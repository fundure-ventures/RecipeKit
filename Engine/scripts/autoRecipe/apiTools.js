/**
 * apiTools.js - AutoRecipe API discovery tools
 *
 * Wraps EvidenceCollector's API capture/discovery into a normalized
 * descriptor that buildApiRecipe() uses to emit standard `api_request`
 * steps (not custom engine commands).
 *
 * The core engine only supports `api_request` — these tools handle the
 * Puppeteer-based interception at recipe-generation time, then produce
 * recipes that run without browser-context commands.
 */

/**
 * Normalize an apiData result from EvidenceCollector.captureApiOnLoad()
 * or discoverSearchAPI() into a descriptor suitable for building
 * `api_request` recipe steps.
 *
 * @param {Object} apiData - Raw capture result from EvidenceCollector
 * @param {string} searchUrl - The search URL that triggered the API
 * @returns {Object} Normalized API descriptor
 */
export function normalizeApiDescriptor(apiData, searchUrl) {
  if (!apiData || !apiData.results || apiData.results.length === 0) {
    return null;
  }

  const sample = apiData.results[0];

  // Detect field names from sample
  const titleField = sample.naslov ? 'naslov'
    : (sample.title ? 'title' : (sample.name ? 'name' : 'title'));
  const subtitleField = sample.dizajner ? 'dizajner'
    : (sample.designer ? 'designer' : (sample.brand ? 'brand' : 'subtitle'));
  const urlField = sample.url?.EN ? 'url.EN[0]'
    : (sample.url ? 'url' : (sample.href ? 'href' : 'link'));
  const imageField = sample.thumbnail ? 'thumbnail'
    : (sample.slika ? 'slika' : (sample.image ? 'image' : 'cover'));

  const pathPrefix = apiData.jsonPathHint || 'results[0].hits[$i]';

  return {
    apiUrl: apiData.apiUrl || null,
    urlPattern: apiData.urlPattern || 'generic',
    method: apiData.method || 'GET',
    headers: apiData.headers || {},
    postData: apiData.postData || null,
    pathPrefix,
    fields: { titleField, subtitleField, urlField, imageField },
    sampleResult: sample,
    resultCount: apiData.results.length,
    searchUrl
  };
}

/**
 * Build standard `api_request` + `json_store_text` autocomplete steps
 * from a normalized API descriptor.
 *
 * These steps use only core engine commands (no browser-context commands).
 *
 * @param {Object} descriptor - From normalizeApiDescriptor()
 * @returns {Object[]} Array of recipe step objects
 */
export function buildApiSteps(descriptor) {
  if (!descriptor) return [];

  const { pathPrefix, fields } = descriptor;
  const steps = [];

  // Use the actual API URL discovered during interception, not the search page URL.
  // Fall back to searchUrl only if no API endpoint was captured.
  const rawApiUrl = descriptor.apiUrl || descriptor.searchUrl;

  // For POST APIs (e.g. Algolia), the query lives in the body, NOT the URL params.
  // URL params are typically API keys/config — do NOT substitute $INPUT into them.
  // Only substitute $INPUT in the URL for GET requests that lack a POST body.
  let apiUrl = rawApiUrl;
  if (descriptor.method === 'GET' || !descriptor.postData) {
    if (rawApiUrl.includes('?') && descriptor.searchUrl) {
      // Find which URL param actually contains the search query
      const searchUrlObj = tryParseUrl(descriptor.searchUrl);
      if (searchUrlObj) {
        const apiUrlObj = tryParseUrl(rawApiUrl);
        if (apiUrlObj) {
          for (const [key, val] of apiUrlObj.searchParams.entries()) {
            // Match the query value from the search page URL
            for (const searchVal of searchUrlObj.searchParams.values()) {
              if (searchVal && searchVal.length > 1 && val.includes(searchVal)) {
                apiUrlObj.searchParams.set(key, '$INPUT');
              }
            }
          }
          apiUrl = apiUrlObj.toString();
        }
      }
    }
  }

  const apiStep = {
    command: 'api_request',
    url: apiUrl,
    config: {
      method: descriptor.method || 'GET'
    },
    output: { name: 'API_RESPONSE' },
    description: 'Fetch search results from API'
  };

  // Add headers/body from discovery if available
  // Filter out volatile/session-specific headers that won't work at runtime
  if (descriptor.headers && typeof descriptor.headers === 'object') {
    const safeHeaders = {};
    const skipHeaders = ['cookie', 'referer', 'origin', 'content-length',
      'accept-encoding', 'sec-', 'user-agent', 'host'];
    for (const [key, value] of Object.entries(descriptor.headers)) {
      const lowerKey = key.toLowerCase();
      if (!skipHeaders.some(skip => lowerKey.startsWith(skip))) {
        safeHeaders[key] = value;
      }
    }
    if (Object.keys(safeHeaders).length > 0) {
      apiStep.config.headers = safeHeaders;
    }
  }

  // For POST body, replace the captured query with $INPUT
  if (descriptor.postData) {
    let body = descriptor.postData;
    // Try to find and replace the query value in the body
    // This handles Algolia-style {"requests":[{"params":"query=cacharel..."}]}
    // and simple {"query":"cacharel"} patterns
    if (descriptor.searchUrl) {
      // Extract query from the search URL to know what to replace
      const urlObj = tryParseUrl(descriptor.searchUrl);
      if (urlObj) {
        for (const val of urlObj.searchParams.values()) {
          if (val && val.length > 1 && body.includes(val)) {
            body = body.split(val).join('$INPUT');
          }
        }
      }
    }
    // Also replace URL-encoded query if present
    if (body.includes('$INPUT') === false) {
      // Fallback: replace any "query":"<value>" pattern
      body = body.replace(/"query"\s*:\s*"[^"]*"/, '"query":"$INPUT"');
    }
    apiStep.config.body = body;
  }

  steps.push(apiStep);

  // json_store_text extraction steps
  const extractionFields = [
    { field: fields.titleField, name: 'TITLE$i', desc: 'Extract titles from API response' },
    { field: fields.subtitleField, name: 'SUBTITLE$i', desc: 'Extract subtitles from API response' },
    { field: fields.urlField, name: 'URL$i', desc: 'Extract URLs from API response' },
    { field: fields.imageField, name: 'COVER$i', desc: 'Extract images from API response' },
  ];

  for (const { field, name, desc } of extractionFields) {
    steps.push({
      command: 'json_store_text',
      input: 'API_RESPONSE',
      locator: `${pathPrefix}.${field}`,
      output: { name },
      config: { loop: { index: 'i', from: 0, to: 9, step: 1 } },
      description: desc
    });
  }

  return steps;
}

function tryParseUrl(str) {
  try { return new URL(str); } catch { return null; }
}
