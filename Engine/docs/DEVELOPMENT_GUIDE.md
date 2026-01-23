# RecipeKit AutoRecipe System - Development Guide

> **Complete reference for understanding and contributing to the autonomous recipe generation system**

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [File Reference Guide](#file-reference-guide)
4. [Getting Started](#getting-started)
5. [Core Concepts](#core-concepts)
6. [Development Workflow](#development-workflow)
7. [AutoRecipe Deep Dive](#autorecipe-deep-dive)
8. [Recipe Engine Reference](#recipe-engine-reference)
9. [Debugging Tools](#debugging-tools)
10. [Prompts & AI Integration](#prompts--ai-integration)
11. [Testing Strategy](#testing-strategy)
12. [Common Patterns & Solutions](#common-patterns--solutions)
13. [Troubleshooting](#troubleshooting)
14. [Contributing](#contributing)

---

## System Overview

### What is RecipeKit?

RecipeKit is an autonomous system that extracts structured data from websites. It consists of:

- **Recipes**: JSON configuration files that define extraction steps
- **Engine**: Puppeteer-based executor that runs recipes
- **AutoRecipe**: AI-powered autonomous recipe generator
- **Debug Tools**: Helper utilities for recipe development

### Key Features

- 🤖 **Autonomous Generation**: Given a URL, automatically creates working recipes
- 🔄 **Self-Healing**: Iteratively repairs broken recipes using test feedback
- 🧪 **Test-Driven**: Generates tests alongside recipes, validates correctness
- 🛠️ **Debug Tools**: Pre-built utilities for selector testing and DOM inspection
- 🎯 **Multi-Strategy**: URL search, form submission, and API discovery

### Supported Content Types

```
albums, anime, artists, beers, boardgames, books, food, generic,
manga, movies, podcasts, recipes, restaurants, software, songs,
tv_shows, videogames, wines
```

---

## Architecture

### Component Overview

```
RecipeKit/
├── Engine/                      # Core execution engine
│   ├── engine.js               # Recipe executor (Puppeteer-based)
│   ├── package.json            # Dependencies & version (engine_version: 20)
│   ├── scripts/
│   │   ├── autoRecipe.js       # Autonomous recipe generator (MAIN - 2,657 lines)
│   │   ├── prompts/            # Copilot prompts for AI agents
│   │   │   ├── classify.md     # Website classification
│   │   │   ├── author-autocomplete.md  # Search recipe generation
│   │   │   ├── author-url.md   # Detail page recipe generation
│   │   │   ├── fixer.md        # Recipe repair agent
│   │   │   ├── debug-strategy.md # Debugging methodology guide
│   │   │   └── engine-reference.md # Engine API reference (for prompts)
│   │   └── debug-tools/        # Developer utilities
│   │       ├── README.md       # Debug tools documentation
│   │       ├── inspect-dom.js  # DOM structure analyzer
│   │       ├── test-selector.js # Selector testing tool
│   │       └── debug-recipe.js # Step-by-step debugger
│   └── docs/
│       ├── autorecipe.md       # AutoRecipe specification (340 lines)
│       ├── engine-reference.md # Recipe authoring reference (572 lines)
│       ├── DEVELOPMENT_GUIDE.md # Complete development guide (this file)
│       └── SUMMARY.md          # Executive summary
│
├── {list_type}/                # Recipes organized by content type (18 types)
│   ├── {domain}.json           # Recipe file
│   ├── {domain}.autorecipe.test.js  # Generated tests
│   └── {list_type}.test.js     # Hand-maintained tests (optional)
```

### Data Flow

```
User Input (URL)
    ↓
Evidence Collection (Puppeteer)
    ↓
Classification (Copilot)
    ↓
Search Recipe Generation (Copilot + Evidence)
    ↓
Test Generation & Validation
    ↓
Detail Recipe Generation (Copilot + Evidence)
    ↓
Repair Loop (Test → Fix → Repeat)
    ↓
Final Recipe + Tests
```

---

## File Reference Guide

### Core System Files

| File | Lines | Purpose | When to Use |
|------|-------|---------|-------------|
| **`Engine/engine.js`** | ~1000 | Recipe executor | Run recipes manually |
| **`Engine/scripts/autoRecipe.js`** | 2,657 | Autonomous generator | Generate new recipes |
| **`Engine/package.json`** | 11 | Dependencies & version | Check engine_version |

### Documentation Files

| File | Lines | Purpose | Audience |
|------|-------|---------|----------|
| **`Engine/docs/DEVELOPMENT_GUIDE.md`** | ~7,500 | Complete reference | All developers |
| **`Engine/docs/SUMMARY.md`** | ~700 | Quick overview | New contributors |
| **`Engine/docs/autorecipe.md`** | 340 | AutoRecipe spec | System designers |
| **`Engine/docs/engine-reference.md`** | 572 | Recipe authoring | Recipe authors |
| **`Engine/scripts/debug-tools/README.md`** | 177 | Debug tools guide | Troubleshooting |

### AI Prompt Files

All prompts are in `Engine/scripts/prompts/`:

| File | Lines | Purpose | Used By |
|------|-------|---------|---------|
| **`discover-sources.md`** | ~200 | Evaluate & rank websites | Discovery Mode (Phase 0) |
| **`classify.md`** | 55 | Website classification | AutoRecipe Phase 1 |
| **`author-autocomplete.md`** | 296 | Generate search steps | AutoRecipe Phase 2 |
| **`author-url.md`** | 315 | Generate detail steps | AutoRecipe Phase 3 |
| **`fixer.md`** | 128 | Repair broken recipes | AutoRecipe repair loop |
| **`debug-strategy.md`** | 296 | Debugging methodology | Manual debugging |
| **`engine-reference.md`** | 572 | Engine API reference | All prompts (context) |
| **`css-selector-guide.md`** | 450+ | CSS selector best practices | All authoring prompts |

**Key Insights:**
- `css-selector-guide.md` - NEW! Comprehensive guide on valid CSS selectors, prevents jQuery pseudo-selector errors
- `discover-sources.md` - NEW! Scores and ranks candidate websites (0-100)
- `classify.md` - Returns strict JSON with list_type and confidence
- `author-autocomplete.md` - Emphasizes "think step-by-step" before JSON output
- `author-url.md` - Focuses on stable selectors (meta tags, JSON-LD)
- `fixer.md` - Prefers surgical patches over full rewrites
- `debug-strategy.md` - Guides AI through debugging methodology
- `engine-reference.md` - Embedded in all prompts as API reference

### Debug Tools

All tools are in `Engine/scripts/debug-tools/`:

| File | Purpose | Primary Use Case |
|------|---------|------------------|
| **`inspect-dom.js`** | Analyze page structure | Find repeating result items |
| **`test-selector.js`** | Test CSS selectors | Validate loop selectors |
| **`debug-recipe.js`** | Step-by-step execution | Debug failing recipes |
| **`README.md`** | Tool documentation | Learn tool usage |

### Recipe Files

Location: `{list_type}/{domain}.*`

| Pattern | Example | Purpose |
|---------|---------|---------|
| **`{domain}.json`** | `movies/themoviedb.json` | Recipe definition |
| **`{domain}.autorecipe.test.js`** | `movies/themoviedb.autorecipe.test.js` | Generated tests |
| **`{list_type}.test.js`** | `movies/movies.test.js` | Hand-maintained tests |

### Configuration Files

| File | Purpose |
|------|---------|
| **`Engine/.env`** | Environment variables (not in repo) |
| **`Engine/bun.lockb`** | Dependency lock file |
| **`Engine/node_modules/`** | Installed dependencies |

---

## Getting Started

### Prerequisites

```bash
# Required
- Bun v1.0+ (JavaScript runtime)
- Node.js 18+ (alternative runtime)
- VPN recommended (engine targets US region)

# Optional for development
- Chrome/Chromium (for visible debugging)
- Git (for version control)
```

### Installation

```bash
# Clone repository
git clone https://github.com/listy-is/RecipeKit
cd RecipeKit

# Install dependencies
cd Engine
bun install

# Verify installation
bun run engine.js --help
```

### Quick Start: Generate Your First Recipe

**Method 1: From a Known URL**

```bash
# Generate a recipe from a URL
bun Engine/scripts/autoRecipe.js --url=https://www.themoviedb.org

# With debug output
bun Engine/scripts/autoRecipe.js --url=https://example.com --debug

# Force overwrite existing recipe
bun Engine/scripts/autoRecipe.js --url=https://example.com --force
```

**Method 2: Discovery Mode (NEW!)** ✨

Let AutoRecipe discover and evaluate candidate websites for you:

```bash
# Discover sources from a prompt
bun Engine/scripts/autoRecipe.js --prompt="movie database with ratings"

# More examples
bun Engine/scripts/autoRecipe.js --prompt="recipe website with ingredients and steps"
bun Engine/scripts/autoRecipe.js --prompt="wine ratings and reviews"
bun Engine/scripts/autoRecipe.js --prompt="board game database" --debug

# How it works:
# 1. Searches the web for matching websites
# 2. Evaluates candidates with Copilot (scoring 0-100)
# 3. Shows you top 5 options with pros/cons
# 4. You select one (or enter custom URL)
# 5. Proceeds with normal recipe generation
```

### Quick Start: Test an Existing Recipe

```bash
# Search (autocomplete mode)
bun Engine/engine.js --recipe movies/tmdb.json --type autocomplete --input "Inception"

# Detail page (url mode)
bun Engine/engine.js --recipe movies/tmdb.json --type url --input "https://www.themoviedb.org/movie/27205"

# Debug mode (visible browser)
bun Engine/engine.js --recipe movies/tmdb.json --type autocomplete --input "Inception" --debug
```

---

## Core Concepts

### 1. Recipes

Recipes are JSON files that define how to extract data from websites.

**Two Operation Modes:**

- **autocomplete**: Extract multiple search results → `{ results: [{...}, {...}] }`
- **url**: Extract single item details → `{ results: {...} }`

**Recipe Structure:**

```json
{
  "recipe_shortcut": "example_movies",
  "list_type": "movies",
  "engine_version": 20,
  "title": "Example Movies",
  "description": "Extract movies from example.com",
  "urls": ["https://example.com"],
  "headers": {
    "Accept-Language": "en-US,en",
    "User-Agent": "Mozilla/5.0..."
  },
  "autocomplete_steps": [...],
  "url_steps": [...]
}
```

### 2. Steps

Steps are commands executed sequentially by the engine. Each step can:

- Load a page (`load`)
- Extract text (`store_text`)
- Extract attributes (`store_attribute`)
- Transform data (`regex`, `replace`)
- Store values (`store`)
- Work with APIs (`api_request`, `json_store_text`)

### 3. Variables

**Built-in Variables:**
- `$INPUT` - User's search query or URL
- `$SYSTEM_LANGUAGE` - User's language (e.g., "en")
- `$SYSTEM_REGION` - User's region (e.g., "US")

**Custom Variables:**
- Defined via `output.name` in steps
- Referenced with `$VARIABLE_NAME`
- **Indexed variables**: `TITLE$i`, `URL$i` (for loops)

**⚠️ CRITICAL Limitation:**

Variables ONLY work in:
- `url` field of `load` and `api_request`
- `input` field of `store`, `regex`, `replace`
- `locator` field (only `$i` for loops)

Variables DO NOT work for combining values:
```json
// ❌ WRONG - This will NOT work!
{ "command": "store", "input": "$VAR1 - $VAR2", "output": {"name": "COMBINED"} }
```

### 4. Loops

Extract multiple items without repeating steps:

```json
{
  "command": "store_text",
  "locator": ".result:nth-child($i) .title",
  "output": { "name": "TITLE$i" },
  "config": {
    "loop": { "index": "i", "from": 1, "to": 5, "step": 1 }
  }
}
```

This creates: `TITLE1`, `TITLE2`, `TITLE3`, `TITLE4`, `TITLE5`

### 5. Output Contract

**Autocomplete (search results):**
- Required: `TITLE$i`, `URL$i`, `COVER$i`
- Optional: `SUBTITLE$i`

**URL (detail pages):**
- Required fields vary by `list_type`
- Must set `"show": true` in output config
- Common: `TITLE`, `DESCRIPTION`, `COVER`, `RATING`, `DATE`, `AUTHOR`

---

## Development Workflow

### Option 1: Discovery Mode (NEW - Most Autonomous) ✨

```bash
# Let AutoRecipe discover AND generate everything
bun Engine/scripts/autoRecipe.js --prompt="wine ratings database" --debug

# What it does:
# 0. Searches web for candidate websites matching your prompt
# 1. Evaluates and ranks candidates (scoring 0-100)
# 2. Presents top 5 options with pros/cons
# 3. You select the best one
# 4. Probes the selected website
# 5. Classifies content type
# 6. Generates autocomplete_steps
# 7. Generates tests
# 8. Runs tests and repairs until green
# 9. Generates url_steps
# 10. Runs tests and repairs until green
```

**Use Discovery Mode when:**
- You know WHAT you want but not WHERE to find it
- You want to compare multiple sources before choosing
- You're exploring a new content domain
- You want Copilot to evaluate website quality

**Example prompts:**
- `"movie database with ratings and reviews"`
- `"recipe website with ingredients and cooking steps"`
- `"board game reviews and player counts"`
- `"wine ratings by region and vintage"`

### Option 2: Direct URL Generation (Recommended for Known Sources)

```bash
# Let AutoRecipe do everything with a known URL
bun Engine/scripts/autoRecipe.js --url=https://example.com --debug

# What it does:
# 1. Probes the website
# 2. Classifies content type
# 3. Generates autocomplete_steps
# 4. Generates tests
# 5. Runs tests and repairs until green
# 6. Generates url_steps
# 7. Runs tests and repairs until green
```

### Option 3: Manual Recipe Development

```bash
# Step 1: Inspect the website
node Engine/scripts/debug-tools/inspect-dom.js "https://example.com/search?q=test" --find-items

# Step 2: Test selectors
node Engine/scripts/debug-tools/test-selector.js "https://example.com" ".result:nth-child(\$i) .title" --loop 5

# Step 3: Create recipe JSON
# Edit {list_type}/{domain}.json

# Step 4: Test the recipe
bun Engine/engine.js --recipe generic/example.json --type autocomplete --input "test" --debug

# Step 5: Debug step by step
node Engine/scripts/debug-tools/debug-recipe.js generic/example.json --type autocomplete --input "test" --pause

# Step 6: Write tests
# Create {list_type}/{domain}.autorecipe.test.js

# Step 7: Run tests
bun test {list_type}/{domain}.autorecipe.test.js
```

### Option 3: Hybrid Approach

```bash
# Generate initial recipe
bun Engine/scripts/autoRecipe.js --url=https://example.com

# Review and manually refine
vim movies/example.json

# Debug specific issues
node Engine/scripts/debug-tools/debug-recipe.js movies/example.json --type url --input "https://example.com/item/123"

# Re-run tests
bun test movies/example.autorecipe.test.js
```

---

## AutoRecipe Deep Dive

### Workflow Phases

#### Phase 0: Setup & Validation

```javascript
// Validates URL, checks for existing recipes
// Sets up browser, Copilot SDK, and logging
```

#### Phase 1: Classification

**Evidence Collection:**
```javascript
{
  "input_url": "https://example.com/...",
  "final_url": "https://example.com/...",
  "hostname": "example.com",
  "title": "...",
  "meta_description": "...",
  "h1": "...",
  "jsonld_types": ["Product", "Recipe"],
  "links_sample": [{"text": "...", "href": "..."}],
  "search": {
    "has_search": true,
    "search_url_template": "https://example.com/search?q=$INPUT",
    "search_box_locator": "input[name=q]"
  }
}
```

**Copilot Classification:**
```javascript
// Sends evidence to classify.md prompt
// Returns: { list_type, confidence, rationale, suggested_recipe_shortcut }
```

#### Phase 2: Search Recipe Generation

**2.1 - Probe Search Results**

Three strategies (in order):
1. **URL-based search**: Try `search_url_template` directly
2. **Form submission**: Find search form and submit
3. **API discovery**: Intercept XHR/fetch during typing

**2.2 - Author autocomplete_steps**

```javascript
// Sends to author-autocomplete.md prompt with:
// - Initial evidence
// - Search results evidence
// - Required output contract

// Returns: { autocomplete_steps, assumptions, known_fragility }
```

**2.3 - Generate & Run Tests**

```javascript
// Creates {domain}.autorecipe.test.js
// Runs: bun test {list_type}/{domain}.autorecipe.test.js
```

**2.4 - Repair Loop (max 5 iterations)**

```javascript
while (tests_failing && iterations < MAX_REPAIR_ITERATIONS) {
  // 1. Collect new evidence (if needed)
  // 2. Send to fixer.md with: recipe, error, evidence
  // 3. Apply patches or rewrite
  // 4. Re-run tests
}
```

#### Phase 3: Detail Recipe Generation

**3.1 - Probe Detail Page**

Uses a stable URL from search results or canonical URL.

**3.2 - Author url_steps**

```javascript
// Sends to author-url.md prompt with:
// - Detail page evidence
// - Required fields for list_type

// Returns: { url_steps, outputs, assumptions }
```

**3.3 - Repair Loop**

Same iterative process as autocomplete.

### Key Classes

#### `AutoRecipe`
Main orchestrator class.

**Key Methods:**
- `run()` - Main entry point
- `classifyWebsite(evidence)` - Determines list_type
- `generateAutocompleteRecipe(evidence)` - Creates search steps
- `generateUrlRecipe(detailUrl, evidence)` - Creates detail steps
- `repairRecipe(recipe, error, evidence)` - Fixes broken recipes

#### `EvidenceCollector`
Puppeteer-based web probing.

**Key Methods:**
- `probe(url)` - Basic page analysis
- `probeSearchResults(searchUrl, query)` - Search page analysis
- `probeDetailPage(url)` - Detail page analysis
- `discoverAutocompleteAPI(page, query)` - API endpoint discovery
- `analyzeSearchResults(page)` - Find result items and structure
- `dismissCookieBanners(page)` - Remove cookie consent overlays

#### `TestGenerator`
Creates Bun test files.

**Key Methods:**
- `generateTestFile(recipe, testConfig)` - Creates test file
- `validateAutocompleteResults(results, expected)` - Test assertions
- `validateUrlResults(results, required)` - Test assertions

#### `RecipeOrchestrator`
Copilot integration.

**Key Methods:**
- `askCopilot(prompt, context)` - Send prompts to Copilot SDK
- `classify(evidence)` - Wrapper for classification
- `authorAutocomplete(evidence)` - Wrapper for autocomplete generation
- `authorUrl(evidence)` - Wrapper for url generation
- `repair(recipe, error, evidence)` - Wrapper for repair

---

## Recipe Engine Reference

### Command Catalog

#### Navigation Commands

**`load` - Load Page**
```json
{
  "command": "load",
  "url": "https://example.com/search?q=$INPUT",
  "config": {
    "js": true,              // Wait for JavaScript (networkidle0)
    "timeout": 10000,        // Milliseconds
    "headers": { "Cookie": "..." }
  },
  "description": "Load search page"
}
```

**`api_request` - Fetch JSON API**
```json
{
  "command": "api_request",
  "url": "https://api.example.com/search?q=$INPUT",
  "config": {
    "method": "POST",        // GET, POST, PUT, DELETE
    "headers": { "Authorization": "Bearer ..." },
    "body": "{\"query\": \"$INPUT\"}"
  },
  "output": { "name": "API_RESPONSE" },
  "description": "Call search API"
}
```

#### Extraction Commands

**`store_text` - Extract Element Text**
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

**⚠️ Important:**
- Uses `textContent.trim()`
- Works on elements with visible text
- Does NOT work on `<meta>` tags

**`store_attribute` - Extract Attribute Value**
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
  "description": "Extract cover image from meta tag"
}
```

**Common attributes:**
- `href` (links)
- `src` (images)
- `content` (meta tags)
- `data-*` (custom attributes)

**`store_array` - Collect Into Array**
```json
{
  "command": "store_array",
  "locator": ".tag:nth-child($i)",
  "output": { "name": "TAGS" },
  "config": {
    "loop": { "index": "i", "from": 1, "to": 10, "step": 1 }
  },
  "description": "Collect all tags"
}
```

**`store_url` - Save Current URL**
```json
{
  "command": "store_url",
  "output": { "name": "CANONICAL_URL" },
  "description": "Save URL after redirects"
}
```

**`json_store_text` - Extract from JSON**
```json
{
  "command": "json_store_text",
  "input": "$API_RESPONSE",
  "locator": "results.[0].title",  // Lodash path syntax
  "output": { "name": "TITLE" },
  "description": "Extract title from JSON"
}
```

**Locator syntax:**
- `property.nested` - Nested object access
- `array.[0]` - Array index (0-based)
- `results.[$i].name` - Loop variable in path

#### Transformation Commands

**`store` - Transform/Concatenate**
```json
{
  "command": "store",
  "input": "https://example.com$RELATIVE_URL",
  "output": { "name": "ABSOLUTE_URL" },
  "description": "Make URL absolute"
}
```

**`regex` - Apply Regular Expression**
```json
{
  "command": "regex",
  "input": "$RATING_TEXT",
  "expression": "([\\d.]+)/10",   // Escape backslashes!
  "output": {
    "name": "RATING",
    "type": "float",
    "show": true
  },
  "description": "Extract numeric rating"
}
```

**Behavior:**
- Returns first capture group if present
- Returns full match if no groups
- Returns original input if no match

**`replace` - String Replace**
```json
{
  "command": "replace",
  "input": "$TITLE",
  "find": " - Wikipedia",
  "replace": "",
  "output": { "name": "TITLE" },
  "description": "Remove Wikipedia suffix"
}
```

**`url_encode` - URL Encode**
```json
{
  "command": "url_encode",
  "input": "$SEARCH_TERM",
  "output": { "name": "ENCODED_TERM" },
  "description": "Encode for URL"
}
```

### CSS Selector Best Practices

#### Selector Stability (Best → Worst)

1. **Meta tags** (most stable)
   ```css
   meta[property="og:title"]
   meta[name="description"]
   link[rel="canonical"]
   ```

2. **Schema.org / JSON-LD**
   ```css
   [itemprop="name"]
   [itemprop="description"]
   script[type="application/ld+json"]
   ```

3. **Semantic HTML**
   ```css
   h1
   article
   main
   nav
   ```

4. **Data attributes**
   ```css
   [data-testid="title"]
   [data-product-id]
   ```

5. **Class names** (fragile)
   ```css
   .product-title
   [class*="title"]  /* Partial match */
   ```

#### Selector Patterns for Loops

**Common patterns:**
```css
/* Items in container */
.results .item:nth-child($i)
.grid > div:nth-child($i)

/* By type */
article:nth-of-type($i)
.product:nth-of-type($i)

/* Title within item */
.item:nth-child($i) h3
.item:nth-child($i) [class*="title"]

/* Link within item */
.item:nth-child($i) a[href]

/* Image within item */
.item:nth-child($i) img
```

**⚠️ Common Mistake:**
```css
/* WRONG: nth-child counts ALL siblings, not just .item */
.item:nth-child($i)  /* May skip items */

/* RIGHT: Use parent > child or nth-of-type */
.container > .item:nth-child($i)
.item:nth-of-type($i)
```

#### querySelector Behavior

The engine uses `querySelector` (NOT `querySelectorAll`):

```css
/* Returns FIRST matching element from ANY selector */
h1, h2, meta[property="og:title"]
/* Might return meta tag first (which has no textContent!) */

/* BETTER: Be specific */
h1.product-title
meta[property="og:title"]  /* Use with store_attribute */
```

### Output Configuration

#### Autocomplete Mode

```json
{
  "output": {
    "name": "TITLE$i"  // Creates TITLE1, TITLE2, etc.
  }
}
```

**Required outputs:**
- `TITLE$i` - Result title (extracted from page)
- `URL$i` - Absolute URL to detail page
- `COVER$i` - Thumbnail image URL

**Optional outputs:**
- `SUBTITLE$i` - Year, author, or secondary info

**Engine output format:**
```json
{
  "results": [
    { "TITLE": "Item 1", "URL": "https://...", "COVER": "https://...", "SUBTITLE": "2023" },
    { "TITLE": "Item 2", "URL": "https://...", "COVER": "https://...", "SUBTITLE": "2022" }
  ]
}
```

#### URL Mode

```json
{
  "output": {
    "name": "TITLE",
    "type": "string",
    "format": "YYYY",      // For dates
    "show": true           // REQUIRED to appear in output
  }
}
```

**⚠️ CRITICAL:** Fields without `"show": true` will NOT appear in output!

**Engine output format:**
```json
{
  "results": {
    "TITLE": "Item Title",
    "DESCRIPTION": "...",
    "COVER": "https://...",
    "RATING": 8.5
  }
}
```

### Required Fields by list_type

```javascript
{
  generic: ['TITLE', 'DESCRIPTION', 'FAVICON', 'COVER'],
  movies: ['TITLE', 'DATE', 'DESCRIPTION', 'RATING', 'AUTHOR', 'COVER', 'DURATION'],
  tv_shows: ['TITLE', 'DATE', 'DESCRIPTION', 'RATING', 'AUTHOR', 'COVER', 'EPISODES'],
  anime: ['TITLE', 'DATE', 'DESCRIPTION', 'RATING', 'AUTHOR', 'COVER', 'ORIGINAL_TITLE', 'EPISODES'],
  manga: ['TITLE', 'DATE', 'DESCRIPTION', 'RATING', 'AUTHOR', 'COVER', 'ORIGINAL_TITLE', 'VOLUMES'],
  books: ['TITLE', 'AUTHOR', 'YEAR', 'PAGES', 'DESCRIPTION', 'RATING', 'COVER'],
  albums: ['TITLE', 'AUTHOR', 'DATE', 'GENRE', 'COVER'],
  songs: ['TITLE', 'AUTHOR', 'DATE', 'GENRE', 'COVER', 'PRICE'],
  beers: ['TITLE', 'AUTHOR', 'RATING', 'COVER', 'STYLE', 'ALCOHOL'],
  wines: ['TITLE', 'WINERY', 'RATING', 'COVER', 'REGION', 'COUNTRY', 'GRAPES', 'STYLE'],
  software: ['TITLE', 'RATING', 'GENRE', 'DESCRIPTION', 'COVER'],
  videogames: ['TITLE', 'DATE', 'DESCRIPTION', 'RATING', 'COVER'],
  recipes: ['TITLE', 'COVER', 'INGREDIENTS', 'DESCRIPTION', 'STEPS', 'COOKING_TIME', 'DINERS'],
  podcasts: ['TITLE', 'AUTHOR', 'ALBUM', 'DATE', 'GENRE', 'COVER'],
  boardgames: ['TITLE', 'DATE', 'DESCRIPTION', 'PLAYERS', 'TIME', 'CATEGORY', 'RATING', 'COVER'],
  restaurants: ['TITLE', 'RATING', 'COVER', 'ADDRESS'],
  artists: ['AUTHOR', 'GENRE', 'COVER'],
  food: ['TITLE', 'COVER', 'DESCRIPTION']
}
```

---

## Debugging Tools

### 1. inspect-dom.js

Analyzes page structure to help build selectors.

**Find repeating items (most useful):**
```bash
node Engine/scripts/debug-tools/inspect-dom.js "https://example.com/search?q=test" --find-items
```

**Output example:**
```
Found repeating patterns:
  .result-card (12 items) - confidence: 0.95
    Features: has-link, has-image, has-text
    Parent: .results-container
    
  .product (8 items) - confidence: 0.80
    Features: has-link, has-text
    Parent: .grid
```

**Analyze specific selector:**
```bash
node Engine/scripts/debug-tools/inspect-dom.js "https://example.com" --selector ".product-card"
```

**View page structure tree:**
```bash
node Engine/scripts/debug-tools/inspect-dom.js "https://example.com" --depth 4
```

### 2. test-selector.js

Tests CSS selectors against a live page.

**Test simple selector:**
```bash
node Engine/scripts/debug-tools/test-selector.js "https://example.com" ".product .title"
```

**Test loop selector (CRITICAL for recipes):**
```bash
# Test nth-of-type pattern (recommended)
node Engine/scripts/debug-tools/test-selector.js "https://example.com/search?q=test" ".result:nth-of-type(\$i) .title" --loop 10

# Test nth-child pattern
node Engine/scripts/debug-tools/test-selector.js "https://example.com" ".grid > *:nth-child(\$i) .title" --loop 10
```

**Output example:**
```
Testing selector: .result:nth-child($i) .title

Loop iteration 1: ✓ Found
  Text: "Item Title 1"
  
Loop iteration 2: ✗ Not found
  
Loop iteration 3: ✓ Found
  Text: "Item Title 2"
```

**Extract attributes:**
```bash
node Engine/scripts/debug-tools/test-selector.js "https://example.com" ".product a" --attribute href
node Engine/scripts/debug-tools/test-selector.js "https://example.com" ".product img" --attribute src
```

### 3. debug-recipe.js

Step-by-step recipe execution with detailed output.

**Basic usage:**
```bash
node Engine/scripts/debug-tools/debug-recipe.js generic/example.json --type autocomplete --input "test"
node Engine/scripts/debug-tools/debug-recipe.js generic/example.json --type url --input "https://example.com/item/123"
```

**Debug specific step:**
```bash
# Run only step 1
node Engine/scripts/debug-tools/debug-recipe.js generic/example.json --type autocomplete --input "test" --step 1
```

**Interactive mode:**
```bash
node Engine/scripts/debug-tools/debug-recipe.js generic/example.json --type autocomplete --input "test" --pause --screenshot
```

**Output example:**
```
Step 1: load
  Command: load
  URL: https://example.com/search?q=test
  Status: ✓ Success
  Duration: 1.2s

Step 2: store_text
  Command: store_text
  Locator: .result:nth-child(1) .title
  Status: ✓ Found element
  Text extracted: "First Result"
  Stored in: TITLE1

Step 3: store_attribute
  Command: store_attribute
  Locator: .result:nth-child(1) a
  Attribute: href
  Status: ✗ Element not found
  Selector matched 0 elements
```

### Debugging Workflow

```bash
# 1. Understand page structure
node Engine/scripts/debug-tools/inspect-dom.js "URL" --find-items

# 2. Test individual selectors
node Engine/scripts/debug-tools/test-selector.js "URL" ".candidate-selector"

# 3. Test loop selectors
node Engine/scripts/debug-tools/test-selector.js "URL" ".result:nth-of-type(\$i)" --loop 10

# 4. Test recipe
bun Engine/engine.js --recipe path/to/recipe.json --type autocomplete --input "test" --debug

# 5. Debug step by step
node Engine/scripts/debug-tools/debug-recipe.js path/to/recipe.json --type autocomplete --input "test" --pause

# 6. Run tests
bun test path/to/recipe.autorecipe.test.js
```

---

## Prompts & AI Integration

AutoRecipe uses the Copilot SDK with specialized markdown prompts.

### Prompt Files

All prompt files are located in `Engine/scripts/prompts/`:

#### 1. classify.md (55 lines)

**Location:** `Engine/scripts/prompts/classify.md`

**Purpose:** Classify website into a list_type category

**Input:**
```json
{
  "input_url": "https://example.com",
  "hostname": "example.com",
  "title": "...",
  "meta_description": "...",
  "jsonld_types": ["Product", "Recipe"],
  "links_sample": [...]
}
```

**Output:**
```json
{
  "list_type": "movies",
  "confidence": 0.95,
  "rationale": "Site contains movie information with titles, release dates, and ratings",
  "suggested_recipe_shortcut": "example_movies"
}
```

#### 2. author-autocomplete.md (296 lines)

**Location:** `Engine/scripts/prompts/author-autocomplete.md`

**Purpose:** Generate autocomplete_steps for search functionality

**Key Principles:**
- Think step-by-step before outputting JSON
- Analyze evidence carefully (don't guess)
- Extract TITLE directly from page elements
- Make URLs absolute
- Use stable selectors

**Input:**
```json
{
  "evidence": { /* Initial evidence + search evidence */ },
  "query": "test",
  "expected": {
    "title": "Expected Title",
    "url_regex": "^https://example.com/item/"
  }
}
```

**Output:**
```json
{
  "autocomplete_steps": [
    { "command": "load", "url": "https://example.com/search?q=$INPUT", ... },
    { "command": "store_text", "locator": ".result:nth-child($i) .title", ... },
    ...
  ],
  "assumptions": ["Results are in .result-item containers"],
  "known_fragility": ["Class names may change"],
  "extra_probes_needed": []
}
```

#### 3. author-url.md (315 lines)

**Location:** `Engine/scripts/prompts/author-url.md`

**Purpose:** Generate url_steps for detail page extraction

**Key Principles:**
- Prefer Open Graph meta tags (most reliable)
- Use JSON-LD when available
- Set `show: true` for all output fields
- Don't use store_text on meta tags

**Input:**
```json
{
  "evidence": {
    "url": "https://example.com/item/123",
    "title": "...",
    "og_title": "...",
    "og_description": "...",
    "og_image": "...",
    "jsonld": [...]
  },
  "list_type": "movies",
  "required_fields": ["TITLE", "DATE", "DESCRIPTION", ...]
}
```

**Output:**
```json
{
  "url_steps": [
    { "command": "load", "url": "$INPUT", ... },
    { "command": "store_attribute", "locator": "meta[property='og:title']", ... },
    ...
  ],
  "outputs": [
    { "name": "TITLE", "type": "string" },
    { "name": "DESCRIPTION", "type": "string" }
  ],
  "assumptions": ["Page uses Open Graph meta tags"],
  "known_fragility": []
}
```

#### 4. fixer.md (128 lines)

**Location:** `Engine/scripts/prompts/fixer.md`

**Purpose:** Repair broken recipes based on test failures

**Key Principles:**
- Prefer patches over full rewrites
- Learn from previous failed attempts
- Check evidence for structural changes
- Suggest surgical fixes

**Input:**
```json
{
  "recipe": { /* Current recipe JSON */ },
  "step_type": "autocomplete_steps",
  "error": {
    "type": "selector_timeout",
    "message": "Selector .result .title not found",
    "details": "..."
  },
  "evidence": { /* Fresh evidence from page */ },
  "conversation_history": [
    { "attempt": 1, "fix": "...", "result": "still failed" }
  ]
}
```

**Output:**
```json
{
  "action": "patch",
  "patches": [
    {
      "step_index": 2,
      "field": "locator",
      "old_value": ".result .title",
      "new_value": ".search-result h3"
    }
  ],
  "explanation": "The container class changed from .result to .search-result"
}
```

Or for major structural changes:
```json
{
  "action": "rewrite",
  "steps": [ /* Complete new steps array */ ],
  "explanation": "Site now uses API instead of DOM scraping"
}
```

#### 5. debug-strategy.md (296 lines)

**Location:** `Engine/scripts/prompts/debug-strategy.md`

**Purpose:** Guide AI through systematic debugging methodology

**Key Sections:**
- Available debugging tools reference
- Think-step-by-step methodology
- Puppeteer script templates for investigation
- Common site patterns (form submit, autocomplete, API, lazy load)
- Recipe validation checklist
- Troubleshooting decision tree

**When Used:**
- Not directly used by AutoRecipe
- Reference guide for manual debugging
- Template for creating custom debugging scripts

**Key Principle:**
```
UNDERSTAND FIRST, CODE SECOND
Every minute analyzing the page saves hours debugging selectors
```

**Debugging Tools Priority:**
1. Use pre-made tools first (`inspect-dom.js`, `test-selector.js`)
2. Create custom Puppeteer scripts only if tools insufficient
3. Always validate selectors before committing to recipe

#### 6. engine-reference.md (572 lines)

**Location:** `Engine/scripts/prompts/engine-reference.md`

**Purpose:** Complete engine API reference for AI context

**Contents:**
- All available commands with syntax
- Variable system and substitution rules
- Loop configuration
- CSS selector patterns
- Output contracts by list_type
- Common mistakes and solutions

**When Used:**
- Embedded in ALL prompt contexts
- Ensures AI has complete API knowledge
- Referenced by classify, author-*, and fixer prompts

**Critical for:**
- Correct command usage
- Understanding variable limitations
- Knowing required output fields per list_type

### Prompt Orchestration

**How prompts work together:**

```
1. classify.md
   Input: Evidence packet (page metadata)
   Output: list_type, confidence, recipe_shortcut
   ↓
2. author-autocomplete.md + engine-reference.md
   Input: Evidence + search evidence + classify result
   Output: autocomplete_steps
   ↓
3. Test & Repair Loop
   ↓
4. fixer.md + engine-reference.md (if tests fail)
   Input: Recipe + error + evidence + history
   Output: Patches or rewrite
   ↓
5. author-url.md + engine-reference.md
   Input: Detail evidence + list_type + required fields
   Output: url_steps
   ↓
6. Test & Repair Loop (again)
```

**Shared Context:**
- All prompts receive `engine-reference.md` as context
- Ensures consistent command usage
- Prevents syntax errors and API misuse

### Copilot SDK Integration

**Implementation in `autoRecipe.js`:**

```javascript
import { CopilotClient } from '@github/copilot-sdk';

// Initialize
const client = new CopilotClient({
  model: 'claude-opus-4.5',  // Best for long-running agentic tasks
  temperature: 0.1            // Low for consistent, predictable output
});

// Create session
const session = await client.createSession();

// Send prompt
const response = await session.send({
  messages: [
    { role: 'system', content: promptFromFile },
    { role: 'user', content: JSON.stringify(evidence) }
  ]
});

// Parse JSON response
const result = JSON.parse(response.content);

// Clean up
await session.destroy();
```

**Model Selection:**
- `claude-opus-4.5`: Best reasoning, use for autoRecipe
- `claude-sonnet-4`: Balanced speed/quality
- `claude-haiku-4.5`: Fast, use for simple tasks

---

## Testing Strategy

### Test File Structure

Generated test files follow this pattern:

```javascript
// {list_type}/{domain}.autorecipe.test.js

import { describe, test, expect } from 'bun:test';
import { spawn } from 'bun';

// Helper: Run engine
async function runEngine(recipe, type, input) {
  const proc = spawn({
    cmd: ['bun', 'Engine/engine.js', '--recipe', recipe, '--type', type, '--input', input],
    stdout: 'pipe',
    stderr: 'pipe'
  });
  
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  
  return JSON.parse(output);
}

// Helper: Find entry in results
function findEntry(results, title, subtitle) {
  return results.find(r => 
    r.TITLE?.toLowerCase().includes(title.toLowerCase()) &&
    (!subtitle || r.SUBTITLE?.includes(subtitle))
  );
}

describe('Example Recipe', () => {
  test('autocomplete: search returns results', async () => {
    const result = await runEngine('generic/example.json', 'autocomplete', 'test query');
    
    expect(result.results).toBeDefined();
    expect(result.results.length).toBeGreaterThan(0);
    
    const entry = findEntry(result.results, 'Expected Title', '2023');
    expect(entry).toBeDefined();
    expect(entry.URL).toMatch(/^https:\/\/example\.com\//);
    expect(entry.COVER).toMatch(/^https:\/\//);
  }, 30000);  // 30 second timeout
  
  test('url: detail page extracts fields', async () => {
    const result = await runEngine('generic/example.json', 'url', 'https://example.com/item/123');
    
    expect(result.results.TITLE).toBeDefined();
    expect(result.results.DESCRIPTION).toBeDefined();
    expect(result.results.COVER).toMatch(/^https:\/\//);
  }, 30000);
});
```

### Test Validation Rules

**Autocomplete tests:**
- ✅ `results` is an array
- ✅ At least 1 result returned
- ✅ Each result has `TITLE`, `URL`, `COVER`
- ✅ URLs are absolute (start with `http`)
- ✅ Expected item found (fuzzy match on title)
- ✅ SUBTITLE matches expected value (if provided)

**URL tests:**
- ✅ `results` is an object (not array)
- ✅ Required fields for list_type are present
- ✅ TITLE is non-empty string
- ✅ DESCRIPTION is non-empty string (if required)
- ✅ COVER matches URL pattern
- ✅ RATING is a number (if provided)
- ✅ DATE matches year format (if provided)

### Running Tests

```bash
# All tests
bun test

# Specific content type
bun test movies/

# Specific test file
bun test movies/tmdb.autorecipe.test.js

# With verbose output
bun test --verbose

# Watch mode (re-run on changes)
bun test --watch
```

### Common Test Patterns

**Fuzzy title matching:**
```javascript
const entry = results.find(r => 
  r.TITLE?.toLowerCase().includes(expectedTitle.toLowerCase())
);
```

**URL pattern matching:**
```javascript
expect(entry.URL).toMatch(/^https:\/\/example\.com\/item\/\d+$/);
```

**Optional fields:**
```javascript
if (result.results.RATING) {
  expect(typeof result.results.RATING).toBe('number');
  expect(result.results.RATING).toBeGreaterThan(0);
}
```

**Array fields:**
```javascript
expect(Array.isArray(result.results.INGREDIENTS)).toBe(true);
expect(result.results.INGREDIENTS.length).toBeGreaterThan(0);
```

---

## Common Patterns & Solutions

### Pattern 1: Handle Relative URLs

**Problem:** Links extracted as `/item/123` instead of full URL

**Solution:**
```json
[
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
]
```

### Pattern 2: Extract from Meta Tags

**Problem:** `store_text` returns empty on meta tags

**Solution:**
```json
{
  "command": "store_attribute",
  "locator": "meta[property='og:title']",
  "attribute_name": "content",
  "output": { "name": "TITLE", "type": "string", "show": true }
}
```

### Pattern 3: Clean Up Extracted Text

**Problem:** Title includes unwanted suffixes like "| Site Name"

**Solution:**
```json
[
  {
    "command": "store_text",
    "locator": "h1",
    "output": { "name": "RAW_TITLE" }
  },
  {
    "command": "regex",
    "input": "$RAW_TITLE",
    "expression": "^(.+?)\\s*[\\|\\-].*$",
    "output": { "name": "TITLE", "type": "string", "show": true }
  }
]
```

### Pattern 4: Extract from JSON-LD

**Problem:** Best data is in JSON-LD structured data

**Solution:**
```json
[
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
  },
  {
    "command": "json_store_text",
    "input": "$JSON_LD",
    "locator": "description",
    "output": { "name": "DESCRIPTION", "type": "string", "show": true }
  }
]
```

### Pattern 5: Extract Rating as Float

**Problem:** Rating is "8.5/10" but needs to be numeric

**Solution:**
```json
[
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
]
```

### Pattern 6: Fallback Selectors

**Problem:** Different pages have different structures

**Solution:** Use comma selector (careful with store_text!)
```json
{
  "command": "store_attribute",
  "locator": "meta[property='og:description'], meta[name='description']",
  "attribute_name": "content",
  "output": { "name": "DESCRIPTION", "type": "string", "show": true }
}
```

**⚠️ Only safe with store_attribute, NOT store_text!**

### Pattern 7: API-Based Recipes

**Problem:** Site uses API instead of rendered HTML

**Solution:**
```json
[
  {
    "command": "api_request",
    "url": "https://api.example.com/search?q=$INPUT",
    "config": {
      "method": "GET",
      "headers": { "Accept": "application/json" }
    },
    "output": { "name": "API_RESPONSE" }
  },
  {
    "command": "json_store_text",
    "input": "$API_RESPONSE",
    "locator": "results.[$i].title",
    "output": { "name": "TITLE$i" },
    "config": { "loop": { "index": "i", "from": 0, "to": 4, "step": 1 } }
  },
  {
    "command": "json_store_text",
    "input": "$API_RESPONSE",
    "locator": "results.[$i].url",
    "output": { "name": "URL$i" },
    "config": { "loop": { "index": "i", "from": 0, "to": 4, "step": 1 } }
  }
]
```

---

## Troubleshooting

### Issue: nth-child selector skips items

**Symptoms:**
```
Loop 1: ✓ Found
Loop 2: ✗ Not found
Loop 3: ✓ Found
Loop 4: ✗ Not found
```

**Cause:** `nth-child($i)` counts ALL siblings, not just matching class

**Diagnosis:**
```bash
node Engine/scripts/debug-tools/test-selector.js "URL" ".item:nth-child(\$i)" --loop 10
```

**Fix:** Use `nth-of-type` or parent > child:
```json
// Option 1: nth-of-type
{ "locator": ".item:nth-of-type($i)" }

// Option 2: Parent selector
{ "locator": ".container > .item:nth-child($i)" }
```

### Issue: Empty results array

**Symptoms:** Engine runs but returns `{ results: [] }`

**Causes:**
1. Wrong search URL pattern
2. Cookie consent blocking content
3. JavaScript not loaded
4. Selectors don't match

**Diagnosis:**
```bash
# Run with debug
bun Engine/engine.js --recipe path.json --type autocomplete --input "test" --debug

# Inspect page structure
node Engine/scripts/debug-tools/inspect-dom.js "SEARCH_URL" --find-items

# Test loop selectors
node Engine/scripts/debug-tools/test-selector.js "SEARCH_URL" ".result:nth-child(\$i)" --loop 10
```

**Fixes:**
```json
// Fix 1: Enable JavaScript loading
{ "command": "load", "url": "...", "config": { "js": true, "timeout": 10000 } }

// Fix 2: Correct selector
// Use inspect-dom to find correct result container

// Fix 3: API discovery
// Run autoRecipe with --debug to see if API was discovered
```

### Issue: Variables not replaced (e.g., TITLE = "$TEAM$i - $YEAR$i")

**Symptoms:** Output contains literal "$VAR" instead of values

**Cause:** Trying to combine multiple variables (NOT SUPPORTED)

**Fix:** Extract TITLE directly from page:
```json
// ❌ WRONG
{ "command": "store_text", "locator": ".team", "output": {"name": "TEAM$i"} },
{ "command": "store_text", "locator": ".year", "output": {"name": "YEAR$i"} },
{ "command": "store", "input": "$TEAM$i - $YEAR$i", "output": {"name": "TITLE$i"} }

// ✅ RIGHT
{ "command": "store_text", "locator": ".result:nth-child($i) .full-title", "output": {"name": "TITLE$i"} },
{ "command": "store_text", "locator": ".result:nth-child($i) .year", "output": {"name": "SUBTITLE$i"} }
```

### Issue: store_text returns empty on meta tags

**Symptoms:** Meta tag selectors return empty string

**Cause:** Meta tags have no `textContent`, only attributes

**Fix:** Use `store_attribute`:
```json
// ❌ WRONG
{ "command": "store_text", "locator": "meta[property='og:title']", ... }

// ✅ RIGHT
{ "command": "store_attribute", "locator": "meta[property='og:title']", "attribute_name": "content", ... }
```

### Issue: Site blocks headless browser

**Symptoms:** 403 errors, CAPTCHA, or "bot detected"

**Causes:**
1. User-Agent detection
2. Headless browser detection
3. Rate limiting
4. IP blocking

**Fixes:**
```json
// Fix 1: Better User-Agent
{
  "headers": {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  }
}

// Fix 2: Additional headers
{
  "headers": {
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Cache-Control": "no-cache"
  }
}
```

### Issue: Repair loop not converging

**Symptoms:** AutoRecipe keeps trying same fix repeatedly

**Cause:** Fixer not learning from previous attempts

**Solution:**
1. Check conversation history is passed to fixer
2. Manual intervention may be needed
3. Review evidence - site structure may have changed
4. Site may be fundamentally incompatible (API key required, etc.)

### Issue: Test timeout

**Symptoms:** Test fails with "Timeout exceeded"

**Cause:** Page loads slowly or selectors take too long

**Fix:**
```javascript
test('description', async () => {
  // ...
}, 60000);  // Increase timeout to 60 seconds
```

---

## Contributing

### Before You Start

1. **Check existing recipes** - Someone may have already created one
2. **Review this guide** - Understand the system first
3. **Test the target website** - Ensure it's scrapable (no login walls, APIs)

### Contribution Workflow

#### Option A: Automated (Recommended)

```bash
# Generate recipe automatically
bun Engine/scripts/autoRecipe.js --url=https://example.com --debug

# Review generated files
cat {list_type}/{domain}.json
cat {list_type}/{domain}.autorecipe.test.js

# Run tests
bun test {list_type}/{domain}.autorecipe.test.js

# If tests pass, submit PR
git add {list_type}/
git commit -m "Add recipe for example.com"
git push origin add-example-recipe
```

#### Option B: Manual

```bash
# 1. Inspect the target site
node Engine/scripts/debug-tools/inspect-dom.js "https://example.com/search?q=test" --find-items

# 2. Test selectors
node Engine/scripts/debug-tools/test-selector.js "https://example.com" ".result:nth-of-type(\$i) .title" --loop 10

# 3. Create recipe JSON
vim {list_type}/{domain}.json

# 4. Test recipe
bun Engine/engine.js --recipe {list_type}/{domain}.json --type autocomplete --input "test" --debug

# 5. Write tests
vim {list_type}/{domain}.autorecipe.test.js

# 6. Run tests
bun test {list_type}/{domain}.autorecipe.test.js

# 7. Submit PR
```

### Recipe Quality Checklist

- [ ] `recipe_shortcut` is unique and descriptive
- [ ] `list_type` matches folder name and content
- [ ] `engine_version` is set to current (20)
- [ ] `urls` array includes all URL patterns
- [ ] `autocomplete_steps` returns TITLE$i, URL$i, COVER$i
- [ ] `url_steps` has `show: true` on all output fields
- [ ] All URLs are absolute (not relative paths)
- [ ] Selectors use stable patterns (prefer meta tags, data attributes)
- [ ] Tests pass consistently
- [ ] Recipe tested with `--debug` flag

### Code Style

**Recipe JSON:**
- 2-space indentation
- Double quotes for strings
- Descriptive `description` fields on all steps
- Logical grouping of steps

**Test Files:**
- Use Bun test framework
- 30+ second timeouts for network operations
- Fuzzy matching for titles (lowercase, includes)
- Regex validation for URLs and images

### Pull Request Guidelines

**Title format:**
```
Add recipe for [Site Name] ([list_type])
```

**Description should include:**
- Website URL
- Content type (list_type)
- What the recipe extracts (autocomplete, url, or both)
- Any known limitations
- Test results

**Example:**
```markdown
## Add recipe for The Movie Database (movies)

**URL:** https://www.themoviedb.org

**Content Type:** movies

**Features:**
- ✅ Autocomplete (search by title)
- ✅ URL extraction (full movie details)

**Extracts:**
- Title, description, release date, rating, director, cover image, duration

**Tests:** All passing (autocomplete + url)

**Known Limitations:**
- Requires US region (content varies by country)
- Some movies missing duration data
```

---

## Advanced Topics

### Custom Headers & Authentication

Some sites require authentication or special headers:

```json
{
  "headers": {
    "Authorization": "Bearer token123",
    "X-API-Key": "key123",
    "Cookie": "session=abc; user=xyz"
  }
}
```

**⚠️ Security:** Never commit API keys or tokens. Use environment variables:

```json
{
  "headers": {
    "X-API-Key": "$API_KEY"
  }
}
```

### Multi-Language Support

```json
{
  "languages_available": ["en", "es", "fr"],
  "language_default": "en",
  "regions_available": ["US", "UK", "CA"],
  "region_default": "US"
}
```

Access in steps:
```json
{
  "command": "load",
  "url": "https://example.com/$SYSTEM_LANGUAGE/search?q=$INPUT"
}
```

### Rate Limiting & Politeness

Add delays between requests:

```json
{
  "command": "load",
  "url": "...",
  "config": {
    "delay": 1000  // Wait 1 second after loading
  }
}
```

### Complex Extractions

**Nested loops (not recommended, but possible):**
```json
{
  "command": "store_text",
  "locator": ".season:nth-child($s) .episode:nth-child($e) .title",
  "output": { "name": "TITLE_S$s_E$e" },
  "config": {
    "loop": [
      { "index": "s", "from": 1, "to": 3, "step": 1 },
      { "index": "e", "from": 1, "to": 10, "step": 1 }
    ]
  }
}
```

**Conditional extraction (via regex):**
```json
{
  "command": "regex",
  "input": "$OPTIONAL_FIELD",
  "expression": ".+",  // Match anything
  "output": { "name": "FIELD", "show": true },
  "description": "Extract only if present"
}
```

---

## Appendix

### Environment Variables

Create `Engine/.env`:

```env
# System defaults
SYSTEM_LANGUAGE=en
SYSTEM_REGION=US

# Browser configuration
DEFAULT_PAGE_LOAD_TIMEOUT=30000
MIN_PAGE_LOAD_TIMEOUT=1000
DEFAULT_USER_AGENT=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36

# Copilot configuration
COPILOT_MODEL=claude-opus-4.5
COPILOT_TEMPERATURE=0.1
```

### File Naming Conventions

```
Recipe:     {list_type}/{domain}.json
Tests:      {list_type}/{domain}.autorecipe.test.js
            {list_type}/{list_type}.test.js (hand-maintained)
```

**Domain normalization:**
- Lowercase
- Remove `www.` prefix
- Replace `.` with nothing or keep (convention: keep TLD)

Examples:
- `www.TheMovieDB.org` → `themoviedb.json`
- `example.co.uk` → `example.co.uk.json` or `example_co_uk.json`

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 20 | 2024 | Current version |
| 19 | 2023 | Added API support |
| 18 | 2023 | JSON-LD extraction |
| 17 | 2023 | Loop improvements |

### Resources

#### Documentation (Local)
- **This Guide:** `Engine/docs/DEVELOPMENT_GUIDE.md`
- **Quick Summary:** `Engine/docs/SUMMARY.md`
- **AutoRecipe Spec:** `Engine/docs/autorecipe.md`
- **Engine Reference:** `Engine/docs/engine-reference.md`
- **Debug Tools:** `Engine/scripts/debug-tools/README.md`

#### Source Files (Local)
- **Main Script:** `Engine/scripts/autoRecipe.js` (2,657 lines)
- **Engine:** `Engine/engine.js`
- **Prompts:** `Engine/scripts/prompts/*.md` (6 files)
- **Debug Tools:** `Engine/scripts/debug-tools/*.js` (3 files)

#### External Resources
- **RecipeKit Repository:** https://github.com/listy-is/RecipeKit
- **Listy App:** https://listy.is
- **Puppeteer Docs:** https://pptr.dev
- **CSS Selectors:** https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors
- **Copilot SDK:** https://github.com/github/copilot-sdk
- **Bun Runtime:** https://bun.sh

### Glossary

- **Recipe**: JSON configuration file defining extraction steps
- **Engine**: Puppeteer-based executor that runs recipes
- **AutoRecipe**: AI-powered autonomous recipe generator
- **Steps**: Individual commands in a recipe (load, store_text, etc.)
- **Variables**: Named storage for extracted values
- **Locator**: CSS selector targeting DOM elements
- **Loop**: Repeated execution of a step with indexed variables
- **Evidence**: Structured data collected from web probing
- **list_type**: Content category (movies, books, etc.)
- **Copilot**: GitHub's AI assistant (via Copilot SDK)

---

## Quick Reference Cards

### AutoRecipe Command

```bash
bun Engine/scripts/autoRecipe.js --url=<URL> [--force] [--debug]

Options:
  --url      Target website URL (required)
  --force    Overwrite existing recipe
  --debug    Verbose output and browser visibility
```

### Engine Command

```bash
bun Engine/engine.js --recipe <path> --type <type> --input <value> [--debug]

Arguments:
  --recipe   Path to recipe JSON (required)
  --type     autocomplete | url (required)
  --input    Search query or URL (required)
  --debug    Visible browser + verbose logs
```

### Debug Tools Commands

```bash
# Inspect DOM
node Engine/scripts/debug-tools/inspect-dom.js <URL> [--find-items] [--selector <sel>] [--depth <n>]

# Test Selector
node Engine/scripts/debug-tools/test-selector.js <URL> <selector> [--loop <n>] [--attribute <attr>]

# Debug Recipe
node Engine/scripts/debug-tools/debug-recipe.js <recipe> --type <type> --input <value> [--step <n>] [--pause]
```

### Common Step Templates

```json
// Load page
{"command": "load", "url": "$INPUT", "config": {"js": true}}

// Extract text
{"command": "store_text", "locator": "h1", "output": {"name": "TITLE", "show": true}}

// Extract attribute
{"command": "store_attribute", "locator": "meta[property='og:image']", "attribute_name": "content", "output": {"name": "COVER", "show": true}}

// Make URL absolute
{"command": "store", "input": "https://example.com$REL_URL", "output": {"name": "URL"}}

// Clean with regex
{"command": "regex", "input": "$RAW", "expression": "^(.+?)\\s*\\|", "output": {"name": "CLEAN"}}
```

---

**End of Development Guide**

For questions or contributions, please visit: https://github.com/listy-is/RecipeKit
