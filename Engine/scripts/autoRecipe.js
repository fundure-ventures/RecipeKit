#!/usr/bin/env bun
/**
 * autoRecipe.js - Autonomous Recipe Authoring for RecipeKit
 * 
 * MODE 1: Direct URL (--url)
 * Given a single URL, this script:
 * 1. Probes the website using Puppeteer
 * 2. Classifies the site into a list_type using Copilot
 * 3. Generates autocomplete_steps and url_steps
 * 4. Writes the recipe and tests
 * 5. Runs tests and repairs until green (or hard failure)
 * 
 * MODE 2: Discovery Mode (--prompt)
 * Given a search prompt, this script:
 * 1. Searches the web for candidate websites
 * 2. Evaluates and ranks candidates using Copilot
 * 3. Presents options to user for selection
 * 4. Then proceeds with MODE 1 workflow on selected URL
 * 
 * Usage: 
 *   bun Engine/scripts/autoRecipe.js --url=https://example.com [--force] [--debug] [--url-only]
 *   bun Engine/scripts/autoRecipe.js --prompt="movie database" [--force] [--debug]
 */

import { spawn } from 'bun';
import { readFile, writeFile, access } from 'fs/promises';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import minimist from 'minimist';
import chalk from 'chalk';
import puppeteer from 'puppeteer';

// Copilot agents import
import { 
  AgentOrchestrator, 
  AuthorAgent, 
  FixerAgent, 
  DiscoveryAgent,
  QueryTestAgent,
  MODELS 
} from './agents/index.js';

// Semantic validation import
import { validateSemanticMatch, validateMultiQuery } from './autoRecipe/validation.js';

// API tools for building api_request-based recipes
import { normalizeApiDescriptor, buildApiSteps } from './autoRecipe/apiTools.js';

/**
 * Prompt user for input via readline
 */
async function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const ENGINE_DIR = resolve(__dirname, '..');
const PROMPTS_DIR = resolve(__dirname, 'prompts');

const MAX_REPAIR_ITERATIONS = 5;
const ENGINE_VERSION = 20; // From package.json

// Allowed list_type values (existing folders at repo root)
const ALLOWED_LIST_TYPES = [
  'albums', 'anime', 'artists', 'beers', 'boardgames', 'books',
  'food', 'generic', 'manga', 'movies', 'podcasts', 'recipes',
  'restaurants', 'software', 'songs', 'tv_shows', 'videogames', 'wines'
];

// Default headers matching existing recipes
const DEFAULT_HEADERS = {
  'Accept-Language': 'en-UK,en',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.113 Safari/537.36'
};

// Generated recipes folder
const GENERATED_DIR = resolve(REPO_ROOT, 'generated');

/**
 * Load a prompt file from the prompts directory
 */
async function loadPromptFile(name) {
  const path = join(PROMPTS_DIR, `${name}.md`);
  return await readFile(path, 'utf-8');
}

class Logger {
  constructor(debug = false) {
    this.debug = debug;
  }

  info(msg) { console.log(chalk.blue('ℹ'), msg); }
  success(msg) { console.log(chalk.green('✓'), msg); }
  warn(msg) { console.log(chalk.yellow('⚠'), msg); }
  error(msg) { console.log(chalk.red('✗'), msg); }
  step(msg) { console.log(chalk.cyan('→'), msg); }
  log(msg) { if (this.debug) console.log(chalk.gray('  DEBUG:'), msg); }
}

/**
 * Validate CSS selector syntax - checks for invalid pseudo-classes
 * Returns { valid: boolean, error?: string, suggestion?: string }
 */
function validateSelector(selector) {
  if (!selector || typeof selector !== 'string') {
    return { valid: false, error: 'Selector is empty or not a string' };
  }
  
  // Check for jQuery-specific pseudo-selectors that are not valid CSS
  const jQueryPseudos = [':contains', ':has', ':visible', ':hidden', ':selected', ':checked', ':parent', ':file', ':input', ':password', ':radio', ':submit', ':text', ':header', ':animated', ':eq', ':gt', ':lt', ':even', ':odd', ':first', ':last'];
  
  for (const pseudo of jQueryPseudos) {
    if (selector.includes(pseudo + '(')) {
      const suggestion = selector.replace(new RegExp(`${pseudo.replace(':', '\\:')}\\([^)]+\\)`, 'g'), '');
      return { 
        valid: false, 
        error: `Invalid pseudo-selector '${pseudo}' (jQuery-specific, not standard CSS)`,
        suggestion: suggestion || 'Use standard CSS selectors or XPath'
      };
    }
  }
  
  // Try to validate by attempting a querySelector in a safe context
  try {
    // This will throw SyntaxError if selector is invalid
    if (typeof document !== 'undefined') {
      document.querySelector.bind(document.createDocumentFragment())(selector);
    }
  } catch (e) {
    if (e.name === 'SyntaxError') {
      return { 
        valid: false, 
        error: `Invalid CSS selector syntax: ${e.message}`
      };
    }
  }
  
  return { valid: true };
}

class EvidenceCollector {
  constructor(logger) {
    this.logger = logger;
    this.browser = null;
  }

  async initialize() {
    this.logger.step('Launching browser...');
    this.browser = await puppeteer.launch({ headless: true });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async probe(url) {
    this.logger.step(`Probing ${url}...`);
    const page = await this.browser.newPage();
    
    // Set a realistic user agent to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      
      // Wait for potential dynamic content
      await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000)); // Extra wait for JS
      
      const evidence = await page.evaluate(() => {
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
          // Try to find search form/input
          const searchInput = document.querySelector('input[type="search"], input[name="q"], input[name="query"], input[name="search"], input[placeholder*="search" i]');
          const searchForm = searchInput?.closest('form');
          
          return {
            has_search: !!searchInput,
            search_box_locator: searchInput ? `input[name="${searchInput.name || 'search'}"]` : null,
            search_form_action: searchForm?.action || null
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
      });

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
   * Dismiss cookie consent banners and other overlays that block content
   */
  async dismissCookieBanners(page) {
    // Common cookie consent button selectors
    const consentButtons = [
      // Generic patterns
      'button[id*="accept"]', 'button[id*="consent"]', 'button[id*="agree"]',
      'button[class*="accept"]', 'button[class*="consent"]', 'button[class*="agree"]',
      '[data-testid*="accept"]', '[data-testid*="consent"]',
      // Common cookie consent frameworks
      '.fc-cta-consent', '.fc-button-label', // Funding Choices (Google)
      '#onetrust-accept-btn-handler', // OneTrust
      '.cc-accept', '.cc-allow', // Cookie Consent
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', // Cookiebot
      '.cky-btn-accept', // CookieYes
      '#didomi-notice-agree-button', // Didomi
      '.qc-cmp2-summary-buttons button:first-child', // Quantcast
      '[aria-label*="accept" i]', '[aria-label*="consent" i]',
      'button:has-text("Accept")', 'button:has-text("Accept All")',
      'button:has-text("Agree")', 'button:has-text("OK")', 'button:has-text("Got it")',
    ];
    
    for (const selector of consentButtons) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await button.isIntersectingViewport();
          if (isVisible) {
            await button.click();
            this.logger.log(`Dismissed cookie banner via: ${selector}`);
            await new Promise(r => setTimeout(r, 500)); // Wait for banner to close
            return true;
          }
        }
      } catch (e) {
        // Selector might be invalid or button not clickable, continue
      }
    }
    
    // Try to close any modal overlays
    try {
      await page.evaluate(() => {
        // Remove common overlay/modal elements
        const overlaySelectors = [
          '.fc-consent-root', '.fc-dialog-overlay', // Funding Choices
          '#onetrust-consent-sdk', // OneTrust
          '.cc-window', // Cookie Consent
          '#CybotCookiebotDialog', // Cookiebot
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

  async probeSearchResults(searchUrl, query) {
    this.logger.step(`Probing search results for "${query}"...`);
    const page = await this.browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Capture API calls during page load (for sites that load via JS API)
    const capturedApiCalls = [];
    const capturedRequests = new Map();
    
    await page.setRequestInterception(true);
    
    page.on('request', request => {
      const url = request.url();
      const method = request.method();
      
      // Store request details for POST APIs
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
        
        // Capture JSON responses that could be search APIs
        if ((contentType.includes('json') || url.endsWith('.json')) && response.status() === 200) {
          try {
            const text = await response.text();
            const json = JSON.parse(text);
            const requestInfo = capturedRequests.get(url) || { method: 'GET', headers: {}, postData: null };
            
            // Check if this looks like Algolia, Elasticsearch, or other search API
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
      // Strategy 1: Try the searchUrl directly (URL-based search)
      const url = searchUrl.replace('$INPUT', encodeURIComponent(query));
      this.logger.info(`Loading search URL: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Dismiss cookie banners before analyzing
      await this.dismissCookieBanners(page);
      
      await new Promise(r => setTimeout(r, 2000)); // Wait for JS rendering
      
      let searchEvidence = await this.analyzeSearchResults(page);
      searchEvidence.search_url = url;
      
      // If we captured API calls during load, add them to evidence
      if (capturedApiCalls.length > 0) {
        const apiInfo = await this.analyzeCapturedApiCalls(capturedApiCalls, query);
        if (apiInfo) {
          searchEvidence.api = apiInfo;
          searchEvidence.search_type = 'api_intercepted';
          this.logger.success(`Intercepted search API on page load: ${apiInfo.url_pattern}`);
        }
      }
      
      // Strategy 2: If URL-based search found no results, try form submission
      if (searchEvidence.result_count === 0) {
        this.logger.info('URL-based search found no results. Trying form submission...');
        
        const baseUrl = new URL(url).origin;
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await this.dismissCookieBanners(page);
        await new Promise(r => setTimeout(r, 1000));
        
        const searchInput = await page.$('input[type="search"], input[name="q"], input[name="query"], input[name="search"], input[placeholder*="search" i]');
        
        if (searchInput) {
          this.logger.info('Found search input. Discovering search URL pattern...');
          
          await searchInput.click({ clickCount: 3 });
          await searchInput.type(query, { delay: 50 });
          await new Promise(r => setTimeout(r, 1000));
          
          await page.keyboard.press('Enter');
          
          await Promise.race([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
            new Promise(r => setTimeout(r, 5000))
          ]).catch(() => {});
          
          const newUrl = page.url();
          this.logger.info(`After form submit, URL is: ${newUrl}`);
          
          if (newUrl !== baseUrl && newUrl !== url) {
            await new Promise(r => setTimeout(r, 2000));
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
      
      // Strategy 3: Try to discover autocomplete API if:
      // - No results found at all, OR
      // - The "discovered" URL doesn't contain the query (meaning it's not a real search page)
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

      // CRITICAL: Analyze DOM structure to find consecutive parent for loop selectors
      // This helps the LLM generate correct :nth-child($i) patterns
      if (searchEvidence.result_count > 0) {
        // Extract result links from analyzed items to pass to findConsecutiveParent
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
    
    // Navigate to homepage
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));
    
    // Capture ALL XHR/fetch with request details and responses
    const capturedRequests = new Map(); // url -> request info
    const capturedResponses = [];
    
    // We need request interception to capture POST body and headers
    await page.setRequestInterception(true);
    
    page.on('request', request => {
      const url = request.url();
      const method = request.method();
      
      // Store request details for potential API calls
      if (method === 'POST' || request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
        capturedRequests.set(url, {
          method: method,
          headers: request.headers(),
          postData: request.postData()
        });
      }
      
      request.continue();
    });
    
    // Listen to responses
    const responseHandler = async (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        // Capture any JSON response during the search interaction
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
    
    // Find and interact with search input
    const searchInput = await page.$('input[type="search"], input[name="q"], input[name="query"], input[name="search"], input[placeholder*="search" i]');
    
    if (!searchInput) {
      this.logger.info('No search input found for API discovery');
      return null;
    }
    
    this.logger.info('Typing in search to trigger autocomplete API...');
    
    // Click and type slowly to trigger autocomplete
    await searchInput.click();
    await new Promise(r => setTimeout(r, 500));
    
    // Type query character by character to trigger autocomplete
    for (const char of query) {
      await searchInput.type(char, { delay: 100 });
      await new Promise(r => setTimeout(r, 200)); // Wait for potential API calls
    }
    
    // Wait for any final API calls
    await new Promise(r => setTimeout(r, 2000));
    
    // Disable interception and remove handler
    await page.setRequestInterception(false);
    page.off('response', responseHandler);
    
    this.logger.log(`Captured ${capturedResponses.length} JSON responses`);
    
    // Log first response structure for debugging
    if (capturedResponses.length > 0) {
      const firstData = capturedResponses[0].data;
      this.logger.log(`First response keys: ${Object.keys(firstData).join(', ')}`);
      // Look deeper for Algolia-style responses
      if (firstData.results && Array.isArray(firstData.results)) {
        this.logger.log(`  results[0] keys: ${Object.keys(firstData.results[0] || {}).join(', ')}`);
        if (firstData.results[0]?.hits) {
          const hit = firstData.results[0].hits[0];
          this.logger.log(`  results[0].hits[0] keys: ${Object.keys(hit).join(', ')}`);
          this.logger.log(`  results[0].hits[0]: ${JSON.stringify(hit).slice(0, 500)}...`);
        }
      }
    }
    
    // Analyze captured responses to find the best autocomplete API
    if (capturedResponses.length === 0) {
      return null;
    }
    
    // Find the most relevant response (has array of results with titles)
    let bestApi = null;
    for (const response of capturedResponses) {
      const analysis = this.analyzeAPIResponse(response.data, query);
      if (analysis.isAutocomplete) {
        // Build the API info including request details for POST APIs
        const urlPattern = response.postData 
          ? response.url // For POST, URL stays the same, body changes
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
   * @param {Array} capturedCalls - Array of captured API call objects
   * @param {string} query - The search query used
   * @returns {Object|null} API info if found
   */
  async analyzeCapturedApiCalls(capturedCalls, query) {
    // Prioritize by API type
    const priorityOrder = [
      (call) => call.url.includes('algolia'),
      (call) => call.url.includes('typesense'),
      (call) => call.url.includes('elasticsearch'),
      (call) => call.method === 'POST' && call.postData,
      (call) => call.url.includes('search'),
    ];
    
    // Sort captured calls by priority
    capturedCalls.sort((a, b) => {
      const aPriority = priorityOrder.findIndex(fn => fn(a));
      const bPriority = priorityOrder.findIndex(fn => fn(b));
      return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
    });
    
    for (const call of capturedCalls) {
      const analysis = this.analyzeAPIResponse(call.data, query);
      
      if (analysis.isAutocomplete) {
        // Create URL pattern by replacing the query
        let urlPattern = call.url;
        if (call.method === 'POST' && call.postData) {
          // For POST, keep URL as-is, query is in body
          urlPattern = call.url;
        } else {
          urlPattern = call.url
            .replace(encodeURIComponent(query), '$INPUT')
            .replace(query, '$INPUT');
        }
        
        // Create body pattern for POST requests
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
   * and extracts the structure for recipe generation
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
    
    // Helper to find arrays in nested objects
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
    
    // Helper to find title/name/url fields in an object
    const findFieldPaths = (obj, basePath = '') => {
      const fields = { title: null, url: null, image: null };
      
      if (!obj || typeof obj !== 'object') return fields;
      
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        const fullPath = basePath ? `${basePath}.${key}` : key;
        
        if (typeof value === 'string') {
          // Look for title-like fields (including international variations)
          if (!fields.title && (lowerKey.includes('title') || lowerKey.includes('name') || 
              lowerKey === 'label' || lowerKey === 'text' || lowerKey === 'display' ||
              lowerKey === 'naslov' || // Croatian/Serbian for "title"
              lowerKey === 'naziv' ||  // Croatian/Serbian for "name"
              lowerKey === 'titulo' || // Spanish for "title"
              lowerKey === 'titre' ||  // French for "title"
              lowerKey === 'headline' || lowerKey === 'value' || lowerKey === 'query')) {
            fields.title = fullPath;
          }
          // Look for URL fields
          if (!fields.url && (lowerKey.includes('url') || lowerKey.includes('href') || 
              lowerKey.includes('link') || lowerKey === 'uri' || lowerKey === 'path' ||
              lowerKey === 'slug' || lowerKey === 'permalink')) {
            fields.url = fullPath;
          }
          // Look for image fields
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
          // Recurse into nested objects
          const nested = findFieldPaths(value, fullPath);
          if (!fields.title && nested.title) fields.title = nested.title;
          if (!fields.url && nested.url) fields.url = nested.url;
          if (!fields.image && nested.image) fields.image = nested.image;
        }
      }
      
      return fields;
    };
    
    // Find arrays that could be result lists
    const arrays = findArrays(data);
    
    for (const { path, array } of arrays) {
      if (array.length === 0) continue;
      
      // Check if items look like search results
      const firstItem = array[0];
      if (typeof firstItem === 'string') {
        // Simple string array - check if any match query
        const hasMatch = array.some(item => 
          typeof item === 'string' && item.toLowerCase().includes(query.toLowerCase())
        );
        if (hasMatch) {
          result.isAutocomplete = true;
          result.itemsPath = path;
          result.titlePath = ''; // Item itself is the title
          result.structure = 'string_array';
          result.sampleItem = firstItem;
          return result;
        }
      } else if (typeof firstItem === 'object') {
        // Object array - look for title/url fields
        const fields = findFieldPaths(firstItem);
        
        if (fields.title) {
          // Check if any title contains the query
          const hasMatch = array.some(item => {
            const title = this.getNestedValue(item, fields.title);
            return title && String(title).toLowerCase().includes(query.toLowerCase());
          });
          
          if (hasMatch || array.length >= 3) { // Accept if 3+ results even without query match
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
  
  /**
   * Helper to get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    if (!path) return obj;
    return path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce((o, k) => (o || {})[k], obj);
  }

  async analyzeSearchResults(page) {
    return await page.evaluate(() => {
      // Try to identify result items by common patterns
      // Priority order: most specific to least
      const resultSelectors = [
        // Book/product specific patterns (high priority)
        '[class*="bookTitle"]', '[class*="book-title"]',
        '[class*="searchResult"]', '[class*="search-result"]',
        '[class*="searchItem"]', '[class*="search-item"]',
        // Generic result patterns
        '[class*="result"]:not([class*="searchResults"])', // Avoid containers
        '[class*="item"]:not(li[class*="nav"]):not([class*="menu"])', // Exclude nav items
        '[class*="card"]:not([class*="sidebar"])', // Exclude sidebar cards
        '[data-testid*="result"]', '[data-testid*="item"]',
        // Semantic patterns
        'article', 'main [class*="row"]', '[class*="listing"]',
        // Table-based results
        'table.tableList tr',
        // Fallback patterns (lower priority)
        '[class*="perfume"]', '[class*="product"]',
      ];
      
      let resultContainer = null;
      let resultItems = [];
      
      // Patterns that indicate cookie consent / GDPR / non-content elements
      const nonContentPatterns = [
        // Cookie consent frameworks
        'fc-consent', 'fc-preference', 'fc-purpose', 'fc-dialog',
        'cookie', 'consent', 'gdpr', 'privacy',
        'onetrust', 'cookiebot', 'didomi', 'quantcast',
        // Common non-content
        'newsletter', 'subscribe', 'signup', 'sign-up',
        'login', 'signin', 'sign-in', 'register',
        'advertisement', 'ad-', 'ads-', 'sponsor',
        'modal', 'popup', 'overlay', 'banner',
      ];
      
      // Helper to check if element is part of cookie/consent UI
      const isNonContentElement = (item) => {
        const classAndId = `${item.className || ''} ${item.id || ''}`.toLowerCase();
        const parentClassAndId = `${item.parentElement?.className || ''} ${item.parentElement?.id || ''}`.toLowerCase();
        const text = item.textContent?.toLowerCase() || '';
        
        // Check if element or parent has non-content patterns
        for (const pattern of nonContentPatterns) {
          if (classAndId.includes(pattern) || parentClassAndId.includes(pattern)) {
            return true;
          }
        }
        
        // Check for GDPR-like text content
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
      
      // Helper to check if an item looks like a search result (has link + meaningful content)
      const looksLikeResult = (item) => {
        // First, exclude cookie consent / non-content elements
        if (isNonContentElement(item)) return false;
        
        // Must have a link
        const hasLink = item.querySelector('a[href]') || item.tagName === 'A';
        if (!hasLink) return false;
        
        // Link should point to a detail page (not navigation)
        const link = item.querySelector('a[href]') || (item.tagName === 'A' ? item : null);
        if (link) {
          const href = link.href || '';
          // Exclude common navigation patterns and fragment-only links
          if (href.includes('/genres/') || href.includes('/categories/') || 
              href.includes('/tags/') || href.includes('/signin') ||
              href.includes('/login') || href.includes('/register') ||
              (href.includes('#') && !href.includes('/#/'))) { // Allow hash routing but not anchors
            return false;
          }
        }
        
        // Should have some meaningful content (not just a single word link)
        const textLength = item.textContent?.trim().length || 0;
        if (textLength < 10) return false;
        
        return true;
      };
      
      // Helper to score potential result containers
      const scoreSelector = (selector, items) => {
        let score = 0;
        
        // Bonus for having images (likely product/book results)
        const hasImages = items.filter(i => i.querySelector('img')).length;
        score += hasImages * 2;
        
        // Bonus for having title-like elements
        const hasTitles = items.filter(i => i.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"]')).length;
        score += hasTitles * 3;
        
        // Penalty for navigation-like structure
        if (selector.includes('ul.') || selector.includes('nav') || 
            selector.includes('menu') || selector.includes('sidebar') ||
            selector.includes('footer') || selector.includes('header')) {
          score -= 10;
        }
        
        // Bonus for being in main content area
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
      
      // IMPORTANT: If we found a single container-like element, drill down to find the actual items
      // This handles cases like .kit-container which contains many .kit children
      if (resultItems.length === 1 && resultItems[0].children.length >= 3) {
        const container = resultItems[0];
        const children = Array.from(container.children);
        
        // Find the most common child class (these are likely the actual result items)
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
            // Found the actual items - update the results
            resultItems = actualItems.slice(0, 10);
            // Build the full selector: container > child
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
        // Fallback: look for repeated structures with links in main content
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
        
        // Find the most common parent pattern
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
          resultContainer = selector; // Store clean selector without comments
        }
      }

      const analyzeItem = (item, index) => {
        const link = item.querySelector('a[href]') || (item.tagName === 'A' ? item : null);
        const img = item.querySelector('img');
        
        // Look for title in multiple places:
        // 1. Headings (h1-h6)
        // 2. Elements with class containing "title"
        // 3. Links with class containing "title" (common pattern)
        const headings = item.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"], a[class*="Title"], a[class*="title"]');
        
        // Also try to find the "main" title link (not the image link)
        // Often the title is a separate link from the image
        const titleLink = item.querySelector('a[class*="title"], a[class*="Title"], a[class*="name"], a.title');
        
        // Get the actual structure of the item for selector building
        const getSelector = (el) => {
          if (!el) return null;
          if (el.id) return `#${el.id}`;
          if (el.className) {
            const firstClass = el.className.split(' ').find(c => c && !c.includes('__') && c.length < 30);
            if (firstClass) return `${el.tagName.toLowerCase()}.${firstClass}`;
          }
          return el.tagName.toLowerCase();
        };
        
        // Build title candidates from both headings and the title link
        const titleCandidates = Array.from(headings).map(h => ({
          tag: h.tagName,
          class: h.className,
          text: h.textContent?.trim().slice(0, 100),
          selector: getSelector(h)
        }));
        
        // If we found a title link that's different from the main link, add it
        if (titleLink && titleLink !== link && titleLink.textContent?.trim()) {
          titleCandidates.unshift({
            tag: titleLink.tagName,
            class: titleLink.className,
            text: titleLink.textContent?.trim().slice(0, 100),
            selector: getSelector(titleLink),
            is_primary: true  // Mark as primary title candidate
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

      // Find the common parent of result items and check if they're direct children
      let commonParent = null;
      let commonParentSelector = null;
      let itemsAreDirectChildren = false;
      
      if (resultItems.length >= 2) {
        const firstParent = resultItems[0].parentElement;
        const allSameParent = resultItems.every(item => item.parentElement === firstParent);
        
        if (allSameParent && firstParent) {
          commonParent = firstParent;
          
          // Build selector for the common parent
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
          
          // Check if items are ALL children of this parent (no other siblings between them)
          const children = Array.from(firstParent.children);
          const resultIndexes = resultItems.map(item => children.indexOf(item));
          
          // Check if result items are consecutive or only have non-element nodes between them
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
   * This works by finding result links and tracing back to their common ancestor.
   * No hardcoded class names - purely dynamic analysis based on page content.
   */
  async findConsecutiveParent(page, resultLinks = []) {
    return await page.evaluate((links) => {
      // Helper: get a minimal unique selector for an element
      function getSelector(el) {
        if (!el || el === document.body) return null;
        const tag = el.tagName.toLowerCase();
        if (el.id) return `#${el.id}`;
        const classes = Array.from(el.classList).filter(c => !c.match(/\d{4,}/)); // skip hash classes
        if (classes.length > 0) return `${tag}.${classes[0]}`;
        return tag;
      }
      
      // Helper: get path from element to root as array of elements
      function getAncestorPath(el) {
        const path = [];
        let current = el;
        while (current && current !== document.body) {
          path.push(current);
          current = current.parentElement;
        }
        return path;
      }
      
      // Helper: find index of element among siblings
      function getSiblingIndex(el) {
        if (!el.parentElement) return -1;
        return Array.from(el.parentElement.children).indexOf(el) + 1; // 1-indexed
      }
      
      // Step 1: Find actual result links on the page
      // If links provided, use those; otherwise find links with similar URL patterns
      let resultAnchors = [];
      
      if (links && links.length > 0) {
        // Find anchors matching provided URLs
        for (const href of links.slice(0, 10)) {
          const anchor = document.querySelector(`a[href="${href}"], a[href$="${href.split('/').pop()}"]`);
          if (anchor) resultAnchors.push(anchor);
        }
      }
      
      // Fallback: find groups of links with similar URL patterns (likely results)
      if (resultAnchors.length < 3) {
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        const linksByPattern = {};
        
        for (const a of allLinks) {
          const href = a.getAttribute('href') || '';
          // Skip navigation/utility links
          if (href.startsWith('#') || href.includes('login') || href.includes('cart') || 
              href.includes('account') || href === '/' || href.length < 5) continue;
          
          // Group by URL structure (path depth and pattern)
          const parts = href.replace(/^https?:\/\/[^/]+/, '').split('/').filter(Boolean);
          if (parts.length < 1) continue;
          
          const pattern = parts.slice(0, -1).join('/') || 'root';
          if (!linksByPattern[pattern]) linksByPattern[pattern] = [];
          linksByPattern[pattern].push(a);
        }
        
        // Find the pattern with most links (likely results)
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
      
      // Step 2: Find the common ancestor of all result links
      const paths = resultAnchors.map(a => getAncestorPath(a));
      
      // Find the deepest common ancestor
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
      
      // Step 3: Find the direct children of common ancestor that contain results
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
      
      // Step 4: Analyze the container structure
      const containerSelector = getSelector(commonAncestor);
      const allChildren = Array.from(commonAncestor.children);
      
      // Get indices of result containers
      const resultIndices = resultContainers.map(c => getSiblingIndex(c));
      
      // Check if indices are consecutive
      const sortedIndices = [...resultIndices].sort((a, b) => a - b);
      const isConsecutive = sortedIndices.every((idx, i) => 
        i === 0 || idx === sortedIndices[i - 1] + 1
      );
      
      // Determine the child pattern (tag + optional class)
      const childTags = resultContainers.map(c => c.tagName.toLowerCase());
      const uniqueTags = [...new Set(childTags)];
      
      let childSelector;
      if (uniqueTags.length === 1) {
        // All same tag - check if they share a class
        const sharedClasses = resultContainers.reduce((shared, el) => {
          const classes = Array.from(el.classList).filter(c => !c.match(/\d{4,}/));
          if (shared === null) return classes;
          return shared.filter(c => classes.includes(c));
        }, null) || [];
        
        childSelector = sharedClasses.length > 0 
          ? `${uniqueTags[0]}.${sharedClasses[0]}`
          : uniqueTags[0];
      } else {
        // Mixed tags - use :nth-child on container
        childSelector = '*';
      }
      
      // Step 5: Analyze a sample result container to find field selectors
      const sampleContainer = resultContainers[0];
      const fieldSelectors = {};
      
      // Find title (first heading or prominent text)
      const titleEl = sampleContainer.querySelector('h1, h2, h3, h4, h5, h6') ||
                      sampleContainer.querySelector('[class*="title" i], [class*="name" i]') ||
                      sampleContainer.querySelector('a');
      if (titleEl) {
        fieldSelectors.title = getSelector(titleEl) || titleEl.tagName.toLowerCase();
      }
      
      // Find URL (the result link)
      const linkEl = sampleContainer.querySelector('a[href]');
      if (linkEl) {
        fieldSelectors.url = 'a';
        fieldSelectors.url_attr = 'href';
      }
      
      // Find image
      const imgEl = sampleContainer.querySelector('img[src], img[data-src], img[data-lazy-src]');
      if (imgEl) {
        fieldSelectors.cover = getSelector(imgEl) || 'img';
        fieldSelectors.cover_attr = imgEl.getAttribute('src') ? 'src' : 
                                    imgEl.getAttribute('data-src') ? 'data-src' : 'data-lazy-src';
      }
      
      // Build the loop base selector
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
   * Validate that a loop selector pattern works (finds multiple items)
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
      isValid: foundCount >= 3, // At least 3 must work
      results
    };
  }

  async analyzeAutocompleteDropdown(page) {
    return await page.evaluate(() => {
      // Find autocomplete/suggestion items
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
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1500)); // Wait for JS
      
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
   * Debug recipe steps by running them manually with Puppeteer
   * Returns detailed info about what worked and what failed
   */
  async debugRecipeSteps(url, steps, stepType) {
    this.logger.step(`Debugging ${stepType} steps on ${url}...`);
    const page = await this.browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const debugResults = {
      url,
      stepType,
      stepsAnalyzed: [],
      workingSelectors: [],
      failedSelectors: [],
      suggestedFixes: [],
      pageSnapshot: null
    };

    try {
      // Load the page
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await new Promise(r => setTimeout(r, 2000)); // Wait for JS

      // Take a snapshot of the page structure
      debugResults.pageSnapshot = await page.evaluate(() => {
        const getStructure = (el, depth = 0) => {
          if (depth > 3 || !el) return null;
          const children = Array.from(el.children || []).slice(0, 10);
          return {
            tag: el.tagName?.toLowerCase(),
            id: el.id || null,
            classes: el.className?.split?.(' ').filter(c => c).slice(0, 5) || [],
            text: el.textContent?.trim().slice(0, 50) || null,
            childCount: el.children?.length || 0
          };
        };
        
        return {
          title: document.title,
          bodyClasses: document.body?.className || '',
          mainContainers: Array.from(document.querySelectorAll('main, [role="main"], #content, .content, article')).map(el => ({
            tag: el.tagName.toLowerCase(),
            id: el.id,
            classes: el.className
          }))
        };
      });

      // Analyze each step
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepResult = {
          index: i,
          command: step.command,
          description: step.description || '',
          locator: step.locator || null,
          status: 'unknown',
          found: 0,
          samples: [],
          error: null,
          alternatives: []
        };

        try {
          if (step.locator) {
            // Check if selector has loop variables ($i, $j, etc.)
            const hasLoopVar = /\$[a-z]/i.test(step.locator);
            const loopConfig = step.config?.loop;
            
            if (hasLoopVar && loopConfig) {
              // Test the selector with actual values from the loop range
              this.logger.log(`Testing loop selector with range ${loopConfig.from}-${loopConfig.to}`);
              
              let totalFound = 0;
              const samples = [];
              
              for (let idx = loopConfig.from; idx <= Math.min(loopConfig.from + 2, loopConfig.to); idx++) {
                const testSelector = step.locator.replace(new RegExp(`\\$${loopConfig.index}`, 'g'), idx);
                
                // Validate the instantiated selector
                const validation = validateSelector(testSelector);
                if (!validation.valid) {
                  stepResult.status = 'invalid-selector';
                  stepResult.error = `Loop iteration ${idx}: ${validation.error}`;
                  if (validation.suggestion) {
                    stepResult.alternatives.push({
                      selector: validation.suggestion,
                      confidence: 0.5,
                      count: 0,
                      reason: 'Suggested fix for invalid selector'
                    });
                  }
                  debugResults.failedSelectors.push({ 
                    index: i, 
                    locator: testSelector, 
                    command: step.command,
                    error: validation.error
                  });
                  this.logger.warn(`Invalid selector at step ${i} (loop iteration ${idx}): ${validation.error}`);
                  break;
                }
                
                try {
                  const elements = await page.$$(testSelector);
                  totalFound += elements.length;
                  
                  if (elements.length > 0 && samples.length < 3) {
                    const sample = await page.evaluate((sel) => {
                      const el = document.querySelector(sel);
                      if (!el) return null;
                      return {
                        tag: el.tagName.toLowerCase(),
                        text: el.textContent?.trim().slice(0, 100),
                        href: el.href || el.querySelector('a')?.href,
                        src: el.src || el.querySelector('img')?.src,
                        classes: el.className
                      };
                    }, testSelector);
                    if (sample) samples.push({ iteration: idx, ...sample });
                  }
                } catch (e) {
                  this.logger.warn(`Error testing loop selector at iteration ${idx}: ${e.message}`);
                }
              }
              
              stepResult.found = totalFound;
              stepResult.samples = samples;
              
              if (totalFound > 0) {
                stepResult.status = 'working';
                debugResults.workingSelectors.push({ 
                  index: i, 
                  locator: step.locator,
                  loopConfig,
                  found: totalFound 
                });
              } else {
                stepResult.status = 'failed';
                debugResults.failedSelectors.push({ 
                  index: i, 
                  locator: step.locator, 
                  command: step.command 
                });
                stepResult.alternatives = await this.findAlternativeSelectors(page, step);
              }
            } else if (hasLoopVar && !loopConfig) {
              // Has $i but no loop config - ERROR
              stepResult.status = 'invalid-loop';
              stepResult.error = 'Selector contains loop variable ($i) but no loop configuration found';
              this.logger.warn(`Step ${i} has $i in selector but no config.loop`);
              debugResults.failedSelectors.push({ 
                index: i, 
                locator: step.locator, 
                command: step.command,
                error: stepResult.error
              });
            } else {
              // Regular selector without loop variables
              // Validate selector before using it
              const validation = validateSelector(step.locator);
              if (!validation.valid) {
                stepResult.status = 'invalid-selector';
                stepResult.error = validation.error;
                if (validation.suggestion) {
                  stepResult.alternatives.push({
                    selector: validation.suggestion,
                    confidence: 0.5,
                    count: 0,
                    reason: 'Suggested fix for invalid selector'
                  });
                }
                debugResults.failedSelectors.push({ 
                  index: i, 
                  locator: step.locator, 
                  command: step.command,
                  error: validation.error
                });
                this.logger.warn(`Invalid selector at step ${i}: ${validation.error}`);
                this.logger.log(`  Original: ${step.locator}`);
                if (validation.suggestion) {
                  this.logger.log(`  Suggestion: ${validation.suggestion}`);
                }
              } else {
                // Test if the selector finds anything
                const elements = await page.$$(step.locator);
                stepResult.found = elements.length;
                
                if (elements.length > 0) {
                  stepResult.status = 'working';
                  debugResults.workingSelectors.push({ index: i, locator: step.locator, found: elements.length });
                  
                  // Get sample content from found elements
                  stepResult.samples = await page.evaluate((selector) => {
                    return Array.from(document.querySelectorAll(selector)).slice(0, 3).map(el => ({
                      tag: el.tagName.toLowerCase(),
                      text: el.textContent?.trim().slice(0, 100),
                      href: el.href || el.querySelector('a')?.href,
                      src: el.src || el.querySelector('img')?.src,
                      classes: el.className
                    }));
                  }, step.locator);
                } else {
                  stepResult.status = 'failed';
                  debugResults.failedSelectors.push({ index: i, locator: step.locator, command: step.command });
                  
                  // Try to find alternatives
                  stepResult.alternatives = await this.findAlternativeSelectors(page, step);
                }
              }
            }
          } else if (step.command === 'load') {
            stepResult.status = 'working';
          } else {
            stepResult.status = 'no-locator';
          }
        } catch (e) {
          stepResult.status = 'error';
          stepResult.error = e.message;
          this.logger.warn(`Error testing selector at step ${i}: ${e.message}`);
        }

        debugResults.stepsAnalyzed.push(stepResult);
      }

      // Generate suggested fixes for failed selectors
      for (const failed of debugResults.failedSelectors) {
        const stepResult = debugResults.stepsAnalyzed[failed.index];
        if (stepResult.alternatives.length > 0) {
          debugResults.suggestedFixes.push({
            stepIndex: failed.index,
            originalLocator: failed.locator,
            suggestedLocator: stepResult.alternatives[0].selector,
            reason: `Original selector found 0 elements, alternative found ${stepResult.alternatives[0].count}`,
            confidence: stepResult.alternatives[0].confidence
          });
        }
      }

      return debugResults;

    } finally {
      await page.close();
    }
  }

  /**
   * Find alternative selectors that might work for a failed step
   */
  async findAlternativeSelectors(page, step) {
    const alternatives = [];
    
    // Based on the step's output name or description, try to find alternatives
    const outputName = step.output?.name || '';
    const description = step.description || '';
    const hint = `${outputName} ${description}`.toLowerCase();
    
    // Common selector patterns to try based on what we're looking for
    const selectorPatterns = [];
    
    if (hint.includes('title') || hint.includes('name')) {
      selectorPatterns.push(
        'h1', 'h2', 'h3',
        '[class*="title"]', '[class*="name"]', '[class*="heading"]',
        '[data-testid*="title"]', '[data-testid*="name"]',
        'meta[property="og:title"]'
      );
    }
    
    if (hint.includes('cover') || hint.includes('image') || hint.includes('img')) {
      selectorPatterns.push(
        'img[src*="cover"]', 'img[src*="poster"]', 'img[class*="cover"]',
        '[class*="cover"] img', '[class*="poster"] img', '[class*="image"] img',
        'meta[property="og:image"]',
        'picture img', 'figure img'
      );
    }
    
    if (hint.includes('url') || hint.includes('link')) {
      selectorPatterns.push(
        'a[href]', '[class*="link"] a', '[class*="item"] a',
        '[class*="result"] a', '[class*="card"] a'
      );
    }
    
    if (hint.includes('description') || hint.includes('desc')) {
      selectorPatterns.push(
        '[class*="description"]', '[class*="summary"]', '[class*="synopsis"]',
        'meta[property="og:description"]', 'meta[name="description"]',
        'p[class*="desc"]'
      );
    }
    
    if (hint.includes('rating') || hint.includes('score')) {
      selectorPatterns.push(
        '[class*="rating"]', '[class*="score"]', '[class*="stars"]',
        '[data-rating]', '[itemprop="ratingValue"]'
      );
    }

    if (hint.includes('subtitle') || hint.includes('year') || hint.includes('date')) {
      selectorPatterns.push(
        '[class*="subtitle"]', '[class*="year"]', '[class*="date"]',
        'time', 'span[class*="meta"]', '[class*="info"]'
      );
    }

    // Try each pattern
    for (const selector of selectorPatterns) {
      try {
        const count = await page.$$eval(selector, els => els.length).catch(() => 0);
        if (count > 0) {
          const sample = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el ? {
              text: el.textContent?.trim().slice(0, 50),
              attr: el.getAttribute('content') || el.getAttribute('src') || el.getAttribute('href')
            } : null;
          }, selector);
          
          alternatives.push({
            selector,
            count,
            sample,
            confidence: count > 0 && count < 20 ? 'high' : 'medium'
          });
        }
      } catch (e) {
        // Selector failed, skip
      }
    }

    // Sort by confidence and count
    return alternatives.sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
      return a.count - b.count; // Prefer fewer matches (more specific)
    }).slice(0, 5);
  }

  /**
   * Navigate to URL and capture API responses for search results
   * Returns API data with results array and metadata
   */
  async captureApiOnLoad(url, query) {
    // Use a fresh incognito context to avoid any state issues
    const context = await this.browser.createBrowserContext();
    const page = await context.newPage();
    
    let capturedData = null;
    let resolveCapture;
    let responseCount = 0;
    const capturedRequests = new Map();
    
    // Create promise that will be resolved when API is captured
    const capturePromise = new Promise((resolve) => {
      resolveCapture = resolve;
    });
    
    // Enable request interception to capture all network activity
    await page.setRequestInterception(true);
    
    // Capture request metadata before continuing
    page.on('request', request => {
      const reqUrl = request.url();
      capturedRequests.set(reqUrl, {
        method: request.method(),
        headers: request.headers(),
        postData: request.postData() || null
      });
      request.continue();
    });
    
    // Set up response listener BEFORE navigation
    page.on('response', async (response) => {
      responseCount++;
      
      // Skip if already resolved
      if (capturedData) return;
      
      const responseUrl = response.url();
      const status = response.status();
      
      // Only process successful responses from Algolia (be specific)
      if (status !== 200) return;
      
      // Check for Algolia specifically
      const isAlgolia = responseUrl.includes('algolia');
      if (!isAlgolia) return;
      
      this.logger.log(`    Algolia response detected: ${responseUrl.slice(0, 60)}...`);
      
      try {
        // Get response text
        const text = await response.text();
        this.logger.log(`    Response length: ${text.length}, starts with {: ${text.startsWith('{')}`);
        
        if (!text.startsWith('{')) return;
        
        const data = JSON.parse(text);
        
        // Algolia structure
        if (data.results?.[0]?.hits && Array.isArray(data.results[0].hits)) {
          const results = data.results[0].hits;
          this.logger.log(`    Found Algolia response with ${results.length} hits`);
          
          // Verify results contain relevant data
          if (results.length > 0) {
            const sample = results[0];
            const hasTitle = sample.title || sample.name || sample.naslov || sample.headline;
            
            if (hasTitle) {
              const reqMeta = capturedRequests.get(responseUrl) || {};
              capturedData = {
                results,
                jsonPathHint: 'results[0].hits[$i]',
                urlPattern: 'algolia',
                fullResponse: data,
                apiUrl: responseUrl,
                method: reqMeta.method || 'GET',
                headers: reqMeta.headers || {},
                postData: reqMeta.postData || null
              };
              this.logger.success(`    Captured ${results.length} results from Algolia API!`);
              resolveCapture(capturedData);
            }
          }
        }
      } catch (e) {
        // Not valid JSON or parsing error
        this.logger.log(`    Response parse error: ${e.message}`);
      }
    });
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Navigate and wait for initial load
      this.logger.log(`    Navigating to ${url.slice(0, 60)}...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      
      // Wait for network to settle (API calls happen after DOM ready)
      await new Promise(r => setTimeout(r, 8000));
      
      this.logger.log(`    Total responses seen: ${responseCount}`);
      
      // Race between capture and timeout
      const result = await Promise.race([
        capturePromise,
        new Promise(resolve => setTimeout(() => {
          if (!capturedData) {
            this.logger.log(`    API capture timeout - no Algolia responses found`);
          }
          resolve(null);
        }, 5000))
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
class RecipeBuilder {
  constructor(logger) {
    this.logger = logger;
  }

  buildSkeleton(hostname, listType, shortcut, autocompleteSteps = null, urlSteps = null) {
    return {
      recipe_shortcut: shortcut,
      list_type: listType,
      engine_version: ENGINE_VERSION,
      title: this.titleCase(hostname),
      description: `Retrieve ${listType} from ${hostname}`,
      urls: [
        `https://${hostname}`,
        `https://www.${hostname}`
      ],
      headers: DEFAULT_HEADERS,
      autocomplete_steps: autocompleteSteps,
      url_steps: urlSteps
    };
  }

  titleCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  applyPatches(recipe, stepType, patches) {
    const steps = [...recipe[stepType]];
    
    for (const patch of patches) {
      if (patch.step_index < steps.length) {
        steps[patch.step_index] = {
          ...steps[patch.step_index],
          [patch.field]: patch.new_value
        };
      }
    }
    
    return { ...recipe, [stepType]: steps };
  }
}

class TestGenerator {
  constructor(logger) {
    this.logger = logger;
  }

  generate(recipePath, listType, domain, autocompleteQuery, autocompleteExpected, urlInput, urlExpected) {
    const urlOnly = !autocompleteQuery;

    if (urlOnly) {
      return `import { expect, test, describe } from "bun:test";
import { runEngine, loadEnvVariables } from '../Engine/utils/test_utils.js';

// Auto-generated by autoRecipe.js (--url-only)
await loadEnvVariables();
const TIMEOUT = parseInt(process.env.TEST_TIMEOUT);

const RECIPE = "${domain}.json";
const INPUT_URL = ${JSON.stringify(urlInput)};

describe(RECIPE, () => {
    test("--type url", async () => {
        const result = await runEngine(\`generated/\${RECIPE}\`, "url", INPUT_URL);

        ${this.generateUrlAssertions(listType, urlExpected)}
    }, TIMEOUT);
});
`;
    }

    return `import { expect, test, describe } from "bun:test";
import { runEngine, findEntry, loadEnvVariables } from '../Engine/utils/test_utils.js';

// Auto-generated by autoRecipe.js
await loadEnvVariables();
const TIMEOUT = parseInt(process.env.TEST_TIMEOUT);

const RECIPE = "${domain}.json";
const INPUT = {
    AUTOCOMPLETE: ${JSON.stringify(autocompleteQuery)},
    URL: ${JSON.stringify(urlInput)}
};

const ENTRY = ${JSON.stringify(autocompleteExpected)};

describe(RECIPE, () => {
    test("--type autocomplete", async () => {
        const results = await runEngine(\`generated/\${RECIPE}\`, "autocomplete", INPUT.AUTOCOMPLETE);
        
        const entry = findEntry(results, ENTRY.TITLE${autocompleteExpected?.SUBTITLE ? ', ENTRY.SUBTITLE' : ''});

        expect(entry.TITLE).toBe(ENTRY.TITLE);
        ${autocompleteExpected?.SUBTITLE ? 'expect(entry.SUBTITLE).toBe(ENTRY.SUBTITLE);' : ''}
        expect(entry.URL).toBeDefined();
        expect(entry.COVER).toBeDefined();
    }, TIMEOUT);

    test("--type url", async () => {
        const result = await runEngine(\`generated/\${RECIPE}\`, "url", INPUT.URL);

        ${this.generateUrlAssertions(listType, urlExpected)}
    }, TIMEOUT);
});
`;
  }

  generateUrlAssertions(listType, expected) {
    const assertions = ['expect(result.TITLE).toBeDefined();'];
    
    // Add type-specific assertions
    const typeFields = {
      generic: ['DESCRIPTION', 'COVER'],
      movies: ['DATE', 'DESCRIPTION', 'RATING', 'AUTHOR', 'COVER'],
      tv_shows: ['DATE', 'DESCRIPTION', 'RATING', 'AUTHOR', 'COVER'],
      anime: ['DATE', 'DESCRIPTION', 'RATING', 'AUTHOR', 'COVER', 'EPISODES'],
      manga: ['DATE', 'DESCRIPTION', 'RATING', 'AUTHOR', 'COVER', 'VOLUMES'],
      books: ['AUTHOR', 'DESCRIPTION', 'RATING', 'COVER'],
      albums: ['AUTHOR', 'DATE', 'GENRE', 'COVER'],
      songs: ['AUTHOR', 'DATE', 'GENRE', 'COVER'],
      beers: ['AUTHOR', 'RATING', 'COVER', 'STYLE'],
      wines: ['WINERY', 'RATING', 'COVER', 'REGION'],
      software: ['RATING', 'GENRE', 'DESCRIPTION', 'COVER'],
      videogames: ['DATE', 'DESCRIPTION', 'RATING', 'COVER'],
      recipes: ['COVER', 'INGREDIENTS', 'DESCRIPTION', 'STEPS'],
      podcasts: ['AUTHOR', 'COVER'],
      boardgames: ['DATE', 'DESCRIPTION', 'RATING', 'COVER']
    };

    const fields = typeFields[listType] || typeFields.generic;
    for (const field of fields) {
      assertions.push(`expect(result.${field}).toBeDefined();`);
    }

    return assertions.join('\n        ');
  }
}

class EngineRunner {
  constructor(logger) {
    this.logger = logger;
  }

  async run(recipePath, type, input) {
    this.logger.step(`Running engine: ${type} with input "${input.slice(0, 50)}..."`);
    
    try {
      const proc = spawn([
        'bun',
        join(ENGINE_DIR, 'engine.js'),
        '--recipe', recipePath,
        '--type', type,
        '--input', input
      ], { cwd: REPO_ROOT });

      const output = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      
      // Log stderr if present
      if (stderr) {
        this.logger.log(`Engine stderr: ${stderr.slice(0, 500)}`);
      }

      // Check for non-zero exit code
      if (exitCode !== 0) {
        const errorMsg = stderr || output || `Engine exited with code ${exitCode}`;
        this.logger.error(`Engine failed with exit code ${exitCode}`);
        return { 
          success: false, 
          error: errorMsg,
          output, 
          stderr,
          exitCode,
          errorType: 'engine_crash'
        };
      }

      // Try to parse JSON output
      try {
        const data = JSON.parse(output);
        return { success: true, data, output, stderr };
      } catch (e) {
        // Output wasn't valid JSON
        this.logger.error(`Engine output not valid JSON: ${e.message}`);
        return { 
          success: false, 
          error: `Invalid JSON output: ${e.message}`, 
          output, 
          stderr,
          errorType: 'invalid_json'
        };
      }
    } catch (e) {
      this.logger.error(`Engine spawn failed: ${e.message}`);
      return { 
        success: false, 
        error: e.message, 
        output: '', 
        stderr: '',
        errorType: 'spawn_error'
      };
    }
  }

  async runTest(testPath) {
    this.logger.step(`Running test: ${testPath}`);
    
    const proc = spawn(['bun', 'test', testPath], { cwd: REPO_ROOT });

    const output = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return {
      success: exitCode === 0,
      output,
      stderr,
      exitCode
    };
  }
}

/**
 * SourceDiscovery class
 * Discovers and evaluates potential recipe sources using web search
 */
class SourceDiscovery {
  constructor(logger, orchestrator, discoveryAgent) {
    this.logger = logger;
    this.orchestrator = orchestrator;
    this.discoveryAgent = discoveryAgent;
  }

  /**
   * Main discovery workflow
   */
  async discover(userPrompt) {
    this.logger.step(`Discovery mode for: "${userPrompt}"`);
    
    if (this.logger.debug) {
      this.logger.log('═══ DISCOVERY WORKFLOW ═══');
      this.logger.log(`Original user prompt: "${userPrompt}"`);
    }
    
    // Step 1: Clarify and enhance the user's intent
    this.logger.step('Clarifying search intent...');
    const clarifiedIntent = await this.clarifyIntent(userPrompt);
    
    if (this.logger.debug) {
      this.logger.log('─── Intent Clarification ───');
      this.logger.log(`Purpose: ${clarifiedIntent.purpose}`);
      this.logger.log(`Content type: ${clarifiedIntent.list_type_hint || 'unknown'}`);
      this.logger.log(`Key features: ${clarifiedIntent.key_features?.join(', ') || 'none specified'}`);
      this.logger.log(`Enhanced query: "${clarifiedIntent.search_query}"`);
    }
    
    // Step 2: Search the web for candidate sites using enhanced query
    this.logger.step(`Searching: "${clarifiedIntent.search_query}"`);
    const searchResults = await this.searchWeb(clarifiedIntent.search_query, clarifiedIntent);
    
    if (searchResults.length === 0) {
      this.logger.warn('AI web search returned no results.');
      this.logger.warn('This could mean:');
      this.logger.warn('  1. No good websites found for this query');
      this.logger.warn('  2. AI web search is not available/enabled');
      this.logger.warn('  3. The query was too vague or specific');
      this.logger.warn('');
      this.logger.warn('Try using --url with a known website instead:');
      this.logger.warn(`  bun Engine/scripts/autoRecipe.js --url=https://example.com`);
      throw new Error('No search results found - try using --url mode instead');
    }
    
    if (this.logger.debug) {
      this.logger.log('─── Search Results ───');
      this.logger.log(`Found ${searchResults.length} potential sources`);
      searchResults.slice(0, 3).forEach((r, i) => {
        this.logger.log(`  ${i + 1}. ${r.title} - ${r.url}`);
      });
    }
    
    this.logger.info(`Found ${searchResults.length} potential sources`);
    
    // Step 3: Evaluate candidates with Copilot
    const evaluation = await this.evaluateCandidates(searchResults, userPrompt, clarifiedIntent);
    
    if (!evaluation || !evaluation.candidates || evaluation.candidates.length === 0) {
      throw new Error('No viable candidates found after evaluation');
    }
    
    if (this.logger.debug) {
      this.logger.log('─── Evaluation Results ───');
      evaluation.candidates.slice(0, 3).forEach((c, i) => {
        this.logger.log(`  ${i + 1}. ${c.title} (score: ${c.score}, confidence: ${(c.confidence * 100).toFixed(0)}%)`);
      });
    }
    
    // Step 4: Present options to user
    const selectedUrl = await this.promptUserSelection(evaluation.candidates, evaluation.top_recommendation);
    
    if (this.logger.debug) {
      this.logger.log('─── Final Selection ───');
      this.logger.log(`Selected URL: ${selectedUrl}`);
      this.logger.log('═══════════════════════════');
    }
    
    return selectedUrl;
  }
  
  /**
   * Clarify user intent and enhance the search query
   */
  async clarifyIntent(userPrompt) {
    try {
      const result = await this.discoveryAgent.clarifyIntent(userPrompt);
      this.logger.success('Intent clarified');
      return {
        purpose: result.clarified_query || `Find ${userPrompt} websites`,
        list_type_hint: result.list_type_hint || null,
        key_features: [],
        search_query: result.search_terms?.join(' ') || `${userPrompt} database website -youtube -facebook -twitter`
      };
    } catch (e) {
      this.logger.warn(`Intent clarification failed: ${e.message}, using original prompt`);
      return {
        purpose: `Find ${userPrompt} websites`,
        list_type_hint: null,
        key_features: [],
        search_query: `${userPrompt} database website -youtube -facebook -twitter`
      };
    }
  }

  /**
   * Use the AI model's web search capability to find candidate websites
   */
  async searchWeb(searchQuery, clarifiedIntent) {
    this.logger.log('Using AI web search to find candidates...');
    
    try {
      if (this.logger.debug) {
        this.logger.log(`Search query: "${searchQuery}"`);
        if (clarifiedIntent?.list_type_hint) {
          this.logger.log(`Target content type: ${clarifiedIntent.list_type_hint}`);
        }
      }
      
      // Create enhanced search prompt with context
      const searchPrompt = `# Web Search Task

${clarifiedIntent ? `**Context**: ${clarifiedIntent.purpose}` : ''}
${clarifiedIntent?.key_features ? `**Looking for sites with**: ${clarifiedIntent.key_features.join(', ')}` : ''}

Use web search to find websites matching this query:
"${searchQuery}"

Find 10-15 websites that are actual databases, aggregators, or content sites.

Filter out:
- Social media (YouTube, Facebook, Twitter, Instagram, LinkedIn, Reddit, Pinterest)
- Generic sites (Wikipedia unless highly relevant)
- News sites
- Shopping sites (unless specifically relevant)

Return ONLY valid JSON in this exact format:

\`\`\`json
{
  "results": [
    {
      "title": "Site Name",
      "url": "https://example.com",
      "description": "What the site offers"
    }
  ]
}
\`\`\`

Use web search now to find these sites. Output ONLY the JSON.`;

      if (this.logger.debug) {
        this.logger.log('─── Search Prompt ───');
        this.logger.log(searchPrompt.split('\n').slice(0, 10).join('\n') + '\n...');
      }
      
      // Send to discovery agent session which should have web search enabled
      this.logger.log('Requesting AI web search...');
      
      // Use the discovery agent's sendAndWait directly for web search
      // This gives us access to the raw session for handling tool events
      const session = this.discoveryAgent.session;
      
      let responseContent = '';
      let eventCount = 0;
      let toolExecutions = 0;
      
      const done = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Search timeout after 90 seconds'));
        }, 90000);
        
        const unsubscribe = session.on((event) => {
          eventCount++;
          
          if (event.type === 'tool.execution_start') {
            toolExecutions++;
            if (this.logger.debug) {
              this.logger.log(`  → Tool execution #${toolExecutions} started`);
            }
          }
          
          if (event.type === 'tool.execution_complete') {
            if (this.logger.debug) {
              this.logger.log(`  ✓ Tool execution #${toolExecutions} completed`);
            }
          }
          
          // Handle streaming message chunks
          if (event.type === 'assistant.message_delta' && event.data?.deltaContent) {
            responseContent += event.data.deltaContent;
          }
          // Handle final message
          if (event.type === 'assistant.message' && event.data?.content) {
            if (event.data.content.length > responseContent.length) {
              responseContent = event.data.content;
            }
          }
          // Session finished
          if (event.type === 'session.idle') {
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          }
          // Handle errors
          if (event.type === 'error') {
            clearTimeout(timeout);
            unsubscribe();
            reject(new Error(event.data?.message || 'Search failed'));
          }
        });
      });
      
      // Send the prompt
      await session.send({ prompt: searchPrompt });
      
      // Wait for completion
      await done;
      
      if (this.logger.debug) {
        this.logger.log(`Search completed: ${toolExecutions} tool executions, ${eventCount} events`);
      }
      
      if (!responseContent) {
        this.logger.warn('AI returned empty search response');
        return [];
      }
      
      this.logger.log(`Search response received (${responseContent.length} chars)`);
      
      if (this.logger.debug) {
        this.logger.log(`Response preview: ${responseContent.slice(0, 300)}...`);
      }
      
      // Extract JSON from response
      const jsonMatch = responseContent.match(/```json\n?([\s\S]*?)\n?```/) || 
                        responseContent.match(/```\n?([\s\S]*?)\n?```/) ||
                        responseContent.match(/(\{[\s\S]*\})/);
      
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        try {
          const parsed = JSON.parse(jsonStr);
          const results = parsed.results || parsed;
          
          if (Array.isArray(results) && results.length > 0) {
            this.logger.success(`AI found ${results.length} websites via web search`);
            return results;
          }
        } catch (parseErr) {
          this.logger.warn(`Failed to parse search results: ${parseErr.message}`);
          if (this.logger.debug) {
            this.logger.log(`JSON string was: ${jsonStr.slice(0, 500)}`);
          }
        }
      } else {
        this.logger.warn('No JSON found in AI response');
        if (this.logger.debug) {
          this.logger.log(`Full response: ${responseContent}`);
        }
      }
      
      return [];
      
    } catch (error) {
      this.logger.warn(`AI web search failed: ${error.message}`);
      if (this.logger.debug) {
        this.logger.error(error.stack);
      }
      return [];
    }
  }

  /**
   * Evaluate candidates using DiscoveryAgent
   */
  async evaluateCandidates(searchResults, userPrompt, clarifiedIntent) {
    this.logger.step('Evaluating candidates with DiscoveryAgent...');
    
    if (this.logger.debug) {
      this.logger.log('─── Evaluation Context ───');
      this.logger.log(`Original prompt: ${userPrompt}`);
      this.logger.log(`Clarified purpose: ${clarifiedIntent?.purpose || 'none'}`);
      this.logger.log(`Suggested list_type: ${clarifiedIntent?.list_type_hint || 'unknown'}`);
      this.logger.log(`Candidates to evaluate: ${searchResults.length}`);
    }
    
    const evaluation = await this.discoveryAgent.searchAndEvaluate(userPrompt, searchResults);
    
    if (!evaluation || !evaluation.candidates) {
      throw new Error('DiscoveryAgent evaluation failed or returned invalid format');
    }
    
    // Sort candidates by score (highest first)
    evaluation.candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
    
    this.logger.success(`Evaluated ${evaluation.candidates.length} candidates`);
    
    if (this.logger.debug) {
      this.logger.log('─── Top 3 Candidates ───');
      evaluation.candidates.slice(0, 3).forEach((c, i) => {
        this.logger.log(`  ${i + 1}. ${c.title}`);
        this.logger.log(`     Score: ${c.score}/100, Confidence: ${((c.confidence || 0) * 100).toFixed(0)}%`);
        this.logger.log(`     URL: ${c.url}`);
        this.logger.log(`     Reasoning: ${c.reasoning?.slice(0, 100)}...`);
      });
    }
    
    return evaluation;
  }

  /**
   * Interactive user selection
   */
  async promptUserSelection(candidates, topRecommendation) {
    console.log(chalk.bold.cyan('\n🔍 Found Recipe Source Candidates:\n'));
    
    // Show top 5 candidates
    const displayCandidates = candidates.slice(0, 5);
    
    displayCandidates.forEach((candidate, index) => {
      const isTop = topRecommendation && candidate.url === topRecommendation.url;
      const marker = isTop ? chalk.green('⭐ RECOMMENDED') : '';
      
      console.log(chalk.bold(`${index + 1}. ${candidate.title}`) + ` ${marker}`);
      console.log(chalk.gray(`   ${candidate.url}`));
      console.log(`   Score: ${chalk.yellow(candidate.score)}/100 | Confidence: ${chalk.yellow((candidate.confidence * 100).toFixed(0))}%`);
      console.log(chalk.gray(`   ${candidate.description.slice(0, 100)}${candidate.description.length > 100 ? '...' : ''}`));
      
      if (candidate.pros && candidate.pros.length > 0) {
        console.log(chalk.green('   ✓'), candidate.pros.slice(0, 2).join('; '));
      }
      
      if (candidate.cons && candidate.cons.length > 0) {
        console.log(chalk.yellow('   ⚠'), candidate.cons.slice(0, 2).join('; '));
      }
      
      console.log('');
    });
    
    console.log(chalk.gray('Other options:'));
    console.log(chalk.gray('  0) Enter custom URL'));
    console.log(chalk.gray('  q) Quit\n'));
    
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve, reject) => {
      rl.question(chalk.bold('Select a source (1-5, 0 for custom, q to quit): '), async (answer) => {
        rl.close();
        
        const choice = answer.trim().toLowerCase();
        
        if (choice === 'q' || choice === 'quit') {
          reject(new Error('User cancelled'));
          return;
        }
        
        if (choice === '0' || choice === 'custom') {
          const customRl = createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          customRl.question('Enter URL: ', (url) => {
            customRl.close();
            const trimmedUrl = url.trim();
            if (!trimmedUrl.startsWith('http')) {
              reject(new Error('Invalid URL'));
            } else {
              resolve(trimmedUrl);
            }
          });
          return;
        }
        
        const index = parseInt(choice) - 1;
        if (index >= 0 && index < displayCandidates.length) {
          const selected = displayCandidates[index];
          console.log(chalk.green(`\n✓ Selected: ${selected.title}`));
          console.log(chalk.gray(`  ${selected.url}\n`));
          resolve(selected.url);
        } else {
          reject(new Error('Invalid selection'));
        }
      });
    });
  }
}

class AutoRecipe {
  constructor(options) {
    this.url = options.url;
    this.force = options.force || false;
    this.debug = options.debug || false;
    this.urlOnly = options.urlOnly || false;
    this.outputDir = options.outputDir || null;
    
    this.logger = new Logger(this.debug);
    this.evidence = new EvidenceCollector(this.logger);
    
    // New agent-based architecture
    this.orchestrator = new AgentOrchestrator(this.logger, this.debug);
    this.authorAgent = null;
    this.fixerAgent = null;
    
    this.builder = new RecipeBuilder(this.logger);
    this.testGen = new TestGenerator(this.logger);
    this.engine = new EngineRunner(this.logger);
  }

  async run() {
    this.logger.info(`Starting autoRecipe for ${this.url}`);
    const runStart = Date.now();
    
    try {
      await this.evidence.initialize();
      await this.orchestrator.initialize();
      
      // Initialize agents
      this.authorAgent = new AuthorAgent(this.orchestrator);
      await this.authorAgent.initialize();
      
      this.queryTestAgent = new QueryTestAgent(this.orchestrator);
      await this.queryTestAgent.initialize();

      // Phase 1: Probe site (classification skipped)
      const siteEvidence = await this.evidence.probe(this.url);
      this.logger.log(JSON.stringify(siteEvidence, null, 2));

      // Use 'generic' as default list_type (classification skipped)
      const classification = {
        list_type: 'generic',
        confidence: 1.0,
        rationale: 'Classification skipped - using generic type',
        suggested_recipe_shortcut: siteEvidence.hostname.replace(/\./g, '_') + '_generic'
      };
      this.logger.info(`Using list_type: ${classification.list_type} (classification skipped)`);

      const domain = siteEvidence.hostname.replace(/\./g, '');
      
      // Store in outputDir (if provided) or ./generated folder
      const generatedDir = this.outputDir || join(REPO_ROOT, 'generated');
      const recipePath = join(generatedDir, `${domain}.json`);
      const testPath = join(generatedDir, `${domain}.test.js`);

      // Check for existing files
      if (!this.force) {
        let recipeExists = false;
        try {
          await access(recipePath);
          recipeExists = true;
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }
        
        if (recipeExists) {
          this.logger.warn(`Recipe already exists: ${recipePath}`);
          const answer = await prompt(chalk.yellow('What would you like to do?\n  [o] Overwrite existing recipe\n  [n] Create new recipe with suffix\n  [c] Cancel\nChoice (o/n/c): '));
          
          if (answer === 'o' || answer === 'overwrite') {
            this.logger.info('Overwriting existing recipe...');
            this.force = true;
          } else if (answer === 'n' || answer === 'new') {
            // Find a unique suffix
            let suffix = 2;
            let newDomain = `${domain}_${suffix}`;
            let newRecipePath = join(generatedDir, `${newDomain}.json`);
            
            while (true) {
              try {
                await access(newRecipePath);
                suffix++;
                newDomain = `${domain}_${suffix}`;
                newRecipePath = join(generatedDir, `${newDomain}.json`);
              } catch (e) {
                if (e.code === 'ENOENT') break;
                throw e;
              }
            }
            
            // Update paths to use the new suffix
            Object.assign(this, { _domain: newDomain });
            this.logger.info(`Creating new recipe as: ${newDomain}.json`);
            return await this.runWithPaths(
              siteEvidence,
              newDomain,
              newRecipePath,
              join(generatedDir, `${newDomain}.test.js`),
              runStart
            );
          } else {
            this.logger.info('Cancelled.');
            return { success: false, cancelled: true, usage: this.orchestrator.getUsage() };
          }
        }
      }

      // Continue with recipe generation using determined paths
      const result = await this.runWithPaths(siteEvidence, domain, recipePath, testPath, runStart);
      
      // Add usage stats to result
      result.usage = this.orchestrator.getUsage();
      return result;

    } finally {
      await this.evidence.close();
      await this.orchestrator.close();
    }
  }

  /**
   * Run the recipe generation with specific paths (called by run() after path resolution)
   * No classification needed - all recipes use 'generic' list_type in /generated
   */
  async runWithPaths(siteEvidence, domain, recipePath, testPath, runStart = Date.now()) {
    // Use 'generic' as default list_type for all generated recipes
    const listType = 'generic';
    const recipeShortcut = domain;
    const timing = { phase1: 0, phase2: 0, phase3: 0, phase4: 0, total: 0 };

    const finalizeTiming = (result) => {
      timing.total = Date.now() - runStart;
      result.timing = timing;
      return result;
    };
    // --url-only mode: skip autocomplete, go straight to url_steps
    if (this.urlOnly) {
      return this.runUrlOnly(siteEvidence, listType, recipeShortcut, domain, recipePath, testPath, runStart);
    }
    
    // Phase 2: Autocomplete generation
    const phase2Start = Date.now();
    timing.phase1 = phase2Start - runStart;
    this.logger.info('Phase 2: Generating autocomplete_steps...');
    
    // Discover search URL template
    let searchUrl = siteEvidence.search?.search_form_action;
    if (searchUrl) {
      // If we have a search form action, add query parameter if not present
      if (!searchUrl.includes('$INPUT')) {
        // Determine the query parameter name from the search box locator
        // e.g., input[name="query"] -> query, input[name="q"] -> q
        let paramName = 'q'; // default
        const locator = siteEvidence.search?.search_box_locator || '';
        const nameMatch = locator.match(/name="([^"]+)"/);
        if (nameMatch) {
          paramName = nameMatch[1];
        }
        
        // Add the query parameter
        const separator = searchUrl.includes('?') ? '&' : '?';
        searchUrl = `${searchUrl}${separator}${paramName}=$INPUT`;
      }
    } else {
      // Try common patterns - we'll try multiple during probing
      const baseUrl = `https://${siteEvidence.hostname}`;
      searchUrl = `${baseUrl}/search?q=$INPUT`;
    }

    // Infer optimal test query based on site content
    this.logger.step('Inferring optimal test query...');
    let testQuery = 'test'; // fallback
    try {
      const queryResult = await this.queryTestAgent.inferTestQuery(siteEvidence);
      testQuery = queryResult.query;
      this.logger.success(`Using test query: "${testQuery}" (${queryResult.detected_content_type})`);
      this.logger.log(`Reasoning: ${queryResult.reasoning}`);
      if (queryResult.alternatives?.length > 0) {
        this.logger.log(`Alternatives: ${queryResult.alternatives.join(', ')}`);
      }
    } catch (e) {
      this.logger.warn(`Failed to infer test query, using fallback "test": ${e.message}`);
    }

    // Try multiple search URL patterns if the default doesn't work
    const baseUrl = `https://${siteEvidence.hostname}`;
    const searchUrlPatterns = [
      searchUrl,
      `${baseUrl}/search?query=$INPUT`,
      `${baseUrl}/search/?query=$INPUT`,
      `${baseUrl}/search?search=$INPUT`,
      `${baseUrl}/?s=$INPUT`,
      `${baseUrl}/search/$INPUT`,
    ];
    
    let searchEvidence = null;
    for (const pattern of searchUrlPatterns) {
      this.logger.info(`Trying search URL pattern: ${pattern.replace('$INPUT', testQuery)}`);
      searchEvidence = await this.evidence.probeSearchResults(pattern, testQuery);
      
      // If we found results via DOM or API, use this pattern
      if (searchEvidence.result_count > 0 || searchEvidence.api) {
        searchUrl = pattern;
        break;
      }
    }
    
    if (!searchEvidence) {
      searchEvidence = { result_count: 0 };
    }
    
    // Debug: Check if API was discovered
    this.logger.log(`searchEvidence.api: ${searchEvidence.api ? 'FOUND' : 'null'}`);
    this.logger.log(`searchEvidence.search_type: ${searchEvidence.search_type}`);
    
    // If we discovered a better search URL, use it
    if (searchEvidence.discovered_search_url) {
      searchUrl = searchEvidence.discovered_search_url;
      this.logger.info(`Using discovered search URL: ${searchUrl}`);
    }
    
    // Author autocomplete steps using AuthorAgent
    const autocompleteResult = await this.authorAgent.generateAutocomplete({
      site: siteEvidence, 
      search: searchEvidence,
      query: testQuery,
      expected: { title: null, subtitle: null, url_regex: `https://${siteEvidence.hostname}` }
    });
    
    // If the autocomplete steps use a different URL than what we discovered, update them
    if (autocompleteResult.autocomplete_steps?.[0]?.url && searchEvidence.discovered_search_url) {
      autocompleteResult.autocomplete_steps[0].url = searchEvidence.discovered_search_url;
    }

    // VALIDATION: Check if the generated loop selectors actually work
    // If dom_structure was found, validate that the LLM used the correct pattern
    if (searchEvidence.dom_structure?.found) {
      const expectedBase = searchEvidence.dom_structure.loopBase;
      const titleStep = autocompleteResult.autocomplete_steps?.find(s => s.output?.name?.startsWith('TITLE'));
      
      if (titleStep?.locator && !titleStep.locator.includes(searchEvidence.dom_structure.consecutiveChild)) {
        this.logger.warn(`LLM may have used wrong selector pattern. Expected to include: ${searchEvidence.dom_structure.consecutiveChild}`);
        this.logger.warn(`Got: ${titleStep.locator}`);
        this.logger.info(`Suggested base: ${expectedBase}`);
        
        // Include this info in the repair loop context
        autocompleteResult._selectorWarning = {
          expected: expectedBase,
          got: titleStep.locator,
          fieldSelectors: searchEvidence.dom_structure.fieldSelectors
        };
      }
    }

    // Build initial recipe
    let recipe = this.builder.buildSkeleton(
      siteEvidence.hostname,
      listType,
      recipeShortcut,
      autocompleteResult.autocomplete_steps
    );

    // Write recipe
    await writeFile(recipePath, JSON.stringify(recipe, null, 2));
    this.logger.success(`Wrote recipe: ${recipePath}`);

    // Phase 2b: Debug and fix autocomplete until working
    this.logger.info('Testing autocomplete_steps...');
    const autocompleteRepair = await this.repairLoop(recipe, 'autocomplete_steps', recipePath, testQuery, siteEvidence, searchEvidence);
    recipe = autocompleteRepair.recipe;
    const autocompleteFixed = autocompleteRepair.success;
    
    // Verify autocomplete results have actual data
    const autocompleteTest = await this.engine.run(recipePath, 'autocomplete', testQuery);
    const autocompleteResults = autocompleteTest.data?.results || [];
    
    // Validate autocomplete results
    const validResults = this.validateAutocompleteResults(autocompleteResults, siteEvidence.hostname);
    
    const autocompleteWorking = validResults.valid.length > 0;
    
    if (autocompleteWorking) {
      this.logger.success(`Autocomplete working: ${validResults.valid.length} valid results`);
      // Log sample result
      const sample = validResults.valid[0];
      this.logger.info(`  Sample: "${sample.TITLE}" → ${sample.URL?.slice(0, 50)}...`);
      
      // Log any warnings
      if (validResults.warnings.length > 0) {
        for (const warn of validResults.warnings) {
          this.logger.warn(`  ${warn}`);
        }
      }
      
      // Semantic validation: check if results actually match the query
      const semanticCheck = validateSemanticMatch(autocompleteResults, testQuery, 0.3);
      if (!semanticCheck.valid) {
        this.logger.warn(`⚠ Semantic mismatch: ${semanticCheck.reason}`);
        this.logger.warn(`  Results don't match query "${testQuery}" - might be a false positive`);
        
        // Show non-matching samples
        const nonMatching = semanticCheck.details.filter(d => !d.matched).slice(0, 3);
        for (const nm of nonMatching) {
          this.logger.warn(`  Non-matching: "${nm.title}"`);
        }
        
        // Try a second query to confirm false positive
        const testQueries = ['Chanel', 'Dior', 'Versace', 'Gucci'].filter(q => q.toLowerCase() !== testQuery.toLowerCase());
        const secondQuery = testQueries[0];
        
        this.logger.info(`→ Verifying with second query "${secondQuery}"...`);
        const secondTest = await this.engine.run(recipePath, 'autocomplete', secondQuery);
        const secondResults = secondTest.data?.results || [];
        
        // Check if second query returns same results (definite false positive)
        const firstTitles = new Set(autocompleteResults.map(r => r.TITLE).filter(Boolean));
        const secondTitles = new Set(secondResults.map(r => r.TITLE).filter(Boolean));
        const overlap = [...firstTitles].filter(t => secondTitles.has(t));
        
        if (overlap.length > firstTitles.size * 0.7) {
          this.logger.error(`❌ FALSE POSITIVE DETECTED: Both "${testQuery}" and "${secondQuery}" return same results`);
          this.logger.error(`  Recipe is returning static content, not search results`);
          
          // Try API interception as fallback
          this.logger.info(`→ Attempting API interception for JavaScript-powered search...`);
          
          const apiRecipe = await this.tryApiInterception(siteEvidence, testQuery, secondQuery, recipePath, listType, domain);
          
          if (apiRecipe) {
            // API interception worked! Update recipe and continue
            this.logger.success(`✓ API interception successful! Switching to API-based recipe.`);
            recipe = apiRecipe;
            await writeFile(recipePath, JSON.stringify(recipe, null, 2));
            
            // Re-run validation with new recipe
            const apiTest = await this.engine.run(recipePath, 'autocomplete', testQuery);
            const apiResults = apiTest.data?.results || [];
            const apiValidation = this.validateAutocompleteResults(apiResults, siteEvidence.hostname);
            
            if (apiValidation.valid.length > 0) {
              // Update validResults for subsequent code
              validResults.valid = apiValidation.valid;
              autocompleteResults.splice(0, autocompleteResults.length, ...apiResults);
              this.logger.success(`✓ API recipe working: ${apiValidation.valid.length} valid results`);
            } else {
              this.logger.warn(`API recipe returned results but validation failed`);
            }
          } else {
            // API interception also failed
            this.logger.warn('API interception failed - site may require manual recipe authoring.');
            
            // Cannot proceed - recipe is broken
            this.logger.info('Phase 4: Generating test file (for debugging)...');
            const testContent = this.testGen.generate(
              recipePath,
              listType,
              domain,
              testQuery,
              { TITLE: 'Test', SUBTITLE: '' },
              this.url,
              {}
            );
            await writeFile(testPath, testContent);
            this.logger.success(`Wrote test: ${testPath}`);
            
            this.logger.warn('Recipe created but returns static content instead of search results. Manual review needed.');
            return finalizeTiming({ success: false, recipePath, testPath, falsePositive: true });
          }
        } else {
          this.logger.success(`✓ Second query returns different results - semantic mismatch may be coincidental`);
        }
      } else {
        this.logger.success(`✓ Semantic match: ${semanticCheck.matchCount}/${semanticCheck.totalCount} results contain "${testQuery}"`);
      }
    } else {
      this.logger.error('autocomplete_steps not working - no valid results');
      
      // Log specific issues
      for (const issue of validResults.issues) {
        this.logger.error(`  ${issue}`);
      }
      
      if (autocompleteResults.length > 0) {
        this.logger.warn(`Got ${autocompleteResults.length} results but validation failed`);
        const sample = autocompleteResults[0];
        this.logger.warn(`  Sample: ${JSON.stringify(sample, null, 2).slice(0, 300)}`);
      }
      
      // Cannot proceed without working autocomplete
      this.logger.error('Cannot proceed to url_steps without working autocomplete_steps');
      
      // Still write test file and return failure
      this.logger.info('Phase 4: Generating test file (for debugging)...');
      const testContent = this.testGen.generate(
        recipePath,
        listType,
        domain,
        testQuery,
        { TITLE: 'Test', SUBTITLE: '' },
        this.url,
        {}
      );
      await writeFile(testPath, testContent);
      this.logger.success(`Wrote test: ${testPath}`);
      
      this.logger.warn('Recipe created but autocomplete_steps not working. Manual review needed.');
      return finalizeTiming({ success: false, recipePath, testPath });
    }
    
    // Get detail URL from working autocomplete result
    const stableResult = validResults.valid[0];
    let detailUrl = stableResult.URL;
    
    // Make sure the detail URL is absolute
    if (detailUrl && !detailUrl.startsWith('http')) {
      const baseUrl = `https://${siteEvidence.hostname}`;
      detailUrl = detailUrl.startsWith('/') ? `${baseUrl}${detailUrl}` : `${baseUrl}/${detailUrl}`;
      this.logger.info(`Converted relative URL to absolute: ${detailUrl}`);
    }

    // Phase 3: URL/detail generation
    const phase3Start = Date.now();
    timing.phase2 = phase3Start - phase2Start;
    this.logger.info('Phase 3: Generating url_steps...');
    
    const detailEvidence = await this.evidence.probeDetailPage(detailUrl);
    
    // Author url steps using AuthorAgent
    const urlResult = await this.authorAgent.generateUrlSteps({
      evidence: detailEvidence,
      required_fields: this.getRequiredFields(listType)
    });

    recipe.url_steps = urlResult.url_steps;
    await writeFile(recipePath, JSON.stringify(recipe, null, 2));

    // Phase 3b: Debug and fix url_steps until working
    this.logger.info('Testing url_steps...');
    const urlRepair = await this.repairLoop(recipe, 'url_steps', recipePath, detailUrl, siteEvidence, detailEvidence);
    recipe = urlRepair.recipe;
    const urlFixed = urlRepair.success;
    
    // Final verification - check for non-empty values
    const urlTest = await this.engine.run(recipePath, 'url', detailUrl);
    const urlResults = urlTest.data?.results || {};
    const urlFields = Object.keys(urlResults);
    const nonEmptyUrlFields = urlFields.filter(k => urlResults[k] !== '' && urlResults[k] !== null && urlResults[k] !== undefined);
    const emptyUrlFields = urlFields.filter(k => urlResults[k] === '' || urlResults[k] === null || urlResults[k] === undefined);
    
    if (nonEmptyUrlFields.length > 0) {
      this.logger.success(`URL steps working: ${nonEmptyUrlFields.join(', ')}`);
      if (emptyUrlFields.length > 0) {
        this.logger.warn(`URL steps with empty values: ${emptyUrlFields.join(', ')}`);
      }
    }

    // Phase 4: Generate test file (optional, for CI)
    const phase4Start = Date.now();
    timing.phase3 = phase4Start - phase3Start;
    this.logger.info('Phase 4: Generating test file...');
    const testContent = this.testGen.generate(
      recipePath,
      listType,
      domain,
      testQuery,
      { TITLE: stableResult.TITLE, SUBTITLE: stableResult.SUBTITLE },
      detailUrl,
      urlTest.data?.results || {}
    );
    await writeFile(testPath, testContent);
    this.logger.success(`Wrote test: ${testPath}`);
    timing.phase4 = Date.now() - phase4Start;

    // Final summary - autocompleteWorking is already validated above (we wouldn't be here otherwise)
    const missingMinFields = ['TITLE', 'COVER', 'DESCRIPTION'].filter(f => !urlResults[f] || (typeof urlResults[f] === 'string' && urlResults[f].trim() === ''));
    const badUrlFields = ['COVER', 'URL'].filter(f => urlResults[f] && typeof urlResults[f] === 'string' && urlResults[f].trim() !== '' && !urlResults[f].startsWith('https://'));
    const urlWorking = urlFixed && nonEmptyUrlFields.length > 0 && emptyUrlFields.length === 0 && missingMinFields.length === 0 && badUrlFields.length === 0;
    
    if (urlWorking) {
      this.logger.success('✓ Recipe is fully functional!');
      return finalizeTiming({ success: true, recipePath, testPath });
    } else {
      this.logger.warn('Recipe created but url_steps may need manual review:');
      if (emptyUrlFields.length > 0) {
        this.logger.warn(`  Empty fields: ${emptyUrlFields.join(', ')}`);
      }
      if (missingMinFields.length > 0) {
        this.logger.warn(`  Missing required fields: ${missingMinFields.join(', ')}`);
      }
      if (badUrlFields.length > 0) {
        this.logger.warn(`  Fields not using https://: ${badUrlFields.join(', ')}`);
      }
      return finalizeTiming({ success: false, recipePath, testPath });
    }
  }

  /**
   * URL-only mode: skip autocomplete_steps, generate only url_steps
   */
  async runUrlOnly(siteEvidence, listType, recipeShortcut, domain, recipePath, testPath, runStart = Date.now()) {
    this.logger.info('Phase 2: SKIPPED (--url-only mode)');
    const timing = { phase1: Date.now() - runStart, phase2: 0, phase3: 0, phase4: 0, total: 0 };

    const finalizeTiming = (result) => {
      timing.total = Date.now() - runStart;
      result.timing = timing;
      return result;
    };

    const detailUrl = this.url;

    // Build skeleton with empty autocomplete_steps
    let recipe = this.builder.buildSkeleton(
      siteEvidence.hostname,
      listType,
      recipeShortcut,
      []
    );
    await writeFile(recipePath, JSON.stringify(recipe, null, 2));
    this.logger.success(`Wrote recipe: ${recipePath}`);

    // Phase 3: URL/detail generation
    const phase3Start = Date.now();
    this.logger.info('Phase 3: Generating url_steps...');

    const detailEvidence = await this.evidence.probeDetailPage(detailUrl);

    const urlResult = await this.authorAgent.generateUrlSteps({
      evidence: detailEvidence,
      required_fields: this.getRequiredFields(listType)
    });

    recipe.url_steps = urlResult.url_steps;
    await writeFile(recipePath, JSON.stringify(recipe, null, 2));

    // Phase 3b: Debug and fix url_steps until working
    this.logger.info('Testing url_steps...');
    const urlRepair = await this.repairLoop(recipe, 'url_steps', recipePath, detailUrl, siteEvidence, detailEvidence);
    recipe = urlRepair.recipe;
    const urlFixed = urlRepair.success;

    // Final verification
    const urlTest = await this.engine.run(recipePath, 'url', detailUrl);
    const urlResults = urlTest.data?.results || {};
    const urlFields = Object.keys(urlResults);
    const nonEmptyUrlFields = urlFields.filter(k => urlResults[k] !== '' && urlResults[k] !== null && urlResults[k] !== undefined);
    const emptyUrlFields = urlFields.filter(k => urlResults[k] === '' || urlResults[k] === null || urlResults[k] === undefined);

    if (nonEmptyUrlFields.length > 0) {
      this.logger.success(`URL steps working: ${nonEmptyUrlFields.join(', ')}`);
      if (emptyUrlFields.length > 0) {
        this.logger.warn(`URL steps with empty values: ${emptyUrlFields.join(', ')}`);
      }
    }

    // Phase 4: Generate test file (url test only)
    const phase4Start = Date.now();
    timing.phase3 = phase4Start - phase3Start;
    this.logger.info('Phase 4: Generating test file...');
    const testContent = this.testGen.generate(
      recipePath,
      listType,
      domain,
      null,
      null,
      detailUrl,
      urlTest.data?.results || {}
    );
    await writeFile(testPath, testContent);
    this.logger.success(`Wrote test: ${testPath}`);
    timing.phase4 = Date.now() - phase4Start;

    const missingMinFields = ['TITLE', 'COVER', 'DESCRIPTION'].filter(f => !urlResults[f] || (typeof urlResults[f] === 'string' && urlResults[f].trim() === ''));
    const badUrlFields = ['COVER', 'URL'].filter(f => urlResults[f] && typeof urlResults[f] === 'string' && urlResults[f].trim() !== '' && !urlResults[f].startsWith('https://'));
    const urlWorking = urlFixed && nonEmptyUrlFields.length > 0 && emptyUrlFields.length === 0 && missingMinFields.length === 0 && badUrlFields.length === 0;

    if (urlWorking) {
      this.logger.success('✓ Recipe is fully functional!');
      return finalizeTiming({ success: true, recipePath, testPath });
    } else {
      this.logger.warn('Recipe created but url_steps may need manual review:');
      if (emptyUrlFields.length > 0) {
        this.logger.warn(`  Empty fields: ${emptyUrlFields.join(', ')}`);
      }
      if (missingMinFields.length > 0) {
        this.logger.warn(`  Missing required fields: ${missingMinFields.join(', ')}`);
      }
      if (badUrlFields.length > 0) {
        this.logger.warn(`  Fields not using https://: ${badUrlFields.join(', ')}`);
      }
      return finalizeTiming({ success: false, recipePath, testPath });
    }
  }

  /**
   * Try API interception to create a working recipe
   * Used when DOM-based approach returns static content (false positive)
   */
  async tryApiInterception(siteEvidence, testQuery, secondQuery, recipePath, listType, domain) {
    const hostname = siteEvidence.hostname;
    const baseUrl = `https://www.${hostname.replace(/^www\./, '')}`;
    
    // Common search URL patterns to try
    const searchPatterns = [
      `${baseUrl}/search/?query=${encodeURIComponent(testQuery)}`,
      `${baseUrl}/search?query=${encodeURIComponent(testQuery)}`,
      `${baseUrl}/search?q=${encodeURIComponent(testQuery)}`,
      `${baseUrl}/?s=${encodeURIComponent(testQuery)}`,
      `${baseUrl}/search/${encodeURIComponent(testQuery)}`,
    ];
    
    this.logger.info(`  Probing ${searchPatterns.length} search URL patterns for API calls...`);
    
    for (const searchUrl of searchPatterns) {
      this.logger.info(`  Trying: ${searchUrl.slice(0, 60)}...`);
      
      try {
        // Navigate to search URL and capture API responses
        const apiData = await this.evidence.captureApiOnLoad(searchUrl, testQuery);
        
        if (apiData && apiData.results && apiData.results.length > 0) {
          this.logger.success(`  ✓ Captured ${apiData.results.length} results from API!`);
          this.logger.log(`    API URL pattern: ${apiData.urlPattern}`);
          this.logger.log(`    JSON path hint: ${apiData.jsonPathHint}`);
          
          // Verify API returns different results for different queries
          const secondApiData = await this.evidence.captureApiOnLoad(
            searchUrl.replace(encodeURIComponent(testQuery), encodeURIComponent(secondQuery)),
            secondQuery
          );
          
          if (secondApiData && secondApiData.results) {
            const firstTitles = new Set(apiData.results.map(r => r.title || r.name || r.naslov || '').filter(Boolean));
            const secondTitles = new Set(secondApiData.results.map(r => r.title || r.name || r.naslov || '').filter(Boolean));
            const overlap = [...firstTitles].filter(t => secondTitles.has(t));
            
            if (overlap.length < firstTitles.size * 0.5) {
              this.logger.success(`  ✓ API returns different results for different queries!`);
              
              // Let the LLM author the API-based recipe using captured evidence
              const enrichedSearch = {
                api: {
                  url: apiData.apiUrl,
                  method: apiData.method || 'GET',
                  headers: apiData.headers || {},
                  postData: apiData.postData || null,
                  response_structure: apiData.jsonPathHint,
                  sample_data: apiData.results.slice(0, 3),
                  result_count: apiData.results.length,
                  url_pattern: apiData.urlPattern
                },
                search_type: 'api_interception',
                result_count: apiData.results.length
              };
              
              this.logger.info('  Passing captured API evidence to AuthorAgent...');
              const autocompleteResult = await this.authorAgent.generateAutocomplete({
                site: siteEvidence,
                search: enrichedSearch,
                query: testQuery,
                expected: { title: null, subtitle: null, url_regex: `https://${siteEvidence.hostname}` }
              });
              
              return this.buildRecipeFromSteps(siteEvidence, autocompleteResult.autocomplete_steps, listType, domain);
            } else {
              this.logger.warn(`  API also returns same results - may be a recommendation API`);
            }
          }
        }
      } catch (error) {
        this.logger.log(`  Failed: ${error.message}`);
      }
    }
    
    // No working API pattern found
    return null;
  }

  /**
   * Build a recipe using api_request steps from discovered API
   */
  buildApiRecipe(siteEvidence, apiData, searchUrl, listType, domain) {
    const hostname = siteEvidence.hostname;
    const baseUrl = `https://www.${hostname.replace(/^www\./, '')}`;
    
    const descriptor = normalizeApiDescriptor(apiData, searchUrl);
    const autocomplete_steps = buildApiSteps(descriptor);
    
    const recipe = {
      recipe_shortcut: domain,
      list_type: listType,
      engine_version: ENGINE_VERSION,
      title: siteEvidence.title?.split(' - ')[0]?.split(' | ')[0] || hostname,
      description: `Retrieve ${listType} from ${hostname}`,
      urls: [
        `https://${hostname}`,
        baseUrl
      ],
      headers: DEFAULT_HEADERS,
      autocomplete_steps,
      url_steps: null
    };
    
    return recipe;
  }

  /**
   * Build a recipe skeleton from LLM-authored autocomplete steps
   */
  buildRecipeFromSteps(siteEvidence, autocomplete_steps, listType, domain) {
    const hostname = siteEvidence.hostname;
    const baseUrl = `https://www.${hostname.replace(/^www\./, '')}`;
    
    return {
      recipe_shortcut: domain,
      list_type: listType,
      engine_version: ENGINE_VERSION,
      title: siteEvidence.title?.split(' - ')[0]?.split(' | ')[0] || hostname,
      description: `Retrieve ${listType} from ${hostname}`,
      urls: [
        `https://${hostname}`,
        baseUrl
      ],
      headers: DEFAULT_HEADERS,
      autocomplete_steps,
      url_steps: null
    };
  }

  /**
   * Validate autocomplete results for common issues
   * Returns: { valid: [], issues: [], warnings: [] }
   */
  validateAutocompleteResults(results, hostname) {
    const valid = [];
    const issues = [];
    const warnings = [];
    
    if (!results || results.length === 0) {
      issues.push('No results returned from engine');
      return { valid, issues, warnings };
    }
    
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const resultIssues = [];
      
      // Check TITLE (mandatory)
      if (!r.TITLE || r.TITLE.trim() === '') {
        resultIssues.push('TITLE is empty');
      } else if (/\$[A-Z_]+\$?i?\b/.test(r.TITLE)) {
        // Check for unreplaced variables like $SEASON, $TITLE$i, etc.
        resultIssues.push(`TITLE contains unreplaced variable: "${r.TITLE}"`);
      }
      
      // Check URL (mandatory)
      if (!r.URL || r.URL.trim() === '') {
        resultIssues.push('URL is empty');
      } else {
        // URL should not be just the base domain
        try {
          const url = new URL(r.URL);
          const pathLength = url.pathname.replace(/\/$/, '').length;
          if (pathLength <= 1 && !url.search) {
            resultIssues.push(`URL is just base domain: "${r.URL}" (should be a detail page)`);
          }
        } catch (e) {
          // URL might be relative
          if (r.URL === '/' || r.URL === hostname || r.URL === `https://${hostname}` || r.URL === `https://www.${hostname}`) {
            resultIssues.push(`URL is just base domain: "${r.URL}"`);
          }
        }
        
        // Check for unreplaced variables in URL
        if (/\$[A-Z_]+\$?i?\b/.test(r.URL)) {
          resultIssues.push(`URL contains unreplaced variable: "${r.URL}"`);
        }

        // Detect variable collision: doubled domain (e.g. "https://site.comhttps://site.com0")
        const domainMatches = r.URL.match(/https?:\/\//g);
        if (domainMatches && domainMatches.length > 1) {
          resultIssues.push(`URL contains doubled domain (variable collision bug): "${r.URL.slice(0, 80)}" — loop indices must stay single-digit (max "to": 9)`);
        }
      }
      
      // Check COVER (mandatory)
      if (!r.COVER || r.COVER.trim() === '') {
        resultIssues.push('COVER is empty');
      } else if (/\$[A-Z_]+\$?i?\b/.test(r.COVER)) {
        resultIssues.push(`COVER contains unreplaced variable: "${r.COVER}"`);
      }
      
      // Check other fields for unreplaced variables
      for (const [key, value] of Object.entries(r)) {
        if (key === 'TITLE' || key === 'URL' || key === 'COVER') continue; // Already checked
        if (typeof value === 'string' && /\$[A-Z_]+\$?i?\b/.test(value)) {
          resultIssues.push(`${key} contains unreplaced variable: "${value}"`);
        }
      }
      
      // SUBTITLE is optional (warning if empty, not error)
      if (!r.SUBTITLE || r.SUBTITLE.trim() === '') {
        warnings.push(`Result ${i + 1}: SUBTITLE is empty (optional)`);
      }
      
      if (resultIssues.length === 0) {
        valid.push(r);
      } else {
        for (const issue of resultIssues) {
          issues.push(`Result ${i + 1}: ${issue}`);
        }
      }
    }
    
    return { valid, issues, warnings };
  }

  /**
   * Debug-first repair loop: Run engine, debug with Puppeteer if fails, fix and retry
   */
  async repairLoop(recipe, stepType, recipePath, input, siteEvidence, stepEvidence) {
    this.logger.info(`Starting debug-first repair loop for ${stepType}...`);
    
    for (let i = 0; i < MAX_REPAIR_ITERATIONS; i++) {
      this.logger.step(`Repair iteration ${i + 1}/${MAX_REPAIR_ITERATIONS}...`);
      
      // Step 1: Run engine and check output
      const engineResult = await this.engine.run(recipePath, stepType.replace('_steps', ''), input);
      
      // Check for engine crashes/errors first
      if (!engineResult.success) {
        const errorInfo = this.parseEngineError(engineResult);
        this.logger.error(`Engine error: ${errorInfo.message}`);
        this.logger.log(`Error type: ${errorInfo.type}`);
        if (errorInfo.details) {
          this.logger.log(`Details: ${errorInfo.details.slice(0, 500)}`);
        }
      }
      
      // Check that we have valid results (different validation for autocomplete vs url)
      let hasValidResults = false;
      let validationIssues = [];
      let emptyFields = [];
      
      if (engineResult.success && stepType === 'autocomplete_steps') {
        // Use comprehensive validation for autocomplete
        const hostname = siteEvidence?.hostname || new URL(input).hostname;
        const validation = this.validateAutocompleteResults(engineResult.data?.results || [], hostname);
        
        // Require at least 3 valid results out of 10, or 30% success rate
        const totalResults = engineResult.data?.results?.length || 0;
        const validCount = validation.valid.length;
        const minRequired = Math.max(3, Math.floor(totalResults * 0.3));
        
        hasValidResults = validCount >= minRequired;
        validationIssues = validation.issues;
        
        if (!hasValidResults) {
          if (validCount > 0 && validCount < minRequired) {
            this.logger.warn(`Only ${validCount}/${totalResults} results are valid (need at least ${minRequired})`);
            this.logger.warn('This usually means the selector pattern is wrong - only some nth-child indices match');
          }
          if (validation.issues.length > 0) {
            this.logger.warn('Autocomplete validation issues:');
            for (const issue of validation.issues.slice(0, 5)) {
              this.logger.warn(`  - ${issue}`);
            }
            if (validation.issues.length > 5) {
              this.logger.warn(`  ... and ${validation.issues.length - 5} more issues`);
            }
          }
        }
      } else if (engineResult.success && engineResult.data?.results) {
        const results = engineResult.data.results;
        const fields = Object.keys(results);
        
        // Check for unreplaced variables in any field
        for (const [key, val] of Object.entries(results)) {
          if (typeof val === 'string' && /\$[A-Z_]+\$?i?\b/.test(val)) {
            validationIssues.push(`${key} contains unreplaced variable: "${val}"`);
          }
        }

        // Validate minimum required fields: TITLE, COVER, DESCRIPTION
        const minimumRequired = ['TITLE', 'COVER', 'DESCRIPTION'];
        for (const field of minimumRequired) {
          if (!results[field] || (typeof results[field] === 'string' && results[field].trim() === '')) {
            validationIssues.push(`${field} is missing or empty (required for a valid recipe)`);
          }
        }

        // Validate that COVER and URL use absolute https:// paths
        for (const field of ['COVER', 'URL']) {
          const val = results[field];
          if (val && typeof val === 'string' && val.trim() !== '' && !val.startsWith('https://')) {
            if (val.startsWith('/')) {
              validationIssues.push(`${field} is a relative path ("${val.slice(0, 80)}"). Add a store step to prepend the site base URL (e.g. "https://hostname$${field}") to produce an absolute https:// URL.`);
            } else if (val.startsWith('//')) {
              validationIssues.push(`${field} is protocol-relative ("${val.slice(0, 80)}"). Add a store step to prepend "https:" to produce an absolute https:// URL.`);
            } else if (val.includes('url(')) {
              validationIssues.push(`${field} contains CSS background-image syntax ("${val.slice(0, 100)}"). The selector is extracting a style attribute instead of an image URL. Fix by: (1) using a different selector that targets an <img> src or og:image meta tag, or (2) adding a regex step to extract the URL from inside "url(...)".`);
            } else if (val.startsWith('http://')) {
              validationIssues.push(`${field} uses http:// instead of https://. Add a store or regex step to replace http:// with https://.`);
            } else {
              validationIssues.push(`${field} is not a valid https:// URL ("${val.slice(0, 100)}"). Ensure the selector targets an image URL (img src, og:image meta tag, or JSON-LD image field) and add store/regex steps if needed to produce an absolute https:// URL.`);
            }
          }
        }
        
        // Check which fields have actual non-empty values
        const nonEmptyFields = fields.filter(k => {
          const val = results[k];
          return val !== '' && val !== null && val !== undefined;
        });
        emptyFields = fields.filter(k => {
          const val = results[k];
          return val === '' || val === null || val === undefined;
        });
        
        // Must have at least one non-empty field, no critical empty fields, and no unreplaced variables
        hasValidResults = nonEmptyFields.length > 0 && emptyFields.length === 0 && validationIssues.length === 0;
        
        if (validationIssues.length > 0) {
          this.logger.warn('URL steps validation failed:');
          for (const issue of validationIssues) {
            this.logger.warn(`  - ${issue}`);
          }
        }
      }
      
      if (hasValidResults) {
        this.logger.success(`Recipe working after ${i} iteration(s)!`);
        if (stepType === 'autocomplete_steps') {
          this.logger.info(`  → Got ${engineResult.data.results.length} results`);
        } else {
          this.logger.info(`  → Got fields: ${Object.keys(engineResult.data.results).join(', ')}`);
        }
        return { recipe, success: true };
      }
      
      // Log which fields are empty
      if (emptyFields.length > 0) {
        this.logger.warn(`Fields with empty values: ${emptyFields.join(', ')}`);
      }
      
      // Step 2: Engine failed or returned empty - debug with Puppeteer
      this.logger.warn('Engine output not as expected. Debugging recipe steps with Puppeteer...');
      
      let steps = recipe[stepType] || [];
      
      // If no steps exist, we cannot proceed - SDK must generate them
      if (steps.length === 0) {
        throw new Error(`No ${stepType} found in recipe. Cannot proceed without SDK-generated steps.`);
      }
      
      // Determine the URL to debug
      let debugUrl = input;
      if (stepType === 'autocomplete_steps') {
        // For autocomplete, we need to construct the search URL
        const loadStep = steps.find(s => s.command === 'load');
        if (loadStep?.url) {
          debugUrl = loadStep.url.replace('$INPUT', encodeURIComponent(input));
        }
      }
      
      // Step 3: Debug each step manually with Puppeteer
      const debugResult = await this.evidence.debugRecipeSteps(debugUrl, steps, stepType);
      
      this.logger.info(`Debug results: ${debugResult.workingSelectors.length} working, ${debugResult.failedSelectors.length} failed`);
      
      if (debugResult.failedSelectors.length === 0 && !hasValidResults) {
        // All selectors work but engine returns nothing - might be a loop or output issue
        this.logger.warn('All selectors found elements, but engine returned no results or validation failed.');
        this.logger.info('This might be a loop configuration, output mapping issue, or unreplaced variables.');
      }
      
      // Log failed selectors
      for (const failed of debugResult.failedSelectors) {
        const step = steps[failed.index];
        this.logger.error(`  Step ${failed.index}: "${step.description || failed.command}" - selector "${failed.locator}" found 0 elements`);
        
        const stepDebug = debugResult.stepsAnalyzed[failed.index];
        if (stepDebug.alternatives.length > 0) {
          this.logger.info(`    → Suggested alternative: "${stepDebug.alternatives[0].selector}" (found ${stepDebug.alternatives[0].count})`);
        }
      }
      
      // Step 4: Build comprehensive error context for Copilot
      const engineErrorInfo = this.parseEngineError(engineResult);
      
      // Include validation issues in the error context
      let validationContext = '';
      if (validationIssues.length > 0) {
        validationContext = `
VALIDATION ERRORS (CRITICAL - These must be fixed):
${validationIssues.map(issue => `- ${issue}`).join('\n')}

If you see "contains unreplaced variable" errors:
- The recipe is trying to combine variables like "$TEAM$i - $SEASON$i" which the engine does NOT support
- Variables can ONLY be referenced in: store.input (for URL prepending), regex.input, load.url
- The fix is to extract TITLE directly from a page element, NOT construct it from other variables
- Use SUBTITLE for secondary info like season/year instead of trying to combine into TITLE

If you see COVER URL issues:
- COVER must be a clean absolute https:// URL pointing to an image
- Best sources: meta[property="og:image"] content, img[src], JSON-LD image field
- If the value is a relative path like "/images/foo.jpg": add a store step with input "https://hostname$RAW_COVER" to prepend the base URL
- If the value contains CSS like "background-image: url(...)": change the selector to target an <img> or og:image meta tag instead. If no alternative exists, add a regex step with expression "url\\\\(([^)]+)\\\\)" to extract the URL from the CSS value
- If the value is protocol-relative "//cdn.example.com/...": add a store step with input "https:$RAW_COVER" to prepend the scheme
- Use a regex step to clean any trailing garbage characters from URLs
`;
      }
      
      const errorContext = `
Engine Error: ${engineErrorInfo.message}
Error Type: ${engineErrorInfo.type}
${engineErrorInfo.details ? `Details: ${engineErrorInfo.details.slice(0, 1000)}` : ''}
${engineResult.output ? `Raw Output: ${engineResult.output.slice(0, 500)}` : ''}
${engineResult.stderr ? `Stderr: ${engineResult.stderr.slice(0, 500)}` : ''}
${validationContext}
`.trim();
      
      const debugContext = {
        recipe,
        stepType,
        engineError: errorContext,
        engineOutput: engineResult.data,
        debugResult: {
          url: debugResult.url,
          workingSelectors: debugResult.workingSelectors,
          failedSelectors: debugResult.failedSelectors,
          suggestedFixes: debugResult.suggestedFixes,
          stepsAnalyzed: debugResult.stepsAnalyzed.map(s => ({
            index: s.index,
            command: s.command,
            locator: s.locator,
            status: s.status,
            found: s.found,
            samples: s.samples?.slice(0, 2),
            alternatives: s.alternatives?.slice(0, 3)
          }))
        },
        siteEvidence: stepType === 'autocomplete_steps' ? stepEvidence : siteEvidence
      };
      
      let fix;
      try {
        // Initialize fixer agent if not done yet
        if (!this.fixerAgent) {
          this.fixerAgent = new FixerAgent(this.orchestrator);
          await this.fixerAgent.initialize();
        }
        
        if (i === 0) {
          fix = await this.fixerAgent.startFix(
            recipe, 
            stepType, 
            `Debug analysis:\n${JSON.stringify(debugContext.debugResult, null, 2)}`,
            errorContext,
            debugContext.siteEvidence
          );
        } else {
          fix = await this.fixerAgent.continueFix(
            recipe,
            `Debug analysis:\n${JSON.stringify(debugContext.debugResult, null, 2)}\n\n${errorContext}`,
            null
          );
        }
      } catch (e) {
        this.logger.warn(`Copilot fix failed: ${e.message}`);
        
        // Try to apply suggested fixes automatically
        if (debugResult.suggestedFixes.length > 0) {
          this.logger.info('Applying automatic fixes based on debug analysis...');
          for (const suggested of debugResult.suggestedFixes) {
            if (recipe[stepType][suggested.stepIndex]) {
              this.logger.log(`  Fixing step ${suggested.stepIndex}: "${suggested.originalLocator}" → "${suggested.suggestedLocator}"`);
              recipe[stepType][suggested.stepIndex].locator = suggested.suggestedLocator;
            }
          }
          await writeFile(recipePath, JSON.stringify(recipe, null, 2));
          continue; // Retry with auto-fixed recipe
        }
        break;
      }
      
      // Step 5: Apply the fix
      let fixApplied = false;
      
      if (fix.action === 'rewrite' && fix.steps) {
        recipe[stepType] = fix.steps;
        fixApplied = true;
        this.logger.success(`Applied rewrite: ${fix.explanation || 'No explanation'}`);
      } else if (fix.action === 'patch' && fix.patches?.length) {
        recipe = this.builder.applyPatches(recipe, stepType, fix.patches);
        fixApplied = true;
        this.logger.success(`Applied ${fix.patches.length} patches: ${fix.explanation || 'No explanation'}`);
      } else {
        this.logger.warn(`Copilot returned no actionable fix: ${fix.action || 'none'}`);
        
        // Try auto-fixes as fallback
        if (debugResult.suggestedFixes.length > 0) {
          this.logger.info('Applying automatic fixes as fallback...');
          for (const suggested of debugResult.suggestedFixes) {
            if (recipe[stepType][suggested.stepIndex]) {
              recipe[stepType][suggested.stepIndex].locator = suggested.suggestedLocator;
              fixApplied = true;
            }
          }
        }
      }
      
      if (fixApplied) {
        await writeFile(recipePath, JSON.stringify(recipe, null, 2));
        this.logger.info('Recipe updated. Retrying...');
      } else {
        this.logger.error('No fix could be applied. Stopping.');
        break;
      }
    }

    this.logger.error(`Repair loop exhausted after ${MAX_REPAIR_ITERATIONS} iterations`);
    // FixerAgent session is managed by orchestrator, no need to end manually
    if (this.fixerAgent) {
      this.fixerAgent.resetIteration();
    }
    return { recipe, success: false };
  }

  getRequiredFields(listType) {
    const fields = {
      generic: ['TITLE', 'DESCRIPTION', 'FAVICON', 'COVER'],
      movies: ['TITLE', 'DATE', 'DESCRIPTION', 'RATING', 'AUTHOR', 'COVER', 'DURATION'],
      tv_shows: ['TITLE', 'DATE', 'DESCRIPTION', 'RATING', 'AUTHOR', 'COVER', 'EPISODES'],
      anime: ['TITLE', 'DATE', 'DESCRIPTION', 'RATING', 'AUTHOR', 'COVER', 'ORIGINAL_TITLE', 'EPISODES'],
      manga: ['TITLE', 'DATE', 'DESCRIPTION', 'RATING', 'AUTHOR', 'COVER', 'ORIGINAL_TITLE', 'VOLUMES'],
      books: ['TITLE', 'AUTHOR', 'YEAR', 'PAGES', 'DESCRIPTION', 'RATING', 'COVER'],
      albums: ['TITLE', 'AUTHOR', 'DATE', 'GENRE', 'COVER'],
      songs: ['TITLE', 'AUTHOR', 'DATE', 'GENRE', 'COVER', 'PRICE'],
      beers: ['TITLE', 'AUTHOR', 'RATING', 'COVER', 'STYLE', 'ALCOHOL'],
      wines: ['TITLE', 'WINERY', 'RATING', 'COVER', 'REGION', 'COUNTRY', 'GRAPES', 'STYLE'],
      software: ['TITLE', 'RATING', 'GENRE', 'DESCRIPTION', 'COVER'],
      videogames: ['TITLE', 'DATE', 'DESCRIPTION', 'RATING', 'COVER'],
      recipes: ['TITLE', 'COVER', 'INGREDIENTS', 'DESCRIPTION', 'STEPS', 'COOKING_TIME', 'DINERS'],
      podcasts: ['TITLE', 'AUTHOR', 'ALBUM', 'DATE', 'GENRE', 'COVER'],
      boardgames: ['TITLE', 'DATE', 'DESCRIPTION', 'PLAYERS', 'TIME', 'CATEGORY', 'RATING', 'COVER'],
      restaurants: ['TITLE', 'RATING', 'COVER', 'ADDRESS'],
      artists: ['AUTHOR', 'GENRE', 'COVER'],
      food: ['TITLE', 'COVER', 'DESCRIPTION']
    };
    return fields[listType] || fields.generic;
  }

  /**
   * Parse engine error into a structured format for better debugging
   */
  parseEngineError(engineResult) {
    if (engineResult.success) {
      // Not an error, but empty results
      return {
        type: 'empty_results',
        message: 'Engine ran successfully but returned no results',
        details: JSON.stringify(engineResult.data, null, 2)
      };
    }

    const output = engineResult.output || '';
    const stderr = engineResult.stderr || '';
    const combined = `${output}\n${stderr}`;

    // Categorize the error
    if (engineResult.errorType === 'spawn_error') {
      return {
        type: 'spawn_error',
        message: 'Failed to start the engine process',
        details: engineResult.error
      };
    }

    if (engineResult.errorType === 'invalid_json') {
      return {
        type: 'invalid_json',
        message: 'Engine output was not valid JSON',
        details: output.slice(0, 1000)
      };
    }

    // Check for common error patterns
    if (/no steps found/i.test(combined)) {
      return {
        type: 'no_steps',
        message: 'No steps found for the specified step type',
        details: 'The recipe may be missing the required steps array',
        suggestion: 'Ensure the recipe has autocomplete_steps or url_steps defined'
      };
    }

    if (/selector.*not found|element not found|timeout/i.test(combined)) {
      return {
        type: 'selector_timeout',
        message: 'A selector failed to find elements or timed out',
        details: combined.slice(0, 1000),
        suggestion: 'Check if the selector is correct or increase timeout'
      };
    }

    if (/network|fetch|ECONNREFUSED|ETIMEDOUT/i.test(combined)) {
      return {
        type: 'network_error',
        message: 'Network error while fetching the page',
        details: combined.slice(0, 1000),
        suggestion: 'Check if the URL is accessible and the site is not blocking requests'
      };
    }

    if (/captcha|blocked|forbidden|403/i.test(combined)) {
      return {
        type: 'blocked',
        message: 'The site may be blocking automated requests',
        details: combined.slice(0, 1000),
        suggestion: 'The site may require different headers or have anti-bot protection'
      };
    }

    if (/syntax|parse|unexpected token/i.test(combined)) {
      return {
        type: 'recipe_syntax',
        message: 'Recipe JSON syntax error',
        details: combined.slice(0, 1000),
        suggestion: 'Check the recipe JSON for syntax errors'
      };
    }

    // Generic error
    return {
      type: 'unknown',
      message: engineResult.error || 'Unknown engine error',
      details: combined.slice(0, 1000)
    };
  }
}

// Main
const args = minimist(process.argv.slice(2));

// Check for either --url or --prompt
if (!args.url && !args.prompt) {
  console.log(chalk.red('Error: Either --url or --prompt is required\n'));
  console.log('Usage:');
  console.log('  bun Engine/scripts/autoRecipe.js --url=https://example.com [--force] [--debug] [--url-only] [--output-dir=<path>]');
  console.log('  bun Engine/scripts/autoRecipe.js --prompt="movie database" [--force] [--debug]');
  console.log('');
  console.log('Options:');
  console.log('  --url=<URL>      Target website URL (Mode 1: Direct URL)');
  console.log('  --prompt=<text>  Search prompt (Mode 2: Discovery)');
  console.log('  --force          Overwrite existing recipe without prompting');
  console.log('  --debug          Enable verbose logging and stack traces');
  console.log('  --url-only       Skip autocomplete_steps, generate only url_steps');
  console.log('  --output-dir     Directory to write recipe and test files (default: generated/)');
  console.log('');
  console.log('Examples:');
  console.log('  bun Engine/scripts/autoRecipe.js --url=https://www.themoviedb.org --debug');
  console.log('  bun Engine/scripts/autoRecipe.js --url=https://www.imdb.com/title/tt0111161 --url-only');
  console.log('  bun Engine/scripts/autoRecipe.js --prompt="recipe website with ingredients"');
  console.log('  bun Engine/scripts/autoRecipe.js --prompt="wine ratings database" --force');
  process.exit(1);
}

// Main workflow
(async () => {
  try {
    let targetUrl = args.url;
    let discoveryTime = 0;
    
    // If prompt mode, discover sources first
    if (args.prompt && !args.url) {
      console.log(chalk.bold.cyan('\n🔍 Discovery Mode: Finding sources for your prompt\n'));
      const discoveryStart = Date.now();
      
      const logger = new Logger(args.debug || false);
      const orchestrator = new AgentOrchestrator(logger, args.debug || false);
      await orchestrator.initialize();
      
      const discoveryAgent = new DiscoveryAgent(orchestrator);
      await discoveryAgent.initialize();
      
      const discovery = new SourceDiscovery(logger, orchestrator, discoveryAgent);
      targetUrl = await discovery.discover(args.prompt);
      
      await orchestrator.close();
      discoveryTime = Date.now() - discoveryStart;
      
      console.log(chalk.green(`\n✓ Starting recipe generation for: ${targetUrl}\n`));
    }
    
    // Create and run AutoRecipe with the target URL
    const autoRecipe = new AutoRecipe({
      url: targetUrl,
      force: args.force || false,
      debug: args.debug || false,
      urlOnly: args['url-only'] || false,
      outputDir: args['output-dir'] || null
    });
    
    const result = await autoRecipe.run();
    
    // Display timing breakdown
    const formatTime = (ms) => {
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
    };

    console.log(chalk.cyan('\n⏱  Timing:'));
    if (discoveryTime > 0) {
      console.log(`  Discovery:                ${formatTime(discoveryTime)}`);
    }
    if (result.timing) {
      const t = result.timing;
      console.log(`  Phase 1 (probe site):     ${formatTime(t.phase1)}`);
      if (t.phase2 > 0) {
        console.log(`  Phase 2 (autocomplete):   ${formatTime(t.phase2)}`);
      } else {
        console.log(`  Phase 2 (autocomplete):   skipped`);
      }
      console.log(`  Phase 3 (url_steps):      ${formatTime(t.phase3)}`);
      console.log(`  Phase 4 (test gen):       ${formatTime(t.phase4)}`);
      const grandTotal = discoveryTime + t.total;
      console.log(`  ${'─'.repeat(36)}`);
      console.log(`  Total:                    ${formatTime(grandTotal)}`);
    }

    // Display usage stats
    if (result.usage) {
      console.log(chalk.cyan('\n📊 Copilot Usage:'));
      console.log(`  Requests: ${result.usage.requests}`);
      if (result.usage.totalTokens > 0) {
        console.log(`  Prompt tokens:     ${result.usage.totalPromptTokens.toLocaleString()}`);
        console.log(`  Completion tokens: ${result.usage.totalCompletionTokens.toLocaleString()}`);
        console.log(`  Total tokens:      ${result.usage.totalTokens.toLocaleString()}`);
      }
      // Show per-agent breakdown
      if (result.usage.byAgent && Object.keys(result.usage.byAgent).length > 0) {
        console.log('  By agent:');
        for (const [agent, stats] of Object.entries(result.usage.byAgent)) {
          console.log(`    ${agent}: ${stats.requests} req, ${stats.totalTokens.toLocaleString()} tokens (${stats.model})`);
        }
      }
    }
    
    if (result.success) {
      console.log(chalk.green('\n✓ Recipe created successfully!'));
      console.log(`  Recipe: ${result.recipePath}`);
      console.log(`  Test: ${result.testPath}`);
    } else {
      console.log(chalk.yellow('\n⚠ Recipe created but tests failed. Manual review needed.'));
      process.exit(1);
    }
  } catch (err) {
    console.error(chalk.red('\n✗ Error:'), err.message);
    if (args.debug) console.error(err.stack);
    process.exit(1);
  }
})();
