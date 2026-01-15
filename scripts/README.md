# Autonomous Recipe Authoring System

This directory contains the autonomous recipe authoring system for RecipeKit, which can automatically generate scraping recipes from a single URL.

## Overview

The system uses three main components:

1. **agent-browser**: Probes websites to extract structural evidence
2. **Copilot SDK**: AI-powered recipe authoring and repair
3. **autoRecipe.js**: Orchestrates the workflow and validates results

## Usage

```bash
node scripts/autoRecipe.js --url=https://example.com
```

The script will:
1. Classify the website and determine appropriate storage location
2. Generate autocomplete (search) recipe steps
3. Generate URL (detail page) recipe steps
4. Validate recipes by running tests
5. Iteratively repair broken recipes with AI assistance

## Output

Generated files:
- `<folder>/<domain>.json` - The recipe file
- `tests/generated/<folder>/<domain>.autocomplete.test.ts` - Autocomplete tests
- `tests/generated/<folder>/<domain>.url.test.ts` - URL tests

## Architecture

### Phase 0: Repository Structure
- `scripts/autoRecipe.js` - Main orchestrator
- `scripts/prompts/` - AI prompt templates
  - `classify.md` - Website classification
  - `author-autocomplete.md` - Autocomplete recipe generation
  - `author-url.md` - URL recipe generation
  - `fixer.md` - Recipe repair
- `tests/generated/` - Auto-generated tests

### Phase 1: Classification
1. Extract website fingerprint (title, meta, structure)
2. AI classifies topic and suggests folder
3. Validate and canonicalize folder name
4. Apply mapping rules (e.g., "film" → "movies")

### Phase 2: Autocomplete Recipe
1. Probe search functionality
2. AI generates autocomplete_steps
3. Generate test file
4. Run tests and validate
5. If fails: collect more evidence, repair, repeat

### Phase 3: URL Recipe
1. Get detail URL from autocomplete results
2. Probe detail page structure
3. AI generates url_steps
4. Generate test file
5. Run tests and validate
6. If fails: collect more evidence, repair, repeat

### Phase 4: Validation
- Run RecipeKit engine with generated recipe
- Classify failure types:
  - `SELECTOR_MISSING` - CSS selector doesn't match
  - `JS_RENDERED` - Content requires JavaScript
  - `WRONG_URL_PATTERN` - URL structure mismatch
  - `SEARCH_FLOW_INCOMPLETE` - Missing interaction steps
  - `BOT_WALL` - Blocked by bot detection
- Stop conditions:
  - Success: All tests pass
  - Failure: Max iterations or bot wall detected

## Folder Canonicalization

The system applies these mappings:
- film, cinema → movies
- novel, reading, literature → books
- cooking, food, cuisine → recipes
- shop, store, ecommerce → products
- tv, television, series → tv_shows
- music, album → albums
- game, gaming → videogames

Folder names must:
- Be lowercase
- Use only [a-z0-9-]
- Be maximum 32 characters
- Not start/end with hyphens

## Integration Points

### agent-browser Commands
The system uses these commands for web probing:
- `agent-browser open <url>`
- `agent-browser snapshot --json`
- `agent-browser get text <selector>`
- `agent-browser get attr <selector> <attr>`
- `agent-browser click <selector>`
- `agent-browser fill <selector> <text>`

### Copilot SDK
The system uses:
- `CopilotClient()` - Initialize client
- `client.createSession()` - Create reasoning session
- `session.send()` - Send prompts
- `session.on()` - Listen for events

### RecipeKit Engine
Validates recipes using:
```bash
bun run ./Engine/engine.js --recipe <path> --type <type> --input <input>
```

## Configuration

Edit `CONFIG` in `autoRecipe.js` to adjust:
- `MAX_REPAIR_ITERATIONS` - Maximum repair attempts (default: 5)
- `BROWSER_TIMEOUT` - Browser operation timeout (default: 10s)
- `ENGINE_TIMEOUT` - Engine test timeout (default: 30s)
- `FOLDER_MAPPINGS` - Topic to folder mappings

## Development Status

Current implementation status:

✅ **Complete:**
- Directory structure
- Prompt templates
- Orchestrator framework
- Validation logic
- Test generation
- Folder canonicalization

🚧 **Placeholder (needs integration):**
- agent-browser web probing
- Copilot SDK session management
- Copilot AI response parsing
- Interactive repair loop

## Next Steps

To complete the implementation:

1. **Install Copilot SDK**:
   ```bash
   npm install @github/copilot-sdk
   ```

2. **Integrate Copilot**:
   - Update `CopilotSession` class with real SDK calls
   - Parse JSON responses from AI
   - Handle streaming events

3. **Integrate agent-browser**:
   - Add web probing with browser automation
   - Extract DOM structure and metadata
   - Capture interactive evidence

4. **Test end-to-end**:
   ```bash
   node scripts/autoRecipe.js --url=https://www.imdb.com
   ```

## Troubleshooting

### "Copilot SDK not yet integrated"
The system is running in mock mode. Install and configure Copilot SDK.

### "Web probing not fully implemented"
The system is using basic fingerprints. Integrate agent-browser for full probing.

### Recipe tests failing
Check:
1. Website structure hasn't changed
2. Selectors are correct
3. JavaScript rendering is enabled if needed
4. Bot detection isn't blocking requests

## Contributing

To add features:
1. Add new prompt templates in `scripts/prompts/`
2. Extend `RecipeManager` for new recipe types
3. Add failure classifiers in `RecipeValidator`
4. Update folder mappings in `CONFIG`

## License

Same as RecipeKit parent repository.
