# Classify Website

You are classifying a website into one of the allowed `list_type` categories for RecipeKit.

## Allowed list_type values

- albums
- anime
- artists
- beers
- boardgames
- books
- food
- generic
- manga
- movies
- podcasts
- recipes
- restaurants
- software
- songs
- tv_shows
- videogames
- wines

## Input

You will receive an "evidence packet" JSON containing:
- input_url, final_url, hostname
- title, meta_description, h1
- jsonld_types (array of schema.org types found)
- links_sample (array of {text, href})
- search info (if discoverable)

## Output

Return **only** valid JSON (no markdown, no explanation):

```json
{
  "list_type": "<one of the allowed values>",
  "confidence": <0.0 to 1.0>,
  "rationale": "<brief explanation>",
  "suggested_recipe_shortcut": "<hostname>_<list_type>"
}
```

## Rules

1. Choose the most specific category that fits. Use `generic` only as a last resort.
2. If the site is clearly about one type of content (e.g., movies, books), choose that.
3. If the site sells/lists multiple unrelated things, use `generic`.
4. Confidence should reflect how certain you are (0.9+ for obvious cases, 0.5-0.7 for ambiguous).
5. The `suggested_recipe_shortcut` should be lowercase, use underscores, and combine hostname + list_type.
