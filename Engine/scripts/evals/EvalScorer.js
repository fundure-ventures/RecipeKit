/**
 * EvalScorer - Scores autoRecipe results against expected outcomes
 * 
 * Scoring rubric:
 *   fields_present  (40%) - % of expected_fields that exist and are non-empty
 *   urls_valid       (20%) - COVER and URL fields start with https://
 *   patterns_match   (20%) - % of expected_field_patterns that match
 *   no_errors        (20%) - Recipe ran without engine errors or repair exhaustion
 * 
 * Pass threshold: 70/100
 */

const PASS_THRESHOLD = 70;

const WEIGHTS = {
  fields_present: 0.4,
  urls_valid: 0.2,
  patterns_match: 0.2,
  no_errors: 0.2
};

/**
 * Score a single eval case result
 * 
 * @param {object} testCase - The golden test case definition
 * @param {object} result - The autoRecipe run result
 * @param {object} urlResults - The url_steps engine output (results object)
 * @param {object} autocompleteResults - The autocomplete engine output (results array), if applicable
 * @param {boolean} hadErrors - Whether the run had engine errors or exhausted repair loop
 * @returns {object} { score, metrics, passed, details }
 */
export function scoreCase(testCase, result, urlResults = {}, autocompleteResults = [], hadErrors = false) {
  const metrics = {};
  const details = {};

  // 1. fields_present — % of expected fields that are non-empty
  const expectedFields = testCase.expected_fields || [];
  if (expectedFields.length > 0) {
    const presentFields = [];
    const missingFields = [];
    for (const field of expectedFields) {
      const val = urlResults[field];
      const present = val !== undefined && val !== null && val !== '' && 
        (typeof val !== 'string' || val.trim() !== '');
      if (present) {
        presentFields.push(field);
      } else {
        missingFields.push(field);
      }
    }
    metrics.fields_present = (presentFields.length / expectedFields.length) * 100;
    details.fields_present = { presentFields, missingFields, total: expectedFields.length };
  } else {
    metrics.fields_present = 100;
    details.fields_present = { presentFields: [], missingFields: [], total: 0 };
  }

  // 2. urls_valid — COVER and URL must start with https://
  const urlFieldsToCheck = ['COVER', 'URL'];
  const urlChecks = [];
  let urlValidCount = 0;
  let urlTotalCount = 0;
  for (const field of urlFieldsToCheck) {
    const val = urlResults[field];
    if (val && typeof val === 'string' && val.trim() !== '') {
      urlTotalCount++;
      const valid = val.startsWith('https://');
      if (valid) urlValidCount++;
      urlChecks.push({ field, value: val.slice(0, 120), valid });
    }
  }
  metrics.urls_valid = urlTotalCount > 0 ? (urlValidCount / urlTotalCount) * 100 : 100;
  details.urls_valid = { checks: urlChecks, valid: urlValidCount, total: urlTotalCount };

  // 3. patterns_match — % of expected_field_patterns that match
  const patterns = testCase.expected_field_patterns || {};
  const patternKeys = Object.keys(patterns);
  if (patternKeys.length > 0) {
    const patternChecks = [];
    let patternMatchCount = 0;
    for (const field of patternKeys) {
      const val = urlResults[field];
      const pattern = new RegExp(patterns[field], 'i');
      const matched = val && typeof val === 'string' && pattern.test(val);
      if (matched) patternMatchCount++;
      patternChecks.push({ field, pattern: patterns[field], value: val?.toString().slice(0, 120) || '(empty)', matched });
    }
    metrics.patterns_match = (patternMatchCount / patternKeys.length) * 100;
    details.patterns_match = { checks: patternChecks, matched: patternMatchCount, total: patternKeys.length };
  } else {
    metrics.patterns_match = 100;
    details.patterns_match = { checks: [], matched: 0, total: 0 };
  }

  // 4. no_errors — binary: 100 if no errors, 0 if errors
  metrics.no_errors = hadErrors ? 0 : 100;
  details.no_errors = { hadErrors, success: result?.success ?? false };

  // Composite score
  const score = Math.round(
    metrics.fields_present * WEIGHTS.fields_present +
    metrics.urls_valid * WEIGHTS.urls_valid +
    metrics.patterns_match * WEIGHTS.patterns_match +
    metrics.no_errors * WEIGHTS.no_errors
  );

  const passed = score >= PASS_THRESHOLD;

  return { score, metrics, passed, details, threshold: PASS_THRESHOLD };
}

/**
 * Summarise scores across multiple cases
 * 
 * @param {Array<{caseId: string, score: object}>} caseScores
 * @returns {object} { totalCases, passed, failed, avgScore, passRate }
 */
export function summariseRun(caseScores) {
  const totalCases = caseScores.length;
  const passed = caseScores.filter(c => c.score.passed).length;
  const failed = totalCases - passed;
  const avgScore = totalCases > 0
    ? Math.round(caseScores.reduce((sum, c) => sum + c.score.score, 0) / totalCases)
    : 0;
  const passRate = totalCases > 0 ? Math.round((passed / totalCases) * 100) : 0;

  return { totalCases, passed, failed, avgScore, passRate };
}

export { PASS_THRESHOLD, WEIGHTS };
