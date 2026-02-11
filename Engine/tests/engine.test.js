import { expect, test, describe, beforeEach } from "bun:test";
import { Log } from '../src/logger.js';

Log.setDebug(false);

// engine.js classes are not exported and the file auto-executes.
// We replicate the pure-logic functions here to test them in isolation.
// These are exact copies of the logic from engine.js.

function getEngineCommandType(commandType) {
  const commandTypeMap = {
    'autocomplete': 'autocomplete_steps',
    'url': 'url_steps'
  };
  return commandTypeMap[commandType] || commandType;
}

function restructureOutputByIndex(result) {
  const debug = {};
  const results = [];
  const indexedVariables = {};

  for (const [key, value] of Object.entries(result)) {
    const match = key.match(/^([A-Z]+)(\d+)$/);
    if (match) {
      const [, prefix, index] = match;
      if (!indexedVariables[index]) {
        indexedVariables[index] = {};
      }
      indexedVariables[index][prefix] = value;
    } else {
      debug[key] = value;
    }
  }

  results.push(...Object.values(indexedVariables));
  return { debug, results };
}

function restructureOutputByStepConfig(result, recipe) {
  const filteredResult = {};

  if (recipe.url_steps && Array.isArray(recipe.url_steps)) {
    for (const step of recipe.url_steps) {
      if (step.output && step.output.name && step.output.show) {
        const outputName = step.output.name;
        if (result.hasOwnProperty(outputName)) {
          filteredResult[outputName] = result[outputName];
        } else if (outputName.includes('$')) {
          const pattern = new RegExp('^' + outputName.replace(/\$[a-zA-Z]+/g, '\\d+') + '$');
          for (const key of Object.keys(result)) {
            if (pattern.test(key)) {
              filteredResult[key] = result[key];
            }
          }
        }
      }
    }
  }

  return { results: filteredResult };
}

// ============================================================
// getEngineCommandType
// ============================================================
describe("getEngineCommandType", () => {
  test("maps 'autocomplete' to 'autocomplete_steps'", () => {
    expect(getEngineCommandType("autocomplete")).toBe("autocomplete_steps");
  });

  test("maps 'url' to 'url_steps'", () => {
    expect(getEngineCommandType("url")).toBe("url_steps");
  });

  test("returns unknown type as-is", () => {
    expect(getEngineCommandType("custom_type")).toBe("custom_type");
  });
});

// ============================================================
// restructureOutputByIndex — autocomplete results grouping
// ============================================================
describe("restructureOutputByIndex", () => {

  // From movies/tmdb.json autocomplete — 1-based indexed variables
  test("groups 1-based indexed variables (tmdb autocomplete)", () => {
    const raw = {
      INPUT: "The Matrix", SYSTEM_LANGUAGE: "en", SYSTEM_REGION: "US",
      TITLE1: "The Matrix", SUBTITLE1: "1999", COVER1: "https://img.tmdb.org/1.jpg", URL1: "https://www.themoviedb.org/movie/603",
      TITLE2: "The Matrix Reloaded", SUBTITLE2: "2003", COVER2: "https://img.tmdb.org/2.jpg", URL2: "https://www.themoviedb.org/movie/604",
      TITLE3: "The Matrix Revolutions", SUBTITLE3: "2003", COVER3: "https://img.tmdb.org/3.jpg", URL3: "https://www.themoviedb.org/movie/605",
    };

    const { results, debug } = restructureOutputByIndex(raw);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      TITLE: "The Matrix", SUBTITLE: "1999",
      COVER: "https://img.tmdb.org/1.jpg", URL: "https://www.themoviedb.org/movie/603"
    });
    expect(results[1].TITLE).toBe("The Matrix Reloaded");
    expect(results[2].TITLE).toBe("The Matrix Revolutions");

    // Non-indexed vars go to debug
    expect(debug.INPUT).toBe("The Matrix");
    expect(debug.SYSTEM_LANGUAGE).toBe("en");
  });

  // From albums/apple.json autocomplete — 0-based indexed variables
  test("groups 0-based indexed variables (apple autocomplete)", () => {
    const raw = {
      INPUT: "Nevermind", SYSTEM_LANGUAGE: "en", SYSTEM_REGION: "US",
      COVER0: "https://is1-ssl.mzstatic.com/1.jpg", SUBTITLE0: "Nirvana", TITLE0: "Nevermind", URL0: "https://music.apple.com/1",
      COVER1: "https://is1-ssl.mzstatic.com/2.jpg", SUBTITLE1: "Nirvana", TITLE1: "In Utero", URL1: "https://music.apple.com/2",
    };

    const { results } = restructureOutputByIndex(raw);

    expect(results).toHaveLength(2);
    expect(results[0].TITLE).toBe("Nevermind");
    expect(results[1].TITLE).toBe("In Utero");
  });

  // Empty result
  test("handles empty result", () => {
    const { results } = restructureOutputByIndex({});
    expect(results).toHaveLength(0);
  });

  // Only non-indexed variables
  test("all vars go to debug when no indexed vars", () => {
    const raw = { INPUT: "test", SYSTEM_LANGUAGE: "en" };
    const { results, debug } = restructureOutputByIndex(raw);
    expect(results).toHaveLength(0);
    expect(debug.INPUT).toBe("test");
  });
});

// ============================================================
// restructureOutputByStepConfig — url results filtering
// ============================================================
describe("restructureOutputByStepConfig", () => {

  // From food/openfoodfacts.json — all-API recipe
  test("filters by show flag (openfoodfacts)", () => {
    const recipe = {
      url_steps: [
        { command: "regex", output: { name: "BARCODE", show: true } },
        { command: "store", output: { name: "URL", show: true } },
        { command: "store", output: { name: "APIURL" } }, // no show flag
        { command: "api_request", output: { name: "JSON" } }, // no show flag
        { command: "json_store_text", output: { name: "BRAND", type: "string", show: true } },
        { command: "json_store_text", output: { name: "CATEGORY", type: "string", show: true } },
        { command: "json_store_text", output: { name: "COVER", type: "string", show: true } },
        { command: "json_store_text", output: { name: "NUTRISCORE", type: "string", show: true } },
        { command: "json_store_text", output: { name: "DESCRIPTION", type: "string", show: true } },
      ]
    };

    const rawResult = {
      INPUT: "https://us.openfoodfacts.org/product/123456",
      BARCODE: "123456", URL: "https://us.openfoodfacts.org/product/123456/",
      APIURL: "https://us.openfoodfacts.org/api/v0/product/123456.json",
      JSON: {}, BRAND: "Ferrero", CATEGORY: "Spreads",
      COVER: "https://images.openfoodfacts.org/123.jpg",
      NUTRISCORE: "e", DESCRIPTION: "Hazelnut spread"
    };

    const { results } = restructureOutputByStepConfig(rawResult, recipe);

    // Only show:true fields should be present
    expect(results.BARCODE).toBe("123456");
    expect(results.URL).toBeDefined();
    expect(results.BRAND).toBe("Ferrero");
    expect(results.CATEGORY).toBe("Spreads");
    expect(results.COVER).toBeDefined();
    expect(results.NUTRISCORE).toBe("e");
    expect(results.DESCRIPTION).toBe("Hazelnut spread");

    // Non-show fields should be excluded
    expect(results.APIURL).toBeUndefined();
    expect(results.JSON).toBeUndefined();
    expect(results.INPUT).toBeUndefined();
  });

  // From movies/tmdb.json url_steps
  test("filters tmdb url_steps output (tmdb)", () => {
    const recipe = {
      url_steps: [
        { command: "load", url: "$INPUT" },
        { command: "store_text", output: { name: "TITLE" } }, // no show
        { command: "regex", output: { name: "DATE", type: "date", show: true } },
        { command: "regex", output: { name: "TITLE", type: "string", show: true } },
        { command: "store_text", output: { name: "DESCRIPTION", type: "string", show: true } },
        { command: "store", output: { name: "RATING", type: "float", show: true } },
        { command: "store", output: { name: "COVER", type: "string", show: true } },
      ]
    };

    const rawResult = {
      INPUT: "https://www.themoviedb.org/movie/603",
      TITLE: "The Matrix", DATE: "1999",
      DESCRIPTION: "A computer hacker learns...",
      RATING: "7.3", COVER: "https://image.tmdb.org/abc.jpg",
      AUX_RATING_PERCENT: "73"
    };

    const { results } = restructureOutputByStepConfig(rawResult, recipe);

    expect(results.TITLE).toBe("The Matrix");
    expect(results.DATE).toBe("1999");
    expect(results.DESCRIPTION).toBeDefined();
    expect(results.RATING).toBe("7.3");
    expect(results.COVER).toBeDefined();
    expect(results.AUX_RATING_PERCENT).toBeUndefined();
    expect(results.INPUT).toBeUndefined();
  });

  // Empty recipe
  test("handles recipe with no url_steps", () => {
    const { results } = restructureOutputByStepConfig({ A: 1 }, {});
    expect(Object.keys(results)).toHaveLength(0);
  });

  // Steps without output
  test("handles steps without output property", () => {
    const recipe = { url_steps: [{ command: "load", url: "$INPUT" }] };
    const { results } = restructureOutputByStepConfig({ INPUT: "test" }, recipe);
    expect(Object.keys(results)).toHaveLength(0);
  });

  // Null url_steps
  test("handles null autocomplete_steps gracefully", () => {
    const recipe = { url_steps: null };
    const { results } = restructureOutputByStepConfig({ A: 1 }, recipe);
    expect(Object.keys(results)).toHaveLength(0);
  });
});
