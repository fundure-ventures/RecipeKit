#!/usr/bin/env node

/**
 * autoRecipe.js - Autonomous Recipe Authoring System for RecipeKit
 * 
 * This script orchestrates the autonomous creation of RecipeKit scraping recipes.
 * It uses agent-browser for web probing and Copilot SDK for AI-assisted authoring.
 * 
 * Usage: node scripts/autoRecipe.js --url=https://example.com
 */

import { spawn } from 'child_process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  MAX_REPAIR_ITERATIONS: 5,
  BROWSER_TIMEOUT: 10000,
  ENGINE_TIMEOUT: 30000,
  
  // Canonical folder mappings
  FOLDER_MAPPINGS: {
    'film': 'movies',
    'cinema': 'movies',
    'novel': 'books',
    'reading': 'books',
    'literature': 'books',
    'cooking': 'recipes',
    'food': 'recipes',
    'cuisine': 'recipes',
    'shop': 'products',
    'store': 'products',
    'ecommerce': 'products',
    'shopping': 'products',
    'tv': 'tv_shows',
    'television': 'tv_shows',
    'series': 'tv_shows',
    'music': 'albums',
    'album': 'albums',
    'game': 'videogames',
    'gaming': 'videogames',
    'restaurant': 'restaurants',
    'dining': 'restaurants',
    'software': 'software',
    'app': 'software',
    'application': 'software',
  }
};

// ============================================================================
// Utilities
// ============================================================================

class Logger {
  static log(message, ...args) {
    console.log(`[AutoRecipe] ${message}`, ...args);
  }

  static error(message, ...args) {
    console.error(`[AutoRecipe ERROR] ${message}`, ...args);
  }

  static warn(message, ...args) {
    console.warn(`[AutoRecipe WARN] ${message}`, ...args);
  }

  static debug(message, ...args) {
    if (process.env.DEBUG) {
      console.log(`[AutoRecipe DEBUG] ${message}`, ...args);
    }
  }
}

class ArgumentParser {
  static parse() {
    const args = process.argv.slice(2);
    const parsed = {};

    for (const arg of args) {
      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');
        parsed[key] = value || true;
      }
    }

    return parsed;
  }

  static validate(args) {
    if (!args.url) {
      Logger.error('Missing required argument: --url');
      Logger.log('Usage: node scripts/autoRecipe.js --url=https://example.com');
      process.exit(1);
    }

    try {
      new URL(args.url);
    } catch (e) {
      Logger.error('Invalid URL provided:', args.url);
      process.exit(1);
    }
  }
}

class FolderValidator {
  static canonicalize(folder) {
    // Convert to lowercase
    let canonical = folder.toLowerCase();

    // Apply mappings
    canonical = CONFIG.FOLDER_MAPPINGS[canonical] || canonical;

    // Remove invalid characters
    canonical = canonical.replace(/[^a-z0-9-]/g, '-');

    // Remove duplicate hyphens
    canonical = canonical.replace(/-+/g, '-');

    // Remove leading/trailing hyphens
    canonical = canonical.replace(/^-+|-+$/g, '');

    // Limit length
    canonical = canonical.substring(0, 32);

    return canonical;
  }

  static validate(folder) {
    if (!folder || folder.length === 0) {
      return { valid: false, error: 'Folder name cannot be empty' };
    }

    if (folder.length > 32) {
      return { valid: false, error: 'Folder name too long (max 32 chars)' };
    }

    if (!/^[a-z0-9-]+$/.test(folder)) {
      return { valid: false, error: 'Folder must contain only lowercase alphanumeric and hyphens' };
    }

    return { valid: true };
  }
}

// ============================================================================
// Web Probing (agent-browser integration)
// ============================================================================

class WebProber {
  /**
   * Extract website fingerprint for classification
   */
  static async extractFingerprint(url) {
    Logger.log('Probing website:', url);

    // Note: This is a placeholder for agent-browser integration
    // In a real implementation, this would use the playwright-browser tools
    // or shell out to an agent-browser CLI if available
    
    // For now, we'll use a simpler approach with puppeteer via the engine
    // or we can simulate the data structure

    try {
      const fingerprint = {
        url: url,
        domain: new URL(url).hostname.replace('www.', ''),
        title: null,
        metaDescription: null,
        heading: null,
        jsonLd: null,
        contentCard: null,
        timestamp: new Date().toISOString()
      };

      // TODO: Integrate with agent-browser when available
      // For now, return basic fingerprint from URL
      Logger.warn('Web probing not fully implemented - using basic fingerprint');
      
      return fingerprint;
    } catch (error) {
      Logger.error('Failed to extract fingerprint:', error.message);
      throw error;
    }
  }

  /**
   * Probe search functionality
   */
  static async probeSearch(url, query) {
    Logger.log('Probing search functionality with query:', query);

    // TODO: Implement agent-browser integration for search probing
    // This would click search, fill form, wait for results, take snapshot
    
    return {
      hasSearch: false,
      searchUrl: null,
      resultSelectors: [],
      evidence: {}
    };
  }

  /**
   * Probe detail page
   */
  static async probeDetailPage(url) {
    Logger.log('Probing detail page:', url);

    // TODO: Implement agent-browser integration for detail page probing
    
    return {
      title: null,
      metadata: {},
      coverImage: null,
      canonicalUrl: url,
      evidence: {}
    };
  }
}

// ============================================================================
// Copilot SDK Integration
// ============================================================================

class CopilotSession {
  /**
   * Placeholder for Copilot SDK integration
   * 
   * In real implementation, this would use:
   * - new CopilotClient()
   * - client.start()
   * - client.createSession()
   * - session.send()
   * - session.on() for events
   */
  
  constructor() {
    this.client = null;
    this.session = null;
  }

  async start() {
    Logger.log('Starting Copilot session...');
    
    // TODO: Initialize actual Copilot SDK
    // this.client = new CopilotClient();
    // await this.client.start();
    // this.session = await this.client.createSession({
    //   model: "gpt-4",
    //   systemMessage: { content: "You are an autonomous RecipeKit recipe author..." }
    // });
    
    Logger.warn('Copilot SDK not yet integrated - using mock');
  }

  async send(prompt, attachments = []) {
    Logger.debug('Sending prompt to Copilot:', prompt.substring(0, 100) + '...');
    
    // TODO: Send actual request to Copilot
    // await this.session.send({ prompt, attachments });
    // Wait for assistant.message and session.idle events
    
    // Mock response for now
    return null;
  }

  async destroy() {
    Logger.log('Destroying Copilot session...');
    // TODO: this.session.destroy();
    // TODO: this.client.stop();
  }
}

// ============================================================================
// Recipe Management
// ============================================================================

class RecipeManager {
  static async loadPrompt(name) {
    const promptPath = join(ROOT_DIR, 'scripts', 'prompts', `${name}.md`);
    return await readFile(promptPath, 'utf-8');
  }

  static async classifyWebsite(fingerprint, copilot) {
    Logger.log('Classifying website...');

    const template = await this.loadPrompt('classify');
    const prompt = template.replace('{{FINGERPRINT}}', JSON.stringify(fingerprint, null, 2));

    // TODO: Get actual response from Copilot
    const response = await copilot.send(prompt);

    // Mock classification for now
    const domain = fingerprint.domain;
    let topic = 'generic';
    let folder = 'generic';
    
    // Simple heuristic based on domain
    if (domain.includes('movie') || domain.includes('film') || domain.includes('imdb')) {
      topic = 'movies';
      folder = 'movies';
    } else if (domain.includes('book')) {
      topic = 'books';
      folder = 'books';
    } else if (domain.includes('music') || domain.includes('album')) {
      topic = 'albums';
      folder = 'albums';
    }

    const classification = {
      topic,
      folder,
      confidence: 0.8,
      rationale: `Inferred from domain: ${domain}`
    };

    Logger.log('Classification result:', classification);
    return classification;
  }

  static async generateAutocompleteRecipe(context, evidence, copilot) {
    Logger.log('Generating autocomplete recipe...');

    const template = await this.loadPrompt('author-autocomplete');
    const prompt = template
      .replace(/{{DOMAIN}}/g, context.domain)
      .replace(/{{TOPIC}}/g, context.topic)
      .replace(/{{FOLDER}}/g, context.folder)
      .replace('{{EVIDENCE}}', JSON.stringify(evidence, null, 2));

    // TODO: Get actual response from Copilot
    const response = await copilot.send(prompt);

    // Mock recipe for now
    const recipe = {
      recipe: {
        title: `${context.domain} ${context.topic}`,
        description: `Autocomplete recipe for ${context.domain}`,
        engine_version: "1",
        url_available: [`https://${context.domain}/*`],
        autocomplete_steps: []
      },
      testPlan: {
        queries: ["test query"]
      }
    };

    return recipe;
  }

  static async generateUrlRecipe(context, detailUrl, evidence, existingRecipe, copilot) {
    Logger.log('Generating URL recipe...');

    const template = await this.loadPrompt('author-url');
    const prompt = template
      .replace(/{{DOMAIN}}/g, context.domain)
      .replace(/{{TOPIC}}/g, context.topic)
      .replace('{{DETAIL_URL}}', detailUrl)
      .replace('{{EVIDENCE}}', JSON.stringify(evidence, null, 2))
      .replace('{{EXISTING_RECIPE}}', JSON.stringify(existingRecipe, null, 2));

    // TODO: Get actual response from Copilot
    const response = await copilot.send(prompt);

    // Mock URL steps
    return {
      url_steps: []
    };
  }

  static async fixRecipe(context, type, currentSteps, failure, evidence, copilot) {
    Logger.log(`Fixing ${type} recipe...`);

    const template = await this.loadPrompt('fixer');
    const prompt = template
      .replace(/{{DOMAIN}}/g, context.domain)
      .replace('{{TYPE}}', type)
      .replace('{{FAILURE_TYPE}}', failure.type)
      .replace('{{CURRENT_STEPS}}', JSON.stringify(currentSteps, null, 2))
      .replace('{{FAILURE_REPORT}}', failure.report)
      .replace('{{NEW_EVIDENCE}}', JSON.stringify(evidence, null, 2));

    // TODO: Get actual response from Copilot
    const response = await copilot.send(prompt);

    // Return current steps as fallback
    return type === 'autocomplete' 
      ? { autocomplete_steps: currentSteps }
      : { url_steps: currentSteps };
  }

  static async writeRecipe(folder, domain, recipe) {
    const recipePath = join(ROOT_DIR, folder, `${domain}.json`);
    
    // Ensure directory exists
    await mkdir(join(ROOT_DIR, folder), { recursive: true });
    
    // Write recipe
    await writeFile(recipePath, JSON.stringify(recipe, null, 2));
    
    Logger.log('Recipe written to:', recipePath);
    return recipePath;
  }

  static async writeTest(folder, domain, type, testContent) {
    const testDir = join(ROOT_DIR, 'tests', 'generated', folder);
    await mkdir(testDir, { recursive: true });
    
    const testPath = join(testDir, `${domain}.${type}.test.ts`);
    await writeFile(testPath, testContent);
    
    Logger.log('Test written to:', testPath);
    return testPath;
  }
}

// ============================================================================
// Recipe Testing and Validation
// ============================================================================

class RecipeValidator {
  static async runEngine(recipePath, type, input) {
    Logger.log(`Running engine: type=${type}, input=${input.substring(0, 50)}...`);

    return new Promise((resolve, reject) => {
      const proc = spawn('bun', [
        'run',
        join(ROOT_DIR, 'Engine', 'engine.js'),
        '--recipe',
        recipePath,
        '--type',
        type,
        '--input',
        input
      ]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (stderr && stderr.trim().length > 0) {
          Logger.warn('Engine stderr:', stderr);
        }

        if (code !== 0 || !stdout) {
          resolve({
            success: false,
            error: stderr || 'Engine failed with no output',
            type: this.classifyFailure(stderr || 'Engine failed')
          });
          return;
        }

        try {
          const data = JSON.parse(stdout);
          resolve({ success: true, results: data.results });
        } catch (error) {
          resolve({
            success: false,
            error: `Failed to parse engine output: ${error.message}`,
            type: 'UNKNOWN'
          });
        }
      });

      proc.on('error', (error) => {
        resolve({
          success: false,
          error: error.message,
          type: this.classifyFailure(error.message)
        });
      });
    });
  }

  static classifyFailure(errorMessage) {
    const msg = errorMessage.toLowerCase();

    if (msg.includes('selector') || msg.includes('not found') || msg.includes('locator')) {
      return 'SELECTOR_MISSING';
    }

    if (msg.includes('timeout') || msg.includes('waiting')) {
      return 'JS_RENDERED';
    }

    if (msg.includes('url') || msg.includes('navigation')) {
      return 'WRONG_URL_PATTERN';
    }

    if (msg.includes('empty') || msg.includes('no results')) {
      return 'SEARCH_FLOW_INCOMPLETE';
    }

    if (msg.includes('captcha') || msg.includes('bot') || msg.includes('blocked')) {
      return 'BOT_WALL';
    }

    return 'UNKNOWN';
  }

  static async validateAutocomplete(results) {
    if (!Array.isArray(results)) {
      return { valid: false, error: 'Results is not an array' };
    }

    if (results.length < 1) {
      return { valid: false, error: 'No results returned' };
    }

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      
      if (!item.TITLE) {
        return { valid: false, error: `Result ${i} missing TITLE` };
      }

      if (!item.URL) {
        return { valid: false, error: `Result ${i} missing URL` };
      }
    }

    return { valid: true };
  }

  static async validateUrl(result) {
    if (typeof result !== 'object') {
      return { valid: false, error: 'Result is not an object' };
    }

    if (Object.keys(result).length === 0) {
      return { valid: false, error: 'Result is empty' };
    }

    const requiredFields = ['TITLE', 'URL'];
    for (const field of requiredFields) {
      if (!result[field]) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    return { valid: true };
  }

  static generateTestContent(folder, domain, type, testQueries) {
    const queries = testQueries || ['test query'];
    const query = queries[0];

    if (type === 'autocomplete') {
      return `import { expect, test, describe } from "bun:test";
import { runEngine, findEntry, loadEnvVariables } from '../../../Engine/utils/test_utils.js';

await loadEnvVariables();
const TIMEOUT = parseInt(process.env.TEST_TIMEOUT || 30000);

const RECIPE = "${domain}.json";
const INPUT = {
  AUTOCOMPLETE: "${query}"
};

describe(RECIPE, () => {
  test("--type autocomplete", async() => {
    const results = await runEngine("${folder}/\${RECIPE}", "autocomplete", INPUT.AUTOCOMPLETE);
    
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    
    const entry = results[0];
    expect(entry.TITLE).toBeDefined();
    expect(entry.URL).toBeDefined();
  }, TIMEOUT);
});
`;
    } else {
      return `import { expect, test, describe } from "bun:test";
import { runEngine, loadEnvVariables } from '../../../Engine/utils/test_utils.js';

await loadEnvVariables();
const TIMEOUT = parseInt(process.env.TEST_TIMEOUT || 30000);

const RECIPE = "${domain}.json";
const INPUT = {
  URL: "https://${domain}/example"
};

describe(RECIPE, () => {
  test("--type url", async () => {
    const result = await runEngine("${folder}/\${RECIPE}", "url", INPUT.URL);

    expect(result.TITLE).toBeDefined();
    expect(result.URL).toBeDefined();
  }, TIMEOUT);
});
`;
    }
  }
}

// ============================================================================
// Main Orchestrator
// ============================================================================

class AutoRecipeOrchestrator {
  constructor(url) {
    this.url = url;
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    
    // Extract the main domain part
    // For 'example.com' -> 'example'
    // For 'themoviedb.org' -> 'themoviedb'
    // For 'api.example.com' -> 'example'
    // For 'example.co.uk' -> 'example'
    // Note: This is a simple heuristic and may not work for all domain structures
    const domainParts = hostname.split('.');
    let domain;
    
    if (domainParts.length === 2) {
      // Simple case: example.com
      domain = domainParts[0];
    } else if (domainParts.length > 2) {
      // Complex case: could be subdomain or multi-part TLD
      // Heuristic: if last part is common TLD and second-to-last is short (2-3 chars),
      // it's likely a country code (co.uk, com.au), use third-to-last
      const lastPart = domainParts[domainParts.length - 1];
      const secondLast = domainParts[domainParts.length - 2];
      
      if (secondLast.length <= 3 && ['com', 'co', 'org', 'net', 'gov', 'edu', 'ac'].includes(secondLast)) {
        // Likely country code TLD: example.co.uk -> 'example'
        domain = domainParts[domainParts.length - 3] || domainParts[0];
      } else {
        // Likely subdomain: api.example.com -> 'example'
        domain = domainParts[domainParts.length - 2];
      }
    } else {
      domain = domainParts[0];
    }
    
    this.context = {
      url,
      domain,
      topic: null,
      folder: null
    };
    this.copilot = new CopilotSession();
    this.recipe = null;
    this.recipePath = null;
  }

  async run() {
    try {
      Logger.log('Starting autonomous recipe authoring for:', this.url);

      // Phase 1: Classify and determine storage
      await this.phaseClassification();

      // Phase 2: Generate autocomplete recipe
      await this.phaseAutocomplete();

      // Phase 3: Generate URL recipe
      await this.phaseUrl();

      Logger.log('✓ Recipe authoring completed successfully!');
      Logger.log('Recipe saved to:', this.recipePath);

      return { success: true, recipePath: this.recipePath };

    } catch (error) {
      Logger.error('Recipe authoring failed:', error.message);
      Logger.debug('Stack trace:', error.stack);
      
      return { success: false, error: error.message };
    } finally {
      await this.copilot.destroy();
    }
  }

  async phaseClassification() {
    Logger.log('=== Phase 1: Classification ===');

    // Start Copilot session
    await this.copilot.start();

    // Extract fingerprint
    const fingerprint = await WebProber.extractFingerprint(this.url);

    // Classify website
    let classification = await RecipeManager.classifyWebsite(fingerprint, this.copilot);

    // Validate and canonicalize folder
    let attempts = 0;
    while (attempts < 3) {
      const canonical = FolderValidator.canonicalize(classification.folder);
      const validation = FolderValidator.validate(canonical);

      if (validation.valid) {
        this.context.topic = classification.topic;
        this.context.folder = canonical;
        Logger.log(`✓ Classification complete: topic=${this.context.topic}, folder=${this.context.folder}`);
        return;
      }

      Logger.warn('Invalid folder name:', validation.error);
      // TODO: Ask Copilot to fix
      attempts++;
    }

    throw new Error('Failed to get valid folder name after 3 attempts');
  }

  async phaseAutocomplete() {
    Logger.log('=== Phase 2: Autocomplete Recipe ===');

    // Probe website for search functionality
    const evidence = await WebProber.extractFingerprint(this.url);

    // Generate initial recipe
    const generated = await RecipeManager.generateAutocompleteRecipe(
      this.context,
      evidence,
      this.copilot
    );

    this.recipe = generated.recipe;

    // Write recipe to file
    this.recipePath = await RecipeManager.writeRecipe(
      this.context.folder,
      this.context.domain,
      this.recipe
    );

    // Generate and write test
    const testContent = RecipeValidator.generateTestContent(
      this.context.folder,
      this.context.domain,
      'autocomplete',
      generated.testPlan.queries
    );

    await RecipeManager.writeTest(
      this.context.folder,
      this.context.domain,
      'autocomplete',
      testContent
    );

    // Run test and repair loop
    await this.repairLoop('autocomplete', generated.testPlan.queries);

    Logger.log('✓ Autocomplete recipe complete');
  }

  async phaseUrl() {
    Logger.log('=== Phase 3: URL Recipe ===');

    // Skip if autocomplete didn't work
    if (!this.recipe.autocomplete_steps || this.recipe.autocomplete_steps.length === 0) {
      Logger.warn('Skipping URL recipe (no autocomplete steps)');
      return;
    }

    // TODO: Run autocomplete to get a real detail URL
    const detailUrl = this.url;

    // Probe detail page
    const evidence = await WebProber.probeDetailPage(detailUrl);

    // Generate URL steps
    const generated = await RecipeManager.generateUrlRecipe(
      this.context,
      detailUrl,
      evidence,
      this.recipe,
      this.copilot
    );

    // Update recipe
    this.recipe.url_steps = generated.url_steps;

    // Write updated recipe
    await RecipeManager.writeRecipe(
      this.context.folder,
      this.context.domain,
      this.recipe
    );

    // Generate and write test
    const testContent = RecipeValidator.generateTestContent(
      this.context.folder,
      this.context.domain,
      'url',
      [detailUrl]
    );

    await RecipeManager.writeTest(
      this.context.folder,
      this.context.domain,
      'url',
      testContent
    );

    // Run test and repair loop
    await this.repairLoop('url', [detailUrl]);

    Logger.log('✓ URL recipe complete');
  }

  async repairLoop(type, testInputs) {
    const maxIterations = CONFIG.MAX_REPAIR_ITERATIONS;
    let iteration = 0;

    while (iteration < maxIterations) {
      Logger.log(`Testing ${type} recipe (iteration ${iteration + 1}/${maxIterations})...`);

      const input = testInputs[0];
      const result = await RecipeValidator.runEngine(this.recipePath, type, input);

      if (result.success) {
        // Validate results
        const validation = type === 'autocomplete'
          ? await RecipeValidator.validateAutocomplete(result.results)
          : await RecipeValidator.validateUrl(result.results);

        if (validation.valid) {
          Logger.log(`✓ ${type} recipe test passed!`);
          return;
        }

        Logger.warn('Validation failed:', validation.error);
        // Continue to repair
      } else {
        Logger.warn('Engine failed:', result.error);
      }

      // Repair needed
      iteration++;

      if (iteration >= maxIterations) {
        Logger.error(`Max repair iterations reached for ${type} recipe`);
        throw new Error(`Failed to create working ${type} recipe`);
      }

      // Collect more evidence if needed
      let newEvidence = {};
      if (result.type === 'SELECTOR_MISSING' || result.type === 'JS_RENDERED') {
        // TODO: Probe deeper with agent-browser
        newEvidence = await WebProber.extractFingerprint(this.url);
      }

      // Ask Copilot to fix
      const currentSteps = type === 'autocomplete' 
        ? this.recipe.autocomplete_steps 
        : this.recipe.url_steps;

      const fixed = await RecipeManager.fixRecipe(
        this.context,
        type,
        currentSteps,
        {
          type: result.type || 'UNKNOWN',
          report: result.error || validation.error
        },
        newEvidence,
        this.copilot
      );

      // Update recipe
      if (type === 'autocomplete') {
        this.recipe.autocomplete_steps = fixed.autocomplete_steps;
      } else {
        this.recipe.url_steps = fixed.url_steps;
      }

      // Write updated recipe
      await RecipeManager.writeRecipe(
        this.context.folder,
        this.context.domain,
        this.recipe
      );

      Logger.log('Recipe updated, retrying...');
    }
  }
}

// ============================================================================
// Entry Point
// ============================================================================

async function main() {
  const args = ArgumentParser.parse();
  ArgumentParser.validate(args);

  const orchestrator = new AutoRecipeOrchestrator(args.url);
  const result = await orchestrator.run();

  if (!result.success) {
    process.exit(1);
  }
}

// Run if called directly
const currentModuleUrl = import.meta.url;
const currentModulePath = fileURLToPath(currentModuleUrl);
const mainModulePath = process.argv[1];

// Check if this is the main module being executed
if (mainModulePath === currentModulePath || mainModulePath.endsWith('/scripts/autoRecipe.js')) {
  main().catch(error => {
    Logger.error('Fatal error:', error);
    process.exit(1);
  });
}

export { AutoRecipeOrchestrator, RecipeManager, RecipeValidator, FolderValidator };
