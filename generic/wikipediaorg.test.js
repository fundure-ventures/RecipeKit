import { expect, test, describe } from "bun:test";
import { runEngine, findEntry, loadEnvVariables } from '../Engine/utils/test_utils.js';

await loadEnvVariables();
const TIMEOUT = parseInt(process.env.TEST_TIMEOUT);

const RECIPE = "wikipediaorg.json";
const INPUT = {
    AUTOCOMPLETE: "Earth",
    URL: "https://en.wikipedia.org/wiki/Earth"
};

const ENTRY = { TITLE: "Earth" };

describe(RECIPE, () => {
    test("--type autocomplete", async () => {
        const results = await runEngine(`generic/${RECIPE}`, "autocomplete", INPUT.AUTOCOMPLETE);

        const entry = findEntry(results, ENTRY.TITLE);

        expect(entry.TITLE).toBe(ENTRY.TITLE);
        expect(entry.URL).toBe("https://en.wikipedia.org/wiki/Earth");
        expect(entry.COVER).toBe("https://en.wikipedia.org/static/favicon/wikipedia.ico");
    }, TIMEOUT);

    test("--type url", async () => {
        const result = await runEngine(`generic/${RECIPE}`, "url", INPUT.URL);

        expect(result.TITLE).toBe("Earth");
        expect(result.SUMMARY).not.toBeEmpty();
        expect(result.DESCRIPTION).not.toBeEmpty();
        expect(result.COVER).toMatch(/^https:\/\/.*\.(jpg|jpeg|png|webp)(\?[^ ]*)?$/i);
        expect(result.URL).toBe("https://en.wikipedia.org/wiki/Earth");
        expect(result.FAVICON).toBe("https://en.wikipedia.org/static/favicon/wikipedia.ico");
    }, TIMEOUT);
});
