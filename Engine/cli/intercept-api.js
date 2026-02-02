#!/usr/bin/env bun
/**
 * intercept-api.js - Intercept and analyze API calls made by a page
 * 
 * Usage:
 *   bun Engine/cli/intercept-api.js <url> [options]
 * 
 * Examples:
 *   bun Engine/cli/intercept-api.js "https://www.fragrantica.com/search/?query=Chanel"
 *   bun Engine/cli/intercept-api.js "https://example.com/search?q=test" --filter "api,search,query"
 *   bun Engine/cli/intercept-api.js "https://example.com" --json --wait 10000
 */

import puppeteer from 'puppeteer';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2), {
  string: ['filter', 'f', 'wait', 'w'],
  boolean: ['json', 'help', 'h', 'verbose', 'v', 'generate-recipe', 'g'],
  alias: { f: 'filter', h: 'help', w: 'wait', v: 'verbose', g: 'generate-recipe' },
  default: { wait: 8000 }
});

const url = args._[0];
const filterPatterns = args.filter ? args.filter.split(',').map(p => p.trim().toLowerCase()) : [];
const waitTime = parseInt(args.wait);
const jsonOutput = args.json;
const verbose = args.verbose;
const generateRecipe = args['generate-recipe'];

if (args.help || !url) {
  console.log(`
intercept-api - Intercept and analyze API calls made by a page

Usage:
  bun Engine/cli/intercept-api.js <url> [options]

Options:
  --filter, -f <patterns>   Comma-separated patterns to filter requests (e.g., "api,search,algolia")
  --wait, -w <ms>           Time to wait for requests (default: 8000)
  --json                    Output as JSON
  --verbose, -v             Show all request details
  --generate-recipe, -g     Generate recipe steps for detected APIs
  --help, -h                Show this help

Examples:
  bun Engine/cli/intercept-api.js "https://www.fragrantica.com/search/?query=Chanel"
  bun Engine/cli/intercept-api.js "https://example.com/search?q=test" --filter "algolia,api"
  bun Engine/cli/intercept-api.js "https://example.com" --json --generate-recipe
`);
  process.exit(0);
}

// Known API patterns
const API_PATTERNS = {
  algolia: {
    urlPattern: /algolia|\.algolianet\.com|algoliasearch/i,
    name: 'Algolia InstantSearch',
    description: 'Algolia search API - typically returns JSON with hits array'
  },
  elasticsearch: {
    urlPattern: /elasticsearch|_search|_msearch/i,
    name: 'Elasticsearch',
    description: 'Elasticsearch search API'
  },
  graphql: {
    urlPattern: /graphql/i,
    name: 'GraphQL',
    description: 'GraphQL API endpoint'
  },
  rest_api: {
    urlPattern: /\/api\/|\/v[0-9]+\//i,
    name: 'REST API',
    description: 'Generic REST API endpoint'
  },
  search_api: {
    urlPattern: /search|query|autocomplete|suggest/i,
    name: 'Search API',
    description: 'Generic search/autocomplete endpoint'
  }
};

function identifyApiType(url, contentType) {
  for (const [key, pattern] of Object.entries(API_PATTERNS)) {
    if (pattern.urlPattern.test(url)) {
      return { type: key, ...pattern };
    }
  }
  
  if (contentType?.includes('application/json')) {
    return { type: 'json_api', name: 'JSON API', description: 'Returns JSON data' };
  }
  
  return null;
}

function extractAlgoliaParams(url, postData) {
  const result = {
    appId: null,
    apiKey: null,
    indexName: null,
    query: null
  };
  
  try {
    const urlObj = new URL(url);
    
    // Extract from URL path (e.g., /1/indexes/indexName/query)
    const pathMatch = url.match(/\/1\/indexes\/([^/]+)/);
    if (pathMatch) {
      result.indexName = pathMatch[1];
    }
    
    // Extract app ID from hostname (e.g., APPID-dsn.algolia.net)
    const hostMatch = urlObj.hostname.match(/^([A-Z0-9]+)(-\d+)?(-dsn)?\.algolia/i);
    if (hostMatch) {
      result.appId = hostMatch[1];
    }
    
    // Extract from query params
    result.apiKey = urlObj.searchParams.get('x-algolia-api-key');
    if (!result.appId) {
      result.appId = urlObj.searchParams.get('x-algolia-application-id');
    }
    
    // Extract from POST body
    if (postData) {
      try {
        const body = JSON.parse(postData);
        if (body.requests?.[0]) {
          result.indexName = body.requests[0].indexName || result.indexName;
          result.query = body.requests[0].query || body.requests[0].params?.match(/query=([^&]*)/)?.[1];
        } else if (body.query !== undefined) {
          result.query = body.query;
        } else if (body.params) {
          const queryMatch = body.params.match(/query=([^&]*)/);
          if (queryMatch) result.query = decodeURIComponent(queryMatch[1]);
        }
      } catch (e) {
        // Not JSON, try URL-encoded
        if (postData.includes('query=')) {
          const match = postData.match(/query=([^&]*)/);
          if (match) result.query = decodeURIComponent(match[1]);
        }
      }
    }
  } catch (e) {
    // URL parsing failed
  }
  
  return result;
}

function generateRecipeSteps(apiCall) {
  const steps = [];
  
  if (apiCall.apiType?.type === 'algolia') {
    const params = extractAlgoliaParams(apiCall.url, apiCall.postData);
    
    // Build the API URL template
    let apiUrl = apiCall.url.split('?')[0];
    
    // For Algolia, we need to construct the proper API call
    steps.push({
      command: 'api_request',
      url: apiUrl,
      config: {
        method: apiCall.method,
        headers: {
          'Content-Type': 'application/json',
          'x-algolia-api-key': params.apiKey || '<API_KEY>',
          'x-algolia-application-id': params.appId || '<APP_ID>'
        },
        body: JSON.stringify({
          requests: [{
            indexName: params.indexName || '<INDEX_NAME>',
            params: 'query=$INPUT&hitsPerPage=10'
          }]
        })
      },
      output: { name: 'API_RESPONSE' },
      description: 'Fetch search results from Algolia API'
    });
    
    // Add JSON extraction steps
    steps.push({
      command: 'json_store_text',
      input: 'API_RESPONSE',
      locator: 'results[0].hits[$i].name',
      output: { name: 'TITLE$i' },
      config: {
        loop: { index: 'i', from: 0, to: 9, step: 1 }
      },
      description: 'Extract item names from API response'
    });
    
    steps.push({
      command: 'json_store_text',
      input: 'API_RESPONSE',
      locator: 'results[0].hits[$i].url',
      output: { name: 'URL$i' },
      config: {
        loop: { index: 'i', from: 0, to: 9, step: 1 }
      },
      description: 'Extract item URLs from API response'
    });
    
    steps.push({
      command: 'json_store_text',
      input: 'API_RESPONSE',
      locator: 'results[0].hits[$i].image',
      output: { name: 'COVER$i' },
      config: {
        loop: { index: 'i', from: 0, to: 9, step: 1 }
      },
      description: 'Extract item images from API response'
    });
  } else {
    // Generic JSON API
    steps.push({
      command: 'api_request',
      url: apiCall.url.replace(/query=[^&]+/, 'query=$INPUT'),
      config: {
        method: apiCall.method,
        headers: apiCall.headers || {}
      },
      output: { name: 'API_RESPONSE' },
      description: 'Fetch data from API'
    });
  }
  
  return steps;
}

async function main() {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  const interceptedRequests = [];
  const apiCalls = [];
  
  // Enable request interception
  await page.setRequestInterception(true);
  
  page.on('request', request => {
    const reqUrl = request.url();
    const method = request.method();
    const headers = request.headers();
    const postData = request.postData();
    const resourceType = request.resourceType();
    
    // Store request info
    interceptedRequests.push({
      url: reqUrl,
      method,
      headers,
      postData,
      resourceType
    });
    
    request.continue();
  });
  
  page.on('response', async response => {
    const reqUrl = response.url();
    const status = response.status();
    const headers = response.headers();
    const contentType = headers['content-type'] || '';
    
    // Find matching request
    const matchingReq = interceptedRequests.find(r => r.url === reqUrl);
    
    // Check if this looks like an API call
    const apiType = identifyApiType(reqUrl, contentType);
    
    // Apply user filters
    const matchesFilter = filterPatterns.length === 0 || 
      filterPatterns.some(p => reqUrl.toLowerCase().includes(p));
    
    if (apiType && matchesFilter && contentType.includes('json')) {
      let responseBody = null;
      try {
        responseBody = await response.json();
      } catch (e) {
        // Response might not be JSON or already consumed
      }
      
      apiCalls.push({
        url: reqUrl,
        method: matchingReq?.method || 'GET',
        status,
        contentType,
        apiType,
        postData: matchingReq?.postData,
        headers: matchingReq?.headers,
        responsePreview: responseBody ? JSON.stringify(responseBody).slice(0, 500) : null,
        responseBody
      });
    }
  });
  
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.error(`🔍 Loading: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    console.error(`⏳ Waiting ${waitTime}ms for API calls...`);
    await new Promise(r => setTimeout(r, waitTime));
    
    // Output results
    if (jsonOutput) {
      console.log(JSON.stringify({
        pageUrl: url,
        totalRequests: interceptedRequests.length,
        apiCalls: apiCalls.map(c => ({
          ...c,
          responseBody: undefined, // Don't include full body in JSON output
          algoliaParams: c.apiType?.type === 'algolia' ? extractAlgoliaParams(c.url, c.postData) : undefined,
          suggestedSteps: generateRecipe ? generateRecipeSteps(c) : undefined
        }))
      }, null, 2));
    } else {
      console.log(`\n📊 API Interception Report`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`📄 Page: ${url}`);
      console.log(`📡 Total requests: ${interceptedRequests.length}`);
      console.log(`🎯 API calls detected: ${apiCalls.length}`);
      
      if (apiCalls.length === 0) {
        console.log(`\n⚠️  No API calls detected. Try:`);
        console.log(`   - Increasing wait time: --wait 15000`);
        console.log(`   - Checking if the site uses server-side rendering`);
        console.log(`   - Looking for different URL patterns with --filter`);
      } else {
        console.log(`\n🔗 Detected API Calls:`);
        console.log(`${'─'.repeat(50)}`);
        
        for (const call of apiCalls) {
          console.log(`\n${call.apiType.name} (${call.method} ${call.status})`);
          console.log(`   URL: ${call.url.slice(0, 100)}${call.url.length > 100 ? '...' : ''}`);
          
          if (call.apiType.type === 'algolia') {
            const params = extractAlgoliaParams(call.url, call.postData);
            console.log(`   📦 Algolia Details:`);
            console.log(`      App ID: ${params.appId || 'Not found'}`);
            console.log(`      Index: ${params.indexName || 'Not found'}`);
            console.log(`      Query: ${params.query || 'Not found'}`);
          }
          
          if (call.postData && verbose) {
            console.log(`   📤 POST Data: ${call.postData.slice(0, 200)}${call.postData.length > 200 ? '...' : ''}`);
          }
          
          if (call.responsePreview) {
            console.log(`   📥 Response: ${call.responsePreview.slice(0, 200)}...`);
          }
          
          if (generateRecipe) {
            console.log(`\n   📝 Suggested Recipe Steps:`);
            const steps = generateRecipeSteps(call);
            for (const step of steps) {
              console.log(`      - ${step.command}: ${step.description}`);
            }
          }
        }
      }
      
      // Show unique API domains
      const domains = [...new Set(apiCalls.map(c => {
        try { return new URL(c.url).hostname; } catch { return null; }
      }).filter(Boolean))];
      
      if (domains.length > 0) {
        console.log(`\n🌐 API Domains:`);
        domains.forEach(d => console.log(`   - ${d}`));
      }
    }
    
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
