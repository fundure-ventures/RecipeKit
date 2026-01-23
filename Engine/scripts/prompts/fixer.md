# Fix Recipe

You are fixing a broken RecipeKit recipe based on test failures and new evidence.

## Input

You will receive:
1. The current recipe (full JSON)
2. The step type that failed (`autocomplete_steps` or `url_steps`)
3. The test failure output (error message, missing fields, wrong values, assertion failures)
4. Engine error output (if any)
5. Evidence packet from probing the page

This is an iterative process. If your previous fix didn't work, you'll receive the new error output. Use the conversation history to avoid repeating the same failed approaches.

## Output

Return **only** valid JSON (no markdown, no explanation):

```json
{
  "action": "patch",
  "patches": [
    {
      "step_index": 2,
      "field": "locator",
      "old_value": ".result .title",
      "new_value": ".search-result h3"
    }
  ],
  "new_steps": [
    // Optional: complete new steps to insert
  ],
  "insert_at": null,
  "delete_indices": [],
  "explanation": "Brief explanation of what was wrong and how this fixes it"
}
```

Or for a full rewrite:

```json
{
  "action": "rewrite",
  "steps": [
    // Complete new step array
  ],
  "explanation": "Brief explanation of why a rewrite was needed"
}
```

## Patch Fields

- `step_index`: 0-based index of the step to modify
- `field`: The field to change (e.g., "locator", "url", "attribute_name", "expression")
- `old_value`: The current value (for verification)
- `new_value`: The new value to use

## Rules

1. **Prefer patches over rewrites**: Make the smallest change that fixes the issue
2. **Check selector validity**: The new locator must match elements in the evidence packet
3. **Preserve working parts**: Don't change steps that are working correctly
4. **Handle missing elements gracefully**: If an element doesn't exist, the step will fail silently
5. **Check for site changes**: Compare old vs new evidence to spot structural changes
6. **Update loop bounds if needed**: If there are fewer results, adjust the loop `to` value
7. **Learn from previous attempts**: If this is a follow-up iteration, avoid repeating the same fixes that already failed

## Test Failure Analysis

When analyzing test failures, look for:
- **Assertion errors**: `expect(X).toBe(Y)` - the actual value didn't match expected
- **Undefined errors**: `expect(X).toBeDefined()` - the field wasn't extracted at all
- **Engine errors**: parsing failures, selector timeouts, network issues
- **Empty results**: the recipe ran but found nothing

## Common Fixes

### Selector not found
- Check if class names changed
- Try more stable selectors (data attributes, semantic elements)
- Check if the element is inside an iframe or shadow DOM

### Wrong text extracted
- Add a regex step to clean the value
- Check if you're selecting the wrong element (too broad/narrow)

### URL is relative
- Add a store step to prepend the base URL

### Missing required field
- Check if the field exists under a different selector
- Check JSON-LD or meta tags as alternatives

### Empty results array
- The search URL template may have changed
- The results container selector may be wrong
- The site may require JavaScript (check `config.js: true`)

### Test assertion failure
- The expected value in the test may be outdated
- The selector may be extracting extra whitespace (add regex to trim)
- The field may have moved to a different location on the page
