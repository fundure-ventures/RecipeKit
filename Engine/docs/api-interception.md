# API Interception Commands

These commands help extract data from sites that load content via JavaScript APIs (Algolia, Elasticsearch, etc.) instead of server-rendered HTML.

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

Intercept the API response that the site makes itself during page navigation.

## Commands

### `capture_api_on_load`

**Best for:** Sites where the search URL triggers an API call automatically.

Load a URL and capture any API responses made during page navigation.

```json
{
  "command": "capture_api_on_load",
  "url": "https://example.com/search?q=$INPUT",
  "config": {
    "api_patterns": ["algolia", "search", "api"],
    "timeout": 15000
  },
  "output": {
    "name": "API_RESPONSE"
  }
}
```

**Config options:**
- `api_patterns`: Array of URL substrings to identify API calls (default: algolia, elasticsearch, etc.)
- `timeout`: Page load timeout in ms (default: 15000)

### `trigger_search_api`

**Best for:** Sites that require typing in a search box to trigger the API.

Load a page, find the search input, type the query, and capture the resulting API response.

```json
{
  "command": "load",
  "url": "https://example.com/search",
  "config": { "js": true }
},
{
  "command": "trigger_search_api",
  "config": {
    "query": "$INPUT",
    "search_input_selector": "input[type='search']",
    "api_patterns": ["algolia"],
    "timeout": 10000
  },
  "output": {
    "name": "API_RESPONSE"
  }
}
```

### `browser_api_request`

**Best for:** Direct API calls that need browser session context.

Execute a fetch() request inside the browser context (inherits cookies, session).

```json
{
  "command": "load",
  "url": "https://example.com/page",
  "config": { "js": true }
},
{
  "command": "browser_api_request",
  "url": "https://api.example.com/search?q=$INPUT",
  "config": {
    "method": "POST",
    "headers": { "Content-Type": "application/json" },
    "body": "{\"query\": \"$INPUT\"}"
  },
  "output": {
    "name": "API_RESPONSE"
  }
}
```

**Note:** May still fail with strict CORS policies. Use `capture_api_on_load` instead.

## Extracting Data from JSON

After capturing the API response, use `json_store_text` to extract fields:

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

## Example: Algolia-Powered Site

```json
{
  "autocomplete_steps": [
    {
      "command": "capture_api_on_load",
      "url": "https://site.com/search?query=$INPUT",
      "config": { "api_patterns": ["algolia"] },
      "output": { "name": "API_RESPONSE" }
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

## Discovering API Structure

Use the `intercept-api.js` CLI tool to discover what APIs a site uses:

```bash
bun Engine/cli/intercept-api.js "https://site.com/search?q=test" --wait 10000
```

This shows:
- All API calls made during page load
- Request method, headers, body
- Response structure
- Algolia-specific details (appId, index, query)

## When to Use Each Approach

| Scenario | Command |
|----------|---------|
| Search URL triggers API automatically | `capture_api_on_load` |
| Need to type in search box | `trigger_search_api` |
| Direct API call with session | `browser_api_request` |
| Server-rendered HTML | Regular DOM scraping |
