# Example: Autonomous Recipe Creation

This document shows an example workflow of the autonomous recipe authoring system.

## Example Command

```bash
node scripts/autoRecipe.js --url=https://www.themoviedb.org
```

## Expected Workflow

### Phase 1: Classification

1. **Extract Fingerprint**
```json
{
  "url": "https://www.themoviedb.org",
  "domain": "themoviedb.org",
  "title": "The Movie Database (TMDB)",
  "metaDescription": "The Movie Database (TMDB) is a popular, user editable database for movies and TV shows.",
  "heading": "Welcome to TMDB",
  "timestamp": "2024-01-15T22:00:00.000Z"
}
```

2. **AI Classification** (via Copilot)
```json
{
  "topic": "movies",
  "folder": "movies",
  "confidence": 0.98,
  "rationale": "Website clearly focused on movies with titles, ratings, and database structure"
}
```

3. **Folder Canonicalization**
- Input: `movies`
- Validation: ✓ Valid (lowercase, alphanumeric, < 32 chars)
- Output: `movies/themoviedb.json`

### Phase 2: Autocomplete Recipe

1. **Web Probing**
```json
{
  "hasSearch": true,
  "searchUrl": "https://www.themoviedb.org/search?query=",
  "resultSelectors": [
    ".card.style_1",
    ".result .title",
    ".result .release_date"
  ]
}
```

2. **AI Recipe Generation** (via Copilot)
```json
{
  "recipe": {
    "title": "themoviedb movies",
    "description": "Autocomplete recipe for themoviedb",
    "engine_version": "1",
    "url_available": ["https://www.themoviedb.org/*"],
    "autocomplete_steps": [
      {
        "command": "load",
        "url": "https://www.themoviedb.org/search?query=$INPUT",
        "description": "Load search results",
        "config": {
          "js": true,
          "timeout": 200
        }
      },
      {
        "command": "store_attribute",
        "locator": ".card.style_1:eq($i) a",
        "attribute_name": "href",
        "config": {
          "loop": {
            "index": "i",
            "from": 0,
            "to": 9,
            "step": 1
          }
        },
        "output": {
          "name": "URL$i"
        },
        "description": "Extract result URLs"
      },
      {
        "command": "store_text",
        "locator": ".card.style_1:eq($i) .title",
        "config": {
          "loop": {
            "index": "i",
            "from": 0,
            "to": 9,
            "step": 1
          }
        },
        "output": {
          "name": "TITLE$i"
        },
        "description": "Extract titles"
      }
    ]
  },
  "testPlan": {
    "queries": ["The Matrix", "Inception"]
  }
}
```

3. **Test Generation**
```typescript
// tests/generated/movies/themoviedb.autocomplete.test.ts
import { expect, test, describe } from "bun:test";
import { runEngine, findEntry, loadEnvVariables } from '../../../Engine/utils/test_utils.js';

await loadEnvVariables();
const TIMEOUT = parseInt(process.env.TEST_TIMEOUT || 30000);

const RECIPE = "themoviedb.json";
const INPUT = {
  AUTOCOMPLETE: "The Matrix"
};

describe(RECIPE, () => {
  test("--type autocomplete", async() => {
    const results = await runEngine("movies/${RECIPE}", "autocomplete", INPUT.AUTOCOMPLETE);
    
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    
    const entry = results[0];
    expect(entry.TITLE).toBeDefined();
    expect(entry.URL).toBeDefined();
  }, TIMEOUT);
});
```

4. **Validation & Repair Loop**

Iteration 1:
```bash
$ bun run Engine/engine.js --recipe movies/themoviedb.json --type autocomplete --input "The Matrix"
✗ Error: Selector not found: .card.style_1
```

Classification: `SELECTOR_MISSING`

AI Fix (via Copilot with new evidence):
```json
{
  "autocomplete_steps": [
    {
      "command": "load",
      "url": "https://www.themoviedb.org/search?query=$INPUT",
      "config": { "js": true, "timeout": 500 }
    },
    {
      "command": "store_attribute",
      "locator": ".search_results .card:eq($i) a",
      "attribute_name": "href",
      "config": { "loop": { "index": "i", "from": 0, "to": 9, "step": 1 } },
      "output": { "name": "URL$i" }
    }
  ]
}
```

Iteration 2:
```bash
$ bun run Engine/engine.js --recipe movies/themoviedb.json --type autocomplete --input "The Matrix"
✓ Success: 10 results returned
```

Validation: ✓ All results have TITLE and URL

### Phase 3: URL Recipe

1. **Get Detail URL**
From autocomplete results: `https://www.themoviedb.org/movie/603-the-matrix`

2. **Probe Detail Page**
```json
{
  "title": "The Matrix",
  "metadata": {
    "og:title": "The Matrix (1999)",
    "og:description": "Set in the 22nd century...",
    "og:image": "https://image.tmdb.org/t/p/w500/..."
  },
  "canonicalUrl": "https://www.themoviedb.org/movie/603-the-matrix"
}
```

3. **AI URL Recipe Generation**
```json
{
  "url_steps": [
    {
      "command": "load",
      "url": "$INPUT",
      "description": "Load detail page",
      "config": { "js": true, "timeout": 200 }
    },
    {
      "command": "store_url",
      "output": { "name": "URL" }
    },
    {
      "command": "store_attribute",
      "locator": "meta[property='og:title']",
      "attribute_name": "content",
      "output": { "name": "TITLE", "type": "string", "show": true }
    },
    {
      "command": "regex",
      "input": "$TITLE",
      "expression": "\\((\\d{4})\\)",
      "output": { "name": "DATE", "type": "date", "format": "YYYY", "show": true }
    },
    {
      "command": "store_attribute",
      "locator": "meta[property='og:description']",
      "attribute_name": "content",
      "output": { "name": "DESCRIPTION", "type": "string", "show": true }
    },
    {
      "command": "store_attribute",
      "locator": "meta[property='og:image']",
      "attribute_name": "content",
      "output": { "name": "COVER", "type": "string", "show": true }
    }
  ]
}
```

4. **Test & Validation**
```bash
$ bun run Engine/engine.js --recipe movies/themoviedb.json --type url --input "https://www.themoviedb.org/movie/603-the-matrix"
✓ Success: {
  "TITLE": "The Matrix",
  "DATE": "1999",
  "DESCRIPTION": "Set in the 22nd century...",
  "COVER": "https://image.tmdb.org/t/p/w500/...",
  "URL": "https://www.themoviedb.org/movie/603-the-matrix"
}
```

Validation: ✓ All required fields present

### Final Output

**Recipe File**: `movies/themoviedb.json`
```json
{
  "title": "themoviedb movies",
  "description": "Autocomplete recipe for themoviedb",
  "engine_version": "1",
  "url_available": ["https://www.themoviedb.org/*"],
  "autocomplete_steps": [...],
  "url_steps": [...]
}
```

**Test Files**:
- `tests/generated/movies/themoviedb.autocomplete.test.ts`
- `tests/generated/movies/themoviedb.url.test.ts`

**Console Output**:
```
[AutoRecipe] Starting autonomous recipe authoring for: https://www.themoviedb.org
[AutoRecipe] === Phase 1: Classification ===
[AutoRecipe] ✓ Classification complete: topic=movies, folder=movies
[AutoRecipe] === Phase 2: Autocomplete Recipe ===
[AutoRecipe] Testing autocomplete recipe (iteration 1/5)...
[AutoRecipe] Testing autocomplete recipe (iteration 2/5)...
[AutoRecipe] ✓ Autocomplete recipe complete
[AutoRecipe] === Phase 3: URL Recipe ===
[AutoRecipe] ✓ URL recipe complete
[AutoRecipe] ✓ Recipe authoring completed successfully!
[AutoRecipe] Recipe saved to: /path/to/RecipeKit/movies/themoviedb.json
```

## Success Criteria

For the recipe to be considered successful:

### Autocomplete
- ✓ Returns array of results
- ✓ Each result has `TITLE` field
- ✓ Each result has `URL` field
- ✓ At least 3 results returned
- ✓ URLs match expected pattern

### URL
- ✓ Returns object (not array)
- ✓ Has `TITLE` field
- ✓ Has `URL` field
- ✓ Has at least one additional field (DESCRIPTION, COVER, DATE, etc.)
- ✓ All fields are non-empty

## Failure Scenarios

### 1. Bot Wall Detected
```
[AutoRecipe ERROR] Recipe authoring failed: Bot detection encountered
```
**Action**: Manual intervention required. Website blocks automated access.

### 2. Max Iterations Exceeded
```
[AutoRecipe ERROR] Max repair iterations reached for autocomplete recipe
```
**Action**: Review failure logs. Website structure may be too complex.

### 3. Invalid Classification
```
[AutoRecipe ERROR] Failed to get valid folder name after 3 attempts
```
**Action**: AI unable to classify website. Check fingerprint data.

### 4. Search Flow Incomplete
```
[AutoRecipe WARN] Validation failed: No results returned
```
**Action**: Website may require additional interaction (login, consent, etc.)

## Tips for Best Results

1. **Use well-structured websites**: Sites with semantic HTML and meta tags work best
2. **Check for bot detection**: Some sites block automated access
3. **Start with popular domains**: TMDB, IMDb, etc. have stable structures
4. **Review generated recipes**: AI suggestions should be validated
5. **Iterate**: The repair loop improves recipes automatically

## Extending the System

### Add New Folder Mappings
Edit `CONFIG.FOLDER_MAPPINGS` in `autoRecipe.js`:
```javascript
FOLDER_MAPPINGS: {
  'podcast': 'podcasts',
  'wine': 'wines',
  // Add more...
}
```

### Add New Failure Types
Edit `RecipeValidator.classifyFailure()`:
```javascript
if (msg.includes('consent') || msg.includes('cookie')) {
  return 'CONSENT_REQUIRED';
}
```

### Customize Prompts
Edit prompt templates in `scripts/prompts/`:
- Add domain-specific hints
- Adjust response formats
- Include more examples
