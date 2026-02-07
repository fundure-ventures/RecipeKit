# API-Based Recipes (AutoRecipe Tooling)

This document describes how autoRecipe discovers and generates API-based recipes. These tools run at **recipe-generation time** via Puppeteer; the generated recipes use only standard engine commands (`api_request`, `json_store_text`).

## The Problem

Many modern sites use client-side APIs for search:
- Algolia InstantSearch
- Elasticsearch 
- Typesense
- Custom REST APIs

DOM scraping fails because:
1. Content loads after page render via JavaScript
2. Direct API calls are blocked by CORS or authentication
3. Sites have Cloudflare/anti-bot protection

## The Solution

AutoRecipe discovers the API at generation time using Puppeteer interception, then produces standard `api_request` recipe steps that work without browser-context commands.

## AutoRecipe Discovery Tools

### EvidenceCollector API Methods

These are used during recipe generation (not at recipe runtime):

- **`captureApiOnLoad(url, query)`** — Navigate to a search URL and capture JSON API responses made during page load. Supports Algolia, Typesense, Elasticsearch, and generic JSON APIs.
- **`discoverSearchAPI(url, query)`** — Navigate to a site, find the search input, type a query, and intercept network requests to discover search API endpoints with full request details (method, headers, postData).
- **`discoverAutocompleteAPI(page, query)`** — Similar to discoverSearchAPI but operates on an already-loaded page.

### intercept-api.js CLI

Manually discover what APIs a site uses:

```bash
bun Engine/cli/intercept-api.js "https://site.com/search?q=test" --wait 10000
```

This shows:
- All API calls made during page load
- Request method, headers, body
- Response structure
- Algolia-specific details (appId, index, query)

### apiTools.js Module

Converts discovery results into recipe steps:

- **`normalizeApiDescriptor(apiData, searchUrl)`** — Takes raw EvidenceCollector output and returns a normalized descriptor with detected field names.
- **`buildApiSteps(descriptor)`** — Generates `api_request` + `json_store_text` recipe steps from a normalized descriptor.

## Generated Recipe Pattern

AutoRecipe produces recipes using only standard engine commands:

```json
{
  "autocomplete_steps": [
    {
      "command": "api_request",
      "url": "https://api.example.com/search?q=$INPUT",
      "config": {
        "method": "POST",
        "headers": { "Content-Type": "application/json" },
        "body": "{\"query\": \"$INPUT\"}"
      },
      "output": { "name": "API_RESPONSE" },
      "description": "Fetch search results from API"
    },
    {
      "command": "json_store_text",
      "input": "API_RESPONSE",
      "locator": "results[0].hits[$i].title",
      "output": { "name": "TITLE$i" },
      "config": { "loop": { "index": "i", "from": 0, "to": 9, "step": 1 } }
    },
    {
      "command": "json_store_text",
      "input": "API_RESPONSE",
      "locator": "results[0].hits[$i].url",
      "output": { "name": "URL$i" },
      "config": { "loop": { "index": "i", "from": 0, "to": 9, "step": 1 } }
    }
  ]
}
```

## Extracting Data from JSON

After fetching the API response, use `json_store_text` to extract fields:

```json
{
  "command": "json_store_text",
  "input": "API_RESPONSE",
  "locator": "results[0].hits[$i].title",
  "output": { "name": "TITLE$i" },
  "config": {
    "loop": { "index": "i", "from": 0, "to": 9, "step": 1 }
  }
}
```

The `locator` uses lodash `_.get()` path syntax:
- `results[0].hits[$i]` - Array access with loop variable
- `data.nested.field` - Nested object access
- `items[$i].name` - Array items with loop

## When to Use Each Approach

| Scenario | Approach |
|----------|----------|
| Site has discoverable search API | `api_request` (discovered via autoRecipe tools) |
| Server-rendered HTML | Regular DOM scraping (`store_text`, `store_attribute`) |
| API needs complex auth/CORS bypass | Use `intercept-api.js` to discover, then craft `api_request` manually |
