#!/usr/bin/env bun
/**
 * compare.js - Compare two autoRecipe eval runs side by side
 * 
 * Usage:
 *   bun Engine/scripts/evals/compare.js --runs=<run1>,<run2>
 *   bun Engine/scripts/evals/compare.js --list
 */

import minimist from 'minimist';
import chalk from 'chalk';
import { readFile, readdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(__dirname, 'runs');

const args = minimist(process.argv.slice(2));

if (args.help) {
  console.log(`
${chalk.bold('autoRecipe Eval Comparison')}

Compare scores between two eval runs.

${chalk.bold('Usage:')}
  bun Engine/scripts/evals/compare.js --runs=<run1>,<run2>
  bun Engine/scripts/evals/compare.js --list

${chalk.bold('Options:')}
  --runs=<a>,<b>   Compare run A (baseline) vs run B (new). Use folder names from runs/.
  --list           List available runs.
  --help           Show this help.

${chalk.bold('Examples:')}
  bun Engine/scripts/evals/compare.js --list
  bun Engine/scripts/evals/compare.js --runs=2026-02-12T22-00-00_baseline,2026-02-12T23-00-00_after-fix
`);
  process.exit(0);
}

async function listRuns() {
  try {
    const dirs = await readdir(RUNS_DIR);
    const runs = [];
    for (const d of dirs.sort()) {
      if (d.startsWith('.')) continue;
      const summaryPath = join(RUNS_DIR, d, 'summary.md');
      try {
        const content = await readFile(summaryPath, 'utf-8');
        const overallMatch = content.match(/## Overall: (.+)/);
        const overall = overallMatch ? overallMatch[1] : '—';
        runs.push({ name: d, overall });
      } catch {
        runs.push({ name: d, overall: '(no summary)' });
      }
    }
    return runs;
  } catch {
    return [];
  }
}

async function loadRunResults(runName) {
  const resultsDir = join(RUNS_DIR, runName, 'results');
  const files = await readdir(resultsDir);
  const results = {};
  for (const f of files.filter(f => f.endsWith('.json'))) {
    const content = await readFile(join(resultsDir, f), 'utf-8');
    const data = JSON.parse(content);
    results[data.caseId] = data;
  }
  return results;
}

(async () => {
  try {
    if (args.list) {
      const runs = await listRuns();
      if (runs.length === 0) {
        console.log(chalk.yellow('No eval runs found.'));
        process.exit(0);
      }
      console.log(chalk.bold(`\nAvailable runs (${runs.length}):\n`));
      for (const r of runs) {
        console.log(`  ${chalk.cyan(r.name)}  ${chalk.gray(r.overall)}`);
      }
      console.log('');
      process.exit(0);
    }

    if (!args.runs) {
      console.error(chalk.red('Error: --runs=<run1>,<run2> is required'));
      console.error('Use --list to see available runs, or --help for usage.');
      process.exit(1);
    }

    const [runA, runB] = args.runs.split(',');
    if (!runA || !runB) {
      console.error(chalk.red('Error: Provide exactly two run names separated by comma'));
      process.exit(1);
    }

    console.log(chalk.bold.cyan('\n📊 Eval Comparison\n'));
    console.log(`  Baseline: ${chalk.gray(runA)}`);
    console.log(`  New:      ${chalk.gray(runB)}\n`);

    const resultsA = await loadRunResults(runA);
    const resultsB = await loadRunResults(runB);

    // Merge case IDs
    const allCaseIds = [...new Set([...Object.keys(resultsA), ...Object.keys(resultsB)])].sort();

    if (allCaseIds.length === 0) {
      console.log(chalk.yellow('No case results found in either run.'));
      process.exit(0);
    }

    // Table header
    console.log('| Case | Baseline | New | Delta | Status |');
    console.log('|------|----------|-----|-------|--------|');

    let totalDelta = 0;
    let improvements = 0;
    let regressions = 0;
    let unchanged = 0;

    for (const caseId of allCaseIds) {
      const a = resultsA[caseId];
      const b = resultsB[caseId];

      const scoreA = a?.score?.score ?? '—';
      const scoreB = b?.score?.score ?? '—';

      let delta = '—';
      let status = '—';

      if (typeof scoreA === 'number' && typeof scoreB === 'number') {
        const diff = scoreB - scoreA;
        totalDelta += diff;
        delta = diff > 0 ? chalk.green(`+${diff}`) : diff < 0 ? chalk.red(`${diff}`) : chalk.gray('0');

        if (diff > 0) {
          improvements++;
          status = chalk.green('↑ improved');
        } else if (diff < 0) {
          regressions++;
          status = chalk.red('↓ regressed');
        } else {
          unchanged++;
          status = chalk.gray('= same');
        }
      } else if (scoreA === '—') {
        status = chalk.cyan('+ new');
      } else if (scoreB === '—') {
        status = chalk.yellow('- removed');
      }

      const passA = a?.score?.passed ? '✓' : '✗';
      const passB = b?.score?.passed ? '✓' : '✗';

      console.log(`| ${caseId} | ${scoreA} ${typeof scoreA === 'number' ? passA : ''} | ${scoreB} ${typeof scoreB === 'number' ? passB : ''} | ${delta} | ${status} |`);
    }

    console.log('');
    console.log(`  Improvements: ${chalk.green(improvements)}  Regressions: ${chalk.red(regressions)}  Unchanged: ${chalk.gray(unchanged)}`);
    console.log(`  Net delta: ${totalDelta > 0 ? chalk.green(`+${totalDelta}`) : totalDelta < 0 ? chalk.red(totalDelta) : chalk.gray('0')} points`);
    console.log('');

    // Write comparison markdown
    let md = `# Eval Comparison\n\n`;
    md += `- **Baseline**: ${runA}\n`;
    md += `- **New**: ${runB}\n\n`;
    md += '| Case | Baseline | New | Delta | Status |\n';
    md += '|------|----------|-----|-------|--------|\n';
    for (const caseId of allCaseIds) {
      const a = resultsA[caseId];
      const b = resultsB[caseId];
      const scoreA = a?.score?.score ?? '—';
      const scoreB = b?.score?.score ?? '—';
      let delta = '—';
      let status = '—';
      if (typeof scoreA === 'number' && typeof scoreB === 'number') {
        const diff = scoreB - scoreA;
        delta = diff > 0 ? `+${diff}` : `${diff}`;
        status = diff > 0 ? '↑ improved' : diff < 0 ? '↓ regressed' : '= same';
      }
      md += `| ${caseId} | ${scoreA} | ${scoreB} | ${delta} | ${status} |\n`;
    }
    md += `\n**Net delta**: ${totalDelta > 0 ? `+${totalDelta}` : totalDelta} points\n`;
    md += `**Improvements**: ${improvements}  **Regressions**: ${regressions}  **Unchanged**: ${unchanged}\n`;

    // Write to the newer run's directory
    const comparisonPath = join(RUNS_DIR, runB, `comparison_vs_${runA}.md`);
    const { writeFile } = await import('fs/promises');
    await writeFile(comparisonPath, md);
    console.log(`  Written: ${comparisonPath}\n`);

  } catch (err) {
    console.error(chalk.red('\n✗ Error:'), err.message);
    process.exit(1);
  }
})();
