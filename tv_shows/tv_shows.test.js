import { expect, test, describe } from "bun:test";
import { runEngine, findEntry, loadEnvVariables } from '../Engine/utils/test_utils.js';

// Add process.env variables from the .env file
await loadEnvVariables();
const TIMEOUT = parseInt(process.env.TEST_TIMEOUT);

const RECIPE = "tmdb.json";
const INPUT = {
    AUTOCOMPLETE: "Friends", 
    URL: "https://www.themoviedb.org/tv/1668-friends?language=en-US"
}

const ENTRY = { TITLE: "Friends", SUBTITLE: "1994" };

describe(RECIPE, () => {
    test (" --type autocomplete", async () => {

        const results = await runEngine (`tv_shows/${RECIPE}`, "autocomplete", INPUT.AUTOCOMPLETE);
        const entry = findEntry(results, ENTRY.TITLE, ENTRY.SUBTITLE);

        expect(entry.TITLE).toBe(ENTRY.TITLE);
        expect(entry.SUBTITLE).toBe(ENTRY.SUBTITLE);
        expect(entry.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
        expect(entry.URL).toMatch(/^https:\/\/www\.themoviedb\.org\/tv\/.*friends.*$/i);
    },  TIMEOUT);

    test ("--type url", async () => {

        const result = await runEngine (`tv_shows/${RECIPE}`, "url", INPUT.URL);

        expect(result.TITLE).toBe(ENTRY.TITLE);
        expect(result.DATE).toBe(ENTRY.SUBTITLE);
        expect(result.DESCRIPTION).toBeDefined();
        expect(result.RATING).toBeDefined();
        expect(result.AUTHOR).toBeDefined();
        expect(result.COVER).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/original\/.*\.(jpg|jpeg|png|webp)$/i);
    }, TIMEOUT);
});

describe("imdb.json", () => {
    test ("--type url", async () => {
        const result = await runEngine("tv_shows/imdb.json", "url", "https://www.imdb.com/es-es/title/tt0108778/");
        
        expect(result.TITLE).toBe("Friends");
        expect(result.DATE).toBe("1994");
        expect(result.DESCRIPTION).toBeDefined();
        expect(result.RATING).toBeDefined();
        expect(result.AUTHOR).toBeDefined();
        expect(result.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
    }, TIMEOUT);
});

describe("thetvdb.json", () => {
    test ("--type url", async () => {
        const result = await runEngine("tv_shows/thetvdb.json", "url", "https://thetvdb.com/series/death-note");

        expect(result.TITLE).toBe("Death Note");
        expect(result.DATE).toBe("2006");
        expect(result.DESCRIPTION).toContain("mystical notebook");
        expect(result.AUTHOR).toBe("Toshiki Inoue");
        expect(result.DURATION).toBe("23 minutes");
        expect(result.GENRE).toContain("Anime");
        expect(result.COUNTRY).toBe("Japan");
        expect(result.COVER).toMatch(/^https:\/\/artworks\.thetvdb\.com\/.*\.(jpg|jpeg|png|webp)$/i);
    }, TIMEOUT);
});
