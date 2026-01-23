# AutoRecipe Quick Reference

## 🚀 Quick Start

### Discovery Mode (NEW!)
```bash
# Find sources by natural language
bun Engine/scripts/autoRecipe.js --prompt="wine ratings" --debug

# Specify content type
bun Engine/scripts/autoRecipe.js --prompt="movie database"
```

### Direct URL Mode
```bash
# Generate recipe from URL
bun Engine/scripts/autoRecipe.js --url="https://example.com" --debug

# Force overwrite existing recipe
bun Engine/scripts/autoRecipe.js --url="https://example.com" --force
```

---

## 🔍 Debugging Loop Selectors

### Problem: Only 1 result extracted (others empty)

**Quick Fix:** Use parent container method

```json
// ❌ BAD - Items not consecutive
{ "locator": ".product-tile:nth-child($i)" }

// ✅ GOOD - Parent containers ARE consecutive
{ "locator": ".col-6:nth-child($i) .product-tile" }
```

### Debug Steps

1. **Inspect structure:**
   ```bash
   node Engine/scripts/debug-tools/inspect-dom.js "URL" --find-items
   ```

2. **Test selector:**
   ```bash
   node Engine/scripts/debug-tools/test-selector.js "URL" ".selector:nth-child(\$i)" --loop 5
   ```

3. **Verify recipe:**
   ```bash
   bun Engine/engine.js --recipe list_type/domain.json --type autocomplete --input "test"
   ```

**Expected results:**
- Step 2 shows 5/5 matches ✅
- Step 3 shows all results with data ✅

---

## 📋 Loop Syntax Checklist

Every step with `$i` MUST have `config.loop`:

```json
{
  "command": "store_text",
  "locator": ".col-6:nth-child($i) .title",
  "output": { "name": "TITLE$i" },
  "config": {
    "loop": {
      "index": "i",
      "from": 1,
      "to": 10,
      "step": 1
    }
  }
}
```

**Key points:**
- ✅ Use `:nth-child($i)` with dollar sign
- ✅ Output name ends with `$i`: `TITLE$i`, `URL$i`
- ✅ All steps have identical loop config
- ✅ Minimum `to: 5` for adequate testing

---

## ⚠️ Common Selector Issues

### jQuery Pseudo-Selectors (INVALID)
```css
/* ❌ These will crash - jQuery only */
.item:contains('text')
.item:eq(2)
.item:visible
.item:first
.item:last

/* ✅ Use standard CSS instead */
.item:nth-child(3)
.item[data-visible="true"]
.item:first-child
.item:last-child
```

### nth-child vs nth-of-type
```css
/* nth-child counts ALL siblings */
.item:nth-child(2)   /* 2nd child of parent (any type) */

/* nth-of-type counts by TAG */
div.item:nth-of-type(2)   /* 2nd <div> that is also .item */
```

**Rule:** Use `:nth-child($i)` on parent containers that ARE consecutive.

---

## 🎯 Selector Strategy

1. **Find consecutive level** with `inspect-dom.js`
2. **Test with `--loop 5`** to verify all 5 match
3. **Target parent, drill down** to data

**Pattern:**
```
.consecutive-container:nth-child($i) .nested-item .data
         ↑                                    ↑
      This level IS                    Drill down from here
     consecutive siblings
```

---

## 📊 Testing Checklist

### Autocomplete Recipe
- [ ] Run with `--type autocomplete --input "test"`
- [ ] Check `results.length >= 2` (multi-result enforcement)
- [ ] Verify all results have `TITLE`, `URL`, `COVER`
- [ ] No empty results (empty = selector issue)

### URL Recipe
- [ ] Run with `--type url --input "DETAIL_URL"`
- [ ] Check required fields present (TITLE, DESCRIPTION, etc.)
- [ ] Verify data accuracy matches page

---

## 🔧 Tools Reference

| Tool | Purpose | Example |
|------|---------|---------|
| `inspect-dom.js` | Analyze page structure | `node inspect-dom.js URL --find-items` |
| `test-selector.js` | Test selectors | `node test-selector.js URL ".item:nth-child(\$i)" --loop 5` |
| `debug-recipe.js` | Step-by-step execution | `node debug-recipe.js recipe.json --type autocomplete --input "test"` |

---

## 📚 Documentation Links

- **LOOP_SELECTOR_STRATEGY.md** - Complete loop debugging guide
- **css-selector-guide.md** - Valid vs invalid selectors, patterns
- **DEVELOPMENT_GUIDE.md** - Full reference (52KB)
- **SUMMARY.md** - Executive summary

---

## 🆘 Quick Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Only 1 result has data | Items not consecutive | Use parent container: `.parent:nth-child($i) .item` |
| SyntaxError: invalid selector | jQuery pseudo-selector | Remove `:contains()`, `:eq()`, etc. |
| 0/5 in loop test | Selector wrong | Check `inspect-dom.js` for correct selector |
| Test fails: < 2 results | Loop not configured | Add `config.loop` to all steps with `$i` |

---

## 🎓 Key Principles

1. **Always inspect first** - Use `inspect-dom.js` before writing selectors
2. **Test loops** - Verify with `test-selector.js --loop 5` (expect 5/5)
3. **Parent containers** - Target consecutive level, drill down to data
4. **Standard CSS only** - No jQuery pseudo-selectors
5. **Debug visibility** - Use `--debug` flag to see what's happening

---

## 💡 Pro Tips

- **Discovery mode** saves time finding URLs
- **Multiple test runs** ensure stability
- **Parent container method** solves 90% of loop issues
- **Debug tools** are mandatory, not optional
- **Read the error messages** - they contain hints!

---

**Need help?** Check the full guides in `Engine/docs/`
