#!/usr/bin/env bun
/**
 * eval.js - CLI entry point for autoRecipe evaluations
 * 
 * Usage:
 *   bun Engine/scripts/evals/eval.js
 *   bun Engine/scripts/evals/eval.js --case=example-detail-page
 *   bun Engine/scripts/evals/eval.js --tag=movies
 *   bun Engine/scripts/evals/eval.js --label="after-opus-upgrade"
 */

import minimist from 'minimist';
import chalk from 'chalk';
import { runEval, loadCases } from './EvalRunner.js';

const args = minimist(process.argv.slice(2));

if (args.help) {
  console.log(`
${chalk.bold('autoRecipe Eval Runner')}

Runs golden test cases against autoRecipe and scores the results.

${chalk.bold('Usage:')}
  bun Engine/scripts/evals/eval.js [options]

${chalk.bold('Options:')}
  --case=<id>      Run a specific case by ID (repeatable)
  --tag=<tag>      Run cases matching a tag (repeatable)
  --label=<text>   Label this run for comparison (e.g. "baseline")
  --list           List available cases without running
  --help           Show this help

${chalk.bold('Examples:')}
  bun Engine/scripts/evals/eval.js
  bun Engine/scripts/evals/eval.js --case=imdb-movie-detail
  bun Engine/scripts/evals/eval.js --tag=movies --label="after-prompt-change"
  bun Engine/scripts/evals/eval.js --list
`);
  process.exit(0);
}

(async () => {
  try {
    // --list: show available cases
    if (args.list) {
      const cases = await loadCases();
      if (cases.length === 0) {
        console.log(chalk.yellow('No eval cases found in cases/ directory.'));
        process.exit(0);
      }
      console.log(chalk.bold(`\nAvailable eval cases (${cases.length}):\n`));
      for (const c of cases) {
        const tags = c.tags ? chalk.gray(` [${c.tags.join(', ')}]`) : '';
        console.log(`  ${chalk.cyan(c.id)} — ${c.mode}${tags}`);
        if (c.description) console.log(`    ${chalk.gray(c.description)}`);
        console.log(`    ${c.url || c.prompt}`);
      }
      console.log('');
      process.exit(0);
    }

    // Build options
    const options = {};
    if (args.case) options.caseId = args.case;
    if (args.tag) options.tag = args.tag;
    if (args.label) options.label = args.label;

    console.log(chalk.bold.cyan('\n🧪 autoRecipe Eval Runner\n'));

    const { runDir, summary } = await runEval(options);

    if (summary.failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error(chalk.red('\n✗ Error:'), err.message);
    process.exit(1);
  }
})();
