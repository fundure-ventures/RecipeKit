# CSS Selector Guide for Web Scraping

This guide teaches you how to write **robust, stable CSS selectors** for web scraping with Puppeteer/Chrome.

## ⚠️ CRITICAL: Valid CSS Only

You MUST use **standard CSS selectors** that work with `document.querySelector()` and `document.querySelectorAll()`.

### ❌ INVALID - jQuery Pseudo-Selectors (DO NOT USE)

These are **jQuery-specific** and will cause `SyntaxError` in browser APIs:

```css
/* THESE WILL BREAK - DO NOT USE */
div:contains('text')           /* Use XPath or find by text in JS */
div:has(span)                  /* Use div:has(span) in CSS4, or div span in older browsers */
div:visible                    /* No CSS equivalent - check in JS */
div:hidden                     /* No CSS equivalent - check in JS */
div:eq(2)                      /* Use :nth-child(3) or :nth-of-type(3) */
div:first                      /* Use :first-child or :first-of-type */
div:last                       /* Use :last-child or :last-of-type */
div:even                       /* Use :nth-child(even) */
div:odd                        /* Use :nth-child(odd) */
div:gt(3)                      /* Use :nth-child(n+4) */
div:lt(3)                      /* Use :nth-child(-n+3) */
:input                         /* Use input, select, textarea, button */
:checkbox                      /* Use input[type="checkbox"] */
:radio                         /* Use input[type="radio"] */
:file                          /* Use input[type="file"] */
:password                      /* Use input[type="password"] */
:submit                        /* Use input[type="submit"], button[type="submit"] */
:text                          /* Use input[type="text"] */
:parent                        /* No direct equivalent */
:header                        /* Use h1, h2, h3, h4, h5, h6 */
:animated                      /* No CSS equivalent */
```

### ✅ VALID - Standard CSS Selectors

```css
/* Basic selectors */
div                            /* Element selector */
.class-name                    /* Class selector */
#element-id                    /* ID selector */
[data-id="123"]               /* Attribute selector */

/* Combinators */
div > p                        /* Direct child */
div p                          /* Descendant */
div + p                        /* Adjacent sibling */
div ~ p                        /* General sibling */

/* Pseudo-classes (standard) */
:first-child                   /* First child of parent */
:last-child                    /* Last child of parent */
:nth-child(3)                  /* 3rd child of parent */
:nth-child(odd)                /* Odd children (1, 3, 5...) */
:nth-child(even)               /* Even children (2, 4, 6...) */
:nth-child(2n)                 /* Every 2nd child */
:nth-child(n+3)                /* 3rd child and after */
:nth-of-type(2)                /* 2nd element of this type */
:not(.exclude)                 /* Negation */
:empty                         /* Has no children */

/* Attribute selectors */
[href]                         /* Has href attribute */
[href="value"]                 /* Exact match */
[href^="https"]                /* Starts with */
[href$=".pdf"]                 /* Ends with */
[href*="download"]             /* Contains */
[class~="active"]              /* Word in space-separated list */
[data-id|="en"]                /* Word in hyphen-separated list */

/* Pseudo-elements */
::before                       /* Before content */
::after                        /* After content */
::first-letter                 /* First letter */
::first-line                   /* First line */
```

## 🎯 Best Practices: Selector Stability

### Priority Order (Most Stable → Least Stable)

1. **Data Attributes** (best) - Rarely change
   ```css
   [data-testid="movie-title"]
   [data-item-id="12345"]
   [data-cy="search-result"]
   ```

2. **Semantic HTML with Context**
   ```css
   article h2                   /* Title in article */
   main > section:first-child   /* First section in main */
   [role="listitem"] a          /* Link in list item */
   ```

3. **ARIA Attributes**
   ```css
   [aria-label="Close"]
   [role="navigation"]
   button[aria-pressed="true"]
   ```

4. **Structural Selectors**
   ```css
   .result-list > div:nth-child(3)
   .container > article:first-of-type
   ```

5. **Class Names** (use with caution)
   - **Good**: `.search-result`, `.product-title` (semantic)
   - **Bad**: `.css-1a2b3c`, `.sc-xyz`, `.x-123` (generated, will change)

6. **Generic Classes** (avoid)
   ```css
   /* These are fragile and non-specific */
   .item                        /* Too common */
   .title                       /* Ambiguous */
   div                          /* Too broad */
   ```

## 🏗️ Selector Patterns

### Pattern 1: Loop Through Multiple Results (REQUIRED for Autocomplete)

**For search results, you MUST extract multiple items using loops:**

**❌ Bad - Only gets 1 result:**
```json
{
  "command": "store_text",
  "locator": ".search-result .title",
  "output": { "name": "TITLE" }
}
```
This will only get the first match. Tests will fail with "expected at least 2 results".

**✅ Good - Gets 5 results with loop:**
```json
{
  "command": "loop",
  "index": "i",
  "from": 1,
  "to": 5,
  "steps": [
    {
      "command": "store_text",
      "locator": ".search-result:nth-child($i) .title",
      "output": { "name": "TITLE$i" }
    },
    {
      "command": "store_attribute",
      "locator": ".search-result:nth-child($i) a",
      "attribute_name": "href",
      "output": { "name": "URL$i" }
    }
  ]
}
```

**Key points:**
- Use `:nth-child($i)` to target specific items in sequence
- Append `$i` to output variable names
- Set `to: 5` minimum (or higher if page has many results)
- Remember `:nth-child()` is 1-indexed, not 0-indexed

### Pattern 2: Target Specific Elements in Loops

**❌ Bad - Too broad:**
```css
/* Will match unintended elements */
.item .title
```

**✅ Good - Specific with index:**
```css
/* Targets exact element in loop */
.result-list > .item:nth-child($i) h3
.search-results article:nth-of-type($i) .title
```

### Pattern 2: Avoid Over-Specificity

**❌ Bad - Too fragile:**
```css
/* Will break if structure changes */
body > div.container > div.wrapper > main > section > article > div.content > h2.title
```

**✅ Good - Balanced:**
```css
/* Stable and clear */
article .title
main .search-result h3
```

### Pattern 3: Use Semantic Context

**❌ Bad - No context:**
```css
/* Could match wrong elements */
.price
.rating
```

**✅ Good - With context:**
```css
/* Clear intent and scope */
.product-card .price
article[data-type="movie"] .rating
.search-result:nth-child($i) .price
```

### Pattern 4: Handle Dynamic Content

**❌ Bad - Relies on generated classes:**
```css
/* These classes are auto-generated and unstable */
.css-1xy2ab3
.sc-bdVaJa
.MuiButton-root-123
```

**✅ Good - Use stable attributes:**
```css
/* Stable even if classes change */
button[type="submit"]
[data-testid="login-button"]
button:has(svg[data-icon="search"])  /* CSS4 */
```

## 🚨 Common Mistakes

### 1. Using Comma Selectors with store_text

**❌ Problem:**
```json
{
  "command": "store_text",
  "locator": "h1, meta[property='og:title']"
}
```
The `querySelector` returns **first match** - might be the meta tag (which has no textContent).

**✅ Solution:**
```json
{
  "command": "store_text",
  "locator": "h1"
}
```
Or use separate steps with fallbacks.

### 2. Forgetting :nth-child is 1-indexed

**❌ Wrong:**
```css
/* First item is :nth-child(1), not (0) */
.item:nth-child(0)  /* INVALID */
```

**✅ Correct:**
```css
.item:nth-child(1)   /* First item */
.item:nth-child(2)   /* Second item */
```

### 3. Confusing :nth-child vs :nth-of-type

```html
<div>
  <span>A</span>
  <p>B</p>
  <p>C</p>
  <span>D</span>
</div>
```

```css
/* :nth-child counts ALL children */
p:nth-child(2)        /* Matches B (2nd child overall) */
p:nth-child(3)        /* Matches C (3rd child overall) */

/* :nth-of-type counts only that type */
p:nth-of-type(1)      /* Matches B (1st <p> element) */
p:nth-of-type(2)      /* Matches C (2nd <p> element) */
```

**Rule of thumb:** Use `:nth-of-type` when siblings have mixed types.

### 4. Over-relying on Classes

**❌ Fragile:**
```css
/* These can change frequently */
.btn-primary
.mb-3
.col-md-6
```

**✅ More stable:**
```css
/* Combine with semantic elements */
button[type="submit"]
article > h2
[data-action="search"]
```

### 5. Not Handling Optional Elements

**❌ Assumes element exists:**
```json
{
  "command": "store_text",
  "locator": ".subtitle"
}
```
If `.subtitle` doesn't exist, you get empty string (not an error).

**✅ Make it optional or provide default:**
```json
{
  "command": "store_text",
  "locator": ".subtitle",
  "output": { "name": "SUBTITLE", "show": true }
},
{
  "command": "store",
  "expression": "$SUBTITLE || 'No subtitle'",
  "output": { "name": "SUBTITLE_SAFE" }
}
```

## 🎓 Advanced Patterns

### Pattern: Find Elements by Text (Without :contains)

Since `:contains()` is jQuery-only, use XPath or page.evaluate:

```javascript
// In page.evaluate context
const element = Array.from(document.querySelectorAll('button'))
  .find(btn => btn.textContent.trim() === 'Submit');
```

Or use XPath:
```javascript
// XPath equivalent of :contains
await page.$x("//button[contains(text(), 'Submit')]");
```

### Pattern: Check Visibility (Without :visible)

```javascript
// In page.evaluate context
const isVisible = (el) => {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
};

const visibleDivs = Array.from(document.querySelectorAll('div'))
  .filter(isVisible);
```

### Pattern: Select by Attribute Existence

```css
/* Has any data-* attribute */
[data-id]

/* Has specific value */
[data-type="product"]

/* Starts with */
[class^="result-"]

/* Ends with */
[id$="-item"]

/* Contains */
[href*="/product/"]
```

### Pattern: Complex Nth-child Formulas

```css
/* Every 3rd element */
:nth-child(3n)          /* 3, 6, 9, 12... */

/* Every 3rd starting from 2nd */
:nth-child(3n+2)        /* 2, 5, 8, 11... */

/* First 5 elements */
:nth-child(-n+5)        /* 1, 2, 3, 4, 5 */

/* All but first 3 */
:nth-child(n+4)         /* 4, 5, 6, 7... */

/* Last 3 elements */
:nth-last-child(-n+3)   /* Last 3 */
```

## 🧪 Testing Your Selectors

### In Browser DevTools Console:

```javascript
// Test if selector works
document.querySelectorAll('.your-selector').length  // How many matches?

// See what you're selecting
document.querySelectorAll('.your-selector').forEach(el => console.log(el.textContent));

// Test nth-child with loop
for (let i = 1; i <= 5; i++) {
  const el = document.querySelector(`.item:nth-child(${i}) .title`);
  console.log(i, el ? el.textContent : 'NOT FOUND');
}

// Test attribute extraction
document.querySelector('a')?.href
document.querySelector('img')?.src
document.querySelector('meta[property="og:title"]')?.content
```

### Common Issues:

1. **Selector returns 0 matches**
   - Element might be in iframe: `page.frames()`
   - Element loaded by JavaScript: wait longer or use `waitForSelector`
   - Selector has typo or wrong syntax

2. **Selector returns wrong element**
   - Too broad - add parent context
   - Wrong nth-child index - check HTML structure
   - Comma selector matching wrong element - split into separate selectors

3. **SyntaxError: invalid selector**
   - Using jQuery pseudo-selectors (see ❌ list above)
   - Unclosed brackets or quotes
   - Invalid characters in selector

## 📋 Quick Reference Cheat Sheet

| Goal | CSS Selector | Notes |
|------|-------------|-------|
| Nth item in loop | `.item:nth-child($i)` | 1-indexed |
| First item | `:first-child` | Not `:first` |
| Last item | `:last-child` | Not `:last` |
| Odd items | `:nth-child(odd)` | Not `:odd` |
| Even items | `:nth-child(even)` | Not `:even` |
| Has attribute | `[data-id]` | Any value |
| Attribute equals | `[data-id="123"]` | Exact match |
| Attribute contains | `[href*="example"]` | Substring |
| Class starts with | `[class^="result-"]` | Prefix |
| Not matching | `:not(.excluded)` | Negation |
| Direct child | `parent > child` | Not grandchildren |
| Any descendant | `parent child` | Includes nested |
| Adjacent sibling | `h2 + p` | Next sibling only |
| General sibling | `h2 ~ p` | All following siblings |

## 💡 Pro Tips

1. **Use DevTools to Copy Selectors**
   - Right-click element → Copy → Copy selector (but simplify it!)
   - Generated selectors are often too specific

2. **Test in Incognito Mode**
   - Ensures no browser extensions affect page structure

3. **Check for Shadow DOM**
   - If `querySelector` returns null but element exists, check for Shadow DOM
   - Use `element.shadowRoot.querySelector()` if needed

4. **Consider Mobile vs Desktop**
   - Classes/structure might differ on responsive sites
   - Test with device emulation

5. **Prefer Attribute Selectors for Stability**
   ```css
   /* More stable */
   [data-testid="product-title"]
   
   /* Less stable */
   .product-card__title--v2
   ```

6. **Use Logical Grouping**
   ```css
   /* Good - clear intent */
   .search-results .result-item:nth-child($i) .title
   
   /* Bad - unclear */
   div div div:nth-child($i) span
   ```

## 🔍 Debugging Checklist

When a selector doesn't work:

- [ ] Is it valid CSS? (Test in browser console)
- [ ] Is it using jQuery pseudo-selectors? (Convert to standard CSS)
- [ ] Is the element loaded? (Check page.waitForSelector)
- [ ] Is it in an iframe? (Use page.frames())
- [ ] Is it in Shadow DOM? (Use shadowRoot)
- [ ] Is the selector too specific? (Simplify)
- [ ] Is the selector too broad? (Add context)
- [ ] Are you using nth-child correctly? (1-indexed, counts all siblings)
- [ ] Did you test with actual data from the evidence packet?

---

**Remember:** The best selector is one that is:
1. **Valid** (standard CSS, not jQuery)
2. **Specific** (targets only what you want)
3. **Stable** (won't break with minor page changes)
4. **Readable** (clear what it's selecting)

## ⚠️ CRITICAL: The nth-child/nth-of-type Trap

### The Problem

When using loops with `:nth-child()` or `:nth-of-type()`, items MUST be consecutive siblings. If there are other elements in between, your selectors will fail.

**Example DOM:**
```html
<div class="results">
  <div class="ad">Ad</div>
  <div class="product">Product 1</div>
  <div class="product">Product 2</div>
  <div class="spacer"></div>
  <div class="product">Product 3</div>
</div>
```

**What happens:**
```css
/* This fails - products are NOT consecutive children */
.product:nth-child(1)  /* Returns null (first child is .ad) */
.product:nth-child(2)  /* Returns Product 1 */
.product:nth-child(3)  /* Returns Product 2 */
.product:nth-child(5)  /* Returns Product 3 */

/* This also fails - nth-of-type counts by TAG, not class */
.product:nth-of-type(1)  /* Returns Product 1 (1st div.product) */
.product:nth-of-type(2)  /* Returns Product 2 (2nd div.product) */
.product:nth-of-type(3)  /* Returns Product 3 (3rd div.product) */
/* BUT if there are other <div>s mixed in, this breaks! */
```

### The Solution

**Option 1: Find a parent container where items ARE direct consecutive children**

```css
/* BAD - items not consecutive */
.product-grid .product-tile:nth-child($i)

/* GOOD - find parent where tiles are consecutive */
.search-results > .result-item:nth-child($i)
ul.products > li:nth-child($i)
```

**Option 2: Use a more specific parent selector**

```css
/* If items are in a list */
ul.results > li:nth-child($i)

/* If items are in article tags */
main > article:nth-of-type($i)

/* If items have data attributes */
[data-result-index="$i"]
```

**Option 3: Find a common wrapper that groups each item**

```css
/* Each item wrapped in a container */
.result-wrapper:nth-child($i) .product-tile
.search-item:nth-of-type($i) h3
```

### How to Identify the Problem

Run `inspect-dom.js` on the search page:
```bash
node Engine/scripts/debug-tools/inspect-dom.js "URL" --find-items
```

Look for:
1. **Parent selector** - What contains all the result items?
2. **Item count** - How many items does it find?
3. **Item structure** - Are items direct children or nested?

Then test with:
```bash
node Engine/scripts/debug-tools/test-selector.js "URL" ".selector:nth-child(\$i)" --loop 5
```

If only the first item matches, your items aren't consecutive siblings.

### Real Example: Funko.com

**Problem:**
```json
{
  "locator": ".product-grid .product-tile:nth-child($i)",
  "from": 1, "to": 6
}
```
Only returns 1 result because `.product-tile` elements aren't consecutive children of `.product-grid`.

**Solution:**
Find the actual parent. After inspection:
- Items are `.product` divs
- Inside `.col-6` containers  
- Which are children of `.row.product-grid`

**Fixed selector:**
```json
{
  "locator": ".row.product-grid > .col-6:nth-child($i) .product-tile",
  "from": 1, "to": 10
}
```

Or even better, if `.col-6` elements ARE consecutive:
```json
{
  "locator": ".col-6:nth-child($i) .pdp-link a",
  "from": 1, "to": 10
}
```

### Testing Your Loop Selectors

**ALWAYS test with the debug tools before finalizing:**

```bash
# Test if items 1-5 all match
node Engine/scripts/debug-tools/test-selector.js "URL" ".item:nth-child(\$i) .title" --loop 5

# Expected: 5/5 matches
# If you get 1/5: Items aren't consecutive siblings
# If you get 0/5: Selector is wrong
```

### Key Takeaways

1. `:nth-child($i)` only works if items are consecutive siblings
2. `:nth-of-type($i)` counts by TAG name, not class - use with caution
3. ALWAYS use `inspect-dom.js` to understand the structure FIRST
4. ALWAYS use `test-selector.js --loop` to verify selectors BEFORE generating recipes
5. If items aren't consecutive, find their common parent container
