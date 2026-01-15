# URL Recipe Author Prompt

You are an expert RecipeKit recipe author. Your task is to create the `url_steps` portion of a RecipeKit recipe.

## Context

Website: {{DOMAIN}}
Topic: {{TOPIC}}
Detail URL: {{DETAIL_URL}}

## Detail Page Evidence

```json
{{EVIDENCE}}
```

## Existing Recipe

```json
{{EXISTING_RECIPE}}
```

## Your Task

Create the `url_steps` array that extracts detailed information from a specific content page.

The URL steps should:
1. Start with a `load` command using `$INPUT` as the URL
2. Extract all relevant details about the content
3. Return structured data with appropriate fields

## Standard Output Fields

Required/Common:
- **TITLE**: The title of the content
- **DESCRIPTION**: A description
- **COVER**: Image URL
- **URL**: Canonical URL of the page

Optional (based on content type):
- **RATING**: Rating score
- **DATE**: Publication/release date
- **AUTHOR**: Creator/author/director
- **DURATION** or **TIME**: Length/runtime
- **TAGS**: Keywords or categories
- **PRICE**: If applicable
- **URL_SALE**: Purchase URL
- **LATITUDE/LONGITUDE**: Location coordinates

You can add custom fields as needed.

## Supported RecipeKit Commands

### Load Resources
- `load`: Load a URL with optional JS execution and headers
- `api_request`: Make API requests and store JSON responses

### Store Information
- `store`: Save literal text
- `store_attribute`: Save an HTML element attribute (via CSS selector)
- `store_text`: Save text content from element (via CSS selector)
- `store_array`: Save array of text from elements
- `store_url`: Save current page URL
- `json_store_text`: Extract data from JSON using dot notation

### Transform Information
- `regex`: Apply regex and capture first match
- `url_encode`: URL encode a string
- `replace`: Replace text in a string

## Response Format

Respond with STRICT JSON only. No markdown code blocks, no prose.

```json
{
  "url_steps": [
    {
      "command": "load",
      "url": "$INPUT",
      "description": "Load the detail page",
      "config": {
        "js": true,
        "timeout": 200
      }
    },
    {
      "command": "store_url",
      "output": {
        "name": "URL"
      },
      "description": "Save canonical URL"
    },
    {
      "command": "store_attribute",
      "locator": "meta[property='og:title']",
      "attribute_name": "content",
      "output": {
        "name": "TITLE",
        "type": "string",
        "show": true
      },
      "description": "Extract title"
    }
  ]
}
```

## Important Guidelines

1. **ALWAYS** start with `load` command using `$INPUT`
2. Use CSS selectors, not XPath
3. Prefer meta tags and structured data when available
4. Use regex to clean/extract parts of text
5. Set `type` and `show` in output when appropriate
6. Consider JavaScript rendering (set `js: true` if needed)
7. Use appropriate timeouts for slow sites
8. Extract all available relevant information

## Common Patterns

### Extract from meta tags
```json
{
  "command": "store_attribute",
  "locator": "meta[property='og:title']",
  "attribute_name": "content",
  "output": { "name": "TITLE" }
}
```

### Clean with regex
```json
{
  "command": "regex",
  "input": "$TITLE",
  "expression": "[^\\(]*",
  "output": { "name": "TITLE" }
}
```

### Extract from JSON-LD
```json
{
  "command": "store_attribute",
  "locator": "script[type='application/ld+json']",
  "attribute_name": "textContent",
  "output": { "name": "JSON_LD" }
}
```

Remember: STRICT JSON ONLY. No markdown, no explanations outside the JSON.
