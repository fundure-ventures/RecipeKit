# Fix Recipe

You are fixing a broken RecipeKit recipe based on test failures and evidence.

<api-rewrite-rule>
## 🚀 IMPORTANT: API-Based Rewrite

**If selectors keep failing and you see signs of:**
- Cloudflare protection (page title "Un momento...", "Just a moment...")
- Only navigation elements found ("h1" found 1 with text like "www.sitename.com")
- Empty results despite page loading
- Only link to "Cloudflare" found in alternatives

**THEN the site likely loads data via JavaScript API. Rewrite using `api_request`:**

```json
{
  "action": "rewrite",
  "steps": [
    {
      "command": "api_request",
      "url": "https://api-endpoint.com/search",
      "config": {
        "method": "POST",
        "headers": { "Content-Type": "application/json" },
        "body": "{\"query\":\"$INPUT\"}"
      },
      "output": { "name": "API_RESPONSE" },
      "description": "Fetch from API directly"
    },
    {
      "command": "json_store_text",
      "input": "API_RESPONSE", 
      "locator": "results[$i].title",
      "output": { "name": "TITLE$i" },
      "config": { "loop": { "index": "i", "from": 0, "to": 9, "step": 1 } },
      "description": "Extract titles"
    }
  ],
  "explanation": "Site uses Cloudflare/JS - switching to direct API call"
}
```

**You need to discover the API URL from the site. Common patterns:**
- Algolia: `{appId}-dsn.algolia.net/1/indexes/*/queries`
- Custom: `/api/search`, `/api/autocomplete`, `/_next/data/`
</api-rewrite-rule>

<critical-rules>
## 🚨 CRITICAL RULES

1. **Check `dom_structure` in evidence** - It has the correct selector pattern
2. **Use `:nth-child($i)` on consecutive siblings only** - Not on nested items
3. **Never use `:nth-of-type($i)` with class selectors** - It doesn't work correctly
4. **Never add comments inside selectors** - Pure CSS only
5. **Prefer patches over rewrites** - Make minimal changes
6. **If Cloudflare detected after 2+ iterations** - Switch to API approach
</critical-rules>

<common-selector-fixes>
## Common Selector Fixes

### Problem: Only 1 result extracted
**Cause:** `:nth-child($i)` is on a non-consecutive element

```json
// ❌ WRONG - .product is not a consecutive sibling
"locator": ".product:nth-child($i) .title"

// ✅ FIX - Use the consecutive parent from dom_structure
"locator": ".col-6:nth-child($i) .product .title"
```

### Problem: `:nth-of-type` not working with classes
**Cause:** `:nth-of-type` counts by tag name, not class

```json
// ❌ WRONG - nth-of-type ignores the class
"locator": "div.product:nth-of-type($i)"

// ✅ FIX - Use nth-child on consecutive parent
"locator": ".grid > div:nth-child($i) .product"
```
</common-selector-fixes>

<output-format>
## Output Format

Return **ONLY** valid JSON (no markdown, no explanation):

### For patches:
```json
{
  "action": "patch",
  "patches": [
    {
      "step_index": 2,
      "field": "locator", 
      "old_value": ".product:nth-of-type($i) .title",
      "new_value": ".col-6:nth-child($i) .product .title"
    }
  ],
  "explanation": "Changed to use consecutive parent with nth-child"
}
```

### For rewrites:
```json
{
  "action": "rewrite",
  "steps": [...],
  "explanation": "Full rewrite needed because..."
}
```
</output-format>

<patch-fields>
## Patch Fields

- `step_index`: 0-based index of step to modify
- `field`: Field to change (`locator`, `url`, `attribute_name`, `expression`)
- `old_value`: Current value (for verification)
- `new_value`: New value to use
- `new_steps`: Optional new steps to insert
- `insert_at`: Index to insert new steps
- `delete_indices`: Array of step indices to remove
</patch-fields>

<analysis-checklist>
## Analysis Checklist

Before fixing, check:

- [ ] Does `dom_structure.found` exist in evidence?
- [ ] Is the recipe using `dom_structure.loopBase`?
- [ ] Is `:nth-child($i)` on a consecutive element?
- [ ] Are URLs relative (need `store` step to make absolute)?
- [ ] Is the selector using `:nth-of-type` with a class? (wrong!)
</analysis-checklist>

<variable-rules>
## Variable Reference Rules

Variables ONLY work in:
- `input` field of `store` commands
- `input` field of `regex` commands  
- `url` field of `load` commands

**If you see unreplaced variables like `$TEAM$i` in output:**
The recipe tried to combine variables which doesn't work. Fix by extracting TITLE directly from the page.
</variable-rules>
