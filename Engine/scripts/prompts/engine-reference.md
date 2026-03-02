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

### Variable Substitution Limitations

**⚠️ CRITICAL:** Variable substitution ONLY works in these specific places:
- `url` field in `load` and `api_request` commands
- `input` field in `store`, `regex`, `replace`, `url_encode` commands
- `locator` field (ONLY for loop index `$i`)
- `headers` values

**Variables CANNOT be combined in output values.** The engine does NOT support:
```json
// ❌ WRONG - This will NOT work!
{ "command": "store_text", "locator": ".team", "output": { "name": "TEAM$i" } },
{ "command": "store_text", "locator": ".year", "output": { "name": "YEAR$i" } },
{ "command": "store", "input": "$TEAM$i ($YEAR$i)", "output": { "name": "TITLE$i" } }
// Result: TITLE will literally be "$TEAM$i ($YEAR$i)" - NOT replaced!
```

**Instead, extract TITLE directly from the page:**
```json
// ✅ CORRECT - Extract TITLE directly from the element
{ "command": "store_text", "locator": ".result:nth-child($i) .title", "output": { "name": "TITLE$i" } }
// For secondary info, use SUBTITLE as a separate field
{ "command": "store_text", "locator": ".result:nth-child($i) .year", "output": { "name": "SUBTITLE$i" } }
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
- **NEVER use jQuery-specific selectors** like `:contains()`, `:has()`, `:visible`, `:hidden`, `:eq()`, `:first`, `:last` - these are NOT valid CSS and will cause syntax errors
- Use standard CSS selectors only (classes, IDs, attributes, pseudo-classes like `:nth-child()`)


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

**Important:**
- **NEVER use jQuery-specific selectors** like `:contains()`, `:has()`, `:visible`, `:hidden`, `:eq()`, `:first`, `:last`
- Use standard CSS selectors only

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

## Content Types

Recipes must specify a `list_type` that determines what fields are expected:

| Type | Description | Key Fields |
|------|-------------|------------|
| `movies` | Films | TITLE, DATE, RATING, AUTHOR (director), COVER |
| `tv_shows` | TV series | TITLE, DATE, RATING, EPISODES, COVER |
| `books` | Books | TITLE, AUTHOR, PAGES, COVER |
| `anime` | Anime series | TITLE, EPISODES, RATING, COVER |
| `manga` | Manga series | TITLE, AUTHOR, VOLUMES, COVER |
| `videogames` | Video games | TITLE, DATE, RATING, COVER |
| `boardgames` | Board games | TITLE, RATING, COVER |
| `albums` | Music albums | TITLE, AUTHOR (artist), DATE, COVER |
| `songs` | Songs | TITLE, AUTHOR (artist), COVER |
| `artists` | Music artists | TITLE, COVER |
| `podcasts` | Podcasts | TITLE, AUTHOR, COVER |
| `software` | Apps | TITLE, AUTHOR, RATING, ICON, COVER |
| `wines` | Wines | TITLE, WINERY, REGION, VINTAGE, RATING |
| `beers` | Beers | TITLE, STYLE, REGION, ALCOHOL, RATING |
| `restaurants` | Restaurants | TITLE, RATING, LATITUDE, LONGITUDE |
| `recipes` | Cooking recipes | TITLE, INGREDIENTS, COVER |
| `food` | Food products | TITLE, COVER |
| `generic` | Any content | TITLE, DESCRIPTION, FAVICON, COVER |

## Output Contracts

### autocomplete_steps Output
Must produce indexed variables that become an array:

**Required (all mandatory):**
- `TITLE$i` - Result title (extracted directly from page element)
- `URL$i` - Result URL (must be absolute, must be a detail page URL)
- `COVER$i` - Thumbnail/cover image URL

**Optional:**
- `SUBTITLE$i` - Secondary info (year, author, etc.)

**Example Output:**
```json
{
  "results": [
    { "TITLE": "The Matrix", "URL": "https://...", "COVER": "https://...", "SUBTITLE": "1999" },
    { "TITLE": "Matrix Reloaded", "URL": "https://...", "COVER": "https://...", "SUBTITLE": "2003" }
  ]
}
```

### url_steps Output
Must produce named variables with `show: true`:

**Standard Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `TITLE` | string | Item title |
| `DESCRIPTION` | string | Full description |
| `COVER` | string | Main image URL |
| `RATING` | float | Numeric rating |
| `DATE` | date | Release/publish date |
| `AUTHOR` | string | Creator/director/artist |
| `TAGS` | array | Categories/genres |
| `TIME` | string | Duration |
| `PRICE` | string | Price |
| `URL` | string | Canonical URL |
| `FAVICON` | string | Site favicon |

**Content-Specific Fields:**
| Field | Used In | Description |
|-------|---------|-------------|
| `EPISODES` | tv_shows, anime | Number of episodes |
| `PAGES` | books, manga | Page count |
| `VOLUMES` | manga | Number of volumes |
| `WINERY` | wines | Winery name |
| `REGION` | wines, beers | Geographic region |
| `VINTAGE` | wines | Wine vintage year |
| `ALCOHOL` | beers, wines | Alcohol percentage |
| `STYLE` | beers | Beer style |
| `INGREDIENTS` | recipes | Ingredient list |
| `ICON` | software | App icon |
| `LATITUDE` | restaurants | Location latitude |
| `LONGITUDE` | restaurants | Location longitude |

**Example Output:**
```json
{
  "results": {
    "TITLE": "The Matrix",
    "DESCRIPTION": "A computer hacker...",
    "DATE": "1999",
    "RATING": 8.7,
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

6. **Trying to combine variables** - You cannot construct TITLE from `$VAR1 - $VAR2`. Extract TITLE directly from the page element.

## Common Patterns

### Handle Relative URLs
```json
{
  "command": "store_attribute",
  "locator": ".result:nth-child($i) a",
  "attribute_name": "href",
  "output": { "name": "REL_URL$i" },
  "config": { "loop": { "index": "i", "from": 1, "to": 5, "step": 1 } }
},
{
  "command": "store",
  "input": "https://example.com$REL_URL$i",
  "output": { "name": "URL$i" },
  "config": { "loop": { "index": "i", "from": 1, "to": 5, "step": 1 } }
}
```

### Extract from Meta Tags
```json
{
  "command": "store_attribute",
  "locator": "meta[property='og:title']",
  "attribute_name": "content",
  "output": { "name": "TITLE", "type": "string", "show": true }
}
```

### Clean Up Extracted Text
```json
{
  "command": "regex",
  "input": "$TITLE",
  "expression": "^(.+?)\\s*\\|.*$",
  "output": { "name": "TITLE", "type": "string", "show": true },
  "description": "Remove site name suffix"
}
```

### Extract from JSON-LD
```json
{
  "command": "store_text",
  "locator": "script[type='application/ld+json']",
  "output": { "name": "JSON_LD" }
},
{
  "command": "json_store_text",
  "input": "$JSON_LD",
  "locator": "name",
  "output": { "name": "TITLE", "type": "string", "show": true }
}
```

### Extract Rating as Float
```json
{
  "command": "store_text",
  "locator": ".rating-value",
  "output": { "name": "RATING_RAW" }
},
{
  "command": "regex",
  "input": "$RATING_RAW",
  "expression": "([\\d.]+)",
  "output": { "name": "RATING", "type": "float", "show": true }
}
```

## AutoRecipe API Discovery Tools

When authoring recipes for sites that use JavaScript-powered search (Algolia, Elasticsearch, Typesense, etc.), use these autoRecipe tools to discover the API and build `api_request`-based recipes:

### Discovery (generation-time only, not in recipes)
- **`EvidenceCollector.captureApiOnLoad(url, query)`** — Navigate to a search URL and capture JSON API responses during page load.
- **`EvidenceCollector.discoverSearchAPI(url, query)`** — Type a query in the site's search box and intercept the resulting API call with full request details.
- **`intercept-api.js` CLI** — `bun Engine/cli/intercept-api.js "<url>" --wait 10000` to manually discover APIs.

### Recipe generation
- **`normalizeApiDescriptor(apiData, searchUrl)`** — Normalize discovery results into a standard descriptor.
- **`buildApiSteps(descriptor)`** — Generate `api_request` + `json_store_text` steps from the descriptor.

**Important:** Generated recipes must use only standard engine commands (`api_request`, `json_store_text`). Do NOT use `capture_api_on_load`, `browser_api_request`, or `trigger_search_api` — these are not supported by the engine.
