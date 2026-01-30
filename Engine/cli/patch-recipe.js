#!/usr/bin/env bun
/**
 * patch-recipe.js - Apply a quick fix to a recipe
 * 
 * Usage:
 *   bun Engine/cli/patch-recipe.js <recipe.json> --step <n> --field <name> --value <new-value>
 *   bun Engine/cli/patch-recipe.js <recipe.json> --show
 * 
 * Examples:
 *   bun Engine/cli/patch-recipe.js generated/funko_com.json --show
 *   bun Engine/cli/patch-recipe.js generated/funko_com.json --step 1 --field locator --value ".col-6:nth-child(\$i) .pdp-link"
 */

import { readFile, writeFile } from 'fs/promises';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2), {
  string: ['field', 'f', 'value', 'v', 'type', 't'],
  number: ['step', 's'],
  boolean: ['show', 'json', 'help', 'h', 'dry-run', 'n'],
  alias: { s: 'step', f: 'field', v: 'value', t: 'type', h: 'help', n: 'dry-run' },
  default: { type: 'autocomplete_steps' }
});

const recipePath = args._[0];
const stepIndex = args.step;
const field = args.field;
const newValue = args.value;
const stepType = args.type;
const showOnly = args.show;
const jsonOutput = args.json;
const dryRun = args['dry-run'];

if (args.help || !recipePath) {
  console.log(`
patch-recipe - Apply a quick fix to a recipe

Usage:
  bun Engine/cli/patch-recipe.js <recipe.json> [options]

Options:
  --show                 Show recipe steps without modifying
  --step, -s <n>         Step index to modify (0-based)
  --field, -f <name>     Field to modify (e.g., locator, url, attribute_name)
  --value, -v <new>      New value for the field
  --type, -t <type>      Step type: autocomplete_steps or url_steps (default: autocomplete_steps)
  --dry-run, -n          Show what would change without writing
  --json                 Output as JSON
  --help, -h             Show this help

Examples:
  # Show current steps
  bun Engine/cli/patch-recipe.js generated/funko_com.json --show

  # Patch a locator in autocomplete step 1
  bun Engine/cli/patch-recipe.js generated/funko_com.json -s 1 -f locator -v ".col-6:nth-child(\\$i) .pdp-link"

  # Patch url_steps instead
  bun Engine/cli/patch-recipe.js generated/funko_com.json -s 0 -f url -v "https://new.com" --type url_steps

  # Dry run (preview changes)
  bun Engine/cli/patch-recipe.js generated/funko_com.json -s 1 -f locator -v "new-selector" --dry-run
`);
  process.exit(0);
}

async function main() {
  let recipe;
  try {
    const content = await readFile(recipePath, 'utf-8');
    recipe = JSON.parse(content);
  } catch (err) {
    console.error(`Error reading recipe: ${err.message}`);
    process.exit(1);
  }
  
  // Show mode
  if (showOnly) {
    console.log(`\n📄 Recipe: ${recipePath}\n`);
    
    for (const type of ['autocomplete_steps', 'url_steps']) {
      const steps = recipe[type];
      if (!steps || steps.length === 0) continue;
      
      console.log(`📋 ${type}:`);
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const cmd = step.command;
        const loc = step.locator || step.url || '';
        const desc = step.description || '';
        console.log(`   [${i}] ${cmd}: ${loc.slice(0, 60)}${loc.length > 60 ? '...' : ''}`);
        if (step.output?.name) {
          console.log(`       → ${step.output.name}`);
        }
      }
      console.log('');
    }
    
    if (jsonOutput) {
      console.log(JSON.stringify(recipe, null, 2));
    }
    return;
  }
  
  // Patch mode
  if (stepIndex === undefined || !field || newValue === undefined) {
    console.error('Error: --step, --field, and --value are required for patching');
    console.error('Use --show to see current steps, or --help for usage');
    process.exit(1);
  }
  
  const steps = recipe[stepType];
  if (!steps) {
    console.error(`Error: Recipe has no ${stepType}`);
    process.exit(1);
  }
  
  if (stepIndex < 0 || stepIndex >= steps.length) {
    console.error(`Error: Step index ${stepIndex} out of range (0-${steps.length - 1})`);
    process.exit(1);
  }
  
  const step = steps[stepIndex];
  const oldValue = step[field];
  
  if (oldValue === undefined) {
    console.error(`Error: Step ${stepIndex} has no field "${field}"`);
    console.error(`Available fields: ${Object.keys(step).join(', ')}`);
    process.exit(1);
  }
  
  // Apply patch
  step[field] = newValue;
  
  const result = {
    recipePath,
    stepType,
    stepIndex,
    field,
    oldValue,
    newValue,
    dryRun
  };
  
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n${dryRun ? '🔍 DRY RUN - ' : ''}📝 Patching ${recipePath}\n`);
    console.log(`   Step: ${stepType}[${stepIndex}]`);
    console.log(`   Field: ${field}`);
    console.log(`   Old: ${oldValue}`);
    console.log(`   New: ${newValue}`);
  }
  
  if (!dryRun) {
    await writeFile(recipePath, JSON.stringify(recipe, null, 2));
    if (!jsonOutput) {
      console.log(`\n✅ Saved\n`);
    }
  } else {
    if (!jsonOutput) {
      console.log(`\n⚠️  Not saved (dry run). Remove --dry-run to apply.\n`);
    }
  }
}

main();
