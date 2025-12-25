import { expect, test, describe } from "bun:test";
import { runEngine, findEntry } from '../Engine/utils/test_utils.js';

const APPLE_RECIPE = "apple.json";
const GOOGLE_RECIPE = "googleplay.json";

const INPUT = {
    AUTOCOMPLETE: "Listy"
};

const ENTRY_APPLE = {
    TITLE: "Listy · Watchlist & Tracker",
    SUBTITLE: "Productivity",
    URL: "https://apps.apple.com/us/app/listy-lists-of-collections/id1496035097?uo=4"
};

const ENTRY_GOOGLE = {
    TITLE: "Listy · Beautiful lists",
    SUBTITLE: "Fundure Ventures",
    URL: "https://play.google.com/store/apps/details?id=pro.listy"
};

describe(APPLE_RECIPE, () => {
  test("--type autocomplete", async () => {
    const results = await runEngine(`software/${APPLE_RECIPE}`, "autocomplete", INPUT.AUTOCOMPLETE);
    const entry = findEntry(results, ENTRY_APPLE.TITLE, ENTRY_APPLE.SUBTITLE);
    
    expect(entry.TITLE).toBe(ENTRY_APPLE.TITLE);
    expect(entry.SUBTITLE).toBe(ENTRY_APPLE.SUBTITLE);
    expect(entry.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
    expect(entry.URL).toMatch(/^https:\/\/apps\.apple\.com\/.*\/app\/.*listy.*\/id\d+\?uo=4$/i);
  });

  test("--type url", async () => {
    const result = await runEngine(`software/${APPLE_RECIPE}`, "url", ENTRY_APPLE.URL);
    
    expect(result.TITLE).toBe(ENTRY_APPLE.TITLE);
    expect(result.RATING).toBeDefined();
    expect(result.GENRE).toBeDefined();
    expect(result.DESCRIPTION).toBeDefined();
    expect(result.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
  });
});

describe(GOOGLE_RECIPE, () => {
  test("--type autocomplete", async () => {
    const results = await runEngine(`software/${GOOGLE_RECIPE}`, "autocomplete", INPUT.AUTOCOMPLETE);
    const entry = findEntry(results, ENTRY_GOOGLE.TITLE, ENTRY_GOOGLE.SUBTITLE);
    
    expect(entry.TITLE).toBe(ENTRY_GOOGLE.TITLE);
    expect(entry.SUBTITLE).toBe(ENTRY_GOOGLE.SUBTITLE);
    expect(entry.COVER).toMatch(/^https:\/\/.*googleusercontent\.com\/.*/i);
    expect(entry.URL).toMatch(/^https:\/\/play\.google\.com\/.*listy.*$/i);
  });


  test("--type url", async () => {
    const result = await runEngine(`software/${GOOGLE_RECIPE}`, "url", ENTRY_GOOGLE.URL);
    
    expect(result.TITLE).toBe(ENTRY_GOOGLE.TITLE);
    expect(result.RATING).toBeDefined();
    expect(result.GENRE).toBeDefined();
    expect(result.DESCRIPTION).toBeDefined();
    expect(result.COVER).toMatch(/^https:\/\/.*googleusercontent\.com\/.*/i);
  });
});