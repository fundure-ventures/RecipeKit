# RecipeKit File Index

> Complete catalog of all files in the RecipeKit AutoRecipe system

---

## 📁 Documentation Files

### Primary Documentation

| File | Lines | Purpose | Start Here? |
|------|-------|---------|-------------|
| **`DEVELOPMENT_GUIDE.md`** | ~7,500 | Complete development reference | ✅ **YES** |
| **`SUMMARY.md`** | ~700 | Executive summary & quick reference | ✅ For overview |
| **`FILE_INDEX.md`** | ~150 | This file - catalog of all files | Reference |

### Specifications

| File | Lines | Purpose |
|------|-------|---------|
| **`autorecipe.md`** | 340 | AutoRecipe system specification |
| **`engine-reference.md`** | 572 | Recipe authoring & engine API reference |

### Tool Documentation

| File | Lines | Purpose |
|------|-------|---------|
| **`debug-tools/README.md`** | 177 | Guide to using debug utilities |

---

## 🤖 AI Prompt Files

All located in `Engine/scripts/prompts/`

| File | Lines | Purpose | Used By |
|------|-------|---------|---------|
| **`classify.md`** | 55 | Website classification → list_type | AutoRecipe Phase 1 |
| **`author-autocomplete.md`** | 296 | Generate search extraction steps | AutoRecipe Phase 2 |
| **`author-url.md`** | 315 | Generate detail page extraction | AutoRecipe Phase 3 |
| **`fixer.md`** | 128 | Repair broken recipes | Repair loop |
| **`debug-strategy.md`** | 296 | Debugging methodology guide | Manual debugging |
| **`engine-reference.md`** | 572 | Engine API reference (embedded in prompts) | All prompts |

**Total prompt lines:** ~1,700

### Prompt Relationships

```
classify.md
    ↓
author-autocomplete.md + engine-reference.md
    ↓
[Test & Repair with fixer.md]
    ↓
author-url.md + engine-reference.md
    ↓
[Test & Repair with fixer.md]

debug-strategy.md = standalone guide for manual debugging
```

---

## 🔧 Core System Files

### Main Scripts

| File | Lines | Language | Purpose |
|------|-------|----------|---------|
| **`scripts/autoRecipe.js`** | 2,657 | JavaScript | Autonomous recipe generator (MAIN) |
| **`engine.js`** | ~1,000 | JavaScript | Recipe executor (Puppeteer) |

### Configuration

| File | Type | Purpose |
|------|------|---------|
| **`package.json`** | JSON | Dependencies & engine version (20) |
| **`bun.lockb`** | Binary | Dependency lock file |
| **`.env`** | ENV | Environment variables (not in repo) |

---

## 🛠️ Debug Tools

All located in `Engine/scripts/debug-tools/`

| File | Purpose | Primary Command |
|------|---------|----------------|
| **`inspect-dom.js`** | Analyze page structure, find result items | `node inspect-dom.js URL --find-items` |
| **`test-selector.js`** | Test CSS selectors, validate loops | `node test-selector.js URL SELECTOR --loop N` |
| **`debug-recipe.js`** | Step-by-step recipe execution | `node debug-recipe.js RECIPE.json --type TYPE --input VALUE` |
| **`README.md`** | Tool documentation | (read this file) |

**Total debug tools:** 3 scripts + 1 documentation file

---

## 📝 Recipe Files

### Location Pattern

```
{list_type}/{domain}.json           # Recipe definition
{list_type}/{domain}.autorecipe.test.js  # Generated tests
{list_type}/{list_type}.test.js     # Hand-maintained tests (optional)
```

### Content Types (18 total)

Folders at repository root:

```
albums/      anime/       artists/     beers/
boardgames/  books/       food/        generic/
manga/       movies/      podcasts/    recipes/
restaurants/ software/    songs/       tv_shows/
videogames/  wines/
```

### Example Files

```
movies/themoviedb.json               # Recipe
movies/themoviedb.autorecipe.test.js # Auto-generated test
movies/movies.test.js                # Hand-maintained test suite
```

---

## 📊 File Statistics

### By Category

| Category | Files | Total Lines | Avg per File |
|----------|-------|-------------|--------------|
| **Documentation** | 6 | ~9,500 | ~1,583 |
| **Prompts** | 6 | ~1,700 | ~283 |
| **Core Scripts** | 2 | ~3,700 | ~1,850 |
| **Debug Tools** | 3 + README | ~500 | ~125 |
| **Recipes** | ~100+ | Varies | ~200 |
| **Tests** | ~100+ | Varies | ~100 |

### Top 10 Largest Files

1. `DEVELOPMENT_GUIDE.md` (~7,500 lines) - Complete reference
2. `autoRecipe.js` (2,657 lines) - Main orchestrator
3. `engine.js` (~1,000 lines) - Recipe executor
4. `SUMMARY.md` (~700 lines) - Executive summary
5. `engine-reference.md` (572 lines) - Engine API reference
6. `autorecipe.md` (340 lines) - System specification
7. `author-url.md` (315 lines) - Detail page prompt
8. `author-autocomplete.md` (296 lines) - Search prompt
9. `debug-strategy.md` (296 lines) - Debug methodology
10. `debug-tools/README.md` (177 lines) - Tool documentation

---

## 🗂️ Directory Tree

```
RecipeKit/
│
├── Engine/                          # Core engine directory
│   ├── engine.js                   # Recipe executor (~1,000 lines)
│   ├── package.json                # Dependencies (engine_version: 20)
│   ├── bun.lockb                   # Dependency lock
│   ├── node_modules/               # Installed dependencies
│   │
│   ├── scripts/                    # Scripts directory
│   │   ├── autoRecipe.js          # Main generator (2,657 lines)
│   │   │
│   │   ├── prompts/               # AI prompts (6 files)
│   │   │   ├── classify.md        # Classification (55 lines)
│   │   │   ├── author-autocomplete.md  # Search (296 lines)
│   │   │   ├── author-url.md      # Detail (315 lines)
│   │   │   ├── fixer.md           # Repair (128 lines)
│   │   │   ├── debug-strategy.md  # Debug guide (296 lines)
│   │   │   └── engine-reference.md # API ref (572 lines)
│   │   │
│   │   └── debug-tools/           # Debug utilities (3 scripts)
│   │       ├── README.md          # Tool docs (177 lines)
│   │       ├── inspect-dom.js     # DOM analyzer
│   │       ├── test-selector.js   # Selector tester
│   │       └── debug-recipe.js    # Step debugger
│   │
│   ├── docs/                      # Documentation (6 files)
│   │   ├── DEVELOPMENT_GUIDE.md   # Complete guide (~7,500 lines)
│   │   ├── SUMMARY.md             # Quick reference (~700 lines)
│   │   ├── FILE_INDEX.md          # This file (~150 lines)
│   │   ├── autorecipe.md          # Specification (340 lines)
│   │   └── engine-reference.md    # Recipe guide (572 lines)
│   │
│   └── src/                       # Source code (if applicable)
│
├── movies/                        # Movie recipes
│   ├── themoviedb.json
│   ├── themoviedb.autorecipe.test.js
│   ├── imdb.json
│   └── movies.test.js
│
├── books/                         # Book recipes
│   ├── goodreads.json
│   └── books.test.js
│
├── [16 more content type folders]
│
├── LICENSE                        # License file
└── README.md                      # Repository README
```

---

## 🎯 Quick Navigation

### I want to...

**Learn the system:**
→ Start with `docs/SUMMARY.md` then `docs/DEVELOPMENT_GUIDE.md`

**Understand AutoRecipe:**
→ Read `docs/autorecipe.md` then `scripts/autoRecipe.js`

**Write a recipe manually:**
→ Read `docs/engine-reference.md` then use `scripts/debug-tools/`

**Understand AI prompts:**
→ Check `scripts/prompts/` directory, start with `classify.md`

**Debug a recipe:**
→ Use tools in `scripts/debug-tools/`, read their `README.md`

**See examples:**
→ Browse `movies/`, `books/`, etc. folders for real recipes

**Contribute:**
→ Read `docs/DEVELOPMENT_GUIDE.md` → "Contributing" section

---

## 🔍 Search Tips

### By File Extension

```bash
# All documentation
find . -name "*.md" -type f

# All JavaScript
find . -name "*.js" -not -path "*/node_modules/*"

# All recipes
find . -name "*.json" -not -name "package*.json" -not -path "*/node_modules/*"

# All tests
find . -name "*.test.js"
```

### By Content

```bash
# Find prompts
ls Engine/scripts/prompts/*.md

# Find debug tools
ls Engine/scripts/debug-tools/*.js

# Find recipes for a type
ls movies/*.json
```

### By Purpose

```bash
# Documentation
ls Engine/docs/*.md

# Configuration
ls Engine/package.json Engine/.env

# Main scripts
ls Engine/engine.js Engine/scripts/autoRecipe.js
```

---

## 📦 Dependencies

From `Engine/package.json`:

| Package | Version | Purpose |
|---------|---------|---------|
| `@github/copilot-sdk` | ^0.1.16 | AI integration (Claude Opus) |
| `agent-browser` | ^0.5.0 | Alternative browser automation |
| `chalk` | ^5.3.0 | Terminal colors |
| `lodash` | ^4.17.21 | Utility functions |
| `minimist` | ^1.2.8 | CLI argument parsing |
| `puppeteer` | ^23.3.0 | Browser automation |

---

## 🔄 Update Frequency

| File Type | Update Frequency | Last Major Update |
|-----------|------------------|-------------------|
| Core scripts | Stable | v20 |
| Documentation | As needed | 2024 |
| Prompts | Occasionally | v20 |
| Debug tools | Stable | v20 |
| Recipes | Ongoing | Continuously |

---

## 📞 Support

For questions or issues:

1. Check `docs/DEVELOPMENT_GUIDE.md` → "Troubleshooting" section
2. Check `docs/SUMMARY.md` for quick reference
3. Review relevant prompt files in `scripts/prompts/`
4. Use debug tools in `scripts/debug-tools/`
5. Browse example recipes in content type folders

---

**Last Updated:** 2024
**Engine Version:** 20
**Total Files:** ~250+ (including all recipes and tests)
