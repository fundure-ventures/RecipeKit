import { launch } from 'puppeteer';
import { Log } from './logger.js';

export class BrowserManager {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        this.browser = await launch({
            headless: !Log.isDebug,
            // Needed to run on GitHub Actions
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox"
              ]
        });
        this.page = await this.browser.newPage();
        await this.setUserAgent(process.env.DEFAULT_USER_AGENT);
        await this.setExtraHTTPHeaders({
            'Accept-Language': process.env.SYSTEM_LANGUAGE
        });
    }

    async setUserAgent(userAgent) {
        await this.page.setUserAgent(userAgent);
    }

    async setExtraHTTPHeaders(headers) {
        await this.page.setExtraHTTPHeaders(headers);
    }

    async setCookies(cookies) {
        if (!Array.isArray(cookies)) {
            cookies = [cookies];
        }
        await this.page.setCookie(...cookies);
    }

    async close() {
        if (this.browser && !Log.isDebug) {
            await this.browser.close();
        }
    }

    async loadPage(url, options) {
        try {
            await this.page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: process.env.MIN_PAGE_LOAD_TIMEOUT
            });
            if (options.waitUntil === 'networkidle0') {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
         Log.error(`Error loading page ${url}: ${error.message}`);
        }
    }

    async querySelector(selector) {
        return await this.page.$(selector);
    }

    async countElements(selector) {
        const elements = await this.page.$$(selector);
        return elements.length;
    }
}