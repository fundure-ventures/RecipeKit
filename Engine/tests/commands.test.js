import { expect, test, describe, beforeEach, spyOn } from "bun:test";
import { Log } from '../src/logger.js';

Log.setDebug(false);

// Suppress Log.error output during tests that deliberately trigger error paths
function silenceErrors(fn) {
  return async () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try { await fn(); } finally { spy.mockRestore(); }
  };
}

import { mock } from "bun:test";

mock.module('../src/browser.js', () => ({
  BrowserManager: class MockBrowserManager {
    constructor() { this.page = null; }
    async initialize() {}
    async close() {}
    async setUserAgent() {}
    async setExtraHTTPHeaders() {}
    async loadPage() {}
    async querySelector() { return null; }
    async countElements() { return 0; }
    async setCookies() {}
  }
}));

const { RecipeEngine } = await import('../src/recipe.js');
const { StepExecutor } = await import('../src/commands.js');

function createExecutor() {
  const engine = new RecipeEngine();
  const executor = new StepExecutor(engine.browserManager, engine);
  return { engine, executor };
}

// ============================================================
// executeRegexStep — real patterns from across 27 recipes
// ============================================================
describe("StepExecutor — executeRegexStep", () => {

  // From movies/tmdb.json — lookbehind/lookahead to extract year from "The Matrix (1999)"
  test("extracts year with lookbehind/lookahead (tmdb)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("TITLE", "The Matrix (1999)");

    const result = await executor.executeRegexStep({
      command: "regex", input: "$TITLE",
      expression: "(?<=\\()\\d\\d\\d\\d(?=\\))",
      output: { name: "DATE" }
    });
    expect(result).toBe("1999");
  });

  // From movies/tmdb.json — extract title before parenthesized year
  test("extracts title before parenthesis (tmdb)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("TITLE", "The Matrix (1999)");

    const result = await executor.executeRegexStep({
      command: "regex", input: "$TITLE",
      expression: "[^\\(]*",
      output: { name: "TITLE" }
    });
    expect(result).toBe("The Matrix");
  });

  // From movies/imdbgraphql.json — simple capture group
  test("extracts IMDB ID with capture group (imdbgraphql)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("INPUT", "https://m.imdb.com/title/tt0133093/");

    const result = await executor.executeRegexStep({
      command: "regex", input: "$INPUT",
      expression: "(tt\\d+)",
      output: { name: "ID" }
    });
    expect(result).toBe("tt0133093");
  });

  // From beers/untappd.json — lazy match before comma
  test("lazy match before comma (untappd)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("TITLE1", "Punk IPA, Craft Beer");

    const result = await executor.executeRegexStep({
      command: "regex", input: "$TITLE1",
      expression: ".+?(?=\\,|$)",
      output: { name: "TITLE1" }
    });
    expect(result).toBe("Punk IPA");
  });

  // From artists/apple.json — alternation with multiple capture groups
  test("extracts ID from Apple URL with alternation (apple)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("INPUT", "https://music.apple.com/us/artist/nirvana/112018");

    const result = await executor.executeRegexStep({
      command: "regex", input: "$INPUT",
      expression: "/([0-9]+)(?:\\?|$)|id([0-9]+)(?=\\?|/|$)|term=([0-9]+)(?=&|$)",
      output: { name: "ID" }
    });
    expect(result).toBe("112018");
  });

  // From generic/generic.json — extract domain from URL
  test("extracts domain from URL (generic)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("URL", "https://www.example.com/path?q=1");

    const result = await executor.executeRegexStep({
      command: "regex", input: "$URL",
      expression: "(?:https?:\\/\\/)?(?:[^@\\/\\n]+@)?(?:www\\.)?([^:\\/?\\n]+)",
      output: { name: "FAVICON" }
    });
    expect(result).toBe("example.com");
  });

  // From tv_shows/tmdb.json — extract number after bullet
  test("extracts episodes after bullet (tv_shows/tmdb)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("SEASON_META_RAW1", "64% 2025 • 7 episodios");

    const result = await executor.executeRegexStep({
      command: "regex", input: "$SEASON_META_RAW1",
      expression: "(?:•|·)\\s*(\\d+)\\b",
      output: { name: "SEASON_EPISODES1" }
    });
    expect(result).toBe("7");
  });

  // From wines/vivino.json — extract URL from CSS background-image
  test("extracts URL from CSS url() (vivino)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("COVER1", "url(\"https://images.vivino.com/wine.jpg\")");

    const result = await executor.executeRegexStep({
      command: "regex", input: "$COVER1",
      expression: "url\\([\"']((?:https?:)?//[^\"']+)[\"']\\)",
      output: { name: "COVER1" }
    });
    expect(result).toBe("https://images.vivino.com/wine.jpg");
  });

  // From tv_shows/tmdb.json — strip query params
  test("strips query params from URL (tv_shows/tmdb)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("URL", "https://www.themoviedb.org/tv/1396?language=es");

    const result = await executor.executeRegexStep({
      command: "regex", input: "$URL",
      expression: "^[^?]+(?=\\?|$)",
      output: { name: "CLEAN_URL" }
    });
    expect(result).toBe("https://www.themoviedb.org/tv/1396");
  });

  // No-match fallback: returns original input
  test("returns input when no match found", async () => {
    const { engine, executor } = createExecutor();
    engine.set("INPUT", "no-numbers-here");

    const result = await executor.executeRegexStep({
      command: "regex", input: "$INPUT",
      expression: "(\\d+)",
      output: { name: "NUM" }
    });
    expect(result).toBe("no-numbers-here");
  });

  // Missing required properties
  test("returns empty string when input missing", silenceErrors(async () => {
    const { executor } = createExecutor();
    const result = await executor.executeRegexStep({
      command: "regex",
      expression: "(\\d+)",
      output: { name: "NUM" }
    });
    expect(result).toBe("");
  }));

  test("returns empty string when expression missing", silenceErrors(async () => {
    const { engine, executor } = createExecutor();
    engine.set("INPUT", "test");
    const result = await executor.executeRegexStep({
      command: "regex", input: "$INPUT",
      output: { name: "NUM" }
    });
    expect(result).toBe("");
  }));
});

// ============================================================
// executeStoreStep — from multiple recipes
// ============================================================
describe("StepExecutor — executeStoreStep", () => {

  // From movies/tmdb.json — compose full URL from relative path
  test("composes URL with variable (tmdb)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("URL1", "/movie/603-the-matrix");

    const result = await executor.executeStoreStep({
      command: "store", input: "https://www.themoviedb.org$URL1",
      output: { name: "URL1" }
    });
    expect(result).toBe("https://www.themoviedb.org/movie/603-the-matrix");
  });

  // From movies/tmdb.json — compose rating from split digits
  test("composes rating from parts (tmdb)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("AUX_RATING_UNITS", "7");
    engine.set("AUX_RATING_DEC", "3");

    const result = await executor.executeStoreStep({
      command: "store", input: "$AUX_RATING_UNITS.$AUX_RATING_DEC",
      output: { name: "RATING" }
    });
    expect(result).toBe("7.3");
  });

  // From boardgames/boardgamegeek.json — append unit suffix
  test("appends unit suffix (boardgamegeek)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("TIME", "45");

    const result = await executor.executeStoreStep({
      command: "store", input: "$TIME min",
      output: { name: "TIME" }
    });
    expect(result).toBe("45 min");
  });

  // From boardgames/boardgamegeek.json — compose range
  test("composes player range (boardgamegeek)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("PLAYERS_MIN", "2");
    engine.set("PLAYERS_MAX", "4");

    const result = await executor.executeStoreStep({
      command: "store", input: "$PLAYERS_MIN - $PLAYERS_MAX",
      output: { name: "PLAYERS" }
    });
    expect(result).toBe("2 - 4");
  });

  // From wines/vivino.json — prepend protocol
  test("prepends protocol (vivino)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("COVER", "//images.vivino.com/wine.jpg");

    const result = await executor.executeStoreStep({
      command: "store", input: "https:$COVER",
      output: { name: "COVER" }
    });
    expect(result).toBe("https://images.vivino.com/wine.jpg");
  });

  // From wines/vivino.json — combine country and place
  test("combines country and place (vivino)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("COUNTRY", "Spain");
    engine.set("PLACE", "Rioja");

    const result = await executor.executeStoreStep({
      command: "store", input: "$COUNTRY, $PLACE",
      output: { name: "REGION" }
    });
    expect(result).toBe("Spain, Rioja");
  });

  // Missing input
  test("returns empty string when input missing", silenceErrors(async () => {
    const { executor } = createExecutor();
    const result = await executor.executeStoreStep({
      command: "store",
      output: { name: "X" }
    });
    expect(result).toBe("");
  }));
});

// ============================================================
// executeJsonStoreTextStep — from apple, openfoodfacts, imdbgraphql, goodreads
// ============================================================
describe("StepExecutor — executeJsonStoreTextStep", () => {

  // From food/openfoodfacts.json — simple dot path
  test("extracts with simple dot path (openfoodfacts)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("JSON", {
      product: {
        brands: "Ferrero",
        categories: "Spreads, Chocolate spreads",
        nutriscore_grade: "e"
      }
    });

    const result = await executor.executeJsonStoreTextStep({
      command: "json_store_text", locator: "product.brands",
      input: "$JSON", output: { name: "BRAND" }
    });
    expect(result).toBe("Ferrero");
  });

  // From albums/apple.json — array index with bracket notation
  test("extracts from array with bracket notation (apple)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("i", 0);
    engine.set("JSON", {
      results: [
        { collectionName: "Nevermind", artistName: "Nirvana" },
        { collectionName: "In Utero", artistName: "Nirvana" }
      ]
    });

    const result = await executor.executeJsonStoreTextStep({
      command: "json_store_text",
      locator: "results.[0].collectionName",
      input: "$JSON", output: { name: "TITLE0" }
    });
    expect(result).toBe("Nevermind");
  });

  // From books/goodreads.json — root-level array
  test("extracts from root-level array (goodreads)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("JSON", [
      { title: "The Hobbit", author: { name: "J.R.R. Tolkien" }, bookUrl: "/book/show/5907" },
      { title: "The Lord of the Rings", author: { name: "J.R.R. Tolkien" }, bookUrl: "/book/show/33" }
    ]);

    const result = await executor.executeJsonStoreTextStep({
      command: "json_store_text", locator: "[0].title",
      input: "$JSON", output: { name: "TITLE0" }
    });
    expect(result).toBe("The Hobbit");
  });

  // From books/goodreads.json — nested object inside array
  test("extracts nested object from array (goodreads)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("JSON", [
      { title: "The Hobbit", author: { name: "J.R.R. Tolkien" } }
    ]);

    const result = await executor.executeJsonStoreTextStep({
      command: "json_store_text", locator: "[0].author.name",
      input: "$JSON", output: { name: "SUBTITLE0" }
    });
    expect(result).toBe("J.R.R. Tolkien");
  });

  // From movies/imdbgraphql.json — deeply nested GraphQL response
  test("extracts from deeply nested GraphQL path (imdbgraphql)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("JSON", {
      data: {
        title: {
          titleText: { text: "The Matrix" },
          credits: { edges: [{ node: { name: { nameText: { text: "Lana Wachowski" } } } }] }
        }
      }
    });

    const result = await executor.executeJsonStoreTextStep({
      command: "json_store_text",
      locator: "data.title.credits.edges.[0].node.name.nameText.text",
      input: "$JSON", output: { name: "AUTHOR" }
    });
    expect(result).toBe("Lana Wachowski");
  });

  // Non-string value (numeric rating)
  test("extracts numeric value (imdbgraphql)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("JSON", {
      data: { title: { ratingsSummary: { aggregateRating: 8.7 } } }
    });

    const result = await executor.executeJsonStoreTextStep({
      command: "json_store_text",
      locator: "data.title.ratingsSummary.aggregateRating",
      input: "$JSON", output: { name: "RATING" }
    });
    expect(result).toBe(8.7);
  });

  // Missing path returns undefined
  test("returns undefined for missing path", async () => {
    const { engine, executor } = createExecutor();
    engine.set("JSON", { product: {} });

    const result = await executor.executeJsonStoreTextStep({
      command: "json_store_text", locator: "product.nonexistent.deep",
      input: "$JSON", output: { name: "X" }
    });
    expect(result).toBeUndefined();
  });

  // Missing required properties
  test("returns empty string when input missing", silenceErrors(async () => {
    const { executor } = createExecutor();
    const result = await executor.executeJsonStoreTextStep({
      command: "json_store_text", locator: "some.path",
      output: { name: "X" }
    });
    expect(result).toBe("");
  }));
});

// ============================================================
// executeUrlEncodeStep — from artists/apple, restaurants/tripadvisor
// ============================================================
describe("StepExecutor — executeUrlEncodeStep", () => {

  // From artists/apple.json
  test("encodes artist name (apple)", async () => {
    const { executor } = createExecutor();
    const result = await executor.executeUrlEncodeStep({
      command: "url_encode", input: "Guns N' Roses",
      output: { name: "AUX_AUTHOR" }
    });
    expect(result).toBe("Guns%20N'%20Roses");
  });

  test("encodes special characters", async () => {
    const { executor } = createExecutor();
    const result = await executor.executeUrlEncodeStep({
      command: "url_encode", input: "café & résumé",
      output: { name: "ENCODED" }
    });
    expect(result).toBe(encodeURIComponent("café & résumé"));
  });

  test("returns empty string when input missing", silenceErrors(async () => {
    const { executor } = createExecutor();
    const result = await executor.executeUrlEncodeStep({
      command: "url_encode",
      output: { name: "X" }
    });
    expect(result).toBe("");
  }));
});

// ============================================================
// executeReplaceStep — from recipes/cookpad
// ============================================================
describe("StepExecutor — executeReplaceStep", () => {

  // From recipes/cookpad.json — replace region code
  test("replaces region code gb→uk (cookpad)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("SYSTEM_REGION", "gb");

    const result = await executor.executeReplaceStep({
      command: "replace", input: "$SYSTEM_REGION",
      find: "gb", replace: "uk",
      output: { name: "SYSTEM_REGION" }
    });
    expect(result).toBe("uk");
  });

  test("replaces all occurrences", async () => {
    const { engine, executor } = createExecutor();
    engine.set("TEXT", "ab-ab-ab");

    const result = await executor.executeReplaceStep({
      command: "replace", input: "$TEXT",
      find: "ab", replace: "xy",
      output: { name: "TEXT" }
    });
    expect(result).toBe("xy-xy-xy");
  });

  test("handles special regex characters in find string", async () => {
    const { engine, executor } = createExecutor();
    engine.set("TEXT", "price: $10.99");

    const result = await executor.executeReplaceStep({
      command: "replace", input: "$TEXT",
      find: "$10.99", replace: "€10.99",
      output: { name: "TEXT" }
    });
    expect(result).toBe("price: €10.99");
  });

  test("returns empty string when input missing", silenceErrors(async () => {
    const { executor } = createExecutor();
    const result = await executor.executeReplaceStep({
      command: "replace", find: "a", replace: "b",
      output: { name: "X" }
    });
    expect(result).toBe("");
  }));
});

// ============================================================
// execute() — loop iteration logic
// ============================================================
describe("StepExecutor — execute() loop", () => {

  // From movies/tmdb.json — looped store step, 1-based
  // In the real engine, replaceVariablesinString iterates variables in insertion order.
  // The loop index 'i' is set by execute() before calling the handler, so it must be
  // inserted BEFORE the dependent variables (URL1, etc.) for $i to be replaced first.
  test("executes loop with store command (tmdb pattern)", async () => {
    const { engine, executor } = createExecutor();
    // Set loop index first to ensure insertion order puts 'i' before URL1
    engine.set("i", 0);
    engine.set("URL1", "/movie/603");
    engine.set("URL2", "/movie/604");
    engine.set("URL3", "/movie/605");

    await executor.execute({
      command: "store",
      input: "https://www.themoviedb.org$URL$i",
      output: { name: "URL$i" },
      config: { loop: { index: "i", from: 1, to: 3, step: 1 } }
    });

    expect(engine.get("URL1")).toBe("https://www.themoviedb.org/movie/603");
    expect(engine.get("URL2")).toBe("https://www.themoviedb.org/movie/604");
    expect(engine.get("URL3")).toBe("https://www.themoviedb.org/movie/605");
  });

  // From albums/apple.json — 0-based loop
  test("executes 0-based loop (apple pattern)", async () => {
    const { engine, executor } = createExecutor();
    engine.set("i", 0);
    engine.set("YEAR0", "1991");
    engine.set("YEAR1", "1993");

    await executor.execute({
      command: "store",
      input: "$YEAR$i",
      output: { name: "SUBTITLE$i" },
      config: { loop: { index: "i", from: 0, to: 1, step: 1 } }
    });

    expect(engine.get("SUBTITLE0")).toBe("1991");
    expect(engine.get("SUBTITLE1")).toBe("1993");
  });

  // Unknown command
  test("handles unknown command gracefully", silenceErrors(async () => {
    const { executor } = createExecutor();
    await executor.execute({
      command: "nonexistent_command",
      output: { name: "X" }
    });
    // Should not throw
  }));

  // Step without output
  test("handles step without output", async () => {
    const { engine, executor } = createExecutor();
    engine.set("INPUT", "test");
    await executor.execute({
      command: "store",
      input: "$INPUT"
    });
    // Should not throw
  });
});

// ============================================================
// executeStoreCountStep — from tv_shows/tmdb
// ============================================================
describe("StepExecutor — executeStoreCountStep", () => {

  test("returns count from BrowserManager (tv_shows/tmdb)", async () => {
    const engine = new RecipeEngine();
    // Override countElements to return a specific count
    engine.browserManager.countElements = async () => 5;
    const executor = new StepExecutor(engine.browserManager, engine);

    const result = await executor.executeStoreCountStep({
      command: "store_count",
      locator: "div.season_wrapper",
      output: { name: "NUMBER_OF_SEASONS", type: "int", show: false }
    });
    expect(result).toBe("5");
  });

  test("returns empty string when locator missing", silenceErrors(async () => {
    const { executor } = createExecutor();
    const result = await executor.executeStoreCountStep({
      command: "store_count",
      output: { name: "X" }
    });
    expect(result).toBe("");
  }));
});
