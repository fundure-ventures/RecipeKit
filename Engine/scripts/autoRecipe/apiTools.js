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

  // Build the api_request step using the discovered API URL.
  // Replace the actual query with $INPUT so the engine substitutes at runtime.
  const apiUrl = descriptor.searchUrl.replace(/=[^&]+/, '=$INPUT');

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
  if (Object.keys(descriptor.headers).length > 0) {
    apiStep.config.headers = descriptor.headers;
  }
  if (descriptor.postData) {
    apiStep.config.body = descriptor.postData;
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
