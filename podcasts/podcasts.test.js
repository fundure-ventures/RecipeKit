import { expect, test, describe } from "bun:test";
import { runEngine, findEntry, loadEnvVariables } from '../Engine/utils/test_utils.js';

// Add process.env variables from the .env file
await loadEnvVariables();
const TIMEOUT = parseInt(process.env.TEST_TIMEOUT);

const RECIPE = "apple.json";
const INPUT = {
    AUTOCOMPLETE: "Estirando el chicle",
    URL: ["https://podcasts.apple.com/us/podcast/estirando-el-chicle/id1511396938?uo=4",
    "https://podcasts.apple.com/es/podcast/estirando-el-chicle/id1511396938/",
    "https://itunes.apple.com/search?media=podcast&limit=6&explicit=YES&term=Estirando%20el%20chicle" 
    ]
}

const ENTRY = {TITLE: "Estirando el chicle", SUBTITLE: "Podium Podcast"};

describe(RECIPE, () => {
    test("--type autocomplete", async () => {
        
        const results = await runEngine (`podcasts/${RECIPE}`, "autocomplete", INPUT.AUTOCOMPLETE);
        const entry = findEntry(results, ENTRY.TITLE, ENTRY.SUBTITLE);
        
        expect(entry.TITLE).toBe(ENTRY.TITLE);
        expect(entry.SUBTITLE).toBe(ENTRY.SUBTITLE);
        expect(entry.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
        expect(entry.URL).toMatch(/^https:\/\/podcasts\.apple\.com\/us\/podcast\/estirando-el-chicle\/id1511396938(\/?|\?.*)?$/i);
    }, TIMEOUT);

    test("--type url", async () => {
        const result = await runEngine (`podcasts/${RECIPE}`, "url", INPUT.URL);

        expect(result.TITLE).toBe(ENTRY.TITLE);
        expect(result.AUTHOR).toBe(ENTRY.SUBTITLE);
        expect(result.ALBUM).toBeDefined();
        expect(result.DATE).toBeDefined();
        expect(result.GENRE).toBeDefined();
        expect(result.PRICE).toBeDefined();
        expect(result.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
    }, TIMEOUT);
});