# autoRecipe — Autonomous Recipe Authoring

Automatically generates RecipeKit recipe files and tests by probing websites with Puppeteer and authoring extraction steps via Copilot agents.

## Usage

```bash
# Mode 1: Direct URL — provide a website to build a recipe for
bun Engine/scripts/autoRecipe.js --url=<URL> [options]

# Mode 2: Discovery — describe what you're looking for and let AI find sources
bun Engine/scripts/autoRecipe.js --prompt=<description> [options]
```

## Options

| Flag | Description |
|------|-------------|
| `--url=<URL>` | Target website URL. Triggers direct recipe generation (Mode 1). |
| `--prompt=<text>` | Natural-language description of the content you want (e.g. `"wine ratings database"`). Triggers discovery mode (Mode 2) which searches the web, ranks candidates, and lets you pick one before proceeding with Mode 1. |
| `--force` | Overwrite existing recipe without prompting. By default, if a recipe already exists you are asked whether to overwrite, create a new file with a numeric suffix, or cancel. |
| `--debug` | Enable verbose logging: full evidence dumps, agent request/response details, and stack traces on error. |

| `--url-only` | Skip autocomplete_steps generation entirely. Uses `--url` directly as the detail page and generates only `url_steps`. The recipe will have an empty `autocomplete_steps: []` array and the test file will only contain the `--type url` test. Useful when you already have a detail page URL and don't need search functionality. |

| `--output-dir=<path>` | Directory to write recipe and test files. Defaults to `generated/` at the repo root. Useful for isolating output (e.g. eval runs). |

Either `--url` or `--prompt` is required; all other flags are optional.

## Examples

```bash
# Generate a recipe from a known URL
bun Engine/scripts/autoRecipe.js --url=https://www.themoviedb.org --debug

# Generate only url_steps for a specific detail page
bun Engine/scripts/autoRecipe.js --url=https://www.imdb.com/title/tt0111161 --url-only

# Discover a source via prompt
bun Engine/scripts/autoRecipe.js --prompt="recipe website with ingredients"

# Force-overwrite an existing generated recipe
bun Engine/scripts/autoRecipe.js --prompt="wine ratings database" --force
```

## Workflow Phases

### Phase 1 — Probe Site
- Launches Puppeteer against the target URL.
- Gathers site metadata: title, meta tags, JSON-LD structured data, links, search form detection.
- All generated recipes use `list_type: "generic"` (classification step removed).

### Phase 2 — Autocomplete Generation
- Discovers the site's search URL pattern (form analysis or common URL patterns).
- Uses `QueryTestAgent` to infer an optimal test query from the site's content.
- `AuthorAgent` generates `autocomplete_steps` (CSS selectors or API-based).
- Validates and repairs via the **repair loop** (up to 5 iterations).
- Detects false positives: if different queries return identical results, falls back to API interception.

### Phase 3 — URL / Detail Page Generation
- Takes a detail page URL from the first working autocomplete result.
- `AuthorAgent` generates `url_steps` to extract item fields (TITLE, COVER, DESCRIPTION, etc.).
- Validates and repairs via the same repair loop.

### Phase 4 — Test File Generation
- Writes an automated Bun test (`{domain}.test.js`) covering both `--type autocomplete` and `--type url`.
- Includes type-specific field assertions.

## Output

All files are written to the `generated/` directory at the repository root:

| File | Purpose |
|------|---------|
| `generated/{domain}.json` | Recipe file with `autocomplete_steps`, `url_steps`, headers, and URLs. |
| `generated/{domain}.test.js` | Bun test file to validate the recipe. |

If a recipe already exists and `--force` is not set, you are prompted:
- **[o] Overwrite** — replace the existing file.
- **[n] New** — create `{domain}_2.json`, `{domain}_3.json`, etc.
- **[c] Cancel** — abort.

## Architecture

### Entry Point

`Engine/scripts/autoRecipe.js` — monolithic script containing all internal classes and the CLI entry point.

### Internal Classes (in autoRecipe.js)

| Class | Role |
|-------|------|
| `AutoRecipe` | Main orchestrator: runs all phases, manages agents and evidence. |
| `SourceDiscovery` | Discovery mode: uses `DiscoveryAgent` to search the web, rank candidates, and present a selection UI. |
| `RecipeBuilder` | Builds the recipe JSON skeleton (`buildSkeleton`), applies patches from the fixer agent. |
| `TestGenerator` | Generates the `.test.js` file with assertions appropriate to the `list_type`. |
| `EngineRunner` | Spawns `Engine/engine.js` as a subprocess to test a recipe with a given type and input. |
| `Logger` | Coloured terminal output with log levels: info, step, success, warn, error, debug. |

### Copilot Agents (`Engine/scripts/agents/`)

| Agent | Model | Role |
|-------|-------|------|
| `AuthorAgent` | Opus | Generates `autocomplete_steps` and `url_steps` from page evidence. |
| `FixerAgent` | Sonnet | Iteratively debugs and repairs broken selectors in the repair loop. |
| `DiscoveryAgent` | Haiku | Searches the web and evaluates candidate websites for discovery mode. |
| `QueryTestAgent` | Haiku | Infers the best test query to use for a given site. |
| `ClassifyAgent` | Haiku | Site classification (currently unused — all recipes default to `generic`). |

All agents extend `BaseAgent` and use the `AgentOrchestrator` for Copilot SDK session management.

### Module Exports (`Engine/scripts/autoRecipe/`)

| Module | Exports | Purpose |
|--------|---------|---------|
| `index.js` | Re-exports all below | Package entry point. |
| `EvidenceCollector.js` | `EvidenceCollector` | Puppeteer-based page probing: site metadata, search results, detail pages, CAPTCHA detection, API interception. |
| `validation.js` | `validateSemanticMatch`, `validateMultiQuery`, `validateResults` | Result quality checks: semantic matching, multi-query false-positive detection, required-field validation. |
| `apiTools.js` | `normalizeApiDescriptor`, `buildApiSteps`, `buildApiStepsFromEvidence` | Converts captured API traffic into `api_request` recipe steps. |
| `searchCapture.js` | `triggerSearchAndCapture` | Simulates user search input in Puppeteer and intercepts JSON API responses (Algolia, Elasticsearch, etc.). |

### EvidenceCollector Key Methods

| Method | Purpose |
|--------|---------|
| `probe(url)` | Initial site analysis: DOM structure, meta tags, JSON-LD, search form detection. |
| `probeSearchResults(url, query)` | Executes a search and captures DOM results or API calls. |
| `probeDetailPage(url)` | Extracts metadata from a single item's detail page. |
| `discoverAutocompleteAPI(page, query)` | Intercepts XHR/fetch during typing to capture autocomplete APIs. |
| `captureApiOnLoad(url, query)` | Intercepts API responses triggered on page load (Algolia-style). |
| `debugRecipeSteps(url, steps, stepType)` | Validates CSS selectors on the live page and suggests alternatives. |
| `detectCaptcha(page)` | Detects DataDome, Cloudflare, hCaptcha, reCAPTCHA, PerimeterX. |
| `solveCaptchaInteractively(url)` | Opens a headed browser for manual CAPTCHA solving, then captures cookies. |
| `dismissCookieBanners(page)` | Auto-dismisses consent banners (OneTrust, Cookiebot, etc.). |

## Repair Loop

When generated steps fail to produce valid results, the repair loop iterates up to **5 times** (`MAX_REPAIR_ITERATIONS`):

1. **Run** — execute the recipe via `EngineRunner`.
2. **Validate** — check for non-empty required fields, unreplaced variables, semantic match.
3. **Debug** — re-probe the page with Puppeteer to gather fresh evidence and CSS alternatives.
4. **Fix** — send the failure context to `FixerAgent` which returns corrected steps.
5. **Retry** — write the patched recipe and loop back to step 1.

For `autocomplete_steps`, validation requires ≥30% of results (minimum 3) to be structurally valid. For `url_steps`, all declared output fields must be non-empty.

## Supported List Types

All generated recipes currently default to `generic`, but the system recognises these categories:

```
albums · anime · artists · beers · boardgames · books · food · generic
manga · movies · podcasts · recipes · restaurants · software · songs
tv_shows · videogames · wines
```

Each type has its own set of required fields (see `getRequiredFields()` in autoRecipe.js) and corresponding test assertions.

## Evals

A lightweight evaluation framework for measuring autoRecipe quality across runs. Lives in `Engine/scripts/evals/`.

### Quick Start

```bash
# List available test cases
bun Engine/scripts/evals/eval.js --list

# Run all eval cases
bun Engine/scripts/evals/eval.js

# Run with a label for later comparison
bun Engine/scripts/evals/eval.js --label="baseline"

# Run specific case or tag
bun Engine/scripts/evals/eval.js --case=imdb-movie-detail
bun Engine/scripts/evals/eval.js --tag=movies

# Compare two runs
bun Engine/scripts/evals/compare.js --list
bun Engine/scripts/evals/compare.js --runs=<run1>,<run2>
```

### Test Case Format

Place JSON files in `Engine/scripts/evals/cases/`. Each file defines one golden test case:

```json
{
  "id": "imdb-movie-detail",
  "description": "IMDB movie detail page extraction",
  "mode": "url-only",
  "url": "https://www.imdb.com/title/tt0111161/",
  "expected_fields": ["TITLE", "COVER", "DESCRIPTION", "RATING"],
  "expected_field_patterns": {
    "TITLE": "Shawshank",
    "COVER": "^https://"
  },
  "tags": ["movies", "detail-page"]
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for the case. |
| `mode` | `"url-only"`, `"url"`, or `"prompt"`. |
| `url` / `prompt` | The input URL or prompt text. |
| `test_url` | Optional detail page URL for engine scoring (defaults to `url`). |
| `expected_fields` | Fields that must exist and be non-empty in url_steps output. |
| `expected_field_patterns` | Optional regex patterns to validate field values (loose match). |
| `tags` | Tags for filtering with `--tag`. |
| `test_query` | For `"url"` mode: query to test autocomplete with. |

### Scoring Rubric

Each case is scored 0–100. Pass threshold: **70**.

| Metric | Weight | Description |
|--------|--------|-------------|
| `fields_present` | 40% | % of `expected_fields` that exist and are non-empty |
| `urls_valid` | 20% | COVER and URL fields start with `https://` |
| `patterns_match` | 20% | % of `expected_field_patterns` that match |
| `no_errors` | 20% | No engine errors or repair loop exhaustion |

### Output

Each run creates a timestamped folder in `Engine/scripts/evals/runs/`:

```
Engine/scripts/evals/runs/{timestamp}_{label}/
├── summary.md          # Human-readable pass/fail, scores, agent turns
├── events.json         # Full trace: autoRecipe output, engine results, scores
├── recipes/            # Generated recipe and test files for this run
└── results/
    └── {case_id}.json  # Per-case detailed result
```

### Comparing Runs

```bash
bun Engine/scripts/evals/compare.js --runs=<baseline>,<new>
```

Outputs a table with per-case score deltas, improvements, and regressions. Also writes a `comparison_vs_{baseline}.md` file in the new run's directory.
