# Loop Selector Strategy Guide

## The nth-child Challenge

When creating autocomplete recipes that extract multiple search results, the most critical challenge is ensuring your selectors work with `:nth-child($i)` in a loop. This guide teaches you how to identify and fix selector issues.

## How Loops Work in RecipeKit

The engine replaces `$i` with numbers during execution:
```
.item:nth-child($i)  →  .item:nth-child(1)
                     →  .item:nth-child(2)
                     →  .item:nth-child(3)
                     ...
```

**CRITICAL REQUIREMENT:** Items MUST be consecutive siblings for `:nth-child()` to work.

## The Problem: Non-Consecutive Siblings

### Example: Funko.com

**Initial attempt (FAILS):**
```json
{
  "locator": ".product-tile:nth-child($i) .pdp-link a",
  "config": { "loop": { "index": "i", "from": 1, "to": 10 } }
}
```

**Why it fails:**
```html
<div class="row product-grid">
  <div class="col-6">
    <div class="product">
      <div class="product-tile">Item 1</div>
    </div>
  </div>
  <div class="col-6">
    <div class="product">
      <div class="product-tile">Item 2</div>
    </div>
  </div>
</div>
```

- `.product-tile:nth-child(1)` finds Item 1 ✓
- `.product-tile:nth-child(2)` finds NOTHING ✗

Why? Because `.product-tile` is NOT the 2nd child of its parent - it's nested inside `.product` inside `.col-6`.

**Result:** Only 1 item extracted (the first one), remaining 9 are empty.

## The Solution: Find the Consecutive Parent

### Step 1: Identify the Structure

Use `inspect-dom.js` to find what containers hold the results:

```bash
node Engine/scripts/debug-tools/inspect-dom.js "URL" --find-items
```

**Output for Funko:**
```
3. .col-6 (26 items)
   Features: 📷 images, 🔗 links, 📝 titles
   Parent: UL.row
   Children: SCRIPT., SCRIPT., SCRIPT., DIV.product
```

Key insight: `.col-6` containers (26 items) ARE consecutive siblings!

### Step 2: Test the Parent Selector

```bash
node Engine/scripts/debug-tools/test-selector.js "URL" ".col-6:nth-child(\$i) .title" --loop 5
```

### Step 3: Use Parent Container in Recipe

**Fixed selector (WORKS):**
```json
{
  "locator": ".col-6:nth-child($i) .pdp-link a",
  "config": { "loop": { "index": "i", "from": 1, "to": 10 } }
}
```

Now:
- `.col-6:nth-child(1) .pdp-link a` finds Item 1 ✓
- `.col-6:nth-child(2) .pdp-link a` finds Item 2 ✓
- `.col-6:nth-child(3) .pdp-link a` finds Item 3 ✓
- ...continues for all 10 items ✓

**Result:** All 10 items extracted successfully!

## Strategy: The Parent Container Method

### 1. Understand the Nesting

Items are rarely direct consecutive siblings. They're usually wrapped:

```
Common patterns:
- <ul> → <li> → <div class="item">
- <div class="grid"> → <div class="col"> → <div class="product">
- <div class="results"> → <article> → content
```

### 2. Find the Consecutive Level

**Bad approach:**
```css
.item:nth-child($i)           /* Items not consecutive */
.product-tile:nth-child($i)   /* Tiles not consecutive */
```

**Good approach:**
```css
.col:nth-child($i) .item      /* Columns ARE consecutive */
li:nth-child($i) .product     /* List items ARE consecutive */
article:nth-child($i) h2      /* Articles ARE consecutive */
```

### 3. Verification Steps

**Before writing the recipe:**

1. Run `inspect-dom.js` and look for containers that match the result count
2. Identify which container has consecutive siblings
3. Test with `test-selector.js --loop 5` to verify all 5 items match
4. Only then write the recipe

**After generating the recipe:**

1. Run the engine: `bun Engine/engine.js --recipe X.json --type autocomplete --input "test"`
2. Check: `results.length` vs non-empty results
3. If `length=10` but only 1 has data → selector targets non-consecutive items
4. Fix by moving `:nth-child($i)` up to the consecutive parent level

## Real-World Examples

### Example 1: Funko.com (Grid Layout)

**DOM Structure:**
```html
<div class="row product-grid">
  <div class="col-6">           ← THESE are consecutive
    <div class="product">
      <div class="product-tile"> ← THESE are not
```

**Solution:**
```json
{
  "locator": ".col-6:nth-child($i) .product-tile .title"
}
```

### Example 2: TMDB (Search Results)

**DOM Structure:**
```html
<div class="search_results">
  <div class="card">           ← THESE are consecutive
    <div class="image">
    <div class="title">
```

**Solution:**
```json
{
  "locator": ".search_results > div:nth-child($i) .title"
}
```

### Example 3: List-Based Results

**DOM Structure:**
```html
<ul class="results">
  <li>                         ← THESE are consecutive
    <a href="/item1">
    <img src="...">
```

**Solution:**
```json
{
  "locator": "ul.results > li:nth-child($i) a"
}
```

## Common Mistakes

### Mistake 1: Using `:nth-of-type()` Incorrectly

`:nth-of-type()` counts by TAG NAME, not class:

```html
<div class="container">
  <div class="ad">Ad</div>
  <div class="item">Item 1</div>
  <div class="item">Item 2</div>
</div>
```

```css
.item:nth-of-type(1)  /* Matches .ad (first div), NOT Item 1 */
.item:nth-of-type(2)  /* Matches Item 1 (second div) */
```

**Solution:** Use `:nth-child()` on a parent where children ARE the items you want.

### Mistake 2: Too Specific Selector

```json
// BAD - assumes exact nesting structure
".product-grid .row .col-6 .product .product-tile:nth-child($i)"

// GOOD - finds consecutive level and drills down
".col-6:nth-child($i) .product-tile"
```

### Mistake 3: Not Testing Loops

```json
// Wrote selector without testing
".item:nth-child($i)"  // Might only match 1 item!

// ALWAYS test first:
// node Engine/scripts/debug-tools/test-selector.js URL ".item:nth-child(\$i)" --loop 5
// Expected: 5/5 matches
```

## Debugging Checklist

When a recipe only extracts 1 result:

- [ ] Run `inspect-dom.js --find-items` on the search page
- [ ] Identify which container has the correct item count
- [ ] Check if items are direct consecutive siblings
- [ ] If not, move up to parent: `.col-6`, `li`, `article`, etc.
- [ ] Test with `test-selector.js --loop 5` to verify 5/5 matches
- [ ] Update recipe to use parent container selector
- [ ] Re-test with engine to confirm all results extracted

## Quick Reference

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| Only 1st result has data | Items not consecutive | Move `:nth-child($i)` to parent |
| 0/5 loop test matches | Selector wrong | Check `inspect-dom.js` output |
| 1/5 loop test matches | Items not siblings | Find consecutive parent container |
| 2/5 or 3/5 matches | Some items skipped | Use `li` or proper container selector |

## Advanced: When Parent Containers Don't Work

If items truly cannot be targeted with `:nth-child()` (very rare), consider:

1. **Alternative selectors:** Some sites use `data-index` attributes
   ```json
   { "locator": "[data-result-index='$i'] .title" }
   ```

2. **Different list_type:** The site might be better suited for `url_steps` only (no autocomplete)

3. **Engine enhancement needed:** File an issue describing the DOM structure

## Tools Reference

```bash
# 1. Understand page structure
node Engine/scripts/debug-tools/inspect-dom.js "URL" --find-items

# 2. Test selector with loop
node Engine/scripts/debug-tools/test-selector.js "URL" ".selector:nth-child(\$i)" --loop 5

# 3. Test actual recipe
bun Engine/engine.js --recipe list_type/domain.json --type autocomplete --input "test"

# 4. Debug recipe steps
node Engine/scripts/debug-tools/debug-recipe.js list_type/domain.json --type autocomplete --input "test"
```

## Summary

✅ **DO:**
- Use `inspect-dom.js` to find consecutive parent containers
- Test with `test-selector.js --loop` before writing recipes
- Move `:nth-child($i)` to the parent level that IS consecutive
- Verify all results extracted, not just the first one

❌ **DON'T:**
- Assume items are consecutive siblings without checking
- Use `.item:nth-child($i)` when items are nested in containers
- Use `:nth-of-type()` unless you understand it counts by tag name
- Skip testing loops before finalizing the recipe

The key insight: **Find the level where containers ARE consecutive, then drill down to the data.**
