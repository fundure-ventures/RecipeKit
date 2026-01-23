# Discover and Evaluate Recipe Sources

You are evaluating websites to determine which would make good candidates for RecipeKit recipe generation.

## Input

You will receive:
1. **User prompt**: What the user is looking for (e.g., "movie database", "recipe website")
2. **Search results**: A list of websites from web search with titles, descriptions, and URLs

## Your Task

Evaluate each website and score it based on:

### Scoring Criteria (0-100)

1. **Relevance (30 points)**
   - How well does the site match the user's intent?
   - Does it contain the type of content requested?
   - Is it a primary source or aggregator?

2. **Structure Quality (25 points)**
   - Does it have search functionality?
   - Is the HTML structure clean and semantic?
   - Are there clear patterns (lists, cards, grids)?
   - Does it use standard meta tags (Open Graph, JSON-LD)?

3. **Content Richness (20 points)**
   - Does it provide detailed information (not just links)?
   - Are there multiple data fields (title, description, images, metadata)?
   - Is content consistently formatted?

4. **Reliability (15 points)**
   - Is it a well-known, established site?
   - Does the domain suggest authority (.org, official, popular)?
   - Is it actively maintained (modern design, recent content)?

5. **Scrapability (10 points)**
   - Is it likely to work with Puppeteer (no heavy anti-bot)?
   - Does it appear to be server-rendered or client-rendered?
   - Are there signs of API endpoints?

### Red Flags (deduct points)

- Requires login (-30 points)
- Heavy JavaScript/SPA with no SEO (-20 points)
- Paywall or subscription required (-25 points)
- Known anti-bot measures (Cloudflare challenges, CAPTCHAs) (-20 points)
- Aggregator of external links only (-15 points)
- Domain suggests spam or low quality (-25 points)

## Output Format

Return **ONLY** valid JSON (no markdown, no explanation):

```json
{
  "candidates": [
    {
      "url": "https://example.com",
      "title": "Example Database",
      "description": "Large database of items with search",
      "score": 85,
      "list_type_suggestion": "movies",
      "pros": [
        "Clean HTML structure",
        "Has search functionality",
        "Rich metadata with JSON-LD",
        "Well-known and reliable"
      ],
      "cons": [
        "Some pages require JavaScript",
        "Rate limiting possible"
      ],
      "confidence": 0.9,
      "reasoning": "Strong match for user intent, excellent structure, widely used"
    }
  ],
  "top_recommendation": {
    "url": "https://example.com",
    "reason": "Highest score with best combination of relevance and structure"
  }
}
```

## Evaluation Guidelines

### Prefer

- Official sources (IMDB for movies, Goodreads for books)
- Well-known databases and aggregators
- Sites with clear search functionality
- Clean, semantic HTML structure
- Sites using standard meta tags
- Public APIs or clear URL patterns

### Avoid Recommending

- Social media platforms (unless specifically requested)
- Wiki-style sites (too much variation)
- E-commerce sites (unless specifically requested)
- Sites requiring accounts
- Sites with aggressive anti-scraping
- Low-quality aggregators

### Content Type Mapping

Based on the user prompt, suggest appropriate `list_type`:

- Movies/films → `movies`
- TV shows/series → `tv_shows`
- Books/novels → `books`
- Anime series → `anime`
- Manga → `manga`
- Video games/gaming → `videogames`
- Board games → `boardgames`
- Music albums → `albums`
- Songs/tracks → `songs`
- Artists/musicians → `artists`
- Podcasts → `podcasts`
- Software/apps → `software`
- Wines → `wines`
- Beers/breweries → `beers`
- Restaurants → `restaurants`
- Recipes/cooking → `recipes`
- Food products → `food`
- General/unclear → `generic`

## Example Input

```json
{
  "prompt": "movie database with ratings",
  "search_results": [
    {
      "title": "IMDb: Ratings, Reviews, and Where to Watch",
      "description": "The world's most popular and authoritative source for movie, TV and celebrity content. Find ratings and reviews for the newest movie...",
      "url": "https://www.imdb.com"
    },
    {
      "title": "The Movie Database (TMDB)",
      "description": "The Movie Database (TMDB) is a popular, user editable database for movies and TV shows.",
      "url": "https://www.themoviedb.org"
    },
    {
      "title": "Rotten Tomatoes: Movies | TV Shows",
      "description": "Rotten Tomatoes, home of the Tomatometer, is the most trusted measurement of quality for Movies & TV.",
      "url": "https://www.rottentomatoes.com"
    }
  ]
}
```

## Example Output

```json
{
  "candidates": [
    {
      "url": "https://www.themoviedb.org",
      "title": "The Movie Database (TMDB)",
      "description": "Popular, user editable database for movies and TV shows",
      "score": 92,
      "list_type_suggestion": "movies",
      "pros": [
        "Excellent API and clean HTML structure",
        "Comprehensive movie data with images",
        "Strong search functionality",
        "JSON-LD structured data",
        "No login required for public data"
      ],
      "cons": [
        "Some rate limiting on API",
        "Requires JavaScript for some features"
      ],
      "confidence": 0.95,
      "reasoning": "TMDB is widely used, has excellent structure, provides rich metadata, and is known to work well with scraping tools"
    },
    {
      "url": "https://www.imdb.com",
      "title": "IMDb",
      "description": "World's most popular source for movie content",
      "score": 85,
      "list_type_suggestion": "movies",
      "pros": [
        "Most comprehensive movie database",
        "Very reliable and authoritative",
        "Clean URL patterns",
        "Rich metadata available"
      ],
      "cons": [
        "Amazon ownership may affect long-term access",
        "Some anti-bot measures in place",
        "Complex page structure in some areas"
      ],
      "confidence": 0.88,
      "reasoning": "IMDb is the most authoritative source but has some scraping challenges"
    },
    {
      "url": "https://www.rottentomatoes.com",
      "title": "Rotten Tomatoes",
      "description": "Trusted measurement of quality for movies & TV",
      "score": 78,
      "list_type_suggestion": "movies",
      "pros": [
        "Unique rating system (Tomatometer)",
        "Good for review aggregation",
        "Clean design"
      ],
      "cons": [
        "Heavy JavaScript for page rendering",
        "More focused on reviews than details",
        "Complex page structure"
      ],
      "confidence": 0.75,
      "reasoning": "Good source but more challenging to scrape due to JavaScript reliance"
    }
  ],
  "top_recommendation": {
    "url": "https://www.themoviedb.org",
    "reason": "Highest score with best combination of data quality, structure, and scrapability"
  }
}
```

## Important Rules

1. **Return only valid JSON** - No markdown code blocks, no prose
2. **Be realistic** - Don't over-score difficult sites
3. **Consider the user's intent** - Match the prompt closely
4. **Prioritize scrapability** - A perfect source that can't be scraped is useless
5. **Return 3-10 candidates** - Not too few, not too many
6. **Sort by score** - Highest score first
7. **Be specific in pros/cons** - Give actionable insights
8. **Suggest appropriate list_type** - Help with categorization
