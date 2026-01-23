# Discovery Mode - Feature Documentation

> **NEW in v21**: Autonomous source discovery and evaluation

---

## What is Discovery Mode?

Discovery Mode is a new feature that allows AutoRecipe to find and evaluate potential recipe sources automatically, without requiring you to know the exact URL upfront.

Instead of:
```bash
# Old way - you need to know the URL
bun Engine/scripts/autoRecipe.js --url=https://www.themoviedb.org
```

You can now:
```bash
# New way - just describe what you want
bun Engine/scripts/autoRecipe.js --prompt="movie database with ratings"
```

---

## How It Works

### 1. Web Search Phase
AutoRecipe searches the web using your prompt to find 10-15 candidate websites.

**Search Strategy:**
- Uses Google Search via Puppeteer
- Filters out social media and low-quality sites
- Extracts: title, URL, description

### 2. Evaluation Phase
Copilot evaluates each candidate using strict criteria (0-100 score):

**Scoring Criteria:**
- **Relevance (30 pts)**: Matches user intent
- **Structure Quality (25 pts)**: Clean HTML, search functionality
- **Content Richness (20 pts)**: Multiple data fields, detail pages
- **Reliability (15 pts)**: Well-known, authoritative
- **Scrapability (10 pts)**: Works with Puppeteer, no heavy anti-bot

**Red Flags (deductions):**
- Requires login (-30 pts)
- Heavy JavaScript/SPA (-20 pts)
- Paywall (-25 pts)
- Anti-bot measures (-20 pts)

### 3. Selection Phase
You're presented with the top 5 candidates:

```
🔍 Found Recipe Source Candidates:

1. The Movie Database (TMDB) ⭐ RECOMMENDED
   https://www.themoviedb.org
   Score: 92/100 | Confidence: 95%
   Popular, user editable database for movies and TV shows
   ✓ Excellent API and clean HTML structure; Comprehensive movie data
   ⚠ Some rate limiting on API; Requires JavaScript for some features

2. IMDb
   https://www.imdb.com
   Score: 85/100 | Confidence: 88%
   World's most popular source for movie content
   ✓ Most comprehensive movie database; Very reliable and authoritative
   ⚠ Amazon ownership may affect access; Some anti-bot measures

[...]

Select a source (1-5, 0 for custom, q to quit):
```

### 4. Generation Phase
Once you select a source, AutoRecipe proceeds with the normal workflow:
- Probes the website
- Classifies content type
- Generates recipes
- Tests and repairs

---

## Usage Examples

### Basic Usage

```bash
# Movies
bun Engine/scripts/autoRecipe.js --prompt="movie database"

# Recipes
bun Engine/scripts/autoRecipe.js --prompt="cooking recipes with ingredients"

# Wine
bun Engine/scripts/autoRecipe.js --prompt="wine ratings and reviews"

# Board Games
bun Engine/scripts/autoRecipe.js --prompt="board game reviews database"
```

### With Flags

```bash
# With debug output
bun Engine/scripts/autoRecipe.js --prompt="anime database" --debug

# Force overwrite existing recipe
bun Engine/scripts/autoRecipe.js --prompt="tv shows" --force

# Both
bun Engine/scripts/autoRecipe.js --prompt="book reviews" --debug --force
```

### Advanced Prompts

Be specific for better results:

```bash
# Good: Specific and descriptive
bun Engine/scripts/autoRecipe.js --prompt="wine ratings by region and vintage"
bun Engine/scripts/autoRecipe.js --prompt="recipe database with cooking times and difficulty"
bun Engine/scripts/autoRecipe.js --prompt="board games with player count and play time"

# Okay: Generic but clear
bun Engine/scripts/autoRecipe.js --prompt="movie database"
bun Engine/scripts/autoRecipe.js --prompt="book reviews"

# Poor: Too vague
bun Engine/scripts/autoRecipe.js --prompt="movies"
bun Engine/scripts/autoRecipe.js --prompt="food"
```

---

## Selection Interface

When presented with candidates, you have several options:

### Select from List
```
Select a source (1-5, 0 for custom, q to quit): 1
```

Enters the number (1-5) to select that candidate.

### Custom URL
```
Select a source (1-5, 0 for custom, q to quit): 0
Enter URL: https://example.com
```

Choose option `0` to enter your own URL.

### Quit
```
Select a source (1-5, 0 for custom, q to quit): q
```

Type `q` to quit without generating a recipe.

---

## Understanding Evaluation Scores

### Score Ranges

- **90-100**: Excellent candidate
  - Clean structure, easy to scrape
  - Well-known and reliable
  - Perfect match for prompt
  
- **75-89**: Good candidate
  - Should work well
  - Might have minor challenges
  - Solid choice
  
- **60-74**: Acceptable candidate
  - Will require more testing
  - May have some limitations
  - Consider alternatives first
  
- **Below 60**: Problematic
  - Significant challenges expected
  - Use only if no better options
  - May require manual intervention

### Confidence Levels

- **0.9-1.0**: Very confident, high likelihood of success
- **0.75-0.89**: Confident, good chance of success
- **0.5-0.74**: Uncertain, results may vary
- **Below 0.5**: Low confidence, expect issues

---

## When to Use Discovery Mode

### ✅ Use Discovery Mode When:

- You know WHAT you want but not WHERE to find it
- You want to compare multiple sources
- You're exploring a new content domain
- You want AI to evaluate website quality for you
- You're not sure which source is best

**Examples:**
- "I need a wine rating site but don't know which one is best"
- "Find me a good recipe website"
- "Which board game database should I use?"

### ❌ Use Direct URL Mode When:

- You already know the exact website URL
- You're creating recipes for a specific required source
- You're updating an existing recipe
- The website is well-known to you

**Examples:**
- "I need to create a recipe for IMDB specifically"
- "The client requested TMDb integration"
- "Updating the Goodreads recipe"

---

## Prompt Engineering Tips

### Be Descriptive

```bash
# Better
--prompt="wine ratings database with vintage and region information"

# vs

# Worse
--prompt="wine"
```

### Include Key Features

```bash
# Includes what data you care about
--prompt="recipe website with ingredients, steps, and cooking times"
```

### Specify Content Type

```bash
# Clear about what you're looking for
--prompt="board game database with player counts and complexity ratings"
```

### Avoid Ambiguity

```bash
# Clear
--prompt="video game reviews and ratings"

# vs

# Ambiguous (games could be board games or video games)
--prompt="game reviews"
```

---

## Technical Details

### Search Implementation

Discovery Mode uses Puppeteer to perform Google searches:

```javascript
async searchWeb(prompt) {
  const searchQuery = `${prompt} database website`;
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
  
  // Launch browser, extract results
  // Filters: No social media, no YouTube, no Google properties
  // Returns: Top 15 results
}
```

### Evaluation Process

Copilot receives:
- User prompt
- Search results (title, URL, description)
- Evaluation criteria (from `discover-sources.md`)

Copilot returns:
```json
{
  "candidates": [
    {
      "url": "https://example.com",
      "title": "Example Database",
      "score": 85,
      "list_type_suggestion": "movies",
      "pros": ["..."],
      "cons": ["..."],
      "confidence": 0.9,
      "reasoning": "..."
    }
  ],
  "top_recommendation": {
    "url": "https://example.com",
    "reason": "..."
  }
}
```

### Prompt File

The evaluation logic is defined in:
```
Engine/scripts/prompts/discover-sources.md
```

This file contains:
- Scoring criteria weights
- Red flag penalties
- Content type mapping
- Output format specification
- Example evaluations

---

## Limitations

### Search Limitations

- Relies on Google Search via Puppeteer
- May miss niche or new websites
- Results vary by geographic location
- Some sites may be filtered out

### Evaluation Limitations

- Copilot evaluates based on descriptions only (no probing yet)
- Cannot detect all anti-scraping measures upfront
- Scores are estimates, not guarantees
- May miss hidden issues (login walls, CAPTCHAs)

### Workflow Limitations

- Still requires user selection (not fully autonomous)
- Search results quality depends on prompt quality
- May suggest sites that ultimately don't work well

---

## Troubleshooting

### No Results Found

**Problem**: "No search results found"

**Causes**:
- Network issues
- Google blocking automated searches
- Too specific prompt

**Solutions**:
- Check internet connection
- Try a more generic prompt
- Use direct URL mode instead

### All Candidates Have Low Scores

**Problem**: All options score below 60

**Causes**:
- Prompt doesn't match well-structured sites
- Niche domain with limited options
- All candidates have anti-scraping

**Solutions**:
- Refine your prompt
- Try entering custom URL (option 0)
- Use direct URL mode if you know a good source

### Selected Site Fails Generation

**Problem**: Site scores high but recipe generation fails

**Causes**:
- Site changed since evaluation
- Hidden anti-scraping not detected
- Complex JavaScript rendering

**Solutions**:
- Try another candidate from the list
- Use debug mode to see what's failing
- Use debug tools to inspect the site manually

---

## Comparison with Direct URL Mode

| Feature | Discovery Mode | Direct URL Mode |
|---------|---------------|-----------------|
| **Input Required** | Natural language prompt | Exact URL |
| **Source Selection** | Automatic discovery + user choice | Predetermined |
| **Evaluation** | Copilot scores candidates | No evaluation |
| **Time to Start** | +1-2 min (search + selection) | Immediate |
| **Best For** | Exploration, comparison | Known sources |
| **User Involvement** | Interactive selection | None (unless errors) |

---

## Future Enhancements

Planned improvements for Discovery Mode:

### v21.1
- [ ] Probe candidates before showing them (better accuracy)
- [ ] Show preview screenshots
- [ ] Remember user's previous selections
- [ ] Cache search results for re-use

### v21.2
- [ ] Auto-select if top candidate score > 95
- [ ] Support for multiple search engines
- [ ] Better filtering of low-quality sites
- [ ] Domain reputation checking

### v22
- [ ] Discover and evaluate APIs in addition to websites
- [ ] Compare multiple sources side-by-side
- [ ] Generate recipes for top 3 candidates automatically
- [ ] Learning from past successes/failures

---

## Contributing

### Improving Evaluation Criteria

Edit `Engine/scripts/prompts/discover-sources.md`:
- Adjust scoring weights
- Add new red flags
- Update content type mappings
- Add example evaluations

### Improving Search

Edit the `searchWeb()` method in `autoRecipe.js`:
- Add more filters
- Try different search engines
- Extract better metadata
- Improve result parsing

### Testing

Test Discovery Mode with various prompts:
```bash
# Test different content types
bun Engine/scripts/autoRecipe.js --prompt="movies" --debug
bun Engine/scripts/autoRecipe.js --prompt="recipes" --debug

# Test quality of evaluations
# Check if high-scoring candidates work well
# Check if low-scoring candidates fail as expected
```

---

## Related Documentation

- **Complete Guide**: `Engine/docs/DEVELOPMENT_GUIDE.md`
- **Quick Reference**: `Engine/docs/SUMMARY.md`
- **Prompt File**: `Engine/scripts/prompts/discover-sources.md`
- **AutoRecipe Source**: `Engine/scripts/autoRecipe.js` (SourceDiscovery class)

---

## Examples Gallery

### Successful Discovery Prompts

```bash
# Movies - Found TMDb (score: 92)
bun Engine/scripts/autoRecipe.js --prompt="movie database with ratings"

# Recipes - Found AllRecipes (score: 88)
bun Engine/scripts/autoRecipe.js --prompt="recipe website with ingredients and steps"

# Wine - Found Vivino (score: 85)
bun Engine/scripts/autoRecipe.js --prompt="wine ratings by vintage"

# Board Games - Found BoardGameGeek (score: 94)
bun Engine/scripts/autoRecipe.js --prompt="board game database with player counts"

# Books - Found Goodreads (score: 90)
bun Engine/scripts/autoRecipe.js --prompt="book reviews and ratings"
```

---

**Version**: 1.0
**Added In**: Engine v21
**Status**: ✅ Production Ready
**Last Updated**: January 2024
