import { expect, test, describe } from "bun:test";
import { runEngine, findEntry , loadEnvVariables } from '../Engine/utils/test_utils.js';

// Add process.env variables from the .env file
await loadEnvVariables();
const TIMEOUT = parseInt(process.env.TEST_TIMEOUT);

const RECIPE = "apple.json";
const INPUT = {
    AUTOCOMPLETE: "Smells Like Teen Spirit",
    URL: "https://itunes.apple.com/lookup?id=1440783625"
}

const ENTRY = {TITLE: "Smells Like Teen Spirit", SUBTITLE: "Nirvana"};

describe(RECIPE, () => {
    test("--type autocomplete", async () => {

        const results = await runEngine(`songs/${RECIPE}`, "autocomplete", INPUT.AUTOCOMPLETE);
        const entry = findEntry(results, ENTRY.TITLE, ENTRY.SUBTITLE);

		expect(entry.TITLE).toBe(ENTRY.TITLE);
		expect(entry.SUBTITLE).toBe(ENTRY.SUBTITLE);
		expect(entry.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
		expect(entry.URL).toMatch(/^https:\/\/itunes\.apple\.com\/.+/i);
	}, TIMEOUT);

	test("--type url", async () => {
		const result = await runEngine(`songs/${RECIPE}`, "url", INPUT.URL);

		expect(result.TITLE).toBe(ENTRY.TITLE);
		expect(result.AUTHOR).toBe(ENTRY.SUBTITLE);
		expect(result.DATE).toBeDefined();
		expect(result.GENRE).toBeDefined();
		expect(result.PRICE).toBeDefined();
		expect(result.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)$/i);
	}, TIMEOUT);
});
