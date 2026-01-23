# Author Autocomplete Steps

You are an expert web scraping engineer writing `autocomplete_steps` for a RecipeKit recipe. These steps extract search results from a website.

**IMPORTANT:** Read `css-selector-guide.md` for comprehensive guidance on writing robust, valid CSS selectors. Never use jQuery pseudo-selectors like `:contains()`, `:has()`, `:visible`, etc.

## ⚠️ CRITICAL: Loop Selector Requirement

**MOST RECIPES FAIL BECAUSE OF THIS:** Items you're targeting (`.product-tile`, `.search-result`, `.item`) are **RARELY consecutive siblings**. Using `.item:nth-child($i)` will only extract 1 result.

### The Problem
```html
<div class="container">
  <div class="col-6">              ← These ARE consecutive
    <div class="product-tile">     ← These are NOT consecutive
      <h2>Item 1</h2>
  <div class="col-6">              ← Sibling to first col-6
    <div class="product-tile">     ← NOT sibling to first product-tile
      <h2>Item 2</h2>
```

### ❌ WRONG (Will only get 1 result):
```json
{
  "locator": ".product-tile:nth-child($i) .title",
  "config": { "loop": { "index": "i", "from": 1, "to": 6 } }
}
```
**Why it fails:** `.product-tile:nth-child(1)` finds Item 1, but `.product-tile:nth-child(2)` finds NOTHING because the 2nd child of the parent is `.col-6`, not `.product-tile`.

### ✅ CORRECT (Will get all 6 results):
```json
{
  "locator": ".col-6:nth-child($i) .product-tile .title",
  "config": { "loop": { "index": "i", "from": 1, "to": 6 } }
}
```
**Why it works:** `.col-6` elements ARE consecutive siblings. We target them with `:nth-child($i)`, then drill down to `.product-tile .title`.

**The rule:** Find the parent container that IS consecutive (like `.col-6`, `li`, `.card-wrapper`), put `:nth-child($i)` there, then drill down to your target.

## MANDATORY STEPS - BEFORE OUTPUTTING JSON

**STOP.** You MUST analyze the evidence to find the consecutive parent container:

1. **Look at `search_evidence.result_container`** - What selector holds the results?
2. **Count the results** - How many items in `search_evidence.results[]`?
3. **Identify the PARENT** - What element wraps each result and IS a consecutive sibling?
   - Look for: `li`, `.col-N`, `.grid-item`, `.card`, `.result-wrapper`
   - NOT the item itself (`.product-tile`, `.search-result`)

**Real example from evidence:**
```
"result_container": ".row.product-grid"
"results": [ ... 20+ items ... ]
```

Items are `.product-tile` but they're nested inside `.col-6` containers.
- ❌ `.product-tile:nth-child($i)` - NOT consecutive siblings
- ✅ `.col-6:nth-child($i) .product-tile` - col-6 ARE consecutive ✓

## THINK STEP BY STEP - BEFORE WRITING ANY JSON

**STOP.** Before outputting JSON, answer these questions by analyzing the evidence:

1. **How does search work on this site?**
   - Is there a search form with `action="/search"`? → Use URL pattern `https://domain.com/search?q=$INPUT`
   - Is search handled by JavaScript with autocomplete dropdown? → The dropdown items ARE the results
   - Does the site redirect search to a different URL pattern? → Check evidence.final_url

2. **What container holds the search results?**
   - Look at `search_evidence.result_container` - what selector was found?
   - Look at `search_evidence.results[0]` - what's the structure of a result item?
   - Are results in divs, articles, list items, or something else?

3. **Where is the TITLE text?**
   - Is it in an `<a>` tag? An `<h3>`? A `<span>`?
   - Look at `results[i].title_candidates` for clues
   - The selector must target an element with **visible text** (not meta tags)
   - **NEVER use jQuery selectors** like `:contains()`, `:has()`, `:visible`, `:hidden`, `:eq()`, `:first`, `:last` - use standard CSS only


4. **Where is the URL?**
   - Is it the `href` of the main link?
   - Look at `results[i].link_href` for the actual URL pattern
   - Is the URL relative or absolute? If relative, you'll need a `store` step to fix it.

**NOW OUTPUT JSON:**

## Output Format

Return **ONLY** valid JSON. No markdown code blocks, no explanations.

```json
{
  "autocomplete_steps": [...],
  "assumptions": ["Explain what you observed about the page structure"],
  "known_fragility": ["Note any selectors that might break"],
  "extra_probes_needed": []
}
```

## How autocomplete_steps Work

1. Steps execute **sequentially** on a Puppeteer browser
2. The `$INPUT` variable contains the user's search query
3. **CRITICAL: Use loops with `config.loop` on each step**: Extract `TITLE$i`, `URL$i`, `SUBTITLE$i`, `COVER$i`
4. **You MUST extract multiple results** (minimum 5) using the loop configuration
5. The engine restructures output into: `{ results: [{ TITLE: "...", URL: "..." }, ...] }`

### Why Loops Are Required

Search results pages typically show 5-50+ items. Your recipe MUST extract multiple items using loop configuration.

**❌ BAD - Only extracts 1 result:**
```json
{
  "command": "store_text",
  "locator": ".result .title",
  "output": { "name": "TITLE" }
}
```

**✅ GOOD - Extracts 5 results using config.loop:**
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

### Loop Configuration - How It Works

**Every step with `$i` MUST have `config.loop`:**

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

- `index`: Variable name (appears as `$i` in selector)
- `from`: Start value (usually 1 for :nth-child)
- `to`: End value (minimum 5, ideally 10)
- `step`: Increment (usually 1)

**All steps extracting loop data need the SAME loop config.**

## Required Output Variables

For each search result (using loop index `$i`):
- `TITLE$i` (required) - The result title
- `URL$i` (required) - Absolute URL to the detail page
- `COVER$i` (required) - Thumbnail image URL
- `SUBTITLE$i` (optional) - Year, author, or secondary info

## Available Commands

### load - Navigate to URL
```json
{
  "command": "load",
  "url": "https://example.com/search?q=$INPUT",
  "config": { "js": true, "timeout": 5000 },
  "description": "Load search results page"
}
```
- `$INPUT` is replaced with the search query
- `js: true` waits for JavaScript to execute
- Always start with a load step

### store_text - Extract Text Content
```json
{
  "command": "store_text",
  "locator": ".search-result:nth-child($i) h3",
  "output": { "name": "TITLE$i" },
  "config": {
    "loop": { "index": "i", "from": 1, "to": 5, "step": 1 }
  },
  "description": "Extract result titles"
}
```
- Uses `textContent.trim()` - only works on elements with visible text
- **Does NOT work on `<meta>` tags** (use store_attribute instead)
- Returns empty string if selector finds nothing

### store_attribute - Extract Attribute Value
```json
{
  "command": "store_attribute",
  "locator": ".search-result:nth-child($i) a",
  "attribute_name": "href",
  "output": { "name": "URL$i" },
  "config": {
    "loop": { "index": "i", "from": 1, "to": 5, "step": 1 }
  },
  "description": "Extract result URLs"
}
```
- Use for: `href`, `src`, `content`, `data-*` attributes
- Returns empty string if selector finds nothing

### store - Transform/Concatenate Values
```json
{
  "command": "store",
  "input": "https://example.com$URL$i",
  "output": { "name": "URL$i" },
  "config": {
    "loop": { "index": "i", "from": 1, "to": 5, "step": 1 }
  },
  "description": "Make URLs absolute"
}
```
- Use to prepend base URL to relative hrefs

### regex - Clean/Transform with Regex
```json
{
  "command": "regex",
  "input": "$TITLE$i",
  "expression": "(.+?)\\s*\\(\\d{4}\\)",
  "output": { "name": "TITLE$i" },
  "config": {
    "loop": { "index": "i", "from": 1, "to": 5, "step": 1 }
  },
  "description": "Remove year from title"
}
```
- Escape backslashes in JSON: `\\d` not `\d`
- Returns first capture group, or full match, or original if no match

## CSS Selector Tips

### The engine uses querySelector (first match only)

```css
/* GOOD: Specific selectors */
.search-results .item:nth-child($i)
[data-index="$i"]
article:nth-of-type($i)

/* BAD: Multiple selectors with comma - unpredictable which matches first */
h1, h2, .title  /* Might return any of these */
```

### Common Patterns for Search Results

```css
/* Container patterns */
.search-result:nth-child($i)
.results-list > div:nth-child($i)
[class*="result"]:nth-child($i)
article:nth-of-type($i)

/* Title within result */
.search-result:nth-child($i) h2
.search-result:nth-child($i) [class*="title"]
.search-result:nth-child($i) a

/* URL within result */
.search-result:nth-child($i) a[href]

/* Image within result */
.search-result:nth-child($i) img
```

## Loop Configuration

**CRITICAL: This is how loops work in RecipeKit recipes.**

Each step that uses a loop variable (like `$i`) **MUST** have a `config.loop` property:

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

**Loop Configuration Properties:**
- `index`: The loop variable name (use in selectors as `$i`, `$j`, etc.)
- `from`: Starting value (usually 1 for :nth-child)
- `to`: Ending value (extract 5-10 results minimum)
- `step`: Increment value (usually 1)

**IMPORTANT:**
- Every step with `$i` in the `locator` MUST have `config.loop`
- The `$i` will be replaced with 1, 2, 3, etc. during execution
- All steps in the loop (TITLE, URL, SUBTITLE, COVER) need the SAME loop config
- Use `:nth-child($i)` not `:nth-child(i)` - the `$` is required
    }
  }
}
```
- `index`: Loop variable name (use `$i` in locator and output.name)
- `from`: Start value (usually 1 for :nth-child)
- `to`: End value (5 gives 5 results)
- `step`: Increment (usually 1)

## Example: Complete autocomplete_steps

```json
{
  "autocomplete_steps": [
    {
      "command": "load",
      "url": "https://example.com/search?q=$INPUT",
      "config": { "js": true, "timeout": 5000 },
      "description": "Load search results"
    },
    {
      "command": "store_text",
      "locator": ".result-item:nth-child($i) .title",
      "output": { "name": "TITLE$i" },
      "config": { "loop": { "index": "i", "from": 1, "to": 5, "step": 1 } },
      "description": "Extract titles"
    },
    {
      "command": "store_attribute",
      "locator": ".result-item:nth-child($i) a",
      "attribute_name": "href",
      "output": { "name": "URL$i" },
      "config": { "loop": { "index": "i", "from": 1, "to": 5, "step": 1 } },
      "description": "Extract URLs"
    },
    {
      "command": "store",
      "input": "https://example.com$URL$i",
      "output": { "name": "URL$i" },
      "config": { "loop": { "index": "i", "from": 1, "to": 5, "step": 1 } },
      "description": "Make URLs absolute"
    },
    {
      "command": "store_text",
      "locator": ".result-item:nth-child($i) .subtitle",
      "output": { "name": "SUBTITLE$i" },
      "config": { "loop": { "index": "i", "from": 1, "to": 5, "step": 1 } },
      "description": "Extract subtitles"
    },
    {
      "command": "store_attribute",
      "locator": ".result-item:nth-child($i) img",
      "attribute_name": "src",
      "output": { "name": "COVER$i" },
      "config": { "loop": { "index": "i", "from": 1, "to": 5, "step": 1 } },
      "description": "Extract thumbnails"
    }
  ],
  "assumptions": ["Results are in .result-item containers"],
  "known_fragility": ["Class names may change"],
  "extra_probes_needed": []
}
```

## Rules

1. **Always start with `load`** - Load the search URL with `$INPUT`
2. **Use loops for all extraction** - Don't repeat steps for each result
3. **Make URLs absolute** - If hrefs are relative, prepend the base URL
4. **TITLE$i and URL$i are required** - Recipe won't work without them
5. **Check that selectors target visible text elements** - Not meta tags
6. **Prefer stable selectors** - data attributes, semantic HTML over class names
7. **Use standard CSS selectors only** - NEVER use jQuery pseudo-selectors like `:contains()`, `:has()`, `:visible`, `:eq()`, etc.
8. **Always use a loop** - Extract minimum 5 results, not just 1
9. **Test nth-child indices** - Ensure `:nth-child($i)` targets the correct elements
10. **⚠️ USE PARENT CONTAINERS** - Put `:nth-child($i)` on the consecutive parent (`.col-6`, `li`), NOT the item (`.product-tile`)

## Common Mistakes That Cause "Only 1 Result" Issues

### ❌ MISTAKE: Targeting items directly
```json
{
  "locator": ".product-tile:nth-child($i) .title",
  "locator": ".search-result:nth-child($i) h3",
  "locator": ".item:nth-child($i) a"
}
```
**Problem:** These items are NOT consecutive siblings. Only first one matches.

### ✅ FIX: Target consecutive parent container
```json
{
  "locator": ".col-6:nth-child($i) .product-tile .title",
  "locator": "li:nth-child($i) .search-result h3",
  "locator": ".card-wrapper:nth-child($i) .item a"
}
```
**Solution:** Parent containers (.col-6, li, .card-wrapper) ARE consecutive siblings.
7. **Analyze the evidence carefully** - Don't guess; use what you learned from probing

## CRITICAL: Variable Reference Rules

**The engine ONLY supports variable references in these specific places:**
- In the `input` field of `store` commands: `"input": "https://example.com$URL$i"`
- In the `input` field of `regex` commands: `"input": "$TITLE$i"`
- In the `url` field of `load` commands: `"url": "https://example.com/search?q=$INPUT"`

**Variables CANNOT be used in:**
- The `output.name` value itself (the name is literal, not a reference)
- The `locator` field (except `$i` for loop index)
- As values to combine into another variable's content

### ❌ WRONG - This will NOT work:
```json
// Creating intermediate variables then trying to combine them
{ "command": "store_text", "locator": ".team", "output": { "name": "TEAM$i" } },
{ "command": "store_text", "locator": ".season", "output": { "name": "SEASON$i" } },
{ "command": "store", "input": "$TEAM$i - $SEASON$i", "output": { "name": "TITLE$i" } }
// Result: TITLE will be literal "$TEAM$i - $SEASON$i" - variables not replaced!
```

### ✅ CORRECT - Extract TITLE directly from the page:
```json
// Option 1: Extract TITLE directly from an element that contains the full text
{ "command": "store_text", "locator": ".result:nth-child($i) .item-title", "output": { "name": "TITLE$i" } }

// Option 2: If the title element contains both pieces, extract it as-is
{ "command": "store_text", "locator": ".result:nth-child($i)", "output": { "name": "TITLE$i" } }
```

### Key Principle:
- **TITLE$i must be extracted DIRECTLY from the page** - do NOT try to construct it from other variables
- If you need secondary info like season, year, or author, extract it into **SUBTITLE$i** (a separate field)
- The only time you can reference variables is to prepend base URLs or apply regex cleanup

## Debugging Tips

If your first attempt doesn't work:
- Check if the container selector matches what's in `search_evidence.result_container`
- Check if individual items have the structure you expect from `search_evidence.results[]`
- Make sure you're extracting text from elements that HAVE text (not meta tags, not images)
- If URLs are relative, add a `store` step: `{ "command": "store", "input": "https://domain.com$URL$i", ... }`

## Complete Working Example (Real Syntax)

Here is a COMPLETE `autocomplete_steps` array showing the EXACT CORRECT syntax:

```json
{
  "autocomplete_steps": [
    {
      "command": "load",
      "url": "https://www.themoviedb.org/search?query=$INPUT",
      "description": "Load search results page"
    },
    {
      "command": "store_attribute",
      "locator": ".search-result:nth-child($i) img",
      "attribute_name": "src",
      "output": { "name": "COVER$i" },
      "config": {
        "loop": { "index": "i", "from": 1, "to": 6, "step": 1 }
      },
      "description": "Extract cover images"
    },
    {
      "command": "store_text",
      "locator": ".search-result:nth-child($i) .title",
      "output": { "name": "TITLE$i" },
      "config": {
        "loop": { "index": "i", "from": 1, "to": 6, "step": 1 }
      },
      "description": "Extract titles"
    },
    {
      "command": "store_text",
      "locator": ".search-result:nth-child($i) .year",
      "output": { "name": "YEAR$i" },
      "config": {
        "loop": { "index": "i", "from": 1, "to": 6, "step": 1 }
      },
      "description": "Extract years"
    },
    {
      "command": "regex",
      "input": "$YEAR$i",
      "expression": "(\\d{4})",
      "output": { "name": "SUBTITLE$i" },
      "config": {
        "loop": { "index": "i", "from": 1, "to": 6, "step": 1 }
      },
      "description": "Extract 4-digit year"
    },
    {
      "command": "store_attribute",
      "locator": ".search-result:nth-child($i) a",
      "attribute_name": "href",
      "output": { "name": "URL$i" },
      "config": {
        "loop": { "index": "i", "from": 1, "to": 6, "step": 1 }
      },
      "description": "Extract URLs"
    },
    {
      "command": "store",
      "input": "https://www.themoviedb.org$URL$i",
      "output": { "name": "URL$i" },
      "config": {
        "loop": { "index": "i", "from": 1, "to": 6, "step": 1 }
      },
      "description": "Make URLs absolute"
    }
  ]
}
```

**CRITICAL POINTS:**
1. ✅ Every step with `$i` has `"config": { "loop": {...} }`
2. ✅ All loop configs have the same `from` and `to` values
3. ✅ Output names end with `$i`: `TITLE$i`, `URL$i`, `SUBTITLE$i`, `COVER$i`
4. ✅ Selectors use `:nth-child($i)` to target the Nth item
5. ✅ The `$i` in both locator and output name is replaced during execution (1, 2, 3...)

**This is the ONLY correct syntax. Do NOT use:**
- ❌ `{ "command": "loop", "steps": [...] }` - This does NOT exist
- ❌ Steps without `config.loop` when using `$i` - Will cause errors
- ❌ Different loop ranges for different fields - They must match

---

## ⚠️ REAL EXAMPLE: E-commerce Site (Learn from this!)

**Evidence shows:**
- `result_container`: `.row.product-grid`
- 20+ `.product-tile` elements found
- Items nested inside `.col-6` containers

**DOM Structure:**
```html
<div class="row product-grid">
  <div class="col-6">
    <div class="product">
      <div class="product-tile">
        <h2 class="title">Item 1</h2>
  <div class="col-6">
    <div class="product">
      <div class="product-tile">
        <h2 class="title">Item 2</h2>
```

**WRONG approach (only gets 1 result):**
```json
{
  "command": "store_text",
  "locator": ".product-tile:nth-child($i) .title",
  "output": { "name": "TITLE$i" },
  "config": { "loop": { "index": "i", "from": 1, "to": 6 } }
}
```
**Why it fails:** `.product-tile` is NOT a consecutive sibling - there are `.col-6` containers between them. Only the first `.product-tile` that happens to match `:nth-child()` will be found.

**CORRECT approach (gets all 6 results):**
```json
{
  "command": "store_text",
  "locator": ".col-6:nth-child($i) .product-tile .title",
  "output": { "name": "TITLE$i" },
  "config": { "loop": { "index": "i", "from": 1, "to": 6 } }
}
```
**Why it works:** `.col-6` containers ARE consecutive siblings. We target them with `:nth-child($i)`, then drill down to `.product-tile .title`.

**Remember:** 
- Look at the evidence structure carefully
- Identify what wraps each result item
- Target the wrapper with `:nth-child($i)`, not the nested item
- This pattern applies to ANY site with nested result items

---
