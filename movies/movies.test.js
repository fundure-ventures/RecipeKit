import { expect, test, describe } from "bun:test";
import { runEngine, findEntry , loadEnvVariables } from '../Engine/utils/test_utils.js';

// Add process.env variables from the .env file
await loadEnvVariables();
const TIMEOUT = parseInt(process.env.TEST_TIMEOUT);

const RECIPE = "tmdb.json";
const INPUT = {
    AUTOCOMPLETE: "The Matrix",
    URL: "https://www.themoviedb.org/movie/603-the-matrix?language=en-US"
}
const ENTRY = { TITLE: "The Matrix", SUBTITLE: "1999" };

describe(RECIPE, () => {
  test("--type autocomplete", async() => {
   
    const results = await runEngine(`movies/${RECIPE}`, "autocomplete", INPUT.AUTOCOMPLETE);
    const entry = findEntry(results, ENTRY.TITLE, ENTRY.SUBTITLE);
    
    expect(entry.TITLE).toBe(ENTRY.TITLE);
    expect(entry.SUBTITLE).toBe(ENTRY.SUBTITLE);
    expect(entry.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
    expect(entry.URL).toMatch(/^https:\/\/www\.themoviedb\.org\/movie\/.*matrix.*$/i);
  }, TIMEOUT);

  test("--type url'", async () => {
    const result = await runEngine(`movies/${RECIPE}`, "url", INPUT.URL);

    expect(result.TITLE).toBe(ENTRY.TITLE);
    expect(result.DATE).toBe("1999");
    expect(result.DESCRIPTION).toBeDefined();
    // expect(result.GENRE).toBe("");
    expect(result.DURATION).toBeDefined();
    expect(result.RATING).toBeDefined();
    expect(result.AUTHOR).toBeDefined();
    expect(result.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
  }, TIMEOUT);
});

describe("imdb.json", () => {
  test("--type url", async () => {
    const result = await runEngine("movies/imdb.json", "url", "https://www.imdb.com/title/tt0133093/");

    expect(result.TITLE).toContain("Matrix");
    expect(result.DATE).toBe("1999");
    expect(result.DESCRIPTION).toBeDefined();
    expect(result.RATING).toBeDefined();
    expect(result.AUTHOR).toBeDefined();
    expect(result.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
  }, TIMEOUT);
});

describe("rottentomatoes.json", () => {
  test("--type autocomplete", async() => {
    const results = await runEngine("movies/rottentomatoes.json", "autocomplete", "The Matrix");
    const entry = findEntry(results, "The Matrix");
    
    expect(entry).toBeDefined();
    expect(entry.TITLE).toContain("Matrix");
    expect(entry.COVER).toMatch(/^https:\/\/.*(\.(jpg|jpeg|png|webp)|=)/i);
    expect(entry.URL).toMatch(/^https:\/\/www\.rottentomatoes\.com\/m\/.*$/i);
  }, TIMEOUT);

  test("--type url", async () => {
    const result = await runEngine("movies/rottentomatoes.json", "url", "https://www.rottentomatoes.com/m/the_matrix");

    expect(result.TITLE).toContain("Matrix");
    expect(result.DESCRIPTION).toBeDefined();
    expect(result.DURATION).toBeDefined();
    expect(result.RATING).toBeDefined();
    expect(result.AUTHOR).toBeDefined();
    expect(result.COVER).toMatch(/^https:\/\/.*(\.(jpg|jpeg|png|webp)|=)/i);
  }, TIMEOUT);
});
