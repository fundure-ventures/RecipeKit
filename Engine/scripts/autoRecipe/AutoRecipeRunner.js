/**
 * AutoRecipeRunner - Main pipeline controller for autonomous recipe generation.
 * Orchestrates: probe → generate → repair → validate → test generation.
 */
import { writeFile, access } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';

import { REPO_ROOT, MAX_REPAIR_ITERATIONS, ENGINE_VERSION, DEFAULT_HEADERS } from './config.js';
import { promptUser } from './helpers.js';
import { Logger } from './Logger.js';
import { EvidenceCollector } from './EvidenceCollector.js';
import { RecipeDebugger } from './RecipeDebugger.js';
import { RecipeBuilder } from './RecipeBuilder.js';
import { TestGenerator } from './TestGenerator.js';
import { EngineRunner } from './EngineRunner.js';
import { normalizeApiDescriptor, buildApiSteps, buildApiStepsFromEvidence } from './apiTools.js';

import {
  AgentOrchestrator,
  AuthorAgent,
  FixerAgent,
  QueryTestAgent,
} from '../agents/index.js';

import { validateSemanticMatch } from './validation.js';

export class AutoRecipeRunner {
  /**
   * @param {Object} options
   * @param {string} options.url - Target URL
   * @param {boolean} [options.force] - Overwrite existing
   * @param {boolean} [options.debug] - Debug mode
   * @param {AgentOrchestrator} [options.orchestrator] - Shared orchestrator (avoids duplicate init)
   */
  constructor(options) {
    this.url = options.url;
    this.force = options.force || false;
    this.debug = options.debug || false;

    this.logger = new Logger(this.debug);
    this.evidence = new EvidenceCollector(this.logger);

    // Accept shared orchestrator or create our own
    this._sharedOrchestrator = options.orchestrator || null;
    this.orchestrator = null;
    this.authorAgent = null;
    this.fixerAgent = null;
    this.queryTestAgent = null;
    this.recipeDebugger = null;

    this.builder = new RecipeBuilder(this.logger);
    this.testGen = new TestGenerator(this.logger);
    this.engine = new EngineRunner(this.logger);
  }

  async run() {
    this.logger.info(`Starting autoRecipe for ${this.url}`);

    try {
      await this.evidence.initialize();

      // Reuse shared orchestrator if provided, otherwise create new
      if (this._sharedOrchestrator) {
        this.orchestrator = this._sharedOrchestrator;
      } else {
        this.orchestrator = new AgentOrchestrator(this.logger, this.debug);
        await this.orchestrator.initialize();
      }

      // Initialize the recipe debugger with the browser instance
      this.recipeDebugger = new RecipeDebugger(this.logger, this.evidence.browser);

      // Initialize agents
      this.authorAgent = new AuthorAgent(this.orchestrator);
      await this.authorAgent.initialize();

      this.queryTestAgent = new QueryTestAgent(this.orchestrator);
      await this.queryTestAgent.initialize();

      // Phase 1: Probe site
      let siteEvidence = await this.evidence.probe(this.url);
      this.logger.log(JSON.stringify(siteEvidence, null, 2));

      // Assess probe health and detect CAPTCHA
      const probeHealth = this.evidence.assessProbeHealth(siteEvidence);
      this.logger.info(`Probe health: ${probeHealth.score}/100 (${probeHealth.healthy ? 'healthy' : 'unhealthy'})`);

      if (!probeHealth.healthy) {
        this.logger.warn(`Probe issues: ${probeHealth.issues.join(', ')}`);

        // Check for CAPTCHA - create a temporary page to detect
        const tempPage = await this.evidence.browser.newPage();
        await this.evidence.applyStealthToPage(tempPage);
        try {
          await tempPage.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await new Promise(r => setTimeout(r, 2000));
          const captchaResult = await this.evidence.detectCaptcha(tempPage);

          if (captchaResult.blocked) {
            this.logger.warn(`CAPTCHA detected: ${captchaResult.provider}`);
            this.logger.info('Site has anti-bot protection. Will attempt stealth-based approach.');
            // Enrich evidence so the agent knows about the blocking
            siteEvidence._captcha = captchaResult;
          } else {
            // Not CAPTCHA, just a JS-heavy site - try re-probe
            this.logger.info('No CAPTCHA detected. Attempting enhanced re-probe...');
            siteEvidence = await this.evidence.probe(siteEvidence.final_url || this.url);
            const reHealth = this.evidence.assessProbeHealth(siteEvidence);
            this.logger.info(`Re-probe health: ${reHealth.score}/100`);
          }
        } finally {
          await tempPage.close();
        }
      }

      // Use 'generic' as default list_type
      this.logger.info(`Using list_type: generic`);

      const domain = siteEvidence.hostname.replace(/\./g, '');

      const generatedDir = join(REPO_ROOT, 'generated');
      const recipePath = join(generatedDir, `${domain}.json`);
      const testPath = join(generatedDir, `${domain}.autorecipe.test.js`);

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
          const answer = await promptUser(chalk.yellow('What would you like to do?\n  [o] Overwrite existing recipe\n  [n] Create new recipe with suffix\n  [c] Cancel\nChoice (o/n/c): '));

          if (answer === 'o' || answer === 'overwrite') {
            this.logger.info('Overwriting existing recipe...');
            this.force = true;
          } else if (answer === 'n' || answer === 'new') {
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

            this.logger.info(`Creating new recipe as: ${newDomain}.json`);
            return await this.runWithPaths(
              siteEvidence,
              newDomain,
              newRecipePath,
              join(generatedDir, `${newDomain}.autorecipe.test.js`)
            );
          } else {
            this.logger.info('Cancelled.');
            return { success: false, cancelled: true, usage: this.orchestrator.getUsage() };
          }
        }
      }

      const result = await this.runWithPaths(siteEvidence, domain, recipePath, testPath);
      result.usage = this.orchestrator.getUsage();
      return result;

    } finally {
      await this.evidence.close();
      // Only close orchestrator if we created it ourselves
      if (!this._sharedOrchestrator && this.orchestrator) {
        await this.orchestrator.close();
      }
    }
  }

  async runWithPaths(siteEvidence, domain, recipePath, testPath) {
    const listType = 'generic';
    const recipeShortcut = domain;

    // Phase 2: Autocomplete generation
    this.logger.info('Phase 2: Generating autocomplete_steps...');

    let searchUrl = siteEvidence.search?.search_form_action;
    if (searchUrl) {
      if (!searchUrl.includes('$INPUT')) {
        let paramName = 'q';
        const locator = siteEvidence.search?.search_box_locator || '';
        const nameMatch = locator.match(/name="([^"]+)"/);
        if (nameMatch) {
          paramName = nameMatch[1];
        }

        const separator = searchUrl.includes('?') ? '&' : '?';
        searchUrl = `${searchUrl}${separator}${paramName}=$INPUT`;
      }
    } else {
      const baseUrl = `https://${siteEvidence.hostname}`;
      searchUrl = `${baseUrl}/search?q=$INPUT`;
    }

    // Infer optimal test query
    this.logger.step('Inferring optimal test query...');
    let testQuery = 'test';
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

    // Try multiple search URL patterns
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

      if (searchEvidence.result_count > 0 || searchEvidence.api) {
        searchUrl = pattern;
        break;
      }
    }

    if (!searchEvidence) {
      searchEvidence = { result_count: 0 };
    }

    // Fallback: Interactive API discovery if all URL patterns failed
    if (searchEvidence.result_count === 0 && !searchEvidence.api) {
      this.logger.info('All search URL patterns failed. Trying interactive API discovery...');

      const discoveredApi = await this.evidence.discoverSearchAPI(
        `https://${siteEvidence.hostname}`,
        testQuery
      );

      if (discoveredApi) {
        this.logger.success('Interactive API discovery found a search endpoint!');
        searchEvidence.api = discoveredApi;
        searchEvidence.search_type = 'interactive_api_discovery';
      }
    }

    this.logger.log(`searchEvidence.api: ${searchEvidence.api ? 'FOUND' : 'null'}`);
    this.logger.log(`searchEvidence.search_type: ${searchEvidence.search_type}`);

    if (searchEvidence.discovered_search_url) {
      searchUrl = searchEvidence.discovered_search_url;
      this.logger.info(`Using discovered search URL: ${searchUrl}`);
    }

    // Author autocomplete steps
    // For API-based recipes, build steps programmatically (LLMs often get POST/body wrong)
    let autocompleteResult;
    if (searchEvidence.api) {
      this.logger.info('API evidence found — building api_request steps programmatically');
      const apiSteps = buildApiStepsFromEvidence(searchEvidence.api);
      if (apiSteps.length > 0) {
        autocompleteResult = {
          autocomplete_steps: apiSteps,
          assumptions: ['Built programmatically from intercepted API evidence'],
          known_fragility: [],
          extra_probes_needed: []
        };
        this.logger.success(`Built ${apiSteps.length} steps from API evidence (${searchEvidence.api.method} ${searchEvidence.api.url_pattern?.slice(0, 60)})`);
      }
    }

    if (!autocompleteResult) {
      autocompleteResult = await this.authorAgent.generateAutocomplete({
        site: siteEvidence,
        search: searchEvidence,
        query: testQuery,
        expected: { title: null, subtitle: null, url_regex: `https://${siteEvidence.hostname}` }
      });
    }

    if (autocompleteResult.autocomplete_steps?.[0]?.url && searchEvidence.discovered_search_url) {
      autocompleteResult.autocomplete_steps[0].url = searchEvidence.discovered_search_url;
    }

    // Validate loop selectors
    if (searchEvidence.dom_structure?.found) {
      const titleStep = autocompleteResult.autocomplete_steps?.find(s => s.output?.name?.startsWith('TITLE'));

      if (titleStep?.locator && !titleStep.locator.includes(searchEvidence.dom_structure.consecutiveChild)) {
        this.logger.warn(`LLM may have used wrong selector pattern. Expected to include: ${searchEvidence.dom_structure.consecutiveChild}`);
        this.logger.warn(`Got: ${titleStep.locator}`);
        this.logger.info(`Suggested base: ${searchEvidence.dom_structure.loopBase}`);

        autocompleteResult._selectorWarning = {
          expected: searchEvidence.dom_structure.loopBase,
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

    await writeFile(recipePath, JSON.stringify(recipe, null, 2));
    this.logger.success(`Wrote recipe: ${recipePath}`);

    // Phase 2b: Debug and fix autocomplete
    this.logger.info('Testing autocomplete_steps...');
    const autocompleteRepair = await this.repairLoop(recipe, 'autocomplete_steps', recipePath, testQuery, siteEvidence, searchEvidence);
    recipe = autocompleteRepair.recipe;

    const autocompleteTest = await this.engine.run(recipePath, 'autocomplete', testQuery);
    const autocompleteResults = autocompleteTest.data?.results || [];

    const validResults = this.validateAutocompleteResults(autocompleteResults, siteEvidence.hostname);

    const autocompleteWorking = validResults.valid.length > 0;

    if (autocompleteWorking) {
      this.logger.success(`Autocomplete working: ${validResults.valid.length} valid results`);
      const sample = validResults.valid[0];
      this.logger.info(`  Sample: "${sample.TITLE}" → ${sample.URL?.slice(0, 50)}...`);

      if (validResults.warnings.length > 0) {
        for (const warn of validResults.warnings) {
          this.logger.warn(`  ${warn}`);
        }
      }

      // Semantic validation
      const semanticCheck = validateSemanticMatch(autocompleteResults, testQuery, 0.3);
      if (!semanticCheck.valid) {
        this.logger.warn(`⚠ Semantic mismatch: ${semanticCheck.reason}`);
        this.logger.warn(`  Results don't match query "${testQuery}" - might be a false positive`);

        const nonMatching = semanticCheck.details.filter(d => !d.matched).slice(0, 3);
        for (const nm of nonMatching) {
          this.logger.warn(`  Non-matching: "${nm.title}"`);
        }

        // Use QueryTestAgent to pick a domain-appropriate verification query
        let secondQuery = 'test';
        try {
          const verifyQueryResult = await this.queryTestAgent.inferTestQuery(siteEvidence);
          const alternatives = verifyQueryResult.alternatives || [];
          secondQuery = alternatives.find(q => q.toLowerCase() !== testQuery.toLowerCase()) || 'example';
        } catch (e) {
          secondQuery = 'example';
        }

        this.logger.info(`→ Verifying with second query "${secondQuery}"...`);
        const secondTest = await this.engine.run(recipePath, 'autocomplete', secondQuery);
        const secondResults = secondTest.data?.results || [];

        const firstTitles = new Set(autocompleteResults.map(r => r.TITLE).filter(Boolean));
        const secondTitles = new Set(secondResults.map(r => r.TITLE).filter(Boolean));
        const overlap = [...firstTitles].filter(t => secondTitles.has(t));

        if (overlap.length > firstTitles.size * 0.7) {
          this.logger.error(`❌ FALSE POSITIVE DETECTED: Both "${testQuery}" and "${secondQuery}" return same results`);
          this.logger.error(`  Recipe is returning static content, not search results`);

          this.logger.info(`→ Attempting API interception for JavaScript-powered search...`);

          const apiRecipe = await this.tryApiInterception(siteEvidence, testQuery, secondQuery, recipePath, listType, domain);

          if (apiRecipe) {
            this.logger.success(`✓ API interception successful! Switching to API-based recipe.`);
            recipe = apiRecipe;
            await writeFile(recipePath, JSON.stringify(recipe, null, 2));

            const apiTest = await this.engine.run(recipePath, 'autocomplete', testQuery);
            const apiResults = apiTest.data?.results || [];
            const apiValidation = this.validateAutocompleteResults(apiResults, siteEvidence.hostname);

            if (apiValidation.valid.length > 0) {
              validResults.valid = apiValidation.valid;
              autocompleteResults.splice(0, autocompleteResults.length, ...apiResults);
              this.logger.success(`✓ API recipe working: ${apiValidation.valid.length} valid results`);
            } else {
              this.logger.warn(`API recipe returned results but validation failed`);
            }
          } else {
            this.logger.warn('API interception failed - site may require manual recipe authoring.');

            this.logger.info('Phase 4: Generating test file (for debugging)...');
            const testContent = this.testGen.generate(
              recipePath, listType, domain, testQuery,
              { TITLE: 'Test', SUBTITLE: '' },
              this.url, {}
            );
            await writeFile(testPath, testContent);
            this.logger.success(`Wrote test: ${testPath}`);

            this.logger.warn('Recipe created but returns static content instead of search results. Manual review needed.');
            return { success: false, recipePath, testPath, falsePositive: true };
          }
        } else {
          this.logger.success(`✓ Second query returns different results - semantic mismatch may be coincidental`);
        }
      } else {
        this.logger.success(`✓ Semantic match: ${semanticCheck.matchCount}/${semanticCheck.totalCount} results contain "${testQuery}"`);
      }
    } else {
      this.logger.error('autocomplete_steps not working - no valid results');

      for (const issue of validResults.issues) {
        this.logger.error(`  ${issue}`);
      }

      if (autocompleteResults.length > 0) {
        this.logger.warn(`Got ${autocompleteResults.length} results but validation failed`);
        const sample = autocompleteResults[0];
        this.logger.warn(`  Sample: ${JSON.stringify(sample, null, 2).slice(0, 300)}`);
      }

      this.logger.error('Cannot proceed to url_steps without working autocomplete_steps');

      this.logger.info('Phase 4: Generating test file (for debugging)...');
      const testContent = this.testGen.generate(
        recipePath, listType, domain, testQuery,
        { TITLE: 'Test', SUBTITLE: '' },
        this.url, {}
      );
      await writeFile(testPath, testContent);
      this.logger.success(`Wrote test: ${testPath}`);

      this.logger.warn('Recipe created but autocomplete_steps not working. Manual review needed.');
      return { success: false, recipePath, testPath };
    }

    // Get detail URL from working autocomplete result
    const stableResult = validResults.valid[0];
    let detailUrl = stableResult.URL;

    if (detailUrl && !detailUrl.startsWith('http')) {
      const baseUrl2 = `https://${siteEvidence.hostname}`;
      detailUrl = detailUrl.startsWith('/') ? `${baseUrl2}${detailUrl}` : `${baseUrl2}/${detailUrl}`;
      this.logger.info(`Converted relative URL to absolute: ${detailUrl}`);
    }

    // Phase 3: URL/detail generation
    this.logger.info('Phase 3: Generating url_steps...');

    const detailEvidence = await this.evidence.probeDetailPage(detailUrl);

    const urlResult = await this.authorAgent.generateUrlSteps({
      evidence: detailEvidence,
      required_fields: this.getRequiredFields(listType)
    });

    recipe.url_steps = urlResult.url_steps;
    await writeFile(recipePath, JSON.stringify(recipe, null, 2));

    // Phase 3b: Debug and fix url_steps
    this.logger.info('Testing url_steps...');
    const urlRepair = await this.repairLoop(recipe, 'url_steps', recipePath, detailUrl, siteEvidence, detailEvidence);
    recipe = urlRepair.recipe;
    const urlFixed = urlRepair.success;

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

    // Phase 4: Generate test file
    this.logger.info('Phase 4: Generating test file...');
    const testContent = this.testGen.generate(
      recipePath, listType, domain, testQuery,
      { TITLE: stableResult.TITLE, SUBTITLE: stableResult.SUBTITLE },
      detailUrl,
      urlTest.data?.results || {}
    );
    await writeFile(testPath, testContent);
    this.logger.success(`Wrote test: ${testPath}`);

    const urlWorking = urlFixed && nonEmptyUrlFields.length > 0 && emptyUrlFields.length === 0;

    if (urlWorking) {
      this.logger.success('✓ Recipe is fully functional!');
      return { success: true, recipePath, testPath };
    } else {
      this.logger.warn('Recipe created but url_steps may need manual review:');
      if (emptyUrlFields.length > 0) {
        this.logger.warn(`  Empty fields: ${emptyUrlFields.join(', ')}`);
      }
      return { success: false, recipePath, testPath };
    }
  }

  async tryApiInterception(siteEvidence, testQuery, secondQuery, recipePath, listType, domain) {
    const hostname = siteEvidence.hostname;
    const baseUrl = `https://www.${hostname.replace(/^www\./, '')}`;

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
        const apiData = await this.evidence.captureApiOnLoad(searchUrl, testQuery);

        if (apiData && apiData.results && apiData.results.length > 0) {
          this.logger.success(`  ✓ Captured ${apiData.results.length} results from API!`);
          this.logger.log(`    API URL pattern: ${apiData.urlPattern}`);
          this.logger.log(`    JSON path hint: ${apiData.jsonPathHint}`);

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
              return this.buildApiRecipe(siteEvidence, apiData, searchUrl, listType, domain);
            } else {
              this.logger.warn(`  API also returns same results - may be a recommendation API`);
            }
          }
        }
      } catch (error) {
        this.logger.log(`  Failed: ${error.message}`);
      }
    }

    return null;
  }

  buildApiRecipe(siteEvidence, apiData, searchUrl, listType, domain) {
    const hostname = siteEvidence.hostname;
    const baseUrl = `https://www.${hostname.replace(/^www\./, '')}`;

    const descriptor = normalizeApiDescriptor(apiData, searchUrl);
    const autocomplete_steps = buildApiSteps(descriptor);

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

      if (!r.TITLE || r.TITLE.trim() === '') {
        resultIssues.push('TITLE is empty');
      } else if (/\$[A-Z_]+\$?i?\b/.test(r.TITLE)) {
        resultIssues.push(`TITLE contains unreplaced variable: "${r.TITLE}"`);
      }

      if (!r.URL || r.URL.trim() === '') {
        resultIssues.push('URL is empty');
      } else {
        try {
          const url = new URL(r.URL);
          const pathLength = url.pathname.replace(/\/$/, '').length;
          if (pathLength <= 1 && !url.search) {
            resultIssues.push(`URL is just base domain: "${r.URL}" (should be a detail page)`);
          }
        } catch (e) {
          if (r.URL === '/' || r.URL === hostname || r.URL === `https://${hostname}` || r.URL === `https://www.${hostname}`) {
            resultIssues.push(`URL is just base domain: "${r.URL}"`);
          }
        }

        // Detect variable collision: doubled domain (e.g. "https://site.comhttps://site.com0")
        const domainMatches = r.URL.match(/https?:\/\//g);
        if (domainMatches && domainMatches.length > 1) {
          resultIssues.push(`URL contains doubled domain (variable collision bug): "${r.URL.slice(0, 80)}" — loop indices must stay single-digit (max "to": 9)`);
        }

        if (/\$[A-Z_]+\$?i?\b/.test(r.URL)) {
          resultIssues.push(`URL contains unreplaced variable: "${r.URL}"`);
        }
      }

      if (!r.COVER || r.COVER.trim() === '') {
        resultIssues.push('COVER is empty');
      } else if (/\$[A-Z_]+\$?i?\b/.test(r.COVER)) {
        resultIssues.push(`COVER contains unreplaced variable: "${r.COVER}"`);
      }

      for (const [key, value] of Object.entries(r)) {
        if (key === 'TITLE' || key === 'URL' || key === 'COVER') continue;
        if (typeof value === 'string' && /\$[A-Z_]+\$?i?\b/.test(value)) {
          resultIssues.push(`${key} contains unreplaced variable: "${value}"`);
        }
      }

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

  async repairLoop(recipe, stepType, recipePath, input, siteEvidence, stepEvidence) {
    this.logger.info(`Starting debug-first repair loop for ${stepType}...`);

    for (let i = 0; i < MAX_REPAIR_ITERATIONS; i++) {
      this.logger.step(`Repair iteration ${i + 1}/${MAX_REPAIR_ITERATIONS}...`);

      const engineResult = await this.engine.run(recipePath, stepType.replace('_steps', ''), input);

      if (!engineResult.success) {
        const errorInfo = this.parseEngineError(engineResult);
        this.logger.error(`Engine error: ${errorInfo.message}`);
        this.logger.log(`Error type: ${errorInfo.type}`);
        if (errorInfo.details) {
          this.logger.log(`Details: ${errorInfo.details.slice(0, 500)}`);
        }
      }

      let hasValidResults = false;
      let validationIssues = [];
      let emptyFields = [];

      if (engineResult.success && stepType === 'autocomplete_steps') {
        const hostname = siteEvidence?.hostname || new URL(input).hostname;
        const validation = this.validateAutocompleteResults(engineResult.data?.results || [], hostname);

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

        for (const [key, val] of Object.entries(results)) {
          if (typeof val === 'string' && /\$[A-Z_]+\$?i?\b/.test(val)) {
            validationIssues.push(`${key} contains unreplaced variable: "${val}"`);
          }
        }

        const nonEmptyFields = fields.filter(k => {
          const val = results[k];
          return val !== '' && val !== null && val !== undefined;
        });
        emptyFields = fields.filter(k => {
          const val = results[k];
          return val === '' || val === null || val === undefined;
        });

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

      if (emptyFields.length > 0) {
        this.logger.warn(`Fields with empty values: ${emptyFields.join(', ')}`);
      }

      this.logger.warn('Engine output not as expected. Debugging recipe steps with Puppeteer...');

      let steps = recipe[stepType] || [];

      if (steps.length === 0) {
        throw new Error(`No ${stepType} found in recipe. Cannot proceed without SDK-generated steps.`);
      }

      let debugUrl = input;
      if (stepType === 'autocomplete_steps') {
        const loadStep = steps.find(s => s.command === 'load');
        if (loadStep?.url) {
          debugUrl = loadStep.url.replace('$INPUT', encodeURIComponent(input));
        }
      }

      const debugResult = await this.recipeDebugger.debugRecipeSteps(debugUrl, steps, stepType);

      this.logger.info(`Debug results: ${debugResult.workingSelectors.length} working, ${debugResult.failedSelectors.length} failed`);

      if (debugResult.failedSelectors.length === 0 && !hasValidResults) {
        this.logger.warn('All selectors found elements, but engine returned no results or validation failed.');
        this.logger.info('This might be a loop configuration, output mapping issue, or unreplaced variables.');
      }

      for (const failed of debugResult.failedSelectors) {
        const step = steps[failed.index];
        this.logger.error(`  Step ${failed.index}: "${step.description || failed.command}" - selector "${failed.locator}" found 0 elements`);

        const stepDebug = debugResult.stepsAnalyzed[failed.index];
        if (stepDebug.alternatives.length > 0) {
          this.logger.info(`    → Suggested alternative: "${stepDebug.alternatives[0].selector}" (found ${stepDebug.alternatives[0].count})`);
        }
      }

      const engineErrorInfo = this.parseEngineError(engineResult);

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
`;
      }

      // Detect HTTP 403 errors - the agent needs to know the API is blocked
      let httpErrorContext = '';
      const rawOutput = engineResult.output || engineResult.stderr || '';
      if (rawOutput.includes('403') || rawOutput.includes('Forbidden')) {
        httpErrorContext = `
HTTP 403 FORBIDDEN DETECTED:
- The site's API is blocking automated requests (likely anti-bot protection like DataDome, Cloudflare, etc.)
- Do NOT keep retrying the same API endpoint - it will always return 403
- Switch to a DOM-based approach instead: use "load" to navigate to the search page, then use store_text/store_attribute to extract data from HTML elements
- Use the site's regular search page URL (e.g. /search?q=$INPUT) instead of internal API endpoints
`;
      }

      const errorContext = `
Engine Error: ${engineErrorInfo.message}
Error Type: ${engineErrorInfo.type}
${engineErrorInfo.details ? `Details: ${engineErrorInfo.details.slice(0, 1000)}` : ''}
${engineResult.output ? `Raw Output: ${engineResult.output.slice(0, 500)}` : ''}
${engineResult.stderr ? `Stderr: ${engineResult.stderr.slice(0, 500)}` : ''}
${httpErrorContext}
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

        if (debugResult.suggestedFixes.length > 0) {
          this.logger.info('Applying automatic fixes based on debug analysis...');
          for (const suggested of debugResult.suggestedFixes) {
            if (recipe[stepType][suggested.stepIndex]) {
              this.logger.log(`  Fixing step ${suggested.stepIndex}: "${suggested.originalLocator}" → "${suggested.suggestedLocator}"`);
              recipe[stepType][suggested.stepIndex].locator = suggested.suggestedLocator;
            }
          }
          await writeFile(recipePath, JSON.stringify(recipe, null, 2));
          continue;
        }
        break;
      }

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

  parseEngineError(engineResult) {
    if (engineResult.success) {
      return {
        type: 'empty_results',
        message: 'Engine ran successfully but returned no results',
        details: JSON.stringify(engineResult.data, null, 2)
      };
    }

    const output = engineResult.output || '';
    const stderr = engineResult.stderr || '';
    const combined = `${output}\n${stderr}`;

    if (engineResult.errorType === 'spawn_error') {
      return { type: 'spawn_error', message: 'Failed to start the engine process', details: engineResult.error };
    }

    if (engineResult.errorType === 'invalid_json') {
      return { type: 'invalid_json', message: 'Engine output was not valid JSON', details: output.slice(0, 1000) };
    }

    if (/no steps found/i.test(combined)) {
      return { type: 'no_steps', message: 'No steps found for the specified step type', details: 'The recipe may be missing the required steps array' };
    }

    if (/selector.*not found|element not found|timeout/i.test(combined)) {
      return { type: 'selector_timeout', message: 'A selector failed to find elements or timed out', details: combined.slice(0, 1000) };
    }

    if (/network|fetch|ECONNREFUSED|ETIMEDOUT/i.test(combined)) {
      return { type: 'network_error', message: 'Network error while fetching the page', details: combined.slice(0, 1000) };
    }

    if (/captcha|blocked|forbidden|403/i.test(combined)) {
      return { type: 'blocked', message: 'The site may be blocking automated requests', details: combined.slice(0, 1000) };
    }

    if (/syntax|parse|unexpected token/i.test(combined)) {
      return { type: 'recipe_syntax', message: 'Recipe JSON syntax error', details: combined.slice(0, 1000) };
    }

    return { type: 'unknown', message: engineResult.error || 'Unknown engine error', details: combined.slice(0, 1000) };
  }
}
