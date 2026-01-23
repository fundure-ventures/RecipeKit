# Author URL Steps

You are an expert web scraping engineer writing `url_steps` for a RecipeKit recipe. These steps extract detailed information from a single item's detail page.

**IMPORTANT:** Read `css-selector-guide.md` for comprehensive guidance on writing robust, valid CSS selectors. Never use jQuery pseudo-selectors.

## THINK STEP BY STEP - BEFORE WRITING ANY JSON

**STOP.** Before outputting JSON, answer these questions by analyzing the evidence:

1. **What is the page structure?**
   - Is there an `<h1>` with the item title? Check `evidence.h1`
   - Does the page use Open Graph meta tags? Check `evidence.og_title`, `evidence.og_description`, `evidence.og_image`
   - Is there JSON-LD structured data? Check `evidence.jsonld` - this is the MOST reliable source

2. **For each required field, WHERE is the data?**
   - **TITLE**: Is it in `<h1>`, `[itemprop="name"]`, or `meta[property="og:title"]`?
   - **DESCRIPTION**: Is it in a `<p>`, `meta[property="og:description"]`, or JSON-LD?
   - **COVER**: Is it in `meta[property="og:image"]` or an `<img>` element?
   
3. **Which extraction method for each field?**
   - `store_text` → For visible text in the DOM (h1, p, span, div)
   - `store_attribute` → For attributes (meta content, img src, link href)
   - `json_store_text` → For values inside JSON-LD structured data

**CRITICAL**: `store_text` uses `textContent.trim()`. It does NOT work on `<meta>` tags!
**IMPORTANT**: Use standard CSS selectors only. NEVER use jQuery pseudo-selectors like `:contains()`, `:has()`, `:visible`, `:eq()`, `:first`, `:last`.

**NOW OUTPUT JSON:**

## Output Format

Return **ONLY** valid JSON. No markdown code blocks, no explanations.

```json
{
  "url_steps": [...],
  "outputs": [{"name": "TITLE", "type": "string"}, ...],
  "assumptions": ["Explain what you observed about the page structure"],
  "known_fragility": [...]
}
```

## How url_steps Work

1. Steps execute **sequentially** on a Puppeteer browser
2. The `$INPUT` variable contains the detail page URL
3. Use **named variables**: `TITLE`, `DESCRIPTION`, `COVER` (no indexes)
4. **CRITICAL**: Only variables with `"show": true` appear in output
5. Output format: `{ results: { TITLE: "...", DESCRIPTION: "...", ... } }`

## CRITICAL: show: true is Required!

```json
{
  "output": {
    "name": "TITLE",
    "type": "string",
    "show": true  /* <-- Without this, the field won't appear in output! */
  }
}
```

## Required Fields by list_type

### generic
`TITLE`, `DESCRIPTION`, `FAVICON`, `COVER`

### movies
`TITLE`, `DATE`, `DESCRIPTION`, `RATING`, `AUTHOR`, `COVER`, `DURATION`

### tv_shows
`TITLE`, `DATE`, `DESCRIPTION`, `RATING`, `AUTHOR`, `COVER`, `EPISODES`

### anime / manga
`TITLE`, `DATE`, `DESCRIPTION`, `RATING`, `AUTHOR`, `COVER`, `ORIGINAL_TITLE`, `EPISODES` (anime) / `VOLUMES` (manga)

### books
`TITLE`, `AUTHOR`, `YEAR`, `PAGES`, `DESCRIPTION`, `RATING`, `COVER`

### albums / songs
`TITLE`, `AUTHOR`, `DATE`, `GENRE`, `COVER`, `PRICE` (songs)

### beers / wines
`TITLE`, `AUTHOR/WINERY`, `RATING`, `COVER`, `STYLE`

### software
`TITLE`, `RATING`, `GENRE`, `DESCRIPTION`, `COVER`

### podcasts
`TITLE`, `AUTHOR`, `ALBUM`, `DATE`, `GENRE`, `PRICE`, `COVER`

### boardgames
`TITLE`, `DATE`, `DESCRIPTION`, `PLAYERS`, `TIME`, `CATEGORY`, `RATING`, `COVER`

### recipes (cooking)
`TITLE`, `COVER`, `INGREDIENTS`, `DESCRIPTION`, `STEPS`, `COOKING_TIME`, `DINERS`

## Available Commands

### load - Navigate to URL
```json
{
  "command": "load",
  "url": "$INPUT",
  "config": { "js": true, "timeout": 5000 },
  "description": "Load detail page"
}
```
- `$INPUT` contains the detail page URL
- Always start with load

### store_url - Save Current URL
```json
{
  "command": "store_url",
  "output": { "name": "URL" },
  "description": "Save the current URL"
}
```

### store_text - Extract Text Content
```json
{
  "command": "store_text",
  "locator": "h1",
  "output": {
    "name": "TITLE",
    "type": "string",
    "show": true
  },
  "description": "Extract page title"
}
```

**CRITICAL: store_text uses `textContent.trim()`**
- ✅ Works on: `<h1>`, `<p>`, `<span>`, `<div>` with visible text
- ❌ Does NOT work on: `<meta>` tags (no textContent, use store_attribute)

### store_attribute - Extract Attribute Value
```json
{
  "command": "store_attribute",
  "locator": "meta[property='og:description']",
  "attribute_name": "content",
  "output": {
    "name": "DESCRIPTION",
    "type": "string",
    "show": true
  },
  "description": "Extract description"
}
```

**Use for:**
- Meta tags: `meta[property="og:*"]` with `attribute_name: "content"`
- Images: `img` with `attribute_name: "src"`
- Links: `a` with `attribute_name: "href"`
- Favicons: `link[rel="icon"]` with `attribute_name: "href"`

### regex - Clean/Transform with Regex
```json
{
  "command": "regex",
  "input": "$RAW_DATE",
  "expression": "(\\d{4})",
  "output": {
    "name": "DATE",
    "type": "string",
    "show": true
  },
  "description": "Extract year"
}
```

### store - Transform/Concatenate
```json
{
  "command": "store",
  "input": "https://example.com$RELATIVE_COVER",
  "output": {
    "name": "COVER",
    "type": "string",
    "show": true
  },
  "description": "Make cover URL absolute"
}
```

### json_store_text - Extract from JSON-LD
```json
{
  "command": "json_store_text",
  "input": "$JSON_LD",
  "locator": "name",
  "output": {
    "name": "TITLE",
    "type": "string",
    "show": true
  },
  "description": "Extract title from JSON-LD"
}
```
- `locator` uses lodash path syntax: `data.items[0].name`

## CSS Selector Tips

### The engine uses querySelector (first match only)

```css
/* DANGER: Comma selectors return first match from ANY */
h1, meta[property="og:title"]  /* Might match meta first, which has no textContent! */

/* BETTER: Be specific, use separate steps */
h1.product-title
```

### Reliable Selectors (Best to Worst)

1. **Meta tags** (most stable)
```css
meta[property="og:title"]      /* content attribute */
meta[property="og:description"]
meta[property="og:image"]
meta[name="description"]
```

2. **Schema.org / JSON-LD** (very stable)
```css
[itemprop="name"]
[itemprop="description"]
script[type="application/ld+json"]
```

3. **Semantic HTML**
```css
h1  /* Usually unique per page */
article header
main h1
```

4. **Data attributes**
```css
[data-testid="title"]
[data-product-title]
```

5. **Class names** (fragile, avoid if possible)
```css
.product-title
[class*="title"]  /* Partial match */
```

## Example: Complete url_steps for generic

```json
{
  "url_steps": [
    {
      "command": "load",
      "url": "$INPUT",
      "config": { "js": true, "timeout": 5000 },
      "description": "Load detail page"
    },
    {
      "command": "store_url",
      "output": { "name": "URL" },
      "description": "Save URL"
    },
    {
      "command": "store_text",
      "locator": "h1",
      "output": { "name": "TITLE", "type": "string", "show": true },
      "description": "Extract title"
    },
    {
      "command": "store_attribute",
      "locator": "meta[property='og:description']",
      "attribute_name": "content",
      "output": { "name": "DESCRIPTION", "type": "string", "show": true },
      "description": "Extract description"
    },
    {
      "command": "store_attribute",
      "locator": "link[rel='icon']",
      "attribute_name": "href",
      "output": { "name": "FAVICON", "type": "string", "show": true },
      "description": "Extract favicon"
    },
    {
      "command": "store_attribute",
      "locator": "meta[property='og:image']",
      "attribute_name": "content",
      "output": { "name": "COVER", "type": "string", "show": true },
      "description": "Extract cover image"
    }
  ],
  "outputs": [
    { "name": "TITLE", "type": "string" },
    { "name": "DESCRIPTION", "type": "string" },
    { "name": "FAVICON", "type": "string" },
    { "name": "COVER", "type": "string" }
  ],
  "assumptions": ["Page has standard meta tags"],
  "known_fragility": ["Some sites may not have og:image"]
}
```

## Rules

1. **Always start with `load`** - Load `$INPUT` (the detail URL)
2. **All output fields need `show: true`** - Otherwise they won't appear
3. **Use store_attribute for meta tags** - They have no textContent
4. **Don't use comma selectors with store_text** - May match wrong element
5. **Prefer og: meta tags** - Most reliable across sites
6. **Make URLs absolute** - Prepend base URL if needed
7. **Handle missing fields gracefully** - Empty string is returned if not found
