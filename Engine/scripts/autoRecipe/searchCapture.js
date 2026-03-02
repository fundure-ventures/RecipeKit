/**
 * Trigger Search and Capture API Response
 * 
 * This command triggers a search action on the page and captures
 * the API response from the network. This works with sites that
 * use JavaScript/API-based search (Algolia, Elasticsearch, etc.)
 * 
 * The key insight is that we trigger the site's OWN search, which
 * makes the API call with all proper authentication, then we
 * intercept and capture the response.
 */

import { Log } from '../../src/logger.js';

/**
 * Wait for a search API response after triggering search on the page
 * @param {Page} page - Puppeteer page
 * @param {string} query - Search query
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} API response data
 */
export async function triggerSearchAndCapture(page, query, options = {}) {
  const {
    searchInputSelector = 'input[type="search"], input[name="q"], input[name="query"], input[placeholder*="search" i]',
    apiPatterns = ['algolia', 'elasticsearch', 'typesense', 'search', 'query'],
    timeout = 10000
  } = options;

  let capturedResponse = null;
  
  // Set up response interception
  const responseHandler = async (response) => {
    try {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      
      // Check if this looks like a search API
      const isSearchApi = apiPatterns.some(pattern => 
        url.toLowerCase().includes(pattern.toLowerCase())
      );
      
      if (isSearchApi && contentType.includes('json') && response.status() === 200) {
        try {
          const text = await response.text();
          const data = JSON.parse(text);
          
          // Verify this response contains our query
          const responseStr = JSON.stringify(data).toLowerCase();
          if (responseStr.includes(query.toLowerCase())) {
            capturedResponse = data;
            Log.debug(`Captured search API response from ${url}`);
          }
        } catch (e) {
          // Not valid JSON
        }
      }
    } catch (e) {
      // Response unavailable
    }
  };
  
  page.on('response', responseHandler);
  
  try {
    // Find and interact with search input
    const searchInput = await page.$(searchInputSelector);
    
    if (!searchInput) {
      // Try clicking on search icon/button first
      const searchButton = await page.$('[aria-label*="search" i], button[type="search"], .search-icon, .search-btn');
      if (searchButton) {
        await searchButton.click();
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    const input = await page.$(searchInputSelector);
    if (!input) {
      throw new Error('No search input found on page');
    }
    
    // Clear existing text and type new query
    await input.click({ clickCount: 3 });
    await input.type(query, { delay: 50 });
    
    // Wait for API response
    await new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (capturedResponse) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        if (capturedResponse) {
          resolve();
        } else {
          // Try pressing Enter to trigger search
          page.keyboard.press('Enter').then(() => {
            setTimeout(() => {
              if (capturedResponse) resolve();
              else reject(new Error('No search API response captured'));
            }, 3000);
          });
        }
      }, timeout);
    });
    
    return capturedResponse;
    
  } finally {
    page.off('response', responseHandler);
  }
}
