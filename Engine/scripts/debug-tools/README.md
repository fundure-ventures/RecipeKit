# Recipe Debugging Tools

CLI tools for debugging and fixing RecipeKit recipes. Use these to understand page structure, test selectors, and diagnose extraction issues.

**No hardcoded selectors** - all tools work dynamically by analyzing actual page content.

## Quick Reference

```bash
# From Engine directory:
cd /path/to/listy-recipekit/Engine

# 1. Find the loop container automatically (best starting point)
node scripts/debug-tools/find-loop-container.js "https://example.com/search?q=test"

# 2. Analyze children of a container
node scripts/debug-tools/analyze-children.js "https://example.com/search?q=test" ".product-grid"

# 3. Validate a loop selector pattern
node scripts/debug-tools/validate-loop.js "https://example.com/search?q=test" ".grid > div:nth-child(\$i)"

# 4. Test a specific selector
node scripts/debug-tools/test-selector.js "https://example.com/search?q=test" ".result-item .title"

# 5. Debug a recipe step-by-step
node scripts/debug-tools/debug-recipe.js generic/example.json --type autocomplete --input "test"
```

---

## Tool 1: find-loop-container.js ⭐ (Start Here)

Automatically discovers the container element for result items by analyzing link patterns. Works on any site without hardcoded selectors.

### Basic Usage
```bash
node scripts/debug-tools/find-loop-container.js "https://site.com/search?q=test"
```

### With Known Result Links
```bash
node scripts/debug-tools/find-loop-container.js "https://site.com/search?q=test" --links "/product/123,/product/456"
```

### Output Includes
- Container selector and path
- Item pattern (tag + class)
- Whether items are consecutive
- Recommended loop selector (`nth-child` vs `nth-of-type`)
- Field selectors (TITLE, URL, COVER)
- Sample HTML

---

## Tool 2: analyze-children.js

Inspects direct children of a container element. Shows what's at each index to understand why `nth-child` might skip items.

### Usage
```bash
node scripts/debug-tools/analyze-children.js "https://site.com/search?q=test" ".results-grid"
node scripts/debug-tools/analyze-children.js "https://site.com" "#product-list" --max 30
```

### What It Shows
- Each child's tag, class, and index
- Which children have links/images (likely results)
- Whether result items are at consecutive indices
- Gaps between result items
- Recommendation for loop selector

---

## Tool 3: validate-loop.js

Tests if a loop selector pattern actually works by trying each index.

### Usage
```bash
# Test basic pattern
node scripts/debug-tools/validate-loop.js "https://site.com/search?q=test" ".grid > div:nth-child(\$i)"

# Test with field extraction
node scripts/debug-tools/validate-loop.js "https://site.com" ".item:nth-of-type(\$i)" --field "a" --attr "href"

# Test more indices
node scripts/debug-tools/validate-loop.js "https://site.com" ".product:nth-of-type(\$i)" --count 20
```

### What It Detects
- Which indices match vs fail
- Failure patterns (first-index-fails, alternating, odd/even)
- Content presence at each index
- Specific fix recommendations

---

## Tool 4: test-selector.js

Tests CSS selectors against a live page.

### Test Simple Selector
```bash
node scripts/debug-tools/test-selector.js "https://site.com" ".product .title"
```

### Test Loop Selector (Legacy)
```bash
node scripts/debug-tools/test-selector.js "https://site.com" ".product:nth-of-type(\$i) .name" --loop 5
```

### Extract Attributes
```bash
node scripts/debug-tools/test-selector.js "https://site.com" ".product a" --attribute href
node scripts/debug-tools/test-selector.js "https://site.com" ".product img" --attribute src
```

---

## Tool 5: inspect-dom.js

Analyzes page structure to discover potential result items.

### Find Repeating Items
```bash
node scripts/debug-tools/inspect-dom.js "https://site.com/search?q=test" --find-items
```

### Analyze a Specific Selector
```bash
node scripts/debug-tools/inspect-dom.js "https://site.com" --selector ".product-card"
```

### View Page Structure Tree
```bash
node scripts/debug-tools/inspect-dom.js "https://site.com" --depth 4
```

---

## Tool 6: debug-recipe.js

Step-by-step recipe execution with detailed output.

### Basic Usage
```bash
node scripts/debug-tools/debug-recipe.js generic/example.json --type autocomplete --input "test"
node scripts/debug-tools/debug-recipe.js generic/example.json --type url --input "https://example.com/item/123"
```

---

## Debugging Workflow

### When Recipe Gets 0 Results
```bash
# 1. Find what container the site actually uses
node scripts/debug-tools/find-loop-container.js "https://site.com/search?q=test"

# 2. If container found, validate the recommended selector
node scripts/debug-tools/validate-loop.js "https://site.com/search?q=test" "<recommended-selector>"
```

### When Recipe Gets Some But Not All Results
```bash
# 1. Analyze the container's children
node scripts/debug-tools/analyze-children.js "https://site.com/search?q=test" "<container-selector>"

# 2. Check which indices fail
node scripts/debug-tools/validate-loop.js "https://site.com/search?q=test" "<loop-selector>" --count 15
```

### When Selector Works But Fields Are Empty
```bash
# Test field extraction specifically
node scripts/debug-tools/validate-loop.js "https://site.com/search" ".item:nth-of-type(\$i)" --field "h3" --attr "textContent"
node scripts/debug-tools/validate-loop.js "https://site.com/search" ".item:nth-of-type(\$i)" --field "a" --attr "href"
node scripts/debug-tools/validate-loop.js "https://site.com/search" ".item:nth-of-type(\$i)" --field "img" --attr "src"
```

---

## Selector Patterns Cheat Sheet

| Pattern | Use When | Example |
|---------|----------|---------|
| `.parent > .child:nth-child($i)` | Items are consecutive direct children | `.grid > .item:nth-child($i)` |
| `.parent > .child:nth-of-type($i)` | Items share tag, but not consecutive | `.grid > div:nth-of-type($i)` |
| `.parent .child:nth-of-type($i)` | Items nested deeper in container | `.results .card:nth-of-type($i)` |

### nth-child vs nth-of-type

- **nth-child($i)**: Counts ALL siblings. Index 1 = first child regardless of class.
- **nth-of-type($i)**: Counts siblings of SAME TAG. Index 1 = first `<div>` (ignoring `<span>`, etc.)

⚠️ Neither counts by class! `.product:nth-of-type(1)` gets the first `<div>` that HAS `.product` class, not "the 1st .product among .products".

---

## JSON Output

All tools support `--output json` for programmatic use:

```bash
node scripts/debug-tools/find-loop-container.js "https://site.com" --output json
node scripts/debug-tools/analyze-children.js "https://site.com" ".grid" --output json
node scripts/debug-tools/validate-loop.js "https://site.com" ".item:nth-of-type(\$i)" --output json
```
