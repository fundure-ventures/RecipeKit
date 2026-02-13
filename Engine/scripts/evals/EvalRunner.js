/**
 * EvalRunner - Runs autoRecipe eval cases and collects traces
 * 
 * Strategy: runs autoRecipe.js as a subprocess (no internal modifications),
 * then independently runs the engine to score the generated recipe.
 */

import { spawn } from 'bun';
import { readFile, writeFile, readdir, access, unlink, mkdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { scoreCase, summariseRun } from './EvalScorer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const ENGINE_DIR = resolve(__dirname, '../..');
const AUTORECIPE_SCRIPT = resolve(__dirname, '../autoRecipe.js');
const ENGINE_SCRIPT = resolve(ENGINE_DIR, 'engine.js');
const CASES_DIR = resolve(__dirname, 'cases');
const RUNS_DIR = resolve(__dirname, 'runs');

/**
 * Load eval cases from the cases/ directory
 * @param {object} options - { caseId, tag } filters
 * @returns {Array} Loaded and filtered cases
 */
export async function loadCases(options = {}) {
  const files = await readdir(CASES_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  const cases = [];
  for (const file of jsonFiles) {
    const content = await readFile(join(CASES_DIR, file), 'utf-8');
    const testCase = JSON.parse(content);
    cases.push(testCase);
  }

  let filtered = cases;

  if (options.caseId) {
    const ids = Array.isArray(options.caseId) ? options.caseId : [options.caseId];
    filtered = filtered.filter(c => ids.includes(c.id));
  }

  if (options.tag) {
    const tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    filtered = filtered.filter(c => c.tags && tags.some(t => c.tags.includes(t)));
  }

  return filtered;
}

/**
 * Run autoRecipe.js as a subprocess
 * @param {object} testCase - The eval case
 * @param {string} outputDir - Directory to write recipe files
 * @returns {object} { stdout, stderr, exitCode, duration_ms }
 */
async function runAutoRecipe(testCase, outputDir, onProgress) {
  const args = ['bun', AUTORECIPE_SCRIPT, '--force', '--debug'];

  if (outputDir) {
    args.push(`--output-dir=${outputDir}`);
  }

  if (testCase.mode === 'url-only') {
    args.push(`--url=${testCase.url}`, '--url-only');
  } else if (testCase.mode === 'url') {
    args.push(`--url=${testCase.url}`);
  } else if (testCase.mode === 'prompt') {
    args.push(`--prompt=${testCase.prompt}`);
  }

  const start = Date.now();
  const proc = spawn(args, { cwd: REPO_ROOT });

  // Stream stdout — progress parsing is best-effort and never affects the result
  const chunks = [];
  let stdout = '';
  try {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let partial = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      chunks.push(text);
      // Best-effort progress detection — never throws
      if (onProgress) {
        try {
          partial += text;
          const lines = partial.split('\n');
          partial = lines.pop();
          for (const line of lines) {
            if (/phase\s*\d/i.test(line) || /probing|generating|repair|validat/i.test(line)) {
              const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim().slice(0, 60);
              if (clean) onProgress(clean);
            }
          }
        } catch { /* progress is cosmetic — ignore */ }
      }
    }
    stdout = chunks.join('');
  } catch {
    // If streaming fails, fall back to collected chunks
    stdout = chunks.join('');
  }

  const stderr = await new Response(proc.stderr).text().catch(() => '');
  const exitCode = await proc.exited;
  const duration_ms = Date.now() - start;

  return { stdout, stderr, exitCode, duration_ms };
}

/**
 * Run the engine to get url_steps results for a recipe
 * @param {string} recipePath - Path to the recipe JSON
 * @param {string} url - The detail page URL
 * @returns {object} { success, results }
 */
async function runEngine(recipePath, type, input) {
  try {
    const proc = spawn([
      'bun', ENGINE_SCRIPT,
      '--recipe', recipePath,
      '--type', type,
      '--input', input
    ], { cwd: REPO_ROOT });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode === 0) {
      try {
        const data = JSON.parse(stdout);
        return { success: true, results: data.results || {} };
      } catch {
        return { success: false, results: {}, error: 'Invalid JSON output' };
      }
    }
    return { success: false, results: {}, error: `Exit code ${exitCode}` };
  } catch (e) {
    return { success: false, results: {}, error: e.message };
  }
}

/**
 * Determine the generated recipe path from a URL or prompt
 */
function getRecipePath(testCase, outputDir) {
  let hostname;
  if (testCase.url) {
    try {
      hostname = new URL(testCase.url).hostname.replace(/^www\./, '');
    } catch {
      hostname = testCase.url;
    }
  } else if (testCase.prompt) {
    // For prompt mode, we can't predict the domain — we'll scan generated/ after run
    return null;
  }
  const domain = hostname.replace(/\./g, '');
  const baseDir = outputDir || join(REPO_ROOT, 'generated');
  return join(baseDir, `${domain}.json`);
}

/**
 * Find the most recently modified recipe in a directory
 */
async function findLatestRecipe(outputDir) {
  const dir = outputDir || join(REPO_ROOT, 'generated');
  const files = await readdir(dir);
  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.test.js'));

  let latest = null;
  let latestTime = 0;
  for (const f of jsonFiles) {
    const path = join(dir, f);
    const stat = await Bun.file(path).stat?.() || { mtimeMs: 0 };
    // Fallback: use file read to check recency
    if (!latest) {
      latest = path;
    }
  }
  return latest;
}

/**
 * Run a single eval case end-to-end
 * @param {object} testCase
 * @param {string} outputDir - Directory for this case's recipe output
 * @param {function} onProgress - Optional callback for progress updates
 * @returns {object} Full case result with events and score
 */
async function runCase(testCase, outputDir, onProgress) {
  const events = [];
  const timestamp = () => new Date().toISOString();

  // Ensure output dir exists
  await mkdir(outputDir, { recursive: true });

  events.push({ type: 'case_start', time: timestamp(), case_id: testCase.id, mode: testCase.mode });

  // Step 1: Run autoRecipe with output redirected to eval dir
  events.push({ type: 'autorecipe_start', time: timestamp() });
  const autoRecipeResult = await runAutoRecipe(testCase, outputDir, onProgress);
  events.push({
    type: 'autorecipe_end',
    time: timestamp(),
    exitCode: autoRecipeResult.exitCode,
    duration_ms: autoRecipeResult.duration_ms,
    stdout: autoRecipeResult.stdout,
    stderr: autoRecipeResult.stderr
  });

  // Extract agent turns from debug output
  const agentTurns = parseAgentTurns(autoRecipeResult.stdout + '\n' + autoRecipeResult.stderr);
  if (agentTurns.length > 0) {
    events.push({ type: 'agent_turns', time: timestamp(), turns: agentTurns });
  }

  // Step 2: Determine recipe path and run engine for scoring
  let recipePath = getRecipePath(testCase, outputDir);
  let urlResults = {};
  let autocompleteResults = [];
  let hadErrors = autoRecipeResult.exitCode !== 0;

  if (recipePath) {
    let recipeExists = false;
    try {
      await access(recipePath);
      recipeExists = true;
    } catch {}

    if (recipeExists) {
      // Run engine to get url_steps results — use test_url (detail page) if provided
      const detailUrl = testCase.test_url || testCase.url || '';
      if (detailUrl) {
        events.push({ type: 'engine_url_start', time: timestamp() });
        const urlRun = await runEngine(recipePath, 'url', detailUrl);
        events.push({ type: 'engine_url_end', time: timestamp(), success: urlRun.success, results: urlRun.results });
        urlResults = urlRun.results || {};
        if (!urlRun.success) hadErrors = true;
      }

      // For full mode, also test autocomplete
      if (testCase.mode === 'url' && testCase.test_query) {
        events.push({ type: 'engine_autocomplete_start', time: timestamp() });
        const acRun = await runEngine(recipePath, 'autocomplete', testCase.test_query);
        events.push({ type: 'engine_autocomplete_end', time: timestamp(), success: acRun.success, results: acRun.results });
        autocompleteResults = Array.isArray(acRun.results) ? acRun.results : [];
      }

      // Read the generated recipe for the trace
      try {
        const recipeContent = await readFile(recipePath, 'utf-8');
        events.push({ type: 'recipe_content', time: timestamp(), recipe: JSON.parse(recipeContent) });
      } catch {}
    } else {
      hadErrors = true;
      events.push({ type: 'recipe_not_found', time: timestamp(), path: recipePath });
    }
  } else {
    hadErrors = true;
  }

  // Step 3: Score
  const score = scoreCase(testCase, { success: !hadErrors }, urlResults, autocompleteResults, hadErrors);
  events.push({ type: 'score', time: timestamp(), score });

  events.push({ type: 'case_end', time: timestamp(), case_id: testCase.id });

  return {
    caseId: testCase.id,
    testCase,
    score,
    urlResults,
    autocompleteResults,
    agentTurns,
    events,
    duration_ms: autoRecipeResult.duration_ms
  };
}

/**
 * Parse agent turns from autoRecipe debug output
 * Extracts [agentType] Sending task... / Response received patterns
 */
function parseAgentTurns(output) {
  const turns = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match: DEBUG: [author] Sending task...
    const sendMatch = line.match(/\[(\w+)\]\s+Sending task/);
    if (sendMatch) {
      turns.push({ agent: sendMatch[1], type: 'send', raw: line.trim() });
    }
    // Match: DEBUG: [author] Response received (1234 chars)
    const recvMatch = line.match(/\[(\w+)\]\s+Response received\s+\((\d+)\s+chars\)/);
    if (recvMatch) {
      turns.push({ agent: recvMatch[1], type: 'receive', chars: parseInt(recvMatch[2]), raw: line.trim() });
    }
    // Match: Creating new X session with model Y
    const sessionMatch = line.match(/Creating new (\w+) session with model (.+)/);
    if (sessionMatch) {
      turns.push({ agent: sessionMatch[1], type: 'session_create', model: sessionMatch[2].trim(), raw: line.trim() });
    }
  }

  return turns;
}

/**
 * Generate summary markdown from eval results
 */
function generateSummary(label, caseResults, runSummary, usage) {
  const now = new Date().toISOString();
  let md = `# Eval Run: ${now}`;
  if (label) md += ` — "${label}"`;
  md += '\n\n';

  md += `## Overall: ${runSummary.passed}/${runSummary.totalCases} passed (${runSummary.passRate}%) — avg score: ${runSummary.avgScore}\n\n`;

  // Results table
  md += '| Case | Mode | Score | Fields | URLs | Patterns | Errors | Status |\n';
  md += '|------|------|-------|--------|------|----------|--------|--------|\n';
  for (const cr of caseResults) {
    const s = cr.score;
    const m = s.metrics;
    const d = s.details;
    md += `| ${cr.caseId} | ${cr.testCase.mode} | ${s.score} | `;
    md += `${d.fields_present.presentFields.length}/${d.fields_present.total} | `;
    md += `${d.urls_valid.valid}/${d.urls_valid.total} | `;
    md += `${d.patterns_match.matched}/${d.patterns_match.total} | `;
    md += `${s.details.no_errors.hadErrors ? '✗' : '✓'} | `;
    md += `${s.passed ? 'PASS' : 'FAIL'} |\n`;
  }

  // Usage summary (from agent turns)
  md += '\n## Agent Turns\n\n';
  const agentSummary = {};
  for (const cr of caseResults) {
    for (const turn of cr.agentTurns) {
      if (!agentSummary[turn.agent]) {
        agentSummary[turn.agent] = { sends: 0, receives: 0, model: turn.model || '—' };
      }
      if (turn.type === 'send') agentSummary[turn.agent].sends++;
      if (turn.type === 'receive') agentSummary[turn.agent].receives++;
      if (turn.model) agentSummary[turn.agent].model = turn.model;
    }
  }

  if (Object.keys(agentSummary).length > 0) {
    md += '| Agent | Requests | Responses | Model |\n';
    md += '|-------|----------|-----------|-------|\n';
    for (const [agent, stats] of Object.entries(agentSummary)) {
      md += `| ${agent} | ${stats.sends} | ${stats.receives} | ${stats.model} |\n`;
    }
  } else {
    md += '_No agent turn data captured (run with --debug for full traces)_\n';
  }

  // Per-case details
  md += '\n## Per-Case Details\n\n';
  for (const cr of caseResults) {
    md += `### ${cr.caseId}\n\n`;
    md += `- **Mode**: ${cr.testCase.mode}\n`;
    md += `- **Score**: ${cr.score.score}/100 (${cr.score.passed ? 'PASS' : 'FAIL'})\n`;
    md += `- **Duration**: ${(cr.duration_ms / 1000).toFixed(1)}s\n`;

    const extractedFields = Object.keys(cr.urlResults).filter(k => {
      const v = cr.urlResults[k];
      return v !== '' && v !== null && v !== undefined;
    });
    md += `- **Fields extracted**: ${extractedFields.length > 0 ? extractedFields.join(', ') : '(none)'}\n`;

    if (cr.score.details.fields_present.missingFields.length > 0) {
      md += `- **Missing fields**: ${cr.score.details.fields_present.missingFields.join(', ')}\n`;
    }

    if (cr.score.details.urls_valid.checks.length > 0) {
      const invalid = cr.score.details.urls_valid.checks.filter(c => !c.valid);
      if (invalid.length > 0) {
        md += `- **Invalid URLs**: ${invalid.map(c => `${c.field}: ${c.value}`).join(', ')}\n`;
      }
    }

    if (cr.score.details.patterns_match.checks.length > 0) {
      const failed = cr.score.details.patterns_match.checks.filter(c => !c.matched);
      if (failed.length > 0) {
        md += `- **Pattern mismatches**: ${failed.map(c => `${c.field} (expected /${c.pattern}/)`).join(', ')}\n`;
      }
    }

    md += `- **Agent turns**: ${cr.agentTurns.length}\n`;
    md += '\n';
  }

  return md;
}

/**
 * Run all eval cases and write results
 * @param {object} options - { caseId, tag, label }
 * @returns {object} { runDir, summary, caseResults }
 */
export async function runEval(options = {}) {
  const cases = await loadCases(options);

  if (cases.length === 0) {
    throw new Error('No eval cases found matching the given filters');
  }

  // Create run directory — date only, append time if folder already exists
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toISOString().replace(/[:.]/g, '-').slice(11, 19); // HH-MM-SS
  const label = options.label || '';
  const baseName = label ? `${dateStr}_${label.replace(/\s+/g, '-')}` : dateStr;

  let dirName = baseName;
  try {
    await access(join(RUNS_DIR, dirName));
    // Already exists — append time
    dirName = label ? `${dateStr}-${timeStr}_${label.replace(/\s+/g, '-')}` : `${dateStr}-${timeStr}`;
  } catch { /* doesn't exist, use date-only name */ }

  const runDir = join(RUNS_DIR, dirName);
  const resultsDir = join(runDir, 'results');
  const recipesDir = join(runDir, 'recipes');
  await mkdir(runDir, { recursive: true });
  await mkdir(resultsDir, { recursive: true });
  await mkdir(recipesDir, { recursive: true });

  const totalStart = Date.now();
  let completed = 0;

  console.log(`\nRunning ${cases.length} eval case(s) in parallel...\n`);

  // Live-updating display: one fixed line per case
  const caseLines = {};
  const caseOrder = cases.map(c => c.id);
  for (const c of cases) {
    caseLines[c.id] = `  ▸ ${c.id} (${c.mode}) — waiting...`;
  }

  // Print initial lines
  for (const id of caseOrder) {
    process.stdout.write(caseLines[id] + '\n');
  }

  function redraw() {
    // Move cursor up N lines, redraw each, move back down
    const n = caseOrder.length;
    process.stdout.write(`\x1b[${n}A`); // move up
    for (const id of caseOrder) {
      process.stdout.write(`\x1b[2K${caseLines[id]}\n`); // clear line + write
    }
  }

  // Run all cases in parallel, each writing recipes to the eval run folder
  const casePromises = cases.map(async (testCase) => {
    const caseStart = Date.now();

    const onProgress = (msg) => {
      const elapsed = ((Date.now() - caseStart) / 1000).toFixed(0);
      caseLines[testCase.id] = `  ⏳ ${testCase.id} [${elapsed}s] ${msg}`;
      redraw();
    };

    caseLines[testCase.id] = `  ▸ ${testCase.id} (${testCase.mode})...`;
    redraw();

    const result = await runCase(testCase, recipesDir, onProgress);
    completed++;

    const status = result.score.passed ? '✓ PASS' : '✗ FAIL';
    caseLines[testCase.id] = `  ${status} ${testCase.id}: score ${result.score.score}/100 (${(result.duration_ms / 1000).toFixed(1)}s)`;
    redraw();

    // Write per-case result
    await writeFile(
      join(resultsDir, `${testCase.id}.json`),
      JSON.stringify(result, null, 2)
    );

    return result;
  });

  const caseResults = await Promise.all(casePromises);

  // Compute summary
  const runSummary = summariseRun(caseResults);

  // Collect all events
  const allEvents = caseResults.flatMap(cr => cr.events);

  // Write events.json
  await writeFile(join(runDir, 'events.json'), JSON.stringify(allEvents, null, 2));

  // Write summary.md
  const summaryMd = generateSummary(label, caseResults, runSummary, {});
  await writeFile(join(runDir, 'summary.md'), summaryMd);

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Overall: ${runSummary.passed}/${runSummary.totalCases} passed (${runSummary.passRate}%) — avg score: ${runSummary.avgScore}`);
  console.log(`Total time: ${totalElapsed}s`);
  console.log(`Results: ${runDir}`);
  console.log(`Summary: ${join(runDir, 'summary.md')}`);

  return { runDir, summary: runSummary, caseResults };
}
