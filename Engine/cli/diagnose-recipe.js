#!/usr/bin/env node
/**
 * Recipe Diagnostics Tool
 * 
 * Deep diagnostics for debugging recipes that aren't working.
 * Runs multiple validation layers and provides actionable insights.
 * 
 * Usage:
 *   bun Engine/cli/diagnose-recipe.js <recipe-path> [--query "search term"] [--multi-query]
 * 
 * Examples:
 *   bun Engine/cli/diagnose-recipe.js generated/fragranticacom.json --query "Chanel"
 *   bun Engine/cli/diagnose-recipe.js recipes/movies.json --multi-query
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { RecipeEngine } from '../src/engine.js';
import { validateResults, validateSemanticMatch, validateMultiQuery } from '../src/validation.js';

// ANSI colors
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(msg, color = '') {
  console.log(color ? `${color}${msg}${colors.reset}` : msg);
}

function section(title) {
  console.log();
  log(`${'═'.repeat(60)}`, colors.cyan);
  log(`  ${title}`, colors.bold);
  log(`${'═'.repeat(60)}`, colors.cyan);
}

function check(label, passed, detail = '') {
  const icon = passed ? '✓' : '✗';
  const color = passed ? colors.green : colors.red;
  log(`${color}${icon}${colors.reset} ${label}${detail ? colors.dim + ' - ' + detail + colors.reset : ''}`);
}

async function runDiagnostics(recipePath, options = {}) {
  const { query = 'test', multiQuery = false, verbose = false } = options;
  
  section('RECIPE DIAGNOSTICS');
  log(`Recipe: ${recipePath}`);
  log(`Query: "${query}"`);
  
  // 1. Load and validate recipe structure
  section('1. Recipe Structure');
  
  if (!existsSync(recipePath)) {
    check('Recipe file exists', false, 'File not found');
    return;
  }
  check('Recipe file exists', true);
  
  let recipe;
  try {
    recipe = JSON.parse(readFileSync(recipePath, 'utf-8'));
    check('Valid JSON', true);
  } catch (e) {
    check('Valid JSON', false, e.message);
    return;
  }
  
  check('Has autocomplete_steps', !!recipe.autocomplete_steps, 
    recipe.autocomplete_steps ? `${recipe.autocomplete_steps.length} steps` : 'Missing');
  check('Has url_steps', !!recipe.url_steps,
    recipe.url_steps ? `${recipe.url_steps.length} steps` : 'Missing (optional)');
  
  // Analyze step types
  if (recipe.autocomplete_steps) {
    const stepTypes = recipe.autocomplete_steps.map(s => s.command);
    const hasLoad = stepTypes.includes('load');
    const hasApiRequest = stepTypes.includes('api_request') || stepTypes.includes('browser_api_request');
    const hasDomScraping = stepTypes.some(t => ['store_text', 'store_attribute'].includes(t));
    
    log(`\n  Step commands: ${[...new Set(stepTypes)].join(', ')}`, colors.dim);
    check('Has load step', hasLoad);
    
    if (hasApiRequest) {
      log(`  → Recipe uses API-based approach`, colors.blue);
    } else if (hasDomScraping) {
      log(`  → Recipe uses DOM scraping approach`, colors.blue);
    }
  }
  
  // 2. Execute recipe
  section('2. Recipe Execution');
  
  let results;
  let executionError = null;
  const startTime = Date.now();
  
  try {
    const engine = new RecipeEngine();
    await engine.init();
    engine.loadRecipe(recipe);
    
    log(`Executing autocomplete with query "${query}"...`, colors.dim);
    results = await engine.runAutocomplete(query);
    
    const duration = Date.now() - startTime;
    check('Execution successful', true, `${duration}ms`);
    check('Results returned', results && results.length > 0, `${results?.length || 0} results`);
    
    await engine.close();
  } catch (e) {
    executionError = e;
    check('Execution successful', false, e.message);
    
    if (verbose) {
      log(`\n  Error details:`, colors.dim);
      log(`  ${e.stack}`, colors.red);
    }
  }
  
  if (!results || results.length === 0) {
    section('DIAGNOSIS');
    log('Recipe returned no results. Possible causes:', colors.yellow);
    log('  1. Selectors don\'t match page structure');
    log('  2. Page requires JavaScript but js:true not set');
    log('  3. API request blocked (403) - try browser_api_request');
    log('  4. Search URL pattern incorrect');
    log('  5. Site has anti-bot protection (Cloudflare)');
    return;
  }
  
  // 3. Result validation
  section('3. Result Validation');
  
  const validation = validateResults(results, query);
  
  check('Result count OK', results.length >= 3, `${results.length} results`);
  
  const emptyTitles = results.filter(r => !r.TITLE).length;
  check('TITLE extraction', emptyTitles === 0, 
    emptyTitles > 0 ? `${emptyTitles} empty` : 'All populated');
  
  const emptyUrls = results.filter(r => !r.URL).length;
  check('URL extraction', emptyUrls === 0,
    emptyUrls > 0 ? `${emptyUrls} empty` : 'All populated');
  
  const baseDomainUrls = results.filter(r => {
    try {
      return new URL(r.URL || '').pathname === '/';
    } catch { return false; }
  }).length;
  check('URLs have paths', baseDomainUrls === 0,
    baseDomainUrls > 0 ? `${baseDomainUrls} are just base domain` : 'OK');
  
  // 4. Semantic validation
  section('4. Semantic Matching');
  
  const semantic = validateSemanticMatch(results, query);
  check('Results match query', semantic.valid, 
    `${semantic.matchCount}/${semantic.totalCount} (${semantic.matchRatio}%)`);
  
  if (!semantic.valid) {
    log(`\n  Sample results:`, colors.dim);
    semantic.details.slice(0, 5).forEach((d, i) => {
      const matchIcon = d.matched ? '✓' : '✗';
      const matchColor = d.matched ? colors.green : colors.red;
      log(`    ${matchColor}${matchIcon}${colors.reset} "${d.title}"`);
    });
    
    log(`\n  ⚠ Results don't match query "${query}"`, colors.yellow);
    log(`  This might indicate the recipe isn't actually searching.`, colors.yellow);
  }
  
  // 5. Multi-query validation (optional)
  if (multiQuery) {
    section('5. Multi-Query Validation');
    
    const testQueries = [query, 'different', 'another test', 'xyz123'];
    log(`Testing with queries: ${testQueries.join(', ')}`, colors.dim);
    
    try {
      const engine = new RecipeEngine();
      await engine.init();
      engine.loadRecipe(recipe);
      
      const multiResult = await validateMultiQuery(
        async (q) => {
          return await engine.runAutocomplete(q);
        },
        testQueries.slice(0, 3) // Use first 3 queries
      );
      
      check('Different queries return different results', multiResult.valid, multiResult.reason);
      
      if (!multiResult.valid) {
        log(`\n  ⚠ This indicates the recipe might not be searching`, colors.yellow);
        log(`  It may be returning static content regardless of query.`, colors.yellow);
      }
      
      await engine.close();
    } catch (e) {
      check('Multi-query test', false, e.message);
    }
  }
  
  // 6. Summary
  section('SUMMARY');
  
  const allPassed = validation.valid && semantic.valid;
  
  if (allPassed) {
    log('✓ Recipe appears to be working correctly!', colors.green);
  } else {
    log('Issues found:', colors.yellow);
    validation.issues.forEach(issue => log(`  • ${issue}`));
    
    log('\nRecommendations:', colors.cyan);
    
    if (emptyTitles > 0) {
      log('  • Check TITLE selector - may need adjustment');
    }
    if (baseDomainUrls > 0) {
      log('  • URL extraction broken - check href selector and store step');
    }
    if (!semantic.valid) {
      log('  • Results don\'t match query - verify search URL or API params');
      log('  • If using DOM scraping on API-heavy site, try browser_api_request');
    }
  }
  
  // Show sample output
  log('\nSample result:', colors.dim);
  console.log(JSON.stringify(results[0], null, 2));
}

// CLI
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log(`
Recipe Diagnostics Tool

Usage:
  bun Engine/cli/diagnose-recipe.js <recipe-path> [options]

Options:
  --query "text"    Search query to test (default: "test")
  --multi-query     Test with multiple queries to detect false positives
  --verbose         Show detailed error information
  --help            Show this help

Examples:
  bun Engine/cli/diagnose-recipe.js generated/fragranticacom.json --query "Chanel"
  bun Engine/cli/diagnose-recipe.js recipes/movies.json --multi-query --verbose
`);
  process.exit(0);
}

const recipePath = resolve(args[0]);
const queryIdx = args.indexOf('--query');
const query = queryIdx !== -1 && args[queryIdx + 1] ? args[queryIdx + 1] : 'test';
const multiQuery = args.includes('--multi-query');
const verbose = args.includes('--verbose');

runDiagnostics(recipePath, { query, multiQuery, verbose })
  .catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
  });
