# RecipeKit AutoRecipe System - Executive Summary

> **Quick overview of the autonomous recipe generation system for developers and contributors**

---

## What is RecipeKit?

RecipeKit is an autonomous web scraping system that generates JSON "recipes" to extract structured data from websites. Given just a URL, it can:

1. **Classify** the website into a content type (movies, books, restaurants, etc.)
2. **Generate** extraction steps for both search and detail pages
3. **Test** the recipe automatically
4. **Repair** broken recipes iteratively using AI feedback
5. **Produce** production-ready recipes with tests

---

## Key Components

### 1. Engine (`Engine/engine.js`)
Puppeteer-based executor that runs recipes in two modes:
- **autocomplete**: Extract search results → `[{TITLE, URL, COVER}, ...]`
- **url**: Extract item details → `{TITLE, DESCRIPTION, COVER, RATING, ...}`

### 2. AutoRecipe (`Engine/scripts/autoRecipe.js`)
AI-powered autonomous recipe generator (2,657 lines):
- Uses **Copilot SDK** (Claude Opus 4.5) for intelligent generation
- Employs **Puppeteer** for web probing and evidence collection
- Implements **repair loop** (max 5 iterations) to fix failures
- Discovers **search patterns**: URL templates, forms, or APIs

### 3. Debug Tools (`Engine/scripts/debug-tools/`)
Pre-built utilities for recipe development:
- **`inspect-dom.js`**: Analyze page structure, find repeating patterns
- **`test-selector.js`**: Test CSS selectors against live pages
- **`debug-recipe.js`**: Step-by-step recipe execution debugger

### 4. AI Prompts (`Engine/scripts/prompts/`)
Specialized markdown prompts for different tasks:
- **`classify.md`**: Website classification into content types
- **`author-autocomplete.md`**: Generate search extraction steps
- **`author-url.md`**: Generate detail page extraction steps
- **`fixer.md`**: Repair broken recipes based on test failures

---

## How It Works

### Input
```bash
bun Engine/scripts/autoRecipe.js --url=https://www.themoviedb.org
```

### Process

```
1. PROBE WEBSITE
   ├─ Load homepage
   ├─ Extract: title, meta tags, JSON-LD, links
   ├─ Detect search functionality
   └─ Dismiss cookie banners

2. CLASSIFY CONTENT
   ├─ Send evidence to Copilot (classify.md)
   ├─ Get: list_type, confidence, rationale
   └─ Determine: folder + filename

3. GENERATE SEARCH RECIPE
   ├─ Probe search results page
   │  ├─ Try URL template search
   │  ├─ Try form submission
   │  └─ Try API discovery (XHR interception)
   ├─ Analyze result structure
   ├─ Send to Copilot (author-autocomplete.md)
   └─ Get: autocomplete_steps

4. TEST & REPAIR (Search)
   ├─ Generate test file
   ├─ Run: bun test
   ├─ If fails: probe again → send to fixer.md
   ├─ Apply patches or rewrite
   └─ Repeat until pass or max iterations

5. GENERATE DETAIL RECIPE
   ├─ Probe detail page
   ├─ Extract: meta tags, JSON-LD, DOM structure
   ├─ Send to Copilot (author-url.md)
   └─ Get: url_steps

6. TEST & REPAIR (Detail)
   └─ Same repair loop as search

7. OUTPUT
   ├─ Recipe: movies/themoviedb.json
   └─ Tests: movies/themoviedb.autorecipe.test.js
```

### Output

**Recipe file** (`movies/themoviedb.json`):
```json
{
  "recipe_shortcut": "themoviedb_movies",
  "list_type": "movies",
  "engine_version": 20,
  "title": "The Movie Database",
  "description": "Search and extract movie information",
  "urls": ["https://www.themoviedb.org"],
  "headers": {...},
  "autocomplete_steps": [
    {"command": "load", "url": "https://www.themoviedb.org/search?query=$INPUT"},
    {"command": "store_text", "locator": ".result:nth-child($i) h2", "output": {"name": "TITLE$i"}},
    {"command": "store_attribute", "locator": ".result:nth-child($i) a", "attribute_name": "href", "output": {"name": "URL$i"}},
    ...
  ],
  "url_steps": [
    {"command": "load", "url": "$INPUT"},
    {"command": "store_attribute", "locator": "meta[property='og:title']", "attribute_name": "content", "output": {"name": "TITLE", "show": true}},
    ...
  ]
}
```

**Test file** (`movies/themoviedb.autorecipe.test.js`):
```javascript
import { describe, test, expect } from 'bun:test';

describe('The Movie Database Recipe', () => {
  test('autocomplete: search returns results', async () => {
    const result = await runEngine('movies/themoviedb.json', 'autocomplete', 'Inception');
    
    expect(result.results.length).toBeGreaterThan(0);
    const entry = findEntry(result.results, 'Inception', '2010');
    expect(entry).toBeDefined();
    expect(entry.URL).toMatch(/^https:\/\//);
  }, 30000);
  
  test('url: detail page extracts fields', async () => {
    const result = await runEngine('movies/themoviedb.json', 'url', 'https://www.themoviedb.org/movie/27205');
    
    expect(result.results.TITLE).toBe('Inception');
    expect(result.results.DESCRIPTION).toBeDefined();
    expect(result.results.COVER).toMatch(/^https:\/\//);
  }, 30000);
});
```

---

## Architecture

### Directory Structure
```
RecipeKit/
├── Engine/
│   ├── engine.js                    # Recipe executor (Puppeteer)
│   ├── package.json                 # Dependencies (engine_version: 20)
│   ├── scripts/
│   │   ├── autoRecipe.js           # Autonomous generator (2,657 lines)
│   │   ├── prompts/                # AI prompts for Copilot
│   │   │   ├── classify.md         # Classification (55 lines)
│   │   │   ├── author-autocomplete.md # Search steps (296 lines)
│   │   │   ├── author-url.md       # Detail steps (315 lines)
│   │   │   ├── fixer.md            # Repair logic (128 lines)
│   │   │   ├── debug-strategy.md   # Debug guide (296 lines)
│   │   │   └── engine-reference.md # API reference (572 lines)
│   │   └── debug-tools/            # Developer utilities
│   │       ├── README.md           # Tool docs (177 lines)
│   │       ├── inspect-dom.js      # DOM analyzer
│   │       ├── test-selector.js    # Selector tester
│   │       └── debug-recipe.js     # Step debugger
│   └── docs/
│       ├── autorecipe.md           # Specification (340 lines)
│       ├── engine-reference.md     # Recipe guide (572 lines)
│       ├── DEVELOPMENT_GUIDE.md    # Complete guide (NEW)
│       └── SUMMARY.md              # This file (NEW)
│
├── movies/                          # Recipes by content type
│   ├── themoviedb.json
│   └── themoviedb.autorecipe.test.js
├── books/
├── restaurants/
└── ... (18 content types total)
```

### Technology Stack
- **Runtime**: Bun (JavaScript)
- **Browser**: Puppeteer (headless Chrome)
- **AI**: GitHub Copilot SDK (Claude Opus 4.5)
- **Testing**: Bun test framework
- **Language**: JavaScript (ESM modules)

### Content Types Supported (18 total)
```
albums, anime, artists, beers, boardgames, books, food, generic,
manga, movies, podcasts, recipes, restaurants, software, songs,
tv_shows, videogames, wines
```

---

## Core Concepts

### Recipes
JSON files with two types of steps:
- **autocomplete_steps**: Extract search results (indexed variables: `TITLE$i`, `URL$i`)
- **url_steps**: Extract detail page info (named variables: `TITLE`, `DESCRIPTION`)

### Steps
Commands executed sequentially:
- **Navigation**: `load`, `api_request`
- **Extraction**: `store_text`, `store_attribute`, `store_array`
- **Transformation**: `regex`, `replace`, `url_encode`, `store`
- **JSON**: `json_store_text`

### Variables
- **Built-in**: `$INPUT`, `$SYSTEM_LANGUAGE`, `$SYSTEM_REGION`
- **Custom**: Defined via `output.name` in steps
- **Indexed**: `TITLE$i`, `URL$i` (for loops)
- **⚠️ Limitation**: Cannot combine variables like `"$VAR1 - $VAR2"`

### Evidence Collection
Structured data gathered via Puppeteer:
```json
{
  "input_url": "https://example.com",
  "final_url": "https://example.com",
  "hostname": "example.com",
  "title": "Page Title",
  "meta_description": "...",
  "h1": "...",
  "jsonld_types": ["Product", "WebSite"],
  "links_sample": [{...}],
  "search": {
    "has_search": true,
    "search_url_template": "https://example.com/search?q=$INPUT",
    "search_box_locator": "input[name=q]"
  }
}
```

### Repair Loop
Iterative fixing process (max 5 attempts):
1. Run tests
2. Capture failures
3. Probe page again (if needed)
4. Send to fixer.md with context
5. Apply patches or rewrite
6. Repeat

---

## Quick Start

### Generate a Recipe (Discovery Mode - NEW!) ✨
```bash
# Discover and evaluate sources from a prompt
bun Engine/scripts/autoRecipe.js --prompt="movie database with ratings"

# More examples
bun Engine/scripts/autoRecipe.js --prompt="recipe website with ingredients"
bun Engine/scripts/autoRecipe.js --prompt="wine ratings database" --debug

# How it works:
# 1. Searches web for matching websites
# 2. Scores and ranks candidates (0-100)
# 3. Shows top 5 with pros/cons
# 4. You select one
# 5. Generates recipe automatically
```

### Generate a Recipe (Direct URL)
```bash
# Fully autonomous from known URL
bun Engine/scripts/autoRecipe.js --url=https://example.com

# With debug output
bun Engine/scripts/autoRecipe.js --url=https://example.com --debug

# Force overwrite existing
bun Engine/scripts/autoRecipe.js --url=https://example.com --force
```

### Test an Existing Recipe
```bash
# Search mode
bun Engine/engine.js --recipe movies/tmdb.json --type autocomplete --input "Inception"

# Detail mode
bun Engine/engine.js --recipe movies/tmdb.json --type url --input "https://www.themoviedb.org/movie/27205"

# Debug mode (visible browser)
bun Engine/engine.js --recipe movies/tmdb.json --type autocomplete --input "test" --debug
```

### Debug Tools
```bash
# Find result items on a page
node Engine/scripts/debug-tools/inspect-dom.js "https://example.com/search?q=test" --find-items

# Test a CSS selector
node Engine/scripts/debug-tools/test-selector.js "https://example.com" ".result:nth-of-type(\$i) .title" --loop 5

# Debug recipe step-by-step
node Engine/scripts/debug-tools/debug-recipe.js movies/tmdb.json --type autocomplete --input "test" --pause
```

---

## Key Features

### 1. Multi-Strategy Search Detection
AutoRecipe tries three approaches:
1. **URL-based**: Direct search URL like `?q=$INPUT`
2. **Form submission**: Find and submit search form
3. **API discovery**: Intercept XHR/fetch during typing

### 2. Self-Healing Repair Loop
- Automatically detects test failures
- Probes page again for fresh evidence
- Sends context to AI fixer
- Applies surgical patches or full rewrites
- Learns from previous failed attempts

### 3. Intelligent Selector Generation
- Prefers stable selectors (meta tags, JSON-LD, data attributes)
- Avoids fragile patterns (generated class names, deep nesting)
- Tests loop selectors properly (`:nth-of-type` vs `:nth-child`)
- Handles relative URLs automatically

### 4. Cookie Banner Dismissal
Automatically detects and dismisses common cookie consent frameworks:
- OneTrust, Cookiebot, CookieYes, Didomi, Quantcast
- Google Funding Choices
- Generic patterns (accept, consent, agree buttons)

### 5. Comprehensive Evidence Collection
- Page metadata (title, description, h1)
- Open Graph tags
- JSON-LD structured data
- Search functionality detection
- Link analysis
- API endpoint discovery

---

## Important Limitations

### Variable Substitution
Variables ONLY work in specific places:
- ✅ `url` field of `load` and `api_request`
- ✅ `input` field of `store`, `regex`, `replace`
- ✅ `locator` field (only `$i` for loops)
- ❌ NOT for combining values: `"$VAR1 - $VAR2"` won't work

### CSS Selectors
- Engine uses `querySelector` (returns first match only)
- Comma selectors can be unpredictable: `h1, meta[og:title]`
- `:nth-child($i)` counts ALL siblings, not just matching class

### Meta Tag Extraction
- `store_text` does NOT work on `<meta>` tags (no textContent)
- Must use `store_attribute` with `attribute_name: "content"`

### Output Configuration
- **autocomplete mode**: Variables indexed (`TITLE$i`) → array output
- **url mode**: Must set `"show": true` or field won't appear in output

---

## Common Patterns

### Extract from Meta Tags
```json
{
  "command": "store_attribute",
  "locator": "meta[property='og:title']",
  "attribute_name": "content",
  "output": {"name": "TITLE", "type": "string", "show": true}
}
```

### Handle Relative URLs
```json
[
  {"command": "store_attribute", "locator": ".result:nth-child($i) a", "attribute_name": "href", "output": {"name": "REL_URL$i"}},
  {"command": "store", "input": "https://example.com$REL_URL$i", "output": {"name": "URL$i"}}
]
```

### Clean Extracted Text
```json
[
  {"command": "store_text", "locator": "h1", "output": {"name": "RAW_TITLE"}},
  {"command": "regex", "input": "$RAW_TITLE", "expression": "^(.+?)\\s*\\|.*$", "output": {"name": "TITLE", "show": true}}
]
```

### Extract from JSON-LD
```json
[
  {"command": "store_text", "locator": "script[type='application/ld+json']", "output": {"name": "JSON_LD"}},
  {"command": "json_store_text", "input": "$JSON_LD", "locator": "name", "output": {"name": "TITLE", "show": true}}
]
```

### API-Based Recipe
```json
[
  {"command": "api_request", "url": "https://api.example.com/search?q=$INPUT", "output": {"name": "API_RESPONSE"}},
  {"command": "json_store_text", "input": "$API_RESPONSE", "locator": "results.[$i].title", "output": {"name": "TITLE$i"}}
]
```

---

## Development Workflow

### Option 1: Fully Autonomous (Recommended)
```bash
bun Engine/scripts/autoRecipe.js --url=https://example.com --debug
# Sit back and let AI do everything
```

### Option 2: Hybrid (Generate + Refine)
```bash
# Generate initial recipe
bun Engine/scripts/autoRecipe.js --url=https://example.com

# Review and manually refine
vim movies/example.json

# Debug specific issues
node Engine/scripts/debug-tools/debug-recipe.js movies/example.json --type url --input "URL"

# Re-run tests
bun test movies/example.autorecipe.test.js
```

### Option 3: Manual Development
```bash
# 1. Inspect page structure
node Engine/scripts/debug-tools/inspect-dom.js "URL" --find-items

# 2. Test selectors
node Engine/scripts/debug-tools/test-selector.js "URL" ".result:nth-of-type(\$i) .title" --loop 10

# 3. Create recipe JSON manually
vim movies/example.json

# 4. Test recipe
bun Engine/engine.js --recipe movies/example.json --type autocomplete --input "test" --debug

# 5. Write tests manually
vim movies/example.autorecipe.test.js

# 6. Run tests
bun test movies/example.autorecipe.test.js
```

---

## Testing Strategy

### Generated Test Structure
```javascript
describe('Recipe Name', () => {
  test('autocomplete: search returns results', async () => {
    const result = await runEngine('path.json', 'autocomplete', 'query');
    
    expect(result.results.length).toBeGreaterThan(0);
    const entry = findEntry(result.results, 'Expected Title', '2023');
    expect(entry).toBeDefined();
    expect(entry.URL).toMatch(/^https:\/\//);
    expect(entry.COVER).toMatch(/^https:\/\//);
  }, 30000);
  
  test('url: detail page extracts fields', async () => {
    const result = await runEngine('path.json', 'url', 'URL');
    
    expect(result.results.TITLE).toBeDefined();
    expect(result.results.DESCRIPTION).toBeDefined();
    expect(result.results.COVER).toMatch(/^https:\/\//);
  }, 30000);
});
```

### Run Tests
```bash
# All tests
bun test

# Specific content type
bun test movies/

# Specific test file
bun test movies/tmdb.autorecipe.test.js

# Watch mode
bun test --watch
```

---

## Troubleshooting

### Issue: Empty Results
**Cause**: Wrong search URL, selectors don't match, or JavaScript not loaded

**Fix**:
```bash
# Debug with visible browser
bun Engine/engine.js --recipe path.json --type autocomplete --input "test" --debug

# Inspect page structure
node Engine/scripts/debug-tools/inspect-dom.js "SEARCH_URL" --find-items

# Test selectors
node Engine/scripts/debug-tools/test-selector.js "SEARCH_URL" ".result:nth-child(\$i)" --loop 10
```

### Issue: Variables Not Replaced
**Symptom**: Output contains `"$VAR1 - $VAR2"` literally

**Cause**: Trying to combine variables (NOT SUPPORTED)

**Fix**: Extract directly from page
```json
// ✅ Extract TITLE directly from element containing full text
{"command": "store_text", "locator": ".result:nth-child($i) .full-title", "output": {"name": "TITLE$i"}}
```

### Issue: nth-child Skips Items
**Symptom**: Loop finds items 1, 3, 5 but not 2, 4

**Cause**: `:nth-child` counts ALL siblings, not just matching class

**Fix**: Use `:nth-of-type` or parent > child
```json
{"locator": ".item:nth-of-type($i)"}
// or
{"locator": ".container > .item:nth-child($i)"}
```

---

## Contributing

### Prerequisites
- Bun v1.0+
- VPN recommended (targets US region)
- Basic knowledge of CSS selectors and JSON

### Contribution Process
1. Generate recipe: `bun Engine/scripts/autoRecipe.js --url=URL`
2. Review generated files
3. Test: `bun test {list_type}/{domain}.autorecipe.test.js`
4. Submit PR with:
   - Recipe JSON
   - Test file
   - Description of what it extracts
   - Test results

### Recipe Quality Checklist
- [ ] Unique `recipe_shortcut`
- [ ] Correct `list_type`
- [ ] `engine_version: 20`
- [ ] All URLs absolute
- [ ] Stable selectors used
- [ ] Tests pass consistently
- [ ] `show: true` on output fields

---

## Advanced Features

### API Discovery
AutoRecipe can discover autocomplete APIs by intercepting network requests while typing in search boxes. Supports:
- GET requests with query parameters
- POST requests with JSON bodies
- Algolia-style APIs
- Custom authentication headers

### Multi-Language Support
```json
{
  "languages_available": ["en", "es", "fr"],
  "regions_available": ["US", "UK", "CA"],
  "language_default": "en",
  "region_default": "US"
}
```

Access via: `$SYSTEM_LANGUAGE`, `$SYSTEM_REGION`

### Custom Headers
```json
{
  "headers": {
    "Accept-Language": "en-US,en",
    "User-Agent": "Mozilla/5.0...",
    "Cookie": "session=abc123"
  }
}
```

---

## Performance & Scale

### Typical Generation Time
- Simple sites: 1-3 minutes
- Complex sites: 3-8 minutes
- Sites requiring repair: 5-15 minutes

### Token Usage (Copilot)
- Classification: ~500 tokens
- Autocomplete generation: ~2,000 tokens
- URL generation: ~2,000 tokens
- Repair iteration: ~3,000 tokens each
- **Total typical**: 8,000-20,000 tokens per recipe

### Success Rate
- Clean sites (good HTML): ~95%
- Medium complexity: ~80%
- Heavy JavaScript/SPA: ~60%
- Anti-bot protection: ~30%

---

## Resources

### Local Documentation
- **Complete Guide**: `Engine/docs/DEVELOPMENT_GUIDE.md` (this is THE reference)
- **Quick Summary**: `Engine/docs/SUMMARY.md` (you're reading this)
- **AutoRecipe Spec**: `Engine/docs/autorecipe.md` (340 lines)
- **Engine Reference**: `Engine/docs/engine-reference.md` (572 lines)
- **Debug Tools**: `Engine/scripts/debug-tools/README.md` (177 lines)

### Source Files
- **Main Script**: `Engine/scripts/autoRecipe.js` (2,657 lines)
- **Engine Executor**: `Engine/engine.js`
- **AI Prompts**: `Engine/scripts/prompts/*.md` (6 files, ~1,700 lines total)
  - `classify.md` (55 lines)
  - `author-autocomplete.md` (296 lines)
  - `author-url.md` (315 lines)
  - `fixer.md` (128 lines)
  - `debug-strategy.md` (296 lines)
  - `engine-reference.md` (572 lines)
- **Debug Tools**: `Engine/scripts/debug-tools/*.js` (3 scripts)

### External Resources
- **Repository**: https://github.com/listy-is/RecipeKit
- **Listy App**: https://listy.is
- **Puppeteer Docs**: https://pptr.dev
- **CSS Selectors**: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors
- **Copilot SDK**: https://github.com/github/copilot-sdk
- **Bun Runtime**: https://bun.sh

---

## Quick Command Reference

```bash
# Generation
bun Engine/scripts/autoRecipe.js --url=URL [--force] [--debug]

# Testing
bun Engine/engine.js --recipe PATH --type {autocomplete|url} --input VALUE [--debug]

# Debug Tools
node Engine/scripts/debug-tools/inspect-dom.js URL [--find-items]
node Engine/scripts/debug-tools/test-selector.js URL SELECTOR [--loop N]
node Engine/scripts/debug-tools/debug-recipe.js RECIPE --type TYPE --input VALUE

# Tests
bun test [PATH]
```

---

**For complete documentation, see `Engine/docs/DEVELOPMENT_GUIDE.md`**
