/**
 * EvidenceCollector - Puppeteer-based web probing and API interception
 *
 * Responsibilities: site probing, search result analysis, API discovery,
 * cookie banner dismissal, detail page probing, and API capture on load.
 */
import puppeteer from 'puppeteer';
import { BROWSER_USER_AGENT, TIMEOUTS } from './config.js';
import { validateSelector } from './helpers.js';

/**
 * Extended search input selectors - covers modern web app UIs
 * (role=searchbox, aria-label, data-testid, etc.)
 */
const SEARCH_INPUT_SELECTORS = [
  'input[type="search"]',
  'input[name="q"]',
  'input[name="query"]',
  'input[name="search"]',
  'input[placeholder*="search" i]',
  'input[placeholder*="Search" i]',
  'input[role="searchbox"]',
  'input[role="combobox"][aria-label*="search" i]',
  'input[aria-label*="search" i]',
  'input[data-testid*="search" i]',
  'input[id*="search" i]:not([type="hidden"])',
  'input[class*="search" i]:not([type="hidden"])',
  '[contenteditable="true"][role="searchbox"]',
  '[contenteditable="true"][aria-label*="search" i]',
];

export class EvidenceCollector {
  constructor(logger) {
    this.logger = logger;
    this.browser = null;
  }

  async initialize() {
    this.logger.step('Launching browser...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080',
      ],
    });
  }

  /**
   * Apply stealth patches to a page to avoid bot detection.
   * Generic anti-detection techniques that help with any site.
   */
  async applyStealthToPage(page) {
    await page.setUserAgent(BROWSER_USER_AGENT);
    await page.setViewport({ width: 1920, height: 1080 });

    await page.evaluateOnNewDocument(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // Override chrome runtime
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };

      // Override permissions query
      const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
      if (originalQuery) {
        window.navigator.permissions.query = (parameters) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);
      }

      // Override plugins to look like a real browser
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Override WebGL vendor/renderer
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.call(this, parameter);
      };
    });
  }

  /**
   * Assess probe evidence quality. Returns a health score and issues list.
   * Generic: detects blocked/captcha/empty pages regardless of the site.
   */
  assessProbeHealth(evidence) {
    const issues = [];
    let score = 100;

    if (!evidence.title || evidence.title === evidence.hostname || evidence.title.length < 5) {
      issues.push('title_missing_or_generic');
      score -= 30;
    }
    if (!evidence.meta_description) {
      issues.push('no_meta_description');
      score -= 15;
    }
    if (!evidence.h1) {
      issues.push('no_h1');
      score -= 10;
    }
    if (!evidence.links_sample || evidence.links_sample.length === 0) {
      issues.push('no_links');
      score -= 25;
    }
    if (!evidence.jsonld_types || evidence.jsonld_types.length === 0) {
      issues.push('no_jsonld');
      score -= 5;
    }
    if (!evidence.search?.has_search) {
      issues.push('no_search_detected');
      score -= 15;
    }

    const healthy = score >= 40;
    return { score: Math.max(0, score), healthy, issues };
  }

  /**
   * Detect if a page is showing a CAPTCHA challenge.
   * Generic: detects DataDome, Cloudflare, hCaptcha, reCAPTCHA, etc.
   * Returns { blocked: boolean, provider: string|null }
   */
  async detectCaptcha(page) {
    return await page.evaluate(() => {
      const html = document.documentElement.outerHTML.toLowerCase();
      const title = document.title.toLowerCase();

      // DataDome
      if (html.includes('captcha-delivery.com') || html.includes('datadome')) {
        return { blocked: true, provider: 'datadome' };
      }
      // Cloudflare
      if (html.includes('challenges.cloudflare.com') || title.includes('just a moment')) {
        return { blocked: true, provider: 'cloudflare' };
      }
      // hCaptcha
      if (html.includes('hcaptcha.com') || html.includes('h-captcha')) {
        return { blocked: true, provider: 'hcaptcha' };
      }
      // reCAPTCHA
      if (html.includes('recaptcha') || html.includes('google.com/recaptcha')) {
        return { blocked: true, provider: 'recaptcha' };
      }
      // PerimeterX / HUMAN
      if (html.includes('perimeterx') || html.includes('px-captcha')) {
        return { blocked: true, provider: 'perimeterx' };
      }
      // Generic detection: very short page with scripts
      if (document.body?.innerText?.trim().length < 50 && document.querySelectorAll('script').length <= 3) {
        return { blocked: true, provider: 'unknown' };
      }
      return { blocked: false, provider: null };
    });
  }

  /**
   * Open a visible browser window for the user to solve a CAPTCHA.
   * Once solved, captures cookies and returns them for reuse.
   * Generic: works for any CAPTCHA-protected site.
   */
  async solveCaptchaInteractively(url) {
    this.logger.step('Opening browser for manual CAPTCHA solving...');
    this.logger.info('Please solve the CAPTCHA in the browser window that opens.');
    this.logger.info('The script will continue automatically once the real page loads.');

    const headedBrowser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,900',
      ],
    });

    const page = await headedBrowser.newPage();
    await this.applyStealthToPage(page);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.PAGE_LOAD });

      // Wait for user to solve CAPTCHA (up to 120 seconds)
      // Poll until the page no longer shows CAPTCHA
      const maxWait = 120000;
      const pollInterval = 2000;
      let elapsed = 0;

      while (elapsed < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        elapsed += pollInterval;

        const captchaCheck = await this.detectCaptcha(page);
        if (!captchaCheck.blocked) {
          this.logger.success('CAPTCHA solved! Capturing session...');
          break;
        }

        if (elapsed % 10000 === 0) {
          this.logger.info(`Waiting for CAPTCHA to be solved... (${elapsed / 1000}s)`);
        }
      }

      if (elapsed >= maxWait) {
        this.logger.warn('CAPTCHA solving timed out after 120 seconds');
        await headedBrowser.close();
        return null;
      }

      // Wait for page to fully load after CAPTCHA
      await new Promise(r => setTimeout(r, 3000));

      // Capture cookies
      const cookies = await page.cookies();
      this.logger.success(`Captured ${cookies.length} cookies from solved session`);

      // Capture the actual page evidence while we have it
      const evidence = await this.extractPageEvidence(page);

      await headedBrowser.close();

      return { cookies, evidence };

    } catch (e) {
      this.logger.error(`Interactive CAPTCHA solving failed: ${e.message}`);
      await headedBrowser.close();
      return null;
    }
  }

  /**
   * Apply saved cookies to a page (for reusing a solved CAPTCHA session)
   */
  async applyCookies(page, cookies) {
    if (cookies && cookies.length > 0) {
      await page.setCookie(...cookies);
      this.logger.log(`Applied ${cookies.length} saved cookies`);
    }
  }

  /**
   * Extract evidence from an already-loaded page
   */
  async extractPageEvidence(page) {
    const searchSelectors = SEARCH_INPUT_SELECTORS;

    const evidence = await page.evaluate((searchSels) => {
      const getMetaContent = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.getAttribute('content') : null;
      };

      const getJsonLdTypes = () => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        const types = [];
        scripts.forEach(script => {
          try {
            const data = JSON.parse(script.textContent);
            if (data['@type']) types.push(data['@type']);
            if (Array.isArray(data)) {
              data.forEach(item => {
                if (item['@type']) types.push(item['@type']);
              });
            }
          } catch (e) {}
        });
        return [...new Set(types)];
      };

      const getLinksSample = () => {
        const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 20);
        return links.map(a => ({
          text: a.textContent?.trim().slice(0, 100) || '',
          href: a.href
        })).filter(l => l.text && l.href);
      };

      const detectSearch = () => {
        let searchInput = null;
        let matchedSelector = null;
        for (const sel of searchSels) {
          try {
            const el = document.querySelector(sel);
            if (el) { searchInput = el; matchedSelector = sel; break; }
          } catch (e) {}
        }
        const searchForm = searchInput?.closest('form');
        return {
          has_search: !!searchInput,
          search_box_locator: matchedSelector || null,
          search_form_action: searchForm?.action || null,
          search_input_name: searchInput?.name || searchInput?.id || null
        };
      };

      return {
        title: document.title,
        meta_description: getMetaContent('meta[name="description"]') || getMetaContent('meta[property="og:description"]'),
        h1: document.querySelector('h1')?.textContent?.trim() || null,
        jsonld_types: getJsonLdTypes(),
        links_sample: getLinksSample(),
        search: detectSearch()
      };
    }, searchSelectors);

    const finalUrl = page.url();
    const hostname = new URL(finalUrl).hostname.replace(/^www\./, '');

    return {
      input_url: finalUrl,
      final_url: finalUrl,
      hostname,
      ...evidence
    };
  }

  /**
   * Probe with saved cookies (from a previously solved CAPTCHA)
   */
  async probeWithCookies(url, cookies) {
    this.logger.step(`Probing ${url} with saved cookies...`);
    const page = await this.browser.newPage();
    await this.applyStealthToPage(page);

    try {
      await this.applyCookies(page, cookies);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUTS.PAGE_LOAD });
      await page.waitForSelector('body', { timeout: TIMEOUTS.BODY_WAIT }).catch(() => {});
      await new Promise(r => setTimeout(r, TIMEOUTS.JS_RENDER));
      await this.dismissCookieBanners(page);
      await new Promise(r => setTimeout(r, 500));

      return await this.extractPageEvidence(page);
    } finally {
      await page.close();
    }
  }

  /**
   * Interactive search API discovery with pre-solved cookies.
   * For CAPTCHA-protected sites: opens the real page using cookies,
   * then types in the search and captures API calls.
   */
  async discoverSearchAPIWithCookies(url, query, cookies) {
    this.logger.step(`Interactive API discovery (with cookies) on ${url}...`);
    const page = await this.browser.newPage();
    await this.applyStealthToPage(page);

    const capturedRequests = new Map();
    const capturedResponses = [];

    try {
      await this.applyCookies(page, cookies);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUTS.PAGE_LOAD });
      await this.dismissCookieBanners(page);
      await new Promise(r => setTimeout(r, TIMEOUTS.JS_RENDER));

      // Check if we got past the CAPTCHA
      const captchaCheck = await this.detectCaptcha(page);
      if (captchaCheck.blocked) {
        this.logger.warn('Cookies expired or invalid - still seeing CAPTCHA');
        return null;
      }

      // Set up interception
      await page.setRequestInterception(true);

      page.on('request', request => {
        const reqUrl = request.url();
        const method = request.method();
        if (method === 'POST' || request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
          capturedRequests.set(reqUrl, {
            method,
            headers: request.headers(),
            postData: request.postData()
          });
        }
        request.continue();
      });

      const responseHandler = async (response) => {
        try {
          const resUrl = response.url();
          const contentType = response.headers()['content-type'] || '';
          if ((contentType.includes('json') || resUrl.endsWith('.json')) && response.status() === 200) {
            try {
              const text = await response.text();
              const json = JSON.parse(text);
              const requestInfo = capturedRequests.get(resUrl) || { method: 'GET', headers: {}, postData: null };
              capturedResponses.push({
                url: resUrl,
                method: requestInfo.method,
                headers: requestInfo.headers,
                postData: requestInfo.postData,
                data: json
              });
              this.logger.log(`Captured JSON: ${requestInfo.method} ${resUrl.slice(0, 80)}...`);
            } catch (e) { /* not JSON */ }
          }
        } catch (e) { /* response unavailable */ }
      };

      page.on('response', responseHandler);

      // Find search input
      const searchInput = await this.findSearchInput(page);
      if (!searchInput) {
        this.logger.warn('No search input found on CAPTCHA-solved page');
        return null;
      }

      this.logger.info('Found search input on CAPTCHA-solved page. Typing query...');

      await searchInput.click();
      await new Promise(r => setTimeout(r, 500));

      for (const char of query) {
        await searchInput.type(char, { delay: TIMEOUTS.AUTOCOMPLETE_CHAR_DELAY });
        await new Promise(r => setTimeout(r, TIMEOUTS.AUTOCOMPLETE_CHAR_WAIT));
      }

      await new Promise(r => setTimeout(r, TIMEOUTS.AUTOCOMPLETE_FINAL_WAIT));

      await page.setRequestInterception(false);
      page.off('response', responseHandler);

      this.logger.log(`Captured ${capturedResponses.length} JSON responses during typing`);

      if (capturedResponses.length === 0) return null;

      // Find the best autocomplete API
      let bestApi = null;
      for (const response of capturedResponses) {
        const analysis = this.analyzeAPIResponse(response.data, query);
        if (analysis.isAutocomplete) {
          const urlPattern = response.postData
            ? response.url
            : response.url.replace(encodeURIComponent(query), '$INPUT').replace(query, '$INPUT');

          bestApi = {
            url: response.url,
            url_pattern: urlPattern,
            method: response.method || 'GET',
            headers: response.headers || {},
            postData: response.postData,
            response_structure: analysis.structure,
            sample_data: analysis.sampleItem,
            items_path: analysis.itemsPath,
            title_path: analysis.titlePath,
            url_path: analysis.urlPath,
            image_path: analysis.imagePath
          };
          this.logger.success(`Discovered search API: ${response.method} ${response.url.slice(0, 80)}`);
          break;
        }
      }

      // Fallback: look for any search-related endpoint
      if (!bestApi) {
        for (const response of capturedResponses) {
          const urlLower = response.url.toLowerCase();
          if (urlLower.includes('search') || urlLower.includes('autocomplete') ||
              urlLower.includes('typeahead') || urlLower.includes('suggest') ||
              urlLower.includes('query')) {
            bestApi = {
              url: response.url,
              url_pattern: response.postData
                ? response.url
                : response.url.replace(encodeURIComponent(query), '$INPUT').replace(query, '$INPUT'),
              method: response.method || 'GET',
              headers: response.headers || {},
              postData: response.postData,
              response_structure: 'search_endpoint',
              raw_response_keys: Object.keys(response.data || {}).slice(0, 10)
            };
            this.logger.info(`Found search endpoint: ${response.url.slice(0, 80)}`);
            break;
          }
        }
      }

      return bestApi;

    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async probe(url) {
    this.logger.step(`Probing ${url}...`);
    const page = await this.browser.newPage();

    await this.applyStealthToPage(page);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUTS.PAGE_LOAD });

      await page.waitForSelector('body', { timeout: TIMEOUTS.BODY_WAIT }).catch(() => {});
      await new Promise(r => setTimeout(r, TIMEOUTS.JS_RENDER));

      // Dismiss cookie/consent banners before probing
      await this.dismissCookieBanners(page);
      await new Promise(r => setTimeout(r, 500));

      const searchSelectors = SEARCH_INPUT_SELECTORS;

      const evidence = await page.evaluate((searchSels) => {
        const getMetaContent = (selector) => {
          const el = document.querySelector(selector);
          return el ? el.getAttribute('content') : null;
        };

        const getJsonLdTypes = () => {
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          const types = [];
          scripts.forEach(script => {
            try {
              const data = JSON.parse(script.textContent);
              if (data['@type']) types.push(data['@type']);
              if (Array.isArray(data)) {
                data.forEach(item => {
                  if (item['@type']) types.push(item['@type']);
                });
              }
            } catch (e) {}
          });
          return [...new Set(types)];
        };

        const getLinksSample = () => {
          const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 20);
          return links.map(a => ({
            text: a.textContent?.trim().slice(0, 100) || '',
            href: a.href
          })).filter(l => l.text && l.href);
        };

        const detectSearch = () => {
          let searchInput = null;
          let matchedSelector = null;

          for (const sel of searchSels) {
            try {
              const el = document.querySelector(sel);
              if (el) {
                searchInput = el;
                matchedSelector = sel;
                break;
              }
            } catch (e) { /* invalid selector, skip */ }
          }

          const searchForm = searchInput?.closest('form');

          return {
            has_search: !!searchInput,
            search_box_locator: matchedSelector || null,
            search_form_action: searchForm?.action || null,
            search_input_name: searchInput?.name || searchInput?.id || null
          };
        };

        return {
          title: document.title,
          meta_description: getMetaContent('meta[name="description"]') || getMetaContent('meta[property="og:description"]'),
          h1: document.querySelector('h1')?.textContent?.trim() || null,
          jsonld_types: getJsonLdTypes(),
          links_sample: getLinksSample(),
          search: detectSearch()
        };
      }, searchSelectors);

      const finalUrl = page.url();
      const hostname = new URL(finalUrl).hostname.replace(/^www\./, '');

      return {
        input_url: url,
        final_url: finalUrl,
        hostname,
        ...evidence
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Dismiss cookie consent banners and other overlays that block content.
   * Uses only valid CSS selectors (no Playwright-specific :has-text()).
   */
  async dismissCookieBanners(page) {
    const consentButtons = [
      // Generic patterns
      'button[id*="accept"]', 'button[id*="consent"]', 'button[id*="agree"]',
      'button[class*="accept"]', 'button[class*="consent"]', 'button[class*="agree"]',
      '[data-testid*="accept"]', '[data-testid*="consent"]',
      // Common cookie consent frameworks
      '.fc-cta-consent', '.fc-button-label',
      '#onetrust-accept-btn-handler',
      '.cc-accept', '.cc-allow',
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '.cky-btn-accept',
      '#didomi-notice-agree-button',
      '.qc-cmp2-summary-buttons button:first-child',
      '[aria-label*="accept" i]', '[aria-label*="consent" i]',
    ];

    for (const selector of consentButtons) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await button.isIntersectingViewport();
          if (isVisible) {
            await button.click();
            this.logger.log(`Dismissed cookie banner via: ${selector}`);
            await new Promise(r => setTimeout(r, TIMEOUTS.COOKIE_DISMISS));
            return true;
          }
        }
      } catch (e) {
        // Selector might be invalid or button not clickable, continue
      }
    }

    // Fallback: find buttons by text content using page.evaluate (valid in Puppeteer)
    try {
      const dismissed = await page.evaluate(() => {
        const buttonTexts = ['Accept', 'Accept All', 'Agree', 'OK', 'Got it', 'I agree', 'Allow all'];
        const buttons = document.querySelectorAll('button, [role="button"], a.button');
        for (const btn of buttons) {
          const text = btn.textContent?.trim();
          if (text && buttonTexts.some(t => text === t || text.startsWith(t))) {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              btn.click();
              return true;
            }
          }
        }
        return false;
      });
      if (dismissed) {
        this.logger.log('Dismissed cookie banner via text-matching fallback');
        await new Promise(r => setTimeout(r, TIMEOUTS.COOKIE_DISMISS));
        return true;
      }
    } catch (e) {
      // Ignore
    }

    // Try to remove common overlay elements
    try {
      await page.evaluate(() => {
        const overlaySelectors = [
          '.fc-consent-root', '.fc-dialog-overlay',
          '#onetrust-consent-sdk',
          '.cc-window',
          '#CybotCookiebotDialog',
          '[class*="cookie-banner"]', '[class*="cookie-consent"]',
          '[class*="gdpr"]', '[class*="privacy-banner"]',
        ];

        for (const sel of overlaySelectors) {
          const el = document.querySelector(sel);
          if (el) el.remove();
        }
      });
    } catch (e) {
      // Ignore errors
    }

    return false;
  }

  /**
   * Find a search input on the page using broad detection.
   * Tries multiple selector patterns to handle modern web UIs.
   */
  async findSearchInput(page) {
    for (const sel of SEARCH_INPUT_SELECTORS) {
      try {
        const el = await page.$(sel);
        if (el) {
          const isVisible = await el.isIntersectingViewport().catch(() => true);
          if (isVisible) {
            this.logger.log(`Found search input via: ${sel}`);
            return el;
          }
        }
      } catch (e) { /* selector invalid, skip */ }
    }
    return null;
  }

  /**
   * Interactive search API discovery - navigates to a site, finds the search input,
   * types a query, and captures network requests to discover search API endpoints.
   * Generic: works for any JS-powered search (TypeAhead, Algolia, GraphQL, etc.)
   */
  async discoverSearchAPI(url, query) {
    this.logger.step(`Interactive API discovery on ${url} with query "${query}"...`);
    const page = await this.browser.newPage();

    await this.applyStealthToPage(page);

    const capturedRequests = new Map();
    const capturedResponses = [];

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUTS.PAGE_LOAD });
      await this.dismissCookieBanners(page);
      await new Promise(r => setTimeout(r, TIMEOUTS.JS_RENDER));

      // Set up request interception
      await page.setRequestInterception(true);

      page.on('request', request => {
        const reqUrl = request.url();
        const method = request.method();
        if (method === 'POST' || request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
          capturedRequests.set(reqUrl, {
            method,
            headers: request.headers(),
            postData: request.postData()
          });
        }
        request.continue();
      });

      const responseHandler = async (response) => {
        try {
          const resUrl = response.url();
          const contentType = response.headers()['content-type'] || '';
          if ((contentType.includes('json') || resUrl.endsWith('.json')) && response.status() === 200) {
            try {
              const text = await response.text();
              const json = JSON.parse(text);
              const requestInfo = capturedRequests.get(resUrl) || { method: 'GET', headers: {}, postData: null };
              capturedResponses.push({
                url: resUrl,
                method: requestInfo.method,
                headers: requestInfo.headers,
                postData: requestInfo.postData,
                status: response.status(),
                data: json
              });
              this.logger.log(`Captured JSON: ${requestInfo.method} ${resUrl.slice(0, 80)}...`);
            } catch (e) { /* not valid JSON */ }
          }
        } catch (e) { /* response unavailable */ }
      };

      page.on('response', responseHandler);

      // Find search input
      const searchInput = await this.findSearchInput(page);
      if (!searchInput) {
        this.logger.warn('No search input found for interactive API discovery');
        return null;
      }

      this.logger.info('Found search input. Typing query to discover API...');

      // Click and focus the input
      await searchInput.click();
      await new Promise(r => setTimeout(r, 500));

      // Type slowly to trigger autocomplete/typeahead APIs
      for (const char of query) {
        await searchInput.type(char, { delay: TIMEOUTS.AUTOCOMPLETE_CHAR_DELAY });
        await new Promise(r => setTimeout(r, TIMEOUTS.AUTOCOMPLETE_CHAR_WAIT));
      }

      // Wait for API responses to settle
      await new Promise(r => setTimeout(r, TIMEOUTS.AUTOCOMPLETE_FINAL_WAIT));

      await page.setRequestInterception(false);
      page.off('response', responseHandler);

      this.logger.log(`Captured ${capturedResponses.length} JSON responses during typing`);

      if (capturedResponses.length === 0) {
        return null;
      }

      // Analyze captured responses to find autocomplete API
      let bestApi = null;
      for (const response of capturedResponses) {
        const analysis = this.analyzeAPIResponse(response.data, query);
        if (analysis.isAutocomplete) {
          const urlPattern = response.postData
            ? response.url
            : response.url.replace(encodeURIComponent(query), '$INPUT').replace(query, '$INPUT');

          bestApi = {
            url: response.url,
            url_pattern: urlPattern,
            method: response.method || 'GET',
            headers: response.headers || {},
            postData: response.postData,
            response_structure: analysis.structure,
            sample_data: analysis.sampleItem,
            items_path: analysis.itemsPath,
            title_path: analysis.titlePath,
            url_path: analysis.urlPath,
            image_path: analysis.imagePath
          };

          this.logger.success(`Discovered search API: ${response.method} ${response.url.slice(0, 80)}`);
          break;
        }
      }

      // If no autocomplete-style match, look for any JSON with arrays of objects
      if (!bestApi && capturedResponses.length > 0) {
        for (const response of capturedResponses) {
          const urlLower = response.url.toLowerCase();
          if (urlLower.includes('search') || urlLower.includes('autocomplete') ||
              urlLower.includes('typeahead') || urlLower.includes('suggest') ||
              urlLower.includes('query')) {
            const urlPattern = response.postData
              ? response.url
              : response.url.replace(encodeURIComponent(query), '$INPUT').replace(query, '$INPUT');

            bestApi = {
              url: response.url,
              url_pattern: urlPattern,
              method: response.method || 'GET',
              headers: response.headers || {},
              postData: response.postData,
              response_structure: 'search_endpoint',
              raw_response_keys: Object.keys(response.data || {}).slice(0, 10)
            };

            this.logger.info(`Found search-related endpoint: ${response.url.slice(0, 80)}`);
            break;
          }
        }
      }

      return bestApi;

    } finally {
      await page.close();
    }
  }

  async probeSearchResults(searchUrl, query) {
    this.logger.step(`Probing search results for "${query}"...`);
    const page = await this.browser.newPage();

    await this.applyStealthToPage(page);

    const capturedApiCalls = [];
    const capturedRequests = new Map();

    await page.setRequestInterception(true);

    page.on('request', request => {
      const url = request.url();
      const method = request.method();

      if (method === 'POST' || request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
        capturedRequests.set(url, {
          method: method,
          headers: request.headers(),
          postData: request.postData()
        });
      }
      request.continue();
    });

    page.on('response', async (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';

        if ((contentType.includes('json') || url.endsWith('.json')) && response.status() === 200) {
          try {
            const text = await response.text();
            const json = JSON.parse(text);
            const requestInfo = capturedRequests.get(url) || { method: 'GET', headers: {}, postData: null };

            const isSearchApi =
              url.includes('algolia') || url.includes('typesense') || url.includes('elasticsearch') ||
              url.includes('search') || url.includes('autocomplete') || url.includes('query') ||
              (requestInfo.postData && requestInfo.postData.includes(query));

            if (isSearchApi) {
              capturedApiCalls.push({
                url: url,
                method: requestInfo.method,
                headers: requestInfo.headers,
                postData: requestInfo.postData,
                data: json
              });
              this.logger.log(`Captured search API: ${requestInfo.method} ${url.slice(0, 80)}...`);
            }
          } catch (e) {
            // Not valid JSON, ignore
          }
        }
      } catch (e) {
        // Response might be unavailable, ignore
      }
    });

    try {
      // Strategy 1: URL-based search
      const url = searchUrl.replace('$INPUT', encodeURIComponent(query));
      this.logger.info(`Loading search URL: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUTS.SEARCH_PAGE_LOAD });

      await this.dismissCookieBanners(page);

      await new Promise(r => setTimeout(r, TIMEOUTS.JS_RENDER));

      let searchEvidence = await this.analyzeSearchResults(page);
      searchEvidence.search_url = url;

      if (capturedApiCalls.length > 0) {
        const apiInfo = await this.analyzeCapturedApiCalls(capturedApiCalls, query);
        if (apiInfo) {
          searchEvidence.api = apiInfo;
          searchEvidence.search_type = 'api_intercepted';
          this.logger.success(`Intercepted search API on page load: ${apiInfo.url_pattern}`);
        }
      }

      // Strategy 2: Form submission if no results
      if (searchEvidence.result_count === 0) {
        this.logger.info('URL-based search found no results. Trying form submission...');

        const baseUrl = new URL(url).origin;
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: TIMEOUTS.SEARCH_PAGE_LOAD });
        await this.dismissCookieBanners(page);
        await new Promise(r => setTimeout(r, 1000));

        const searchInput = await this.findSearchInput(page);

        if (searchInput) {
          this.logger.info('Found search input. Discovering search URL pattern...');

          await searchInput.click({ clickCount: 3 });
          await searchInput.type(query, { delay: 50 });
          await new Promise(r => setTimeout(r, 1000));

          await page.keyboard.press('Enter');

          await Promise.race([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: TIMEOUTS.NAVIGATION }),
            new Promise(r => setTimeout(r, TIMEOUTS.FORM_SUBMIT))
          ]).catch(() => {});

          const newUrl = page.url();
          this.logger.info(`After form submit, URL is: ${newUrl}`);

          if (newUrl !== baseUrl && newUrl !== url) {
            await new Promise(r => setTimeout(r, TIMEOUTS.JS_RENDER));
            searchEvidence = await this.analyzeSearchResults(page);
            searchEvidence.search_url = newUrl;
            searchEvidence.search_type = 'discovered_url';

            const urlPattern = newUrl.replace(encodeURIComponent(query), '$INPUT').replace(query, '$INPUT');
            searchEvidence.discovered_search_url = urlPattern;

            this.logger.info(`Discovered search URL pattern: ${urlPattern}`);
          }
        }
      } else {
        searchEvidence.search_type = 'url_query';
      }

      // Strategy 3: Autocomplete API discovery
      const shouldTryApi = searchEvidence.result_count === 0 ||
        (searchEvidence.search_type === 'discovered_url' &&
         searchEvidence.search_url &&
         !searchEvidence.search_url.toLowerCase().includes(query.toLowerCase()) &&
         !searchEvidence.search_url.toLowerCase().includes(encodeURIComponent(query).toLowerCase()));

      if (shouldTryApi) {
        this.logger.info('Attempting to discover autocomplete API via network interception...');

        const apiDiscovery = await this.discoverAutocompleteAPI(page, query);
        if (apiDiscovery) {
          searchEvidence.api = apiDiscovery;
          searchEvidence.search_type = 'api';
          this.logger.success(`Discovered autocomplete API: ${apiDiscovery.url_pattern}`);
        }
      }

      // Analyze DOM structure for loop selectors
      if (searchEvidence.result_count > 0) {
        const resultLinks = searchEvidence.results
          .map(r => r.link_href)
          .filter(Boolean);

        const domStructure = await this.findConsecutiveParent(page, resultLinks);
        searchEvidence.dom_structure = domStructure;

        if (domStructure.found) {
          this.logger.info(`Found consecutive parent: ${domStructure.loopBase}`);
        } else {
          this.logger.warn('Could not identify consecutive parent for loop selectors');
        }
      }

      return searchEvidence;
    } finally {
      await page.close();
    }
  }

  /**
   * Intercepts XHR/fetch requests while typing in search to discover autocomplete API
   */
  async discoverAutocompleteAPI(page, query) {
    const baseUrl = page.url().startsWith('http') ? new URL(page.url()).origin : null;
    if (!baseUrl) return null;

    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: TIMEOUTS.SEARCH_PAGE_LOAD });
    await new Promise(r => setTimeout(r, 1000));

    const capturedRequests = new Map();
    const capturedResponses = [];

    await page.setRequestInterception(true);

    page.on('request', request => {
      const url = request.url();
      const method = request.method();

      if (method === 'POST' || request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
        capturedRequests.set(url, {
          method: method,
          headers: request.headers(),
          postData: request.postData()
        });
      }

      request.continue();
    });

    const responseHandler = async (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';

        if (contentType.includes('json') || url.endsWith('.json')) {
          try {
            const text = await response.text();
            const json = JSON.parse(text);
            const requestInfo = capturedRequests.get(url) || { method: 'GET', headers: {}, postData: null };

            capturedResponses.push({
              url: url,
              method: requestInfo.method,
              headers: requestInfo.headers,
              postData: requestInfo.postData,
              status: response.status(),
              data: json
            });
            this.logger.log(`Captured JSON ${requestInfo.method} ${url.slice(0, 80)}...`);
          } catch (e) {
            // Not valid JSON, ignore
          }
        }
      } catch (e) {
        // Response might be unavailable, ignore
      }
    };

    page.on('response', responseHandler);

    const searchInput = await this.findSearchInput(page);

    if (!searchInput) {
      this.logger.info('No search input found for API discovery');
      return null;
    }

    this.logger.info('Typing in search to trigger autocomplete API...');

    await searchInput.click();
    await new Promise(r => setTimeout(r, 500));

    for (const char of query) {
      await searchInput.type(char, { delay: TIMEOUTS.AUTOCOMPLETE_CHAR_DELAY });
      await new Promise(r => setTimeout(r, TIMEOUTS.AUTOCOMPLETE_CHAR_WAIT));
    }

    await new Promise(r => setTimeout(r, TIMEOUTS.AUTOCOMPLETE_FINAL_WAIT));

    await page.setRequestInterception(false);
    page.off('response', responseHandler);

    this.logger.log(`Captured ${capturedResponses.length} JSON responses`);

    if (capturedResponses.length > 0) {
      const firstData = capturedResponses[0].data;
      this.logger.log(`First response keys: ${Object.keys(firstData).join(', ')}`);
      if (firstData.results && Array.isArray(firstData.results)) {
        this.logger.log(`  results[0] keys: ${Object.keys(firstData.results[0] || {}).join(', ')}`);
        if (firstData.results[0]?.hits) {
          const hit = firstData.results[0].hits[0];
          this.logger.log(`  results[0].hits[0] keys: ${Object.keys(hit).join(', ')}`);
          this.logger.log(`  results[0].hits[0]: ${JSON.stringify(hit).slice(0, 500)}...`);
        }
      }
    }

    if (capturedResponses.length === 0) {
      return null;
    }

    let bestApi = null;
    for (const response of capturedResponses) {
      const analysis = this.analyzeAPIResponse(response.data, query);
      if (analysis.isAutocomplete) {
        const urlPattern = response.postData
          ? response.url
          : response.url.replace(encodeURIComponent(query), '$INPUT').replace(query, '$INPUT');

        bestApi = {
          url: response.url,
          url_pattern: urlPattern,
          method: response.method || 'GET',
          headers: response.headers || {},
          postData: response.postData,
          response_structure: analysis.structure,
          sample_data: analysis.sampleItem,
          items_path: analysis.itemsPath,
          title_path: analysis.titlePath,
          url_path: analysis.urlPath,
          image_path: analysis.imagePath
        };

        this.logger.log(`Found autocomplete API: ${response.method} ${response.url.slice(0, 80)}`);
        break;
      }
    }

    return bestApi;
  }

  /**
   * Analyzes captured API calls from page load to find the search API
   */
  async analyzeCapturedApiCalls(capturedCalls, query) {
    const priorityOrder = [
      (call) => call.url.includes('algolia'),
      (call) => call.url.includes('typesense'),
      (call) => call.url.includes('elasticsearch'),
      (call) => call.method === 'POST' && call.postData,
      (call) => call.url.includes('search'),
    ];

    capturedCalls.sort((a, b) => {
      const aPriority = priorityOrder.findIndex(fn => fn(a));
      const bPriority = priorityOrder.findIndex(fn => fn(b));
      return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
    });

    for (const call of capturedCalls) {
      const analysis = this.analyzeAPIResponse(call.data, query);

      if (analysis.isAutocomplete) {
        let urlPattern = call.url;
        if (call.method !== 'POST' || !call.postData) {
          urlPattern = call.url
            .replace(encodeURIComponent(query), '$INPUT')
            .replace(query, '$INPUT');
        }

        let bodyPattern = null;
        if (call.postData) {
          bodyPattern = call.postData
            .replace(new RegExp(query, 'gi'), '$INPUT')
            .replace(new RegExp(encodeURIComponent(query), 'gi'), '$INPUT');
        }

        return {
          url: call.url,
          url_pattern: urlPattern,
          method: call.method || 'GET',
          headers: call.headers || {},
          postData: call.postData,
          body_pattern: bodyPattern,
          response_structure: analysis.structure,
          sample_data: analysis.sampleItem,
          items_path: analysis.itemsPath,
          title_path: analysis.titlePath,
          url_path: analysis.urlPath,
          image_path: analysis.imagePath
        };
      }
    }

    return null;
  }

  /**
   * Analyzes a JSON API response to determine if it's an autocomplete response
   */
  analyzeAPIResponse(data, query) {
    const result = {
      isAutocomplete: false,
      structure: null,
      itemsPath: null,
      titlePath: null,
      urlPath: null,
      sampleItem: null
    };

    const findArrays = (obj, path = '') => {
      const arrays = [];
      if (Array.isArray(obj)) {
        arrays.push({ path: path || 'root', array: obj });
      }
      if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          const newPath = path ? `${path}.${key}` : key;
          if (Array.isArray(value) && value.length > 0) {
            arrays.push({ path: newPath, array: value });
          } else if (typeof value === 'object' && value !== null) {
            arrays.push(...findArrays(value, newPath));
          }
        }
      }
      return arrays;
    };

    const findFieldPaths = (obj, basePath = '') => {
      const fields = { title: null, url: null, image: null };

      if (!obj || typeof obj !== 'object') return fields;

      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        const fullPath = basePath ? `${basePath}.${key}` : key;

        if (typeof value === 'string') {
          if (!fields.title && (lowerKey.includes('title') || lowerKey.includes('name') ||
              lowerKey === 'label' || lowerKey === 'text' || lowerKey === 'display' ||
              lowerKey === 'naslov' || lowerKey === 'naziv' ||
              lowerKey === 'titulo' || lowerKey === 'titre' ||
              lowerKey === 'headline' || lowerKey === 'value' || lowerKey === 'query')) {
            fields.title = fullPath;
          }
          if (!fields.url && (lowerKey.includes('url') || lowerKey.includes('href') ||
              lowerKey.includes('link') || lowerKey === 'uri' || lowerKey === 'path' ||
              lowerKey === 'slug' || lowerKey === 'permalink')) {
            fields.url = fullPath;
          }
          if (!fields.image && (lowerKey.includes('image') || lowerKey.includes('img') ||
              lowerKey.includes('cover') || lowerKey.includes('thumb') || lowerKey.includes('picture') ||
              lowerKey.includes('photo') || lowerKey.includes('avatar') || lowerKey.includes('poster'))) {
            fields.image = fullPath;
          }
        } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
          // Handle arrays of strings (e.g., url: { EN: ["/path/..."] })
          const arrayPath = `${fullPath}[0]`;
          if (!fields.url && (lowerKey.includes('url') || lowerKey.includes('href') ||
              lowerKey.includes('link') || lowerKey === 'uri' || lowerKey === 'path' ||
              lowerKey === 'slug' || lowerKey === 'permalink')) {
            fields.url = arrayPath;
          }
          if (!fields.image && (lowerKey.includes('image') || lowerKey.includes('img') ||
              lowerKey.includes('cover') || lowerKey.includes('thumb') || lowerKey.includes('picture') ||
              lowerKey.includes('photo') || lowerKey.includes('avatar') || lowerKey.includes('poster'))) {
            fields.image = arrayPath;
          }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const nested = findFieldPaths(value, fullPath);
          if (!fields.title && nested.title) fields.title = nested.title;
          if (!fields.url && nested.url) fields.url = nested.url;
          if (!fields.image && nested.image) fields.image = nested.image;
        }
      }

      return fields;
    };

    const arrays = findArrays(data);

    for (const { path, array } of arrays) {
      if (array.length === 0) continue;

      const firstItem = array[0];
      if (typeof firstItem === 'string') {
        const hasMatch = array.some(item =>
          typeof item === 'string' && item.toLowerCase().includes(query.toLowerCase())
        );
        if (hasMatch) {
          result.isAutocomplete = true;
          result.itemsPath = path;
          result.titlePath = '';
          result.structure = 'string_array';
          result.sampleItem = firstItem;
          return result;
        }
      } else if (typeof firstItem === 'object') {
        const fields = findFieldPaths(firstItem);

        if (fields.title) {
          const hasMatch = array.some(item => {
            const title = this.getNestedValue(item, fields.title);
            return title && String(title).toLowerCase().includes(query.toLowerCase());
          });

          if (hasMatch || array.length >= 3) {
            result.isAutocomplete = true;
            result.itemsPath = path;
            result.titlePath = fields.title;
            result.urlPath = fields.url;
            result.imagePath = fields.image;
            result.structure = 'object_array';
            result.sampleItem = firstItem;
            return result;
          }
        }
      }
    }

    return result;
  }

  getNestedValue(obj, path) {
    if (!path) return obj;
    return path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce((o, k) => (o || {})[k], obj);
  }

  async analyzeSearchResults(page) {
    return await page.evaluate(() => {
      const resultSelectors = [
        '[class*="bookTitle"]', '[class*="book-title"]',
        '[class*="searchResult"]', '[class*="search-result"]',
        '[class*="searchItem"]', '[class*="search-item"]',
        '[class*="result"]:not([class*="searchResults"])',
        '[class*="item"]:not(li[class*="nav"]):not([class*="menu"])',
        '[class*="card"]:not([class*="sidebar"])',
        '[data-testid*="result"]', '[data-testid*="item"]',
        'article', 'main [class*="row"]', '[class*="listing"]',
        'table.tableList tr',
        '[class*="perfume"]', '[class*="product"]',
      ];

      let resultContainer = null;
      let resultItems = [];

      const nonContentPatterns = [
        'fc-consent', 'fc-preference', 'fc-purpose', 'fc-dialog',
        'cookie', 'consent', 'gdpr', 'privacy',
        'onetrust', 'cookiebot', 'didomi', 'quantcast',
        'newsletter', 'subscribe', 'signup', 'sign-up',
        'login', 'signin', 'sign-in', 'register',
        'advertisement', 'ad-', 'ads-', 'sponsor',
        'modal', 'popup', 'overlay', 'banner',
      ];

      const isNonContentElement = (item) => {
        const classAndId = `${item.className || ''} ${item.id || ''}`.toLowerCase();
        const parentClassAndId = `${item.parentElement?.className || ''} ${item.parentElement?.id || ''}`.toLowerCase();
        const text = item.textContent?.toLowerCase() || '';

        for (const pattern of nonContentPatterns) {
          if (classAndId.includes(pattern) || parentClassAndId.includes(pattern)) {
            return true;
          }
        }

        const gdprPhrases = [
          'store and/or access', 'advertising', 'personalised', 'personalized',
          'legitimate interest', 'data processing', 'cookies', 'consent',
          'privacy policy', 'terms of service', 'accept all', 'reject all',
        ];
        for (const phrase of gdprPhrases) {
          if (text.includes(phrase)) {
            return true;
          }
        }

        return false;
      };

      const looksLikeResult = (item) => {
        if (isNonContentElement(item)) return false;

        const hasLink = item.querySelector('a[href]') || item.tagName === 'A';
        if (!hasLink) return false;

        const link = item.querySelector('a[href]') || (item.tagName === 'A' ? item : null);
        if (link) {
          const href = link.href || '';
          if (href.includes('/genres/') || href.includes('/categories/') ||
              href.includes('/tags/') || href.includes('/signin') ||
              href.includes('/login') || href.includes('/register') ||
              (href.includes('#') && !href.includes('/#/'))) {
            return false;
          }
        }

        const textLength = item.textContent?.trim().length || 0;
        if (textLength < 10) return false;

        return true;
      };

      const scoreSelector = (selector, items) => {
        let score = 0;

        const hasImages = items.filter(i => i.querySelector('img')).length;
        score += hasImages * 2;

        const hasTitles = items.filter(i => i.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"]')).length;
        score += hasTitles * 3;

        if (selector.includes('ul.') || selector.includes('nav') ||
            selector.includes('menu') || selector.includes('sidebar') ||
            selector.includes('footer') || selector.includes('header')) {
          score -= 10;
        }

        const inMain = items.some(i => i.closest('main, [role="main"], #content, .content'));
        if (inMain) score += 5;

        return score;
      };

      let bestScore = -Infinity;

      for (const selector of resultSelectors) {
        const items = Array.from(document.querySelectorAll(selector));
        const validItems = items.filter(looksLikeResult);

        if (validItems.length >= 2 && validItems.length <= 100) {
          const score = scoreSelector(selector, validItems);

          if (score > bestScore) {
            bestScore = score;
            resultItems = validItems.slice(0, 10);
            resultContainer = selector;
          }
        }
      }

      if (resultItems.length === 1 && resultItems[0].children.length >= 3) {
        const container = resultItems[0];
        const children = Array.from(container.children);

        const classCount = new Map();
        children.forEach(child => {
          const className = child.className?.split(' ')[0];
          if (className && child.querySelector('a[href]')) {
            classCount.set(className, (classCount.get(className) || 0) + 1);
          }
        });

        let mostCommonClass = null;
        let maxCount = 0;
        classCount.forEach((count, cls) => {
          if (count > maxCount && count >= 3) {
            maxCount = count;
            mostCommonClass = cls;
          }
        });

        if (mostCommonClass) {
          const childSelector = `.${mostCommonClass}`;
          const actualItems = Array.from(container.querySelectorAll(`:scope > ${childSelector}`));
          if (actualItems.length >= 3) {
            resultItems = actualItems.slice(0, 10);
            const containerClass = container.className?.split(' ')[0];
            if (containerClass) {
              resultContainer = `.${containerClass} > .${mostCommonClass}`;
            } else {
              resultContainer = `${container.tagName.toLowerCase()} > .${mostCommonClass}`;
            }
          }
        }
      }

      if (resultItems.length === 0) {
        const main = document.querySelector('main, [role="main"], #content, .content') || document.body;
        const allLinks = main.querySelectorAll('a[href]');
        const linkParents = new Map();

        allLinks.forEach(link => {
          const parent = link.parentElement?.parentElement;
          if (parent && !parent.matches('nav, header, footer, aside, [class*="nav"], [class*="menu"]')) {
            const key = parent.tagName + '.' + (parent.className || '').split(' ')[0];
            linkParents.set(key, (linkParents.get(key) || 0) + 1);
          }
        });

        let maxCount = 0;
        let bestParent = null;
        linkParents.forEach((count, key) => {
          if (count > maxCount && count >= 3) {
            maxCount = count;
            bestParent = key;
          }
        });

        if (bestParent) {
          const [tag, className] = bestParent.split('.');
          const selector = className ? `${tag.toLowerCase()}.${className}` : tag.toLowerCase();
          resultItems = Array.from(document.querySelectorAll(selector)).slice(0, 10);
          resultContainer = selector;
        }
      }

      const analyzeItem = (item, index) => {
        const link = item.querySelector('a[href]') || (item.tagName === 'A' ? item : null);
        const img = item.querySelector('img');

        const headings = item.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"], a[class*="Title"], a[class*="title"]');

        const titleLink = item.querySelector('a[class*="title"], a[class*="Title"], a[class*="name"], a.title');

        const getSelector = (el) => {
          if (!el) return null;
          if (el.id) return `#${el.id}`;
          if (el.className) {
            const firstClass = el.className.split(' ').find(c => c && !c.includes('__') && c.length < 30);
            if (firstClass) return `${el.tagName.toLowerCase()}.${firstClass}`;
          }
          return el.tagName.toLowerCase();
        };

        const titleCandidates = Array.from(headings).map(h => ({
          tag: h.tagName,
          class: h.className,
          text: h.textContent?.trim().slice(0, 100),
          selector: getSelector(h)
        }));

        if (titleLink && titleLink !== link && titleLink.textContent?.trim()) {
          titleCandidates.unshift({
            tag: titleLink.tagName,
            class: titleLink.className,
            text: titleLink.textContent?.trim().slice(0, 100),
            selector: getSelector(titleLink),
            is_primary: true
          });
        }

        return {
          index,
          has_link: !!link,
          link_href: link?.href,
          link_text: link?.textContent?.trim().slice(0, 100),
          link_selector: getSelector(link),
          has_image: !!img,
          img_src: img?.src,
          img_selector: getSelector(img),
          title_candidates: titleCandidates.slice(0, 5),
          title_link: titleLink ? {
            href: titleLink.href,
            text: titleLink.textContent?.trim().slice(0, 100),
            selector: getSelector(titleLink)
          } : null,
          text_content: item.textContent?.trim().slice(0, 200),
          item_selector: getSelector(item),
          item_html_snippet: item.outerHTML.slice(0, 500)
        };
      };

      let commonParent = null;
      let commonParentSelector = null;
      let itemsAreDirectChildren = false;

      if (resultItems.length >= 2) {
        const firstParent = resultItems[0].parentElement;
        const allSameParent = resultItems.every(item => item.parentElement === firstParent);

        if (allSameParent && firstParent) {
          commonParent = firstParent;

          if (firstParent.id) {
            commonParentSelector = `#${firstParent.id}`;
          } else if (firstParent.className) {
            const firstClass = firstParent.className.split(' ').find(c => c && !c.includes('__') && c.length < 30);
            if (firstClass) {
              commonParentSelector = `${firstParent.tagName.toLowerCase()}.${firstClass}`;
            }
          }
          if (!commonParentSelector) {
            commonParentSelector = firstParent.tagName.toLowerCase();
          }

          const children = Array.from(firstParent.children);
          const resultIndexes = resultItems.map(item => children.indexOf(item));
          itemsAreDirectChildren = resultIndexes.every(idx => idx !== -1);
        }
      }

      return {
        result_container: resultContainer,
        result_count: resultItems.length,
        results: resultItems.map((item, i) => analyzeItem(item, i)),
        page_title: document.title,
        current_url: window.location.href,
        common_parent_selector: commonParentSelector,
        items_are_direct_children: itemsAreDirectChildren
      };
    });
  }

  /**
   * Analyze DOM structure to find consecutive parent container for loop selectors.
   */
  async findConsecutiveParent(page, resultLinks = []) {
    return await page.evaluate((links) => {
      function getSelector(el) {
        if (!el || el === document.body) return null;
        const tag = el.tagName.toLowerCase();
        if (el.id) return `#${el.id}`;
        const classes = Array.from(el.classList).filter(c => !c.match(/\d{4,}/));
        if (classes.length > 0) return `${tag}.${classes[0]}`;
        return tag;
      }

      function getAncestorPath(el) {
        const path = [];
        let current = el;
        while (current && current !== document.body) {
          path.push(current);
          current = current.parentElement;
        }
        return path;
      }

      function getSiblingIndex(el) {
        if (!el.parentElement) return -1;
        return Array.from(el.parentElement.children).indexOf(el) + 1;
      }

      let resultAnchors = [];

      if (links && links.length > 0) {
        for (const href of links.slice(0, 10)) {
          const anchor = document.querySelector(`a[href="${href}"], a[href$="${href.split('/').pop()}"]`);
          if (anchor) resultAnchors.push(anchor);
        }
      }

      if (resultAnchors.length < 3) {
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        const linksByPattern = {};

        for (const a of allLinks) {
          const href = a.getAttribute('href') || '';
          if (href.startsWith('#') || href.includes('login') || href.includes('cart') ||
              href.includes('account') || href === '/' || href.length < 5) continue;

          const parts = href.replace(/^https?:\/\/[^/]+/, '').split('/').filter(Boolean);
          if (parts.length < 1) continue;

          const pattern = parts.slice(0, -1).join('/') || 'root';
          if (!linksByPattern[pattern]) linksByPattern[pattern] = [];
          linksByPattern[pattern].push(a);
        }

        let bestPattern = null;
        let bestCount = 0;
        for (const [pattern, anchors] of Object.entries(linksByPattern)) {
          if (anchors.length > bestCount && anchors.length >= 3) {
            bestPattern = pattern;
            bestCount = anchors.length;
          }
        }

        if (bestPattern) {
          resultAnchors = linksByPattern[bestPattern].slice(0, 10);
        }
      }

      if (resultAnchors.length < 3) {
        return {
          found: false,
          reason: 'Could not identify enough result links to analyze',
          linksFound: resultAnchors.length
        };
      }

      const paths = resultAnchors.map(a => getAncestorPath(a));

      let commonAncestor = null;
      const minPathLength = Math.min(...paths.map(p => p.length));

      for (let depth = 0; depth < minPathLength; depth++) {
        const ancestorsAtDepth = paths.map(p => p[p.length - 1 - depth]);
        const allSame = ancestorsAtDepth.every(a => a === ancestorsAtDepth[0]);
        if (allSame) {
          commonAncestor = ancestorsAtDepth[0];
        } else {
          break;
        }
      }

      if (!commonAncestor) {
        return {
          found: false,
          reason: 'Result links have no common ancestor'
        };
      }

      const resultContainers = [];
      for (const anchor of resultAnchors) {
        let current = anchor;
        while (current.parentElement && current.parentElement !== commonAncestor) {
          current = current.parentElement;
        }
        if (current.parentElement === commonAncestor && !resultContainers.includes(current)) {
          resultContainers.push(current);
        }
      }

      const containerSelector = getSelector(commonAncestor);
      const allChildren = Array.from(commonAncestor.children);

      const resultIndices = resultContainers.map(c => getSiblingIndex(c));

      const sortedIndices = [...resultIndices].sort((a, b) => a - b);
      const isConsecutive = sortedIndices.every((idx, i) =>
        i === 0 || idx === sortedIndices[i - 1] + 1
      );

      const childTags = resultContainers.map(c => c.tagName.toLowerCase());
      const uniqueTags = [...new Set(childTags)];

      let childSelector;
      if (uniqueTags.length === 1) {
        const sharedClasses = resultContainers.reduce((shared, el) => {
          const classes = Array.from(el.classList).filter(c => !c.match(/\d{4,}/));
          if (shared === null) return classes;
          return shared.filter(c => classes.includes(c));
        }, null) || [];

        childSelector = sharedClasses.length > 0
          ? `${uniqueTags[0]}.${sharedClasses[0]}`
          : uniqueTags[0];
      } else {
        childSelector = '*';
      }

      const sampleContainer = resultContainers[0];
      const fieldSelectors = {};

      const titleEl = sampleContainer.querySelector('h1, h2, h3, h4, h5, h6') ||
                      sampleContainer.querySelector('[class*="title" i], [class*="name" i]') ||
                      sampleContainer.querySelector('a');
      if (titleEl) {
        fieldSelectors.title = getSelector(titleEl) || titleEl.tagName.toLowerCase();
      }

      const linkEl = sampleContainer.querySelector('a[href]');
      if (linkEl) {
        fieldSelectors.url = 'a';
        fieldSelectors.url_attr = 'href';
      }

      const imgEl = sampleContainer.querySelector('img[src], img[data-src], img[data-lazy-src]');
      if (imgEl) {
        fieldSelectors.cover = getSelector(imgEl) || 'img';
        fieldSelectors.cover_attr = imgEl.getAttribute('src') ? 'src' :
                                    imgEl.getAttribute('data-src') ? 'data-src' : 'data-lazy-src';
      } else {
        // No <img> found — check for background-image in inline styles
        const bgEls = Array.from(sampleContainer.querySelectorAll('[style*="background"]'));
        const bgEl = bgEls.find(el => /background(-image)?\s*:.*url\(/i.test(el.getAttribute('style') || ''));
        if (bgEl) {
          fieldSelectors.cover = getSelector(bgEl) || bgEl.tagName.toLowerCase();
          fieldSelectors.cover_attr = 'style';
          fieldSelectors.cover_needs_extraction = true;
          fieldSelectors.cover_css_sample = (bgEl.getAttribute('style') || '').slice(0, 200);
        }
      }

      const loopBase = isConsecutive
        ? `${containerSelector} > ${childSelector}:nth-child($i)`
        : `${containerSelector} > ${childSelector}:nth-of-type($i)`;

      return {
        found: true,
        container: containerSelector,
        consecutiveChild: childSelector,
        childCount: resultContainers.length,
        totalChildren: allChildren.length,
        resultIndices: sortedIndices,
        isConsecutive,
        loopBase,
        fieldSelectors,
        sampleHtml: sampleContainer.outerHTML.slice(0, 500),
        recommendation: isConsecutive
          ? `Results are consecutive children. Use "${loopBase}" as base selector.`
          : `Results are NOT consecutive (indices: ${sortedIndices.join(', ')}). ` +
            `Container has ${allChildren.length} children but only ${resultContainers.length} are results. ` +
            `Use nth-of-type if all results share same tag, otherwise filter by class.`
      };
    }, resultLinks);
  }

  /**
   * Validate that a loop selector pattern works
   */
  async validateLoopSelector(page, selectorPattern, expectedCount = 5) {
    const results = [];

    for (let i = 1; i <= expectedCount; i++) {
      const sel = selectorPattern.replace(/\$i/g, String(i));
      const found = await page.$(sel);
      const text = found ? await page.evaluate(el => el.textContent?.trim().slice(0, 50), found) : null;
      results.push({ index: i, found: !!found, text });
    }

    const foundCount = results.filter(r => r.found).length;

    return {
      pattern: selectorPattern,
      testedCount: expectedCount,
      foundCount,
      successRate: foundCount / expectedCount,
      isValid: foundCount >= 3,
      results
    };
  }

  async analyzeAutocompleteDropdown(page) {
    return await page.evaluate(() => {
      const dropdownSelectors = [
        '[class*="autocomplete"] a', '[class*="autocomplete"] li',
        '[class*="suggestion"] a', '[class*="suggestion"] li',
        '[class*="dropdown"] a', '[class*="dropdown"] li',
        '[class*="typeahead"] a', '[role="option"]',
        '[role="listbox"] > *'
      ];

      let items = [];
      let containerSelector = null;

      for (const selector of dropdownSelectors) {
        const found = document.querySelectorAll(selector);
        if (found.length >= 1) {
          items = Array.from(found).slice(0, 10);
          containerSelector = selector;
          break;
        }
      }

      const analyzeItem = (item, index) => {
        const link = item.tagName === 'A' ? item : item.querySelector('a');
        const img = item.querySelector('img');

        return {
          index,
          has_link: !!link,
          link_href: link?.href,
          link_text: link?.textContent?.trim().slice(0, 100),
          has_image: !!img,
          img_src: img?.src,
          text_content: item.textContent?.trim().slice(0, 200),
          item_html_snippet: item.outerHTML.slice(0, 300)
        };
      };

      return {
        result_container: containerSelector,
        result_count: items.length,
        results: items.map((item, i) => analyzeItem(item, i)),
        page_title: document.title,
        current_url: window.location.href,
        is_dropdown: true
      };
    });
  }

  async probeDetailPage(url) {
    this.logger.step(`Probing detail page ${url}...`);
    const page = await this.browser.newPage();

    await this.applyStealthToPage(page);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUTS.DETAIL_PAGE_LOAD });
      await new Promise(r => setTimeout(r, 1500));

      const detailEvidence = await page.evaluate(() => {
        const getMetaContent = (selector) => {
          const el = document.querySelector(selector);
          return el ? el.getAttribute('content') : null;
        };

        const getJsonLd = () => {
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          const data = [];
          scripts.forEach(script => {
            try {
              data.push(JSON.parse(script.textContent));
            } catch (e) {}
          });
          return data;
        };

        return {
          title: document.title,
          h1: document.querySelector('h1')?.textContent?.trim(),
          og_title: getMetaContent('meta[property="og:title"]'),
          og_description: getMetaContent('meta[property="og:description"]'),
          og_image: getMetaContent('meta[property="og:image"]'),
          canonical: document.querySelector('link[rel="canonical"]')?.href,
          jsonld: getJsonLd(),
          meta_description: getMetaContent('meta[name="description"]')
        };
      });

      return {
        url,
        final_url: page.url(),
        ...detailEvidence
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Navigate to URL and capture API responses for search results.
   * Supports Algolia, Typesense, Elasticsearch, and generic JSON APIs.
   */
  async captureApiOnLoad(url, query) {
    const context = await this.browser.createBrowserContext();
    const page = await context.newPage();

    await this.applyStealthToPage(page);

    let capturedData = null;
    let resolveCapture;
    let responseCount = 0;

    const capturePromise = new Promise((resolve) => {
      resolveCapture = resolve;
    });

    await page.setRequestInterception(true);

    const capturedRequests = new Map();

    page.on('request', request => {
      const reqUrl = request.url();
      const method = request.method();
      if (method === 'POST' || request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
        capturedRequests.set(reqUrl, {
          method,
          headers: request.headers(),
          postData: request.postData()
        });
      }
      request.continue();
    });

    page.on('response', async (response) => {
      responseCount++;

      if (capturedData) return;

      const responseUrl = response.url();
      const status = response.status();
      const requestInfo = capturedRequests.get(responseUrl) || { method: 'GET', headers: {}, postData: null };

      if (status !== 200) return;

      // Broad API detection: Algolia, Typesense, Elasticsearch, or generic search/query endpoints
      const isSearchApi =
        responseUrl.includes('algolia') ||
        responseUrl.includes('typesense') ||
        responseUrl.includes('elasticsearch') ||
        responseUrl.includes('/search') ||
        responseUrl.includes('/query') ||
        responseUrl.includes('/autocomplete');

      if (!isSearchApi) return;

      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('json') && !responseUrl.endsWith('.json')) return;

      this.logger.log(`    Search API response detected: ${responseUrl.slice(0, 60)}...`);

      try {
        const text = await response.text();
        this.logger.log(`    Response length: ${text.length}, starts with {: ${text.startsWith('{')}`);

        if (!text.startsWith('{') && !text.startsWith('[')) return;

        const data = JSON.parse(text);

        // Strategy 1: Algolia structure
        if (data.results?.[0]?.hits && Array.isArray(data.results[0].hits)) {
          const results = data.results[0].hits;
          this.logger.log(`    Found Algolia response with ${results.length} hits`);

          if (results.length > 0) {
            const sample = results[0];
            const hasTitle = sample.title || sample.name || sample.naslov || sample.headline;

            if (hasTitle) {
              capturedData = {
                results,
                jsonPathHint: 'results[0].hits[$i]',
                urlPattern: 'algolia',
                fullResponse: data,
                apiUrl: responseUrl,
                method: requestInfo.method,
                headers: requestInfo.headers,
                postData: requestInfo.postData
              };
              this.logger.success(`    Captured ${results.length} results from Algolia API!`);
              resolveCapture(capturedData);
              return;
            }
          }
        }

        // Strategy 2: Typesense structure { hits: [...], found: N }
        if (data.hits && Array.isArray(data.hits) && data.found !== undefined) {
          const results = data.hits.map(h => h.document || h);
          this.logger.log(`    Found Typesense response with ${results.length} hits`);

          if (results.length > 0) {
            const sample = results[0];
            const hasTitle = sample.title || sample.name;
            if (hasTitle) {
              capturedData = {
                results,
                jsonPathHint: 'hits[$i].document',
                urlPattern: 'typesense',
                fullResponse: data,
                apiUrl: responseUrl,
                method: requestInfo.method,
                headers: requestInfo.headers,
                postData: requestInfo.postData
              };
              this.logger.success(`    Captured ${results.length} results from Typesense API!`);
              resolveCapture(capturedData);
              return;
            }
          }
        }

        // Strategy 3: Elasticsearch structure { hits: { hits: [...] } }
        if (data.hits?.hits && Array.isArray(data.hits.hits)) {
          const results = data.hits.hits.map(h => h._source || h);
          this.logger.log(`    Found Elasticsearch response with ${results.length} hits`);

          if (results.length > 0) {
            const sample = results[0];
            const hasTitle = sample.title || sample.name;
            if (hasTitle) {
              capturedData = {
                results,
                jsonPathHint: 'hits.hits[$i]._source',
                urlPattern: 'elasticsearch',
                fullResponse: data,
                apiUrl: responseUrl,
                method: requestInfo.method,
                headers: requestInfo.headers,
                postData: requestInfo.postData
              };
              this.logger.success(`    Captured ${results.length} results from Elasticsearch API!`);
              resolveCapture(capturedData);
              return;
            }
          }
        }

        // Strategy 4: Generic JSON array or { results/items/data: [...] }
        const arrayKeys = ['results', 'items', 'data', 'records', 'entries', 'products', 'hits'];
        for (const key of arrayKeys) {
          if (data[key] && Array.isArray(data[key]) && data[key].length > 0) {
            const results = data[key];
            const sample = results[0];
            if (typeof sample === 'object' && (sample.title || sample.name)) {
              capturedData = {
                results,
                jsonPathHint: `${key}[$i]`,
                urlPattern: 'generic',
                fullResponse: data,
                apiUrl: responseUrl,
                method: requestInfo.method,
                headers: requestInfo.headers,
                postData: requestInfo.postData
              };
              this.logger.success(`    Captured ${results.length} results from generic API (key: ${key})!`);
              resolveCapture(capturedData);
              return;
            }
          }
        }

        // Strategy 5: Top-level array
        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
          const sample = data[0];
          if (sample.title || sample.name) {
            capturedData = {
              results: data,
              jsonPathHint: '[$i]',
              urlPattern: 'generic_array',
              fullResponse: data,
              apiUrl: responseUrl,
              method: requestInfo.method,
              headers: requestInfo.headers,
              postData: requestInfo.postData
            };
            this.logger.success(`    Captured ${data.length} results from top-level array API!`);
            resolveCapture(capturedData);
            return;
          }
        }
      } catch (e) {
        this.logger.log(`    Response parse error: ${e.message}`);
      }
    });

    try {
      await page.setUserAgent(BROWSER_USER_AGENT);

      this.logger.log(`    Navigating to ${url.slice(0, 60)}...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

      await new Promise(r => setTimeout(r, TIMEOUTS.API_SETTLE));

      this.logger.log(`    Total responses seen: ${responseCount}`);

      const result = await Promise.race([
        capturePromise,
        new Promise(resolve => setTimeout(() => {
          if (!capturedData) {
            this.logger.log(`    API capture timeout - no search API responses found`);
          }
          resolve(null);
        }, TIMEOUTS.API_CAPTURE))
      ]);

      return result;
    } catch (error) {
      this.logger.log(`captureApiOnLoad error: ${error.message}`);
      return null;
    } finally {
      await page.close();
      await context.close();
    }
  }
}
