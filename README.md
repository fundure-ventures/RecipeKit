<a href="https://listy.is">
    <img src="https://listy.is/shared/app-icon.png" alt="Listy logo" title="Listy" align="right" height="48"/>
</a>

# Listy's RecipeKit

Listy is a mobile app that allows you to keep track of your favorite things in a private and organized manner. Create lists to store your favorite movies, books, TV shows, video games, wines, and more—all in one place.

<p float="center">
<a href="https://listy.is/download/ios"><img src="https://listy.is/index/badge-appstore.png" height="48"></a>
<a href="https://listy.is/download/android"><img src="https://listy.is/index/badge-googleplay.png" height="48"></a>
</p>

This repository contains **recipes**—JSON configuration files that enable Listy to extract information from websites. Recipes are open source, allowing anyone to contribute new content providers.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Recipe Structure](#recipe-structure)
3. [Commands Reference](#commands-reference)
4. [Output Fields](#output-fields)
5. [Content Types](#content-types)
6. [Variables & Loops](#variables--loops)
7. [Engine Usage](#engine-usage)
8. [Contributing](#contributing)

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.0 or later
- VPN recommended (engine runs against US region by default)

### Installation

```bash
git clone https://github.com/listy-is/RecipeKit
cd listy-recipekit/Engine
bun install
```

### Run a Recipe

```bash
# Search (autocomplete)
bun run ./Engine/engine.js --recipe ./movies/tmdb.json --type autocomplete --input "Inception"

# Get details from URL
bun run ./Engine/engine.js --recipe ./movies/tmdb.json --type url --input "https://www.themoviedb.org/movie/27205"

# Debug mode (visible browser)
bun run ./Engine/engine.js --recipe ./movies/tmdb.json --type autocomplete --input "Inception" --debug
```

---

## Recipe Structure

A recipe is a JSON file with these properties:

```json
{
  "recipe_shortcut": "imdb_movies",
  "list_type": "movies",
  "engine_version": 20,
  "title": "IMDB Movies",
  "description": "Extract movie information from IMDB",
  "urls": [
    "https://www.imdb.com/title/",
    "https://m.imdb.com/title/"
  ],
  "headers": {
    "Accept-Language": "en-UK,en",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36"
  },
  "autocomplete_steps": [...],
  "url_steps": [...]
}
```

### Property Reference

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `recipe_shortcut` | string | Yes | Unique identifier (e.g., `imdb_movies`) |
| `list_type` | string | Yes | Content category (see [Content Types](#content-types)) |
| `engine_version` | integer | Yes | Minimum engine version required (current: 20) |
| `title` | string | Yes | Human-readable recipe name |
| `description` | string | Yes | Brief description of what the recipe does |
| `urls` | string[] | Yes | URL patterns this recipe can handle |
| `headers` | object | No | HTTP headers for requests |
| `autocomplete_steps` | array | No | Steps for search functionality |
| `url_steps` | array | No | Steps for extracting details from a URL |
| `languages_available` | string[] | No | Supported language codes |
| `regions_available` | string[] | No | Supported region codes |
| `language_default` | string | No | Fallback language |
| `region_default` | string | No | Fallback region |

---

## Commands Reference

Commands are executed sequentially. Each command can have:
- `command`: The command type (required)
- `description`: Human-readable explanation (optional but recommended)
- `output`: Where to store the result
- `config`: Additional configuration

### Load Commands

#### `load` - Navigate to URL

Loads a webpage in a headless browser.

```json
{
  "command": "load",
  "url": "https://example.com/search?q=$INPUT",
  "config": {
    "js": true,
    "timeout": 5000,
    "headers": {
      "Cookie": "session=abc123"
    }
  },
  "description": "Load search results page"
}
```

| Config Option | Type | Default | Description |
|---------------|------|---------|-------------|
| `js` | boolean | false | Wait for JavaScript to execute |
| `timeout` | integer | 30000 | Timeout in milliseconds |
| `headers` | object | null | Custom HTTP headers |

#### `api_request` - Fetch JSON from API

Makes an HTTP request and stores the JSON response.

```json
{
  "command": "api_request",
  "url": "https://api.example.com/search?q=$INPUT",
  "config": {
    "method": "GET",
    "headers": {
      "Authorization": "Bearer token123"
    }
  },
  "output": {
    "name": "JSON"
  },
  "description": "Fetch search results from API"
}
```

### Store Commands

#### `store` - Save/Transform Text

Saves a text value, with variable substitution.

```json
{
  "command": "store",
  "input": "https://example.com$URL$i",
  "output": {
    "name": "URL$i"
  },
  "description": "Make relative URL absolute"
}
```

**Use cases:**
- Prepend base URL to relative paths
- Combine text values
- Set static values

#### `store_text` - Extract Text from Element

Extracts the text content from a DOM element.

```json
{
  "command": "store_text",
  "locator": ".result-item:nth-child($i) h2",
  "output": {
    "name": "TITLE$i",
    "type": "string",
    "show": true
  },
  "description": "Extract result title"
}
```

**Note:** Uses `textContent.trim()`. Does NOT work on `<meta>` tags—use `store_attribute` instead.

#### `store_attribute` - Extract Element Attribute

Extracts an attribute value from a DOM element.

```json
{
  "command": "store_attribute",
  "locator": ".result-item:nth-child($i) a",
  "attribute_name": "href",
  "output": {
    "name": "URL$i"
  },
  "description": "Extract result URL"
}
```

**Common attributes:** `href`, `src`, `content`, `data-*`, `style`

#### `store_array` - Collect Multiple Values into Array

Stores each matched value into an array (useful with loops).

```json
{
  "command": "store_array",
  "locator": ".tag-item:nth-child($i)",
  "output": {
    "name": "TAGS"
  },
  "config": {
    "loop": { "index": "i", "from": 1, "to": 10, "step": 1 }
  },
  "description": "Collect all tags"
}
```

#### `store_url` - Save Current Page URL

Stores the current browser URL (useful after redirects).

```json
{
  "command": "store_url",
  "output": {
    "name": "URL"
  },
  "description": "Save the final URL after redirects"
}
```

#### `json_store_text` - Extract from JSON

Extracts a value from a JSON object using dot notation.

```json
{
  "command": "json_store_text",
  "input": "$JSON",
  "locator": "results.[$i].title",
  "output": {
    "name": "TITLE$i"
  },
  "description": "Extract title from JSON response"
}
```

**Locator syntax:**
- `property.nested` - Access nested properties
- `array.[0]` - Access array index (0-based)
- `results.[$i].name` - Use loop variable for index

### Transform Commands

#### `regex` - Apply Regular Expression

Applies a regex pattern and stores the first capture group (or full match).

```json
{
  "command": "regex",
  "input": "$TITLE",
  "expression": "([\\d.]+)/10",
  "output": {
    "name": "RATING",
    "type": "float",
    "show": true
  },
  "description": "Extract numeric rating"
}
```

**Important:**
- Escape backslashes in JSON: `\\d` not `\d`
- Returns first capture group if present, otherwise full match
- Returns original input if no match

#### `replace` - String Replacement

Replaces text occurrences in a string.

```json
{
  "command": "replace",
  "input": "$TITLE",
  "find": " - Wikipedia",
  "replace": "",
  "output": {
    "name": "TITLE"
  },
  "description": "Remove Wikipedia suffix"
}
```

#### `url_encode` - URL Encode String

URL-encodes a string for use in URLs.

```json
{
  "command": "url_encode",
  "input": "$SEARCH_TERM",
  "output": {
    "name": "ENCODED_TERM"
  },
  "description": "Encode search term for URL"
}
```

---

## Output Fields

### Output Object Structure

```json
{
  "output": {
    "name": "FIELD_NAME",
    "type": "string",
    "format": "YYYY",
    "show": true
  }
}
```

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Variable name to store the value |
| `type` | string | Data type: `string`, `float`, `integer`, `date` |
| `format` | string | Date format (e.g., `YYYY` for year only) |
| `show` | boolean | Whether to include in final output |

### Standard Field Names

#### Autocomplete Results (indexed with `$i`)

| Field | Required | Description |
|-------|----------|-------------|
| `TITLE$i` | **Yes** | Result title |
| `URL$i` | **Yes** | Link to detail page (must be absolute) |
| `COVER$i` | **Yes** | Thumbnail image URL |
| `SUBTITLE$i` | No | Secondary info (year, author, etc.) |

#### URL Details (single item)

| Field | Description | Example |
|-------|-------------|---------|
| `TITLE` | Item title | "Inception" |
| `DESCRIPTION` | Full description | "A thief who steals..." |
| `COVER` | Main image URL | "https://..." |
| `RATING` | Numeric rating | 8.8 |
| `DATE` | Release/publish date | "2010" |
| `AUTHOR` | Creator/director/artist | "Christopher Nolan" |
| `TIME` | Duration | "148 min" |
| `TAGS` | Categories/genres (array) | ["Action", "Sci-Fi"] |
| `PRICE` | Price | "$9.99" |
| `URL` | Canonical URL | "https://..." |
| `URL_SALE` | Purchase link | "https://..." |
| `FAVICON` | Site favicon | "https://..." |
| `LATITUDE` | Location latitude | 40.7128 |
| `LONGITUDE` | Location longitude | -74.0060 |

#### Content-Specific Fields

| Field | Used In | Description |
|-------|---------|-------------|
| `GENRE` | movies, tv_shows | Genre classification |
| `EPISODES` | tv_shows, anime | Number of episodes |
| `PAGES` | books, manga | Page count |
| `VOLUMES` | manga | Number of volumes |
| `WINERY` | wines | Winery name |
| `REGION` | wines, beers | Geographic region |
| `VINTAGE` | wines | Wine vintage year |
| `ALCOHOL` | beers, wines | Alcohol percentage |
| `STYLE` | beers | Beer style |
| `INGREDIENTS` | recipes, food | Ingredient list |
| `ORIGINAL_TITLE` | movies, anime | Original language title |
| `ICON` | software | App icon |

---

## Content Types

Recipes must specify a `list_type` that matches one of these categories:

| Type | Folder | Description | Example Sources |
|------|--------|-------------|-----------------|
| `movies` | movies/ | Films | IMDB, TMDB |
| `tv_shows` | tv_shows/ | Television series | IMDB, TMDB |
| `books` | books/ | Books | Goodreads |
| `anime` | anime/ | Anime series | AniDB, AniSearch |
| `manga` | manga/ | Manga series | AniSearch |
| `videogames` | videogames/ | Video games | IMDB |
| `boardgames` | boardgames/ | Board games | BoardGameGeek |
| `albums` | albums/ | Music albums | Apple Music |
| `songs` | songs/ | Individual songs | Apple Music |
| `artists` | artists/ | Music artists | Apple Music |
| `podcasts` | podcasts/ | Podcasts | Apple Podcasts |
| `software` | software/ | Apps/software | App Store, Play Store |
| `wines` | wines/ | Wines | Vivino |
| `beers` | beers/ | Beers | Untappd, RateBeer |
| `restaurants` | restaurants/ | Restaurants | TripAdvisor |
| `recipes` | recipes/ | Cooking recipes | Cookpad |
| `food` | food/ | Food products | Open Food Facts |
| `generic` | generic/ | Any other content | Amazon, Twitter |

---

## Variables & Loops

### Built-in Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `$INPUT` | User's search query or URL | "Inception" |
| `$SYSTEM_LANGUAGE` | User's language code | "en" |
| `$SYSTEM_REGION` | User's region code | "US" |

### Variable Substitution

Variables are replaced in these contexts:
- `url` field in `load` command
- `url` field in `api_request` command
- `input` field in `store`, `regex`, `replace`, `url_encode` commands
- `locator` field (for loop index `$i` only)
- `headers` values

**⚠️ IMPORTANT:** Variable substitution does NOT work inside `output.name` values. You cannot construct values from multiple variables like `"$VAR1 - $VAR2"`.

### Loop Configuration

Use loops to extract multiple results without repeating commands:

```json
{
  "command": "store_text",
  "locator": ".result:nth-child($i) .title",
  "output": {
    "name": "TITLE$i"
  },
  "config": {
    "loop": {
      "index": "i",
      "from": 1,
      "to": 10,
      "step": 1
    }
  },
  "description": "Extract titles from results 1-10"
}
```

| Property | Description |
|----------|-------------|
| `index` | Loop variable name (use `$i` in locator/output) |
| `from` | Start value (usually 0 or 1) |
| `to` | End value (inclusive) |
| `step` | Increment (usually 1) |

**CSS Selector Note:** `:nth-child()` is 1-indexed, array indices are 0-indexed.

---

## Engine Usage

### Command Line

```bash
bun run ./Engine/engine.js --recipe <path> --type <type> --input <value> [--debug]
```

| Argument | Description |
|----------|-------------|
| `--recipe` | Path to recipe JSON file |
| `--type` | `autocomplete` or `url` |
| `--input` | Search query (autocomplete) or URL (url) |
| `--debug` | Enable visible browser and verbose logging |

### Output Format

**Autocomplete output:**
```json
{
  "results": [
    { "TITLE": "Inception", "URL": "https://...", "SUBTITLE": "2010", "COVER": "https://..." },
    { "TITLE": "Interstellar", "URL": "https://...", "SUBTITLE": "2014", "COVER": "https://..." }
  ]
}
```

**URL output:**
```json
{
  "results": {
    "TITLE": "Inception",
    "DESCRIPTION": "A thief who steals corporate secrets...",
    "DATE": "2010",
    "RATING": 8.8,
    "COVER": "https://..."
  }
}
```

### Environment Variables

Create `Engine/.env`:

```env
SYSTEM_LANGUAGE=en
SYSTEM_REGION=US
DEFAULT_PAGE_LOAD_TIMEOUT=30000
MIN_PAGE_LOAD_TIMEOUT=1000
DEFAULT_USER_AGENT=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
```

---

## Contributing

### Creating a New Recipe

1. Identify the content type and target website
2. Create a JSON file in the appropriate folder: `{type}/{source}.json`
3. Implement `autocomplete_steps` for search functionality
4. Implement `url_steps` for detail page extraction
5. Test with the engine CLI
6. Submit a pull request

### Recipe Checklist

- [ ] `recipe_shortcut` is unique and descriptive
- [ ] `list_type` matches the folder name
- [ ] `engine_version` is set to current (20)
- [ ] `urls` array contains all URL patterns
- [ ] `autocomplete_steps` returns `TITLE$i` and `URL$i` (required)
- [ ] `url_steps` sets `show: true` on fields to display
- [ ] All URLs are absolute (not relative)
- [ ] Tested with `--debug` flag

### Testing

```bash
# Run all tests
bun test

# Run tests for specific content type
bun test movies/

# Run specific test file
bun test movies/movies.test.js
```

### Common Patterns

**Handle relative URLs:**
```json
{
  "command": "store_attribute",
  "locator": ".result a",
  "attribute_name": "href",
  "output": { "name": "REL_URL$i" }
},
{
  "command": "store",
  "input": "https://example.com$REL_URL$i",
  "output": { "name": "URL$i" }
}
```

**Extract from meta tags:**
```json
{
  "command": "store_attribute",
  "locator": "meta[property='og:title']",
  "attribute_name": "content",
  "output": { "name": "TITLE" }
}
```

**Clean up extracted text:**
```json
{
  "command": "regex",
  "input": "$TITLE",
  "expression": "^(.+?)\\s*\\|.*$",
  "output": { "name": "TITLE" },
  "description": "Remove site name suffix"
}
```

**Extract from JSON-LD:**
```json
{
  "command": "store_text",
  "locator": "script[type='application/ld+json']",
  "output": { "name": "JSON_LD" }
},
{
  "command": "json_store_text",
  "input": "$JSON_LD",
  "locator": "name",
  "output": { "name": "TITLE" }
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No results returned | Check selectors with browser DevTools; enable `--debug` |
| JavaScript not loading | Set `config.js: true` and increase `timeout` |
| Wrong encoding | Check `Accept-Language` header |
| Blocked requests | Update `User-Agent` header |
| Relative URLs | Add a `store` step to prepend base URL |
| Empty text fields | Selector may target wrong element; use `store_attribute` for meta tags |

---

## License

See [LICENSE](LICENSE) file.
