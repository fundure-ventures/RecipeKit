import { launch } from 'puppeteer';

const ANDROID_USER_AGENT = 'Mozilla/5.0 (Linux; Android 11; Redmi Note 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const TEST_URL = 'https://m.imdb.com/es-es/title/tt0239023/?ref_=fn_t_2';

async function testRating() {
    console.log('🎮 Probando selectores de rating\n');

    const browser = await launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 393, height: 873, isMobile: true });
    await page.setUserAgent(ANDROID_USER_AGENT);

    try {
        await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 2000));

        const selectors = [
            // Selector nuevo (href-based)
            "a[href*='ratings'] span span",
            "a[href*='ratings'] span",
            
            // Selector antiguo (data-testid)
            "div[data-testid='hero-rating-bar__aggregate-rating__score'] > span:first-child",
            "div[data-testid*='hero-rating-bar__aggregate-rating__score']",
            "[data-testid*='aggregate-rating'] span",
            
            // Alternativas
            ".rating-bar__base-button span",
            "span[class*='rating']",
        ];

        console.log('Probando selectores:\n');

        for (const selector of selectors) {
            try {
                const result = await page.$eval(selector, el => el.textContent);
                console.log(`✅ ${selector}`);
                console.log(`   Valor: "${result}"\n`);
            } catch (e) {
                console.log(`❌ ${selector}\n`);
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await browser.close();
    }
}

testRating();

