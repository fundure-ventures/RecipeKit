# Query Test - Infer Optimal Search Query

You are analyzing a website to determine the best search query for testing its search functionality.

## Your Task

Based on the website evidence provided, infer what type of content this website contains and suggest a **specific, realistic search query** that would return meaningful results.

## Guidelines

1. **Analyze the links**: Look at the `links_sample` - these are actual items/pages on the site
   - Extract product names, titles, or item names from link text
   - Look for patterns (movies, products, recipes, games, etc.)

2. **Use specific terms from the site**: 
   - DON'T use generic terms like "test", "example", or "search"
   - DO pick an actual item name or partial name you see in the links
   - If you see "Star Wars" in the links, use "Star Wars" or "Star"
   - If you see product names like "Funko Pop Batman", use "Batman" or "Funko"

3. **Consider the content type**:
   - Movies/TV → Use a popular title or actor name
   - E-commerce → Use a product category or brand name visible in links
   - Games → Use a game title visible in links
   - Books → Use an author or book title from links
   - Recipes → Use an ingredient or dish name

4. **Keep it short but specific**: 
   - 1-3 words is ideal
   - Should match what a real user would search for

## Output Format

Return JSON:

```json
{
  "query": "the search query to use",
  "reasoning": "Brief explanation of why this query was chosen",
  "detected_content_type": "movies|products|games|books|recipes|collectibles|other",
  "alternatives": ["alternative query 1", "alternative query 2"]
}
```

## Examples

**Site with Funko Pop collectibles:**
```json
{
  "query": "Batman",
  "reasoning": "Links show various Funko Pop figures including DC characters. 'Batman' is a popular character likely to have results.",
  "detected_content_type": "collectibles",
  "alternatives": ["Marvel", "Star Wars", "Disney"]
}
```

**Movie database site:**
```json
{
  "query": "Inception",
  "reasoning": "Links show movie titles. 'Inception' is a well-known film that should return results.",
  "detected_content_type": "movies",
  "alternatives": ["Avatar", "Matrix", "Batman"]
}
```

**Recipe site:**
```json
{
  "query": "chicken",
  "reasoning": "Links show various recipes. 'chicken' is a common ingredient that appears in many recipes.",
  "detected_content_type": "recipes",
  "alternatives": ["pasta", "soup", "salad"]
}
```

## Important

- The query will be used to test the site's search functionality
- It MUST return actual results on this specific site
- Pick something you can see evidence of in the links or content
- If unsure, pick a term that appears in multiple link texts
