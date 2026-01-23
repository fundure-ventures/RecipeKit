# Recipe Debugging Tools

Pre-made tools for debugging and fixing RecipeKit recipes. Use these tools to understand page structure, test selectors, and step through recipe execution.

## Quick Reference

```bash
# From Engine directory:
cd /path/to/listy-recipekit/Engine

# 1. Discover result items on a search page
node scripts/debug-tools/inspect-dom.js "https://example.com/search?q=test" --find-items

# 2. Test a specific selector
node scripts/debug-tools/test-selector.js "https://example.com/search?q=test" ".result-item .title"

# 3. Test a loop selector
node scripts/debug-tools/test-selector.js "https://example.com/search?q=test" ".item:nth-of-type(\$i) .name" --loop 5

# 4. Debug a recipe step-by-step
node scripts/debug-tools/debug-recipe.js generic/example.json --type autocomplete --input "test"
```

---

## Tool 1: inspect-dom.js

Analyzes page structure to help build correct selectors.

### Find Repeating Items (Most Useful)
```bash
node scripts/debug-tools/inspect-dom.js "https://site.com/search?q=test" --find-items
```

Output shows likely result item patterns with their counts, features, and parent containers.

### Analyze a Specific Selector
```bash
node scripts/debug-tools/inspect-dom.js "https://site.com" --selector ".product-card"
```

Shows detailed info about each matching element: parent, children, links, images.

### View Page Structure Tree
```bash
node scripts/debug-tools/inspect-dom.js "https://site.com" --depth 4
```

Shows hierarchical view of main content area.

---

## Tool 2: test-selector.js

Tests CSS selectors against a live page. Essential for validating loop selectors.

### Test Simple Selector
```bash
node scripts/debug-tools/test-selector.js "https://site.com" ".product .title"
```

### Test Loop Selector
```bash
# Test nth-of-type pattern (recommended for class-based selectors)
node scripts/debug-tools/test-selector.js "https://site.com" ".product:nth-of-type(\$i) .name" --loop 5

# Test nth-child pattern (only works when items are consecutive siblings)
node scripts/debug-tools/test-selector.js "https://site.com" ".grid > *:nth-child(\$i) .name" --loop 5
```

### Extract Attributes
```bash
node scripts/debug-tools/test-selector.js "https://site.com" ".product a" --attribute href
node scripts/debug-tools/test-selector.js "https://site.com" ".product img" --attribute src
```

---

## Tool 3: debug-recipe.js

Step-by-step recipe execution with detailed output.

### Basic Usage
```bash
node scripts/debug-tools/debug-recipe.js generic/example.json --type autocomplete --input "test"
node scripts/debug-tools/debug-recipe.js generic/example.json --type url --input "https://example.com/item/123"
```

### Debug Specific Step
```bash
# Run only step 1 (store_text)
node scripts/debug-tools/debug-recipe.js generic/example.json --type autocomplete --input "test" --step 1
```

### Interactive Mode with Screenshots
```bash
node scripts/debug-tools/debug-recipe.js generic/example.json --type autocomplete --input "test" --pause --screenshot
```

---

## Common Issues and Fixes

### Issue: nth-child selector only matches some items

**Problem**: `.kit-container:nth-child($i)` skips items because `nth-child` counts ALL siblings, not just matching ones.

**Diagnosis**:
```bash
node scripts/debug-tools/test-selector.js "https://site.com" ".kit-container:nth-child(\$i)" --loop 10
# Shows: [1] not found, [2] match, [3] not found...
```

**Fix**: Use `nth-of-type` or find the parent container:
```bash
# Option 1: nth-of-type (counts by tag name)
node scripts/debug-tools/test-selector.js "https://site.com" ".kit-container:nth-of-type(\$i)" --loop 5

# Option 2: Use parent > child pattern
node scripts/debug-tools/test-selector.js "https://site.com" ".grid > .kit-container:nth-of-type(\$i)" --loop 5
```

### Issue: Selector finds container instead of items

**Problem**: Selected `.result-container` which has 1 element, but actual items are children inside it.

**Diagnosis**:
```bash
node scripts/debug-tools/inspect-dom.js "https://site.com/search?q=test" --find-items
# Shows: .kit (30 items) vs .kit-container (1 item)
```

**Fix**: Use the child class, not the container:
```bash
# Wrong: .kit-container:nth-of-type($i)
# Right: .kit-container .kit:nth-of-type($i)
```

### Issue: Elements not found after page load

**Problem**: JavaScript renders content after initial load.

**Diagnosis**:
```bash
node scripts/debug-tools/test-selector.js "https://site.com" ".result" --wait 3000
```

**Fix**: Increase timeout in recipe:
```json
{
  "command": "load",
  "url": "...",
  "config": { "timeout": 10000, "waitUntil": "networkidle0" }
}
```

---

## Selector Patterns Cheat Sheet

| Pattern | Use When | Example |
|---------|----------|---------|
| `.class:nth-of-type($i)` | Items are same tag type | `.product:nth-of-type($i)` |
| `.parent > *:nth-child($i)` | Items are direct children | `.grid > *:nth-child($i)` |
| `.parent .class:nth-of-type($i)` | Items nested in container | `.results .item:nth-of-type($i)` |
| `.class:nth-child($i)` | Items are consecutive siblings | Only use if verified |

---

## JSON Output

All tools support `--output json` for programmatic use:

```bash
node scripts/debug-tools/inspect-dom.js "https://site.com" --find-items --output json
node scripts/debug-tools/test-selector.js "https://site.com" ".item" --output json
```
