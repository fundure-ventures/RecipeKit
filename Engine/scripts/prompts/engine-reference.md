# RecipeKit Engine Reference

This document describes how the RecipeKit Engine works. Use this as a reference when authoring recipes.

## Overview

The Engine executes recipes to extract data from websites. A recipe defines a series of **steps** that are executed sequentially. Each step can store values into **variables** that subsequent steps can use.

## Execution Modes

### autocomplete mode (`--type autocomplete`)
- Extracts **multiple results** from a search/listing page
- Uses **indexed variables** like `TITLE1`, `TITLE2`, `URL1`, `URL2`
- Output is restructured into an array: `{ results: [{ TITLE: "...", URL: "..." }, ...] }`
- Variables without index go to `debug` object (only shown with `--debug`)

### url mode (`--type url`)
- Extracts **single item details** from a detail page
- Uses **named variables** like `TITLE`, `DESCRIPTION`, `COVER`
- Only variables with `"show": true` appear in output
- Output is: `{ results: { TITLE: "...", DESCRIPTION: "...", ... } }`

## Variable System

Variables store extracted values. Access them with `$VARIABLE_NAME`.

### Built-in Variables
- `$INPUT` - The input provided via `--input` flag
- `$SYSTEM_LANGUAGE` - System language (e.g., "en")
- `$SYSTEM_REGION` - System region (e.g., "US")

### Setting Variables
Each step with an `output.name` stores its result in that variable.

### Using Variables
Use `$VARIABLE_NAME` in any string field. The engine replaces it with the value:
```json
{
  "command": "load",
  "url": "https://example.com/search?q=$INPUT"
}
```

### Loop Variables
Loops create indexed variables. With `"name": "TITLE$i"` and loop `from: 1, to: 3`:
- Creates: `TITLE1`, `TITLE2`, `TITLE3`

## Available Commands

### `load` - Load a Page
Navigates the browser to a URL.

```json
{
  "command": "load",
  "url": "https://example.com/search?q=$INPUT",
  "config": {
    "js": true,
    "timeout": 5000,
    "headers": {
      "Cookie": "session=$SESSION_ID"
    }
  },
  "description": "Load search results"
}
```

**Properties:**
- `url` (required): URL to load. Can use variables like `$INPUT`
- `config.js`: If `true`, waits for JavaScript to execute (networkidle0)
- `config.timeout`: Page load timeout in milliseconds
- `config.headers`: Extra HTTP headers to send

**Note:** This command doesn't output anything. It just loads the page.

### `store_text` - Extract Text Content
Extracts the `textContent` from an element.

```json
{
  "command": "store_text",
  "locator": "h1.title",
  "output": {
    "name": "TITLE",
    "type": "string",
    "show": true
  },
  "description": "Extract page title"
}
```

**Properties:**
- `locator` (required): CSS selector. Uses `querySelector` (returns first match only)
- `output.name` (required): Variable name to store the result
- `output.show`: If `true`, included in url mode output
- `output.type`: Data type hint ("string", "number", etc.)

**Important:** 
- Uses `textContent.trim()` - works on visible elements with text
- Does NOT work on `<meta>` tags (they have no textContent, use `store_attribute` instead)
- Returns empty string if element not found

### `store_attribute` - Extract Attribute Value
Extracts an attribute from an element.

```json
{
  "command": "store_attribute",
  "locator": "meta[property='og:image']",
  "attribute_name": "content",
  "output": {
    "name": "COVER",
    "type": "string",
    "show": true
  },
  "description": "Extract cover image"
}
```

**Properties:**
- `locator` (required): CSS selector
- `attribute_name` (required): Attribute to extract (e.g., "href", "src", "content")
- `output.name` (required): Variable name

**Common Uses:**
- `meta[property="og:image"]` + `content` → Cover images
- `meta[property="og:description"]` + `content` → Descriptions
- `a.link` + `href` → URLs
- `img.cover` + `src` → Image sources
- `link[rel="icon"]` + `href` → Favicons

### `store_array` - Store Multiple Values
Like `store_text` but pushes to an array instead of overwriting.

```json
{
  "command": "store_array",
  "locator": ".ingredient:nth-child($i)",
  "output": { "name": "INGREDIENTS" },
  "config": {
    "loop": { "index": "i", "from": 1, "to": 20, "step": 1 }
  }
}
```

### `store` - Store/Transform Value
Stores a computed value or transforms existing variables.

```json
{
  "command": "store",
  "input": "https://example.com$RELATIVE_URL",
  "output": { "name": "ABSOLUTE_URL" },
  "description": "Make URL absolute"
}
```

**Properties:**
- `input` (required): Value to store (can include variables)
- `output.name` (required): Variable name

**Common Uses:**
- Concatenating strings: `"https://example.com$PATH"`
- Converting relative URLs to absolute
- Setting default values

### `store_url` - Store Current URL
Stores the current page URL.

```json
{
  "command": "store_url",
  "output": { "name": "URL" },
  "description": "Save current URL"
}
```

### `regex` - Transform with Regex
Applies a regular expression to extract/clean data.

```json
{
  "command": "regex",
  "input": "$RAW_TITLE",
  "expression": "(.+?)\\s*\\(\\d{4}\\)",
  "output": { "name": "CLEAN_TITLE" },
  "description": "Remove year from title"
}
```

**Properties:**
- `input` (required): Variable or string to process
- `expression` (required): JavaScript regex pattern
- `output.name` (required): Variable for result

**Behavior:**
- Returns first capture group if present
- Returns full match if no capture groups
- Returns original input if no match

**Note:** Escape backslashes in JSON: `\\d` not `\d`

### `replace` - String Replace
Simple string replacement.

```json
{
  "command": "replace",
  "input": "$PRICE_TEXT",
  "find": "$",
  "replace": "",
  "output": { "name": "PRICE" }
}
```

### `api_request` - Fetch JSON API
Makes an HTTP request and stores JSON response.

```json
{
  "command": "api_request",
  "url": "https://api.example.com/search?q=$INPUT",
  "config": {
    "method": "GET",
    "headers": { "Accept": "application/json" }
  },
  "output": { "name": "API_RESPONSE" }
}
```

### `json_store_text` - Extract from JSON
Extracts a value from a JSON object using lodash path syntax.

```json
{
  "command": "json_store_text",
  "input": "$API_RESPONSE",
  "locator": "data.items[0].name",
  "output": { "name": "TITLE" }
}
```

**Properties:**
- `input` (required): Variable containing JSON object
- `locator` (required): Lodash path (e.g., "data.items[0].name")

### `url_encode` - URL Encode String
URL-encodes a string.

```json
{
  "command": "url_encode",
  "input": "search query with spaces",
  "output": { "name": "ENCODED_QUERY" }
}
```

## Loop Configuration

Any command can be looped:

```json
{
  "command": "store_text",
  "locator": ".result:nth-child($i) .title",
  "output": { "name": "TITLE$i" },
  "config": {
    "loop": {
      "index": "i",
      "from": 1,
      "to": 5,
      "step": 1
    }
  }
}
```

**Properties:**
- `index`: Variable name for loop counter
- `from`: Start value (inclusive)
- `to`: End value (inclusive)
- `step`: Increment

**Important:**
- Use `$i` (or your index name) in `locator` and `output.name`
- `:nth-child($i)` selects elements by position (1-indexed)
- This creates `TITLE1`, `TITLE2`, `TITLE3`, `TITLE4`, `TITLE5`

## CSS Selector Tips

### querySelector Behavior
The engine uses `querySelector` which returns only the **first** matching element.

```css
/* Comma-separated selectors - returns first match from ANY */
h1, h2, .title  /* Returns first h1 OR first h2 OR first .title - whichever comes first in DOM */

/* Better: Be specific */
h1.product-title  /* Returns exactly what you want */
```

### Stable Selector Patterns
1. **Data attributes**: `[data-testid="title"]`
2. **Schema.org**: `[itemprop="name"]`
3. **Semantic HTML**: `h1`, `article`, `main`
4. **Meta tags**: `meta[property="og:title"]`

### Fragile Patterns (Avoid)
1. **Class names with hashes**: `.Title_abc123`
2. **Deep nesting**: `div > div > div > span`
3. **Positional without context**: `:nth-child(3)`

### Common Patterns

```css
/* Titles */
h1
[itemprop="name"]
meta[property="og:title"]  /* Use store_attribute with "content" */

/* Images */
meta[property="og:image"]  /* Use store_attribute with "content" */
[itemprop="image"]
img.cover

/* Links */
a[href*="/item/"]
[itemprop="url"]

/* Descriptions */
meta[property="og:description"]  /* Use store_attribute */
meta[name="description"]
[itemprop="description"]
```

## Recipe Structure

```json
{
  "recipe_shortcut": "example_com_movies",
  "list_type": "movies",
  "engine_version": 20,
  "title": "Example.com Movies",
  "description": "Search movies on example.com",
  "urls": ["https://example.com"],
  "headers": {
    "Accept-Language": "en-US,en",
    "User-Agent": "Mozilla/5.0..."
  },
  "autocomplete_steps": [
    /* Steps for search results */
  ],
  "url_steps": [
    /* Steps for detail pages */
  ]
}
```

## Output Contracts

### autocomplete_steps Output
Must produce indexed variables that become an array:

**Required:**
- `TITLE$i` - Result title
- `URL$i` - Result URL (absolute)

**Optional:**
- `SUBTITLE$i` - Secondary info (year, author, etc.)
- `COVER$i` - Thumbnail image

**Example Output:**
```json
{
  "results": [
    { "TITLE": "The Matrix", "URL": "https://...", "SUBTITLE": "1999" },
    { "TITLE": "Matrix Reloaded", "URL": "https://...", "SUBTITLE": "2003" }
  ]
}
```

### url_steps Output
Must produce named variables with `show: true`:

**Generic:** TITLE, DESCRIPTION, FAVICON, COVER
**Movies:** TITLE, DATE, DESCRIPTION, RATING, AUTHOR, COVER, DURATION
**TV Shows:** TITLE, DATE, DESCRIPTION, RATING, AUTHOR, COVER, EPISODES

**Example Output:**
```json
{
  "results": {
    "TITLE": "The Matrix",
    "DESCRIPTION": "A computer hacker...",
    "COVER": "https://example.com/matrix.jpg"
  }
}
```

## Debugging

Run with `--debug` flag to see:
- All variables (including non-`show` ones)
- Step execution logs
- Selector matches

```bash
bun Engine/engine.js --recipe path/to/recipe.json --type autocomplete --input "test" --debug
```

## Common Mistakes

1. **Using store_text on meta tags** - Meta tags have no textContent. Use `store_attribute` with `attribute_name: "content"`

2. **Comma selectors with store_text** - `h1, meta[og:title]` might match the meta tag first, which returns empty. Be specific.

3. **Forgetting show: true** - In url_steps, fields without `show: true` won't appear in output

4. **Relative URLs** - Always make URLs absolute with a `store` step if needed

5. **Not handling empty results** - If a selector finds nothing, it returns empty string. The step doesn't fail.
