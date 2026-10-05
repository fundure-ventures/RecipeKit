import { expect, test, describe } from "bun:test";
import { runEngine, findEntry, loadEnvVariables } from '../Engine/utils/test_utils.js';

// Add process.env variables from the .env file
await loadEnvVariables();
const TIMEOUT = parseInt(process.env.TEST_TIMEOUT);

const RECIPE = "boardgamegeek.json";
const INPUT = {
    AUTOCOMPLETE: "Trivial Pursuit: Genus Edition",
    URL: "https://boardgamegeek.com/boardgame/2952/trivial-pursuit-genus-edition"
}

const ENTRY = {TITLE: "Trivial Pursuit: Genus Edition", SUBTITLE: "1981"};

describe(RECIPE, () => {
    test("--type autocomplete", async () => {
        const results = await runEngine (`boardgames/${RECIPE}`, "autocomplete", INPUT.AUTOCOMPLETE);
        const entry = findEntry(results, ENTRY.TITLE, ENTRY.SUBTITLE);
        
        expect(entry.TITLE).toBe(ENTRY.TITLE);
        expect(entry.SUBTITLE).toBe(ENTRY.SUBTITLE);
        expect(entry.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
        expect(entry.URL).toMatch(/^https:\/\/www\.boardgamegeek\.com\/boardgame\/2952\/trivial-pursuit-genus-edition$/i);
    }, TIMEOUT);
    
    test("--type url", async () => {
        const result = await runEngine (`boardgames/${RECIPE}`, "url", INPUT.URL);

        expect(result.URL).toBe(INPUT.URL);
        expect(result.TITLE).toBe(ENTRY.TITLE);
        expect(result.DATE).toBe(ENTRY.SUBTITLE);
        expect(result.DESCRIPTION).toBeDefined();
        expect(result.PLAYERS).toBeDefined();
        expect(result.TIME).toBeDefined();
        expect(result.CATEGORY).toBeDefined();
        expect(result.RATING).toBeDefined();
        expect(result.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
    }, TIMEOUT);
});
