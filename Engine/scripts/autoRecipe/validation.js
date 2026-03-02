/**
 * Validation utilities for recipe results
 * Helps detect false positives (results that don't match the query)
 */

/**
 * Check if results semantically match the search query
 * @param {Array} results - Array of result objects with TITLE, SUBTITLE, etc.
 * @param {string} query - The search query used
 * @param {number} minMatchRatio - Minimum ratio of results that should match (default 0.3)
 * @returns {Object} Validation result
 */
export function validateSemanticMatch(results, query, minMatchRatio = 0.3) {
  if (!results || results.length === 0) {
    return { valid: false, reason: 'No results', matchCount: 0, totalCount: 0 };
  }

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  let matchCount = 0;
  const matchDetails = [];

  for (const result of results) {
    const searchableText = [
      result.TITLE || '',
      result.SUBTITLE || '',
      result.DESCRIPTION || '',
      result.URL || ''
    ].join(' ').toLowerCase();

    // Check for exact query match or any query word match
    const hasExactMatch = searchableText.includes(queryLower);
    const hasWordMatch = queryWords.some(word => searchableText.includes(word));
    const isMatch = hasExactMatch || hasWordMatch;

    if (isMatch) {
      matchCount++;
    }
    
    matchDetails.push({
      title: result.TITLE || '(empty)',
      matched: isMatch,
      matchType: hasExactMatch ? 'exact' : (hasWordMatch ? 'word' : 'none')
    });
  }

  const matchRatio = matchCount / results.length;
  const valid = matchRatio >= minMatchRatio;

  return {
    valid,
    matchCount,
    totalCount: results.length,
    matchRatio: Math.round(matchRatio * 100),
    reason: valid 
      ? `${matchCount}/${results.length} results match query` 
      : `Only ${matchCount}/${results.length} results match query (need ${Math.round(minMatchRatio * 100)}%)`,
    details: matchDetails
  };
}

/**
 * Validate results against multiple queries to detect false positives
 * A recipe that returns the same results for different queries is likely broken
 * @param {Function} runRecipe - Async function that takes a query and returns results
 * @param {string[]} queries - Array of different queries to test
 * @returns {Object} Validation result
 */
export async function validateMultiQuery(runRecipe, queries) {
  if (queries.length < 2) {
    return { valid: true, reason: 'Need at least 2 queries for multi-query validation' };
  }

  const resultsPerQuery = [];
  
  for (const query of queries) {
    try {
      const results = await runRecipe(query);
      resultsPerQuery.push({
        query,
        results,
        titles: results.map(r => r.TITLE || '').filter(Boolean)
      });
    } catch (error) {
      resultsPerQuery.push({ query, error: error.message, results: [], titles: [] });
    }
  }

  // Check if results are identical (false positive indicator)
  const allTitles = resultsPerQuery.map(r => JSON.stringify(r.titles.sort()));
  const uniqueTitleSets = new Set(allTitles);
  
  if (uniqueTitleSets.size === 1 && resultsPerQuery[0].titles.length > 0) {
    return {
      valid: false,
      reason: 'All queries returned identical results - recipe may not be searching',
      queries: resultsPerQuery.map(r => ({ query: r.query, resultCount: r.results.length }))
    };
  }

  // Check semantic match for each query
  const semanticResults = resultsPerQuery.map(r => ({
    query: r.query,
    ...validateSemanticMatch(r.results, r.query)
  }));

  const failedQueries = semanticResults.filter(r => !r.valid);
  
  return {
    valid: failedQueries.length === 0,
    reason: failedQueries.length === 0 
      ? 'All queries returned relevant results'
      : `${failedQueries.length}/${queries.length} queries returned irrelevant results`,
    details: semanticResults
  };
}

/**
 * Comprehensive result validation
 * @param {Array} results - Recipe results
 * @param {string} query - Search query
 * @returns {Object} Validation summary
 */
export function validateResults(results, query) {
  const issues = [];
  
  // Check for empty results
  if (!results || results.length === 0) {
    return { valid: false, issues: ['No results returned'] };
  }

  // Check required fields
  const emptyTitles = results.filter(r => !r.TITLE || r.TITLE.trim() === '').length;
  if (emptyTitles > 0) {
    issues.push(`${emptyTitles}/${results.length} results have empty TITLE`);
  }

  const emptyUrls = results.filter(r => !r.URL || r.URL.trim() === '').length;
  if (emptyUrls > 0) {
    issues.push(`${emptyUrls}/${results.length} results have empty URL`);
  }

  // Check for base domain URLs (indicates broken URL extraction)
  const baseDomainUrls = results.filter(r => {
    if (!r.URL) return false;
    try {
      const url = new URL(r.URL);
      return url.pathname === '/' || url.pathname === '';
    } catch {
      return false;
    }
  }).length;
  
  if (baseDomainUrls > 0) {
    issues.push(`${baseDomainUrls}/${results.length} URLs are just base domain (no path)`);
  }

  // Check semantic match
  const semanticCheck = validateSemanticMatch(results, query);
  if (!semanticCheck.valid) {
    issues.push(semanticCheck.reason);
  }

  return {
    valid: issues.length === 0,
    resultCount: results.length,
    issues,
    semanticMatch: semanticCheck
  };
}
