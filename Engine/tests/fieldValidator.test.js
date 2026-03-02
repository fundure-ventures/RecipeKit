import { expect, test, describe } from "bun:test";
import { validateField, validateRecipeFields } from '../src/fieldValidator.js';
import { Log } from '../src/logger.js';

Log.setDebug(false);

// ============================================================
// validateField — individual step validation
// ============================================================
describe("validateField", () => {

  test("returns valid for step with no output", () => {
    const result = validateField({ command: "load" }, "url_steps");
    expect(result.valid).toBe(true);
  });

  test("returns valid for show: false (any key allowed)", () => {
    const step = { output: { name: "MY_CUSTOM_VAR", show: false } };
    const result = validateField(step, "url_steps");
    expect(result.valid).toBe(true);
  });

  test("returns invalid when show is missing", () => {
    const step = { output: { name: "TITLE" } };
    const result = validateField(step, "url_steps");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('"show" is required');
  });

  test("returns invalid when show is null", () => {
    const step = { output: { name: "TITLE", show: null } };
    const result = validateField(step, "url_steps");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('"show" is required');
  });

  test("returns valid for known url_fields key with show: true", () => {
    const step = { output: { name: "TITLE", type: "string", show: true } };
    const result = validateField(step, "url_steps");
    expect(result.valid).toBe(true);
  });

  test("returns valid for known autocomplete_fields key with show: true", () => {
    const step = { output: { name: "TITLE$i", type: "string", show: true } };
    const result = validateField(step, "autocomplete_steps");
    expect(result.valid).toBe(true);
  });

  test("returns invalid for unknown key with show: true in url_steps", () => {
    const step = { output: { name: "UNKNOWN_FIELD", type: "string", show: true } };
    const result = validateField(step, "url_steps");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("unknown output key");
  });

  test("returns invalid for unknown key with show: true in autocomplete_steps", () => {
    const step = { output: { name: "RATING$i", type: "string", show: true } };
    const result = validateField(step, "autocomplete_steps");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("unknown output key");
  });

  test("validates all standard url_fields keys", () => {
    const knownKeys = ["TITLE", "COVER", "URL", "DESCRIPTION", "RATING", "DATE", "AUTHOR", "TAGS", "FAVICON", "GENRE", "DURATION", "YEAR", "WINERY", "INGREDIENTS", "STEPS", "COORDS", "LATITUDE", "LONGITUDE"];
    for (const key of knownKeys) {
      const step = { output: { name: key, show: true } };
      const result = validateField(step, "url_steps");
      expect(result.valid).toBe(true);
    }
  });

  test("validates all standard autocomplete_fields keys", () => {
    const knownKeys = ["TITLE", "SUBTITLE", "COVER", "URL"];
    for (const key of knownKeys) {
      const step = { output: { name: `${key}$i`, show: true } };
      const result = validateField(step, "autocomplete_steps");
      expect(result.valid).toBe(true);
    }
  });
});

// ============================================================
// validateRecipeFields — full recipe validation
// ============================================================
describe("validateRecipeFields", () => {

  test("returns empty set for valid recipe", () => {
    const recipe = {
      url_steps: [
        { command: "store_text", output: { name: "TITLE", show: true } },
        { command: "store_text", output: { name: "COVER", show: true } },
        { command: "store", output: { name: "AUX_URL", show: false } },
      ]
    };
    const ignored = validateRecipeFields(recipe, "url_steps");
    expect(ignored.size).toBe(0);
  });

  test("returns ignored fields for unknown keys with show: true", () => {
    const recipe = {
      url_steps: [
        { command: "store_text", output: { name: "TITLE", show: true } },
        { command: "store_text", output: { name: "BANANA", show: true } },
      ]
    };
    const ignored = validateRecipeFields(recipe, "url_steps");
    expect(ignored.has("BANANA")).toBe(true);
    expect(ignored.has("TITLE")).toBe(false);
  });

  test("handles recipe with no steps", () => {
    const ignored = validateRecipeFields({}, "url_steps");
    expect(ignored.size).toBe(0);
  });

  test("handles null steps", () => {
    const ignored = validateRecipeFields({ url_steps: null }, "url_steps");
    expect(ignored.size).toBe(0);
  });

  test("skips steps without output", () => {
    const recipe = {
      url_steps: [
        { command: "load", url: "https://example.com" },
        { command: "store_text", output: { name: "TITLE", show: true } },
      ]
    };
    const ignored = validateRecipeFields(recipe, "url_steps");
    expect(ignored.size).toBe(0);
  });

  test("validates autocomplete_steps context", () => {
    const recipe = {
      autocomplete_steps: [
        { command: "store_text", output: { name: "TITLE$i", show: true } },
        { command: "store_text", output: { name: "RATING$i", show: true } },
      ]
    };
    const ignored = validateRecipeFields(recipe, "autocomplete_steps");
    expect(ignored.has("RATING")).toBe(true);
    expect(ignored.has("TITLE")).toBe(false);
  });
});
