import { expect, test, describe, beforeEach } from "bun:test";
import { Log } from '../src/logger.js';

// Suppress debug logging during tests
Log.setDebug(false);

// RecipeEngine imports BrowserManager which needs puppeteer.
// We mock the browser module to avoid launching a real browser.
// We need to mock before importing recipe.js.
import { mock } from "bun:test";

// Mock the browser module
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

describe("RecipeEngine — variable management", () => {
  let engine;

  beforeEach(() => {
    engine = new RecipeEngine();
  });

  test("set() and get() store and retrieve values", () => {
    engine.set("TITLE", "The Matrix");
    expect(engine.get("TITLE")).toBe("The Matrix");
  });

  test("get() strips leading $ from key", () => {
    engine.set("TITLE", "The Matrix");
    expect(engine.get("$TITLE")).toBe("The Matrix");
  });

  test("get() returns defaultValue when key not found", () => {
    expect(engine.get("NONEXISTENT", "fallback")).toBe("fallback");
  });

  test("get() falls back to process.env", () => {
    process.env.TEST_ENGINE_VAR = "from_env";
    expect(engine.get("TEST_ENGINE_VAR")).toBe("from_env");
    delete process.env.TEST_ENGINE_VAR;
  });

  test("get() priority: variables > env > default", () => {
    process.env.TEST_PRIORITY = "env_value";
    engine.set("TEST_PRIORITY", "var_value");
    expect(engine.get("TEST_PRIORITY")).toBe("var_value");
    delete process.env.TEST_PRIORITY;
  });

  test("push() accumulates values in an array", () => {
    engine.push("INGREDIENTS", "flour");
    engine.push("INGREDIENTS", "sugar");
    engine.push("INGREDIENTS", "eggs");
    expect(engine.get("INGREDIENTS")).toEqual(["flour", "sugar", "eggs"]);
  });

  test("push() initializes array on first call", () => {
    engine.push("NEWARRAY", "first");
    expect(engine.get("NEWARRAY")).toEqual(["first"]);
  });

  test("getAllVariables() returns full state", () => {
    engine.set("A", "1");
    engine.set("B", "2");
    const vars = engine.getAllVariables();
    expect(vars.A).toBe("1");
    expect(vars.B).toBe("2");
    expect(vars.INPUT).toBe("");
  });

  test("setInput() stores value and strips backslashes", () => {
    engine.setInput("test\\value\\here");
    expect(engine.get("INPUT")).toBe("testvaluehere");
  });

  test("setInput() handles input without backslashes", () => {
    engine.setInput("The Matrix");
    expect(engine.get("INPUT")).toBe("The Matrix");
  });
});

describe("RecipeEngine — cleanVariableValue", () => {
  let engine;

  beforeEach(() => {
    engine = new RecipeEngine();
  });

  test("set() cleans whitespace from string values", () => {
    engine.set("TITLE", "  The   Matrix  \n\t  Reloaded  ");
    expect(engine.get("TITLE")).toBe("The Matrix Reloaded");
  });

  test("set() preserves non-string values", () => {
    engine.set("COUNT", 42);
    expect(engine.get("COUNT")).toBe(42);
  });

  test("set() preserves objects", () => {
    const obj = { key: "value" };
    engine.set("DATA", obj);
    expect(engine.get("DATA")).toBe(obj);
  });

  test("push() also cleans string values", () => {
    engine.push("LIST", "  item  one  ");
    engine.push("LIST", "\ttab\tvalue\t");
    // \t is stripped (not replaced with space) by cleanVariableValue
    expect(engine.get("LIST")).toEqual(["item one", "tabvalue"]);
  });
});

describe("RecipeEngine — replaceVariablesinString", () => {
  let engine;

  beforeEach(() => {
    engine = new RecipeEngine();
  });

  // From movies/tmdb.json — compose URL with $SYSTEM_LANGUAGE and $INPUT
  test("replaces $SYSTEM_LANGUAGE and $INPUT in tmdb search URL", () => {
    engine.set("SYSTEM_LANGUAGE", "en");
    engine.setInput("The Matrix");
    const result = engine.replaceVariablesinString(
      "https://www.themoviedb.org/search/movie?language=$SYSTEM_LANGUAGE&query=$INPUT"
    );
    expect(result).toBe("https://www.themoviedb.org/search/movie?language=en&query=The Matrix");
  });

  // From movies/tmdb.json autocomplete — compose URL from relative href
  test("replaces $URL$i with loop variable", () => {
    engine.set("i", 1);
    engine.set("URL1", "/movie/603-the-matrix");
    const result = engine.replaceVariablesinString("https://www.themoviedb.org$URL1");
    expect(result).toBe("https://www.themoviedb.org/movie/603-the-matrix");
  });

  // From food/openfoodfacts.json — compose API URL with $SYSTEM_REGION and $BARCODE
  test("replaces $SYSTEM_REGION and $BARCODE in openfoodfacts URL", () => {
    engine.set("SYSTEM_REGION", "US");
    engine.set("BARCODE", "123456");
    const result = engine.replaceVariablesinString(
      "https://$SYSTEM_REGION.openfoodfacts.org/api/v0/product/$BARCODE.json"
    );
    expect(result).toBe("https://US.openfoodfacts.org/api/v0/product/123456.json");
  });

  // From movies/tmdb.json — compose rating from split digits
  test("replaces multiple variables in rating composition", () => {
    engine.set("AUX_RATING_UNITS", "7");
    engine.set("AUX_RATING_DEC", "3");
    const result = engine.replaceVariablesinString("$AUX_RATING_UNITS.$AUX_RATING_DEC");
    expect(result).toBe("7.3");
  });

  // From boardgames/boardgamegeek.json — compose range
  test("replaces variables in player range", () => {
    engine.set("PLAYERS_MIN", "2");
    engine.set("PLAYERS_MAX", "4");
    const result = engine.replaceVariablesinString("$PLAYERS_MIN - $PLAYERS_MAX");
    expect(result).toBe("2 - 4");
  });

  test("returns null/undefined/non-string as-is", () => {
    expect(engine.replaceVariablesinString(null)).toBe(null);
    expect(engine.replaceVariablesinString(undefined)).toBe(undefined);
    expect(engine.replaceVariablesinString(42)).toBe(42);
  });

  test("returns string unchanged if no variables present", () => {
    expect(engine.replaceVariablesinString("no variables here")).toBe("no variables here");
  });

  // From wines/vivino.json — prepend protocol
  test("replaces variable at start of string", () => {
    engine.set("COVER", "//images.vivino.com/wine.jpg");
    const result = engine.replaceVariablesinString("https:$COVER");
    expect(result).toBe("https://images.vivino.com/wine.jpg");
  });
});

describe("RecipeEngine — matchLanguageAndRegion", () => {
  let engine;

  beforeEach(() => {
    engine = new RecipeEngine();
  });

  // From anime/anisearch.json — exact match
  test("matches exact language and region from anisearch recipe", () => {
    engine.set("SYSTEM_LANGUAGE", "es");
    engine.set("SYSTEM_REGION", "ES");

    const recipe = {
      regions_available: ["COM", "ES", "JP", "DE", "IT", "FR"],
      region_default: "COM",
      languages_available: ["COM", "es", "jp", "de", "it", "fr"],
      language_default: "COM",
    };

    engine.matchLanguageAndRegion(recipe);
    expect(engine.get("SYSTEM_LANGUAGE")).toBe("es");
    expect(engine.get("SYSTEM_REGION")).toBe("ES");
  });

  // Fallback to defaults when no match
  test("falls back to defaults when language/region not found", () => {
    engine.set("SYSTEM_LANGUAGE", "zh");
    engine.set("SYSTEM_REGION", "CN");

    const recipe = {
      regions_available: ["COM", "ES", "JP", "DE", "IT", "FR"],
      region_default: "COM",
      languages_available: ["COM", "es", "jp", "de", "it", "fr"],
      language_default: "COM",
    };

    engine.matchLanguageAndRegion(recipe);
    expect(engine.get("SYSTEM_LANGUAGE")).toBe("com");
    expect(engine.get("SYSTEM_REGION")).toBe("COM");
  });

  // Case-insensitive language matching (en_US → en)
  test("matches language case-insensitively using first segment", () => {
    engine.set("SYSTEM_LANGUAGE", "ES_ES");
    engine.set("SYSTEM_REGION", "ES");

    const recipe = {
      regions_available: ["COM", "ES"],
      region_default: "COM",
      languages_available: ["COM", "es"],
      language_default: "COM",
    };

    engine.matchLanguageAndRegion(recipe);
    expect(engine.get("SYSTEM_LANGUAGE")).toBe("es");
  });
});
