#!/usr/bin/env node
/**
 * Recipe Debugger - Step-by-step execution of recipe with detailed output
 * 
 * Usage:
 *   node debug-recipe.js <recipe.json> --type <autocomplete|url> --input <value> [options]
 * 
 * Options:
 *   --step <n>         Run only step n (0-indexed)
 *   --pause            Pause after each step for inspection
 *   --screenshot       Take screenshot after each step
 *   --output json|text Output format (default: text)
 * 
 * Examples:
 *   node debug-recipe.js ../../generic/example.json --type autocomplete --input "test"
 *   node debug-recipe.js ../../generic/example.json --type url --input "https://example.com/item"
 *   node debug-recipe.js ../../generic/example.json --type autocomplete --input "test" --step 1
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function debugRecipe(recipePath, options) {
  // Load recipe
  const fullPath = path.resolve(recipePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`Recipe not found: ${fullPath}`);
    process.exit(1);
  }
  
  const recipe = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  const stepType = options.type === 'autocomplete' ? 'autocomplete_steps' : 'url_steps';
  const steps = recipe[stepType];
  
  if (!steps || steps.length === 0) {
    console.error(`No ${stepType} found in recipe`);
    process.exit(1);
  }
  
  console.log(`\n📋 Recipe: ${path.basename(recipePath)}`);
  console.log(`   Type: ${stepType}`);
  console.log(`   Input: ${options.input}`);
  console.log(`   Steps: ${steps.length}\n`);
  
  const browser = await puppeteer.launch({ 
    headless: options.screenshot ? false : true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  });
  
  try {
    const page = await browser.newPage();
    const variables = {
      INPUT: options.input,
      i: 1
    };
    
    for (let i = 0; i < steps.length; i++) {
      if (options.step !== undefined && options.step !== i) continue;
      
      const step = steps[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`STEP ${i}: ${step.command}`);
      console.log('='.repeat(60));
      console.log(`Config: ${JSON.stringify(step, null, 2)}`);
      
      try {
        const result = await executeStep(page, step, variables, options);
        console.log(`\n✓ Result:`);
        console.log(JSON.stringify(result, null, 2));
        
        if (options.screenshot) {
          const screenshotPath = `/tmp/recipe-debug-step-${i}.png`;
          await page.screenshot({ path: screenshotPath, fullPage: false });
          console.log(`📸 Screenshot: ${screenshotPath}`);
        }
        
        if (options.pause) {
          await waitForKeypress(`Press Enter to continue to next step...`);
        }
      } catch (err) {
        console.log(`\n❌ Error: ${err.message}`);
        
        // Diagnostic info
        console.log('\n--- Diagnostics ---');
        if (step.locator) {
          const locator = replaceVariables(step.locator, variables);
          console.log(`Resolved locator: ${locator}`);
          
          const exists = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el ? {
              found: true,
              tag: el.tagName,
              text: el.textContent?.trim().slice(0, 100),
              visible: el.offsetParent !== null
            } : { found: false };
          }, locator);
          
          console.log(`Element check: ${JSON.stringify(exists, null, 2)}`);
        }
        
        if (options.screenshot) {
          const screenshotPath = `/tmp/recipe-debug-error-${i}.png`;
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`📸 Error screenshot: ${screenshotPath}`);
        }
      }
    }
    
    // Print final variables
    console.log(`\n${'='.repeat(60)}`);
    console.log('FINAL VARIABLES');
    console.log('='.repeat(60));
    console.log(JSON.stringify(variables, null, 2));
    
  } finally {
    if (!options.pause) {
      await browser.close();
    }
  }
}

async function executeStep(page, step, variables, options) {
  const command = step.command;
  
  switch (command) {
    case 'load': {
      const url = replaceVariables(step.url, variables);
      console.log(`\nLoading: ${url}`);
      await page.goto(url, { 
        waitUntil: step.config?.waitUntil || 'networkidle0',
        timeout: step.config?.timeout || 30000 
      });
      
      // Dismiss cookie banners
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button[class*="consent"], button[class*="accept"]');
        btns.forEach(b => b.click());
      });
      await new Promise(r => setTimeout(r, 1000));
      
      return { url, title: await page.title() };
    }
    
    case 'store_text': {
      if (step.config?.loop) {
        return await executeLoopStep(page, step, variables, 'text');
      }
      const locator = replaceVariables(step.locator, variables);
      const text = await page.$eval(locator, el => el.textContent?.trim());
      const varName = replaceVariables(step.output?.name, variables);
      variables[varName] = text;
      return { [varName]: text };
    }
    
    case 'store_attribute': {
      if (step.config?.loop) {
        return await executeLoopStep(page, step, variables, 'attribute');
      }
      const locator = replaceVariables(step.locator, variables);
      const attr = step.attribute_name;
      const value = await page.$eval(locator, (el, a) => el.getAttribute(a), attr);
      const varName = replaceVariables(step.output?.name, variables);
      variables[varName] = value;
      return { [varName]: value };
    }
    
    case 'click': {
      const locator = replaceVariables(step.locator, variables);
      await page.click(locator);
      await new Promise(r => setTimeout(r, step.config?.wait || 500));
      return { clicked: locator };
    }
    
    case 'type': {
      const locator = replaceVariables(step.locator, variables);
      const text = replaceVariables(step.text, variables);
      await page.type(locator, text);
      return { typed: text, into: locator };
    }
    
    case 'wait': {
      const ms = step.timeout || 1000;
      await new Promise(r => setTimeout(r, ms));
      return { waited: ms };
    }
    
    default:
      return { skipped: true, reason: `Unknown command: ${command}` };
  }
}

async function executeLoopStep(page, step, variables, type) {
  const loop = step.config.loop;
  const results = {};
  
  for (let i = loop.from; i <= loop.to; i += (loop.step || 1)) {
    variables[loop.index] = i;
    const locator = replaceVariables(step.locator, variables);
    const varName = replaceVariables(step.output?.name, variables);
    
    try {
      let value;
      if (type === 'text') {
        value = await page.$eval(locator, el => el.textContent?.trim());
      } else {
        value = await page.$eval(locator, (el, attr) => el.getAttribute(attr), step.attribute_name);
      }
      variables[varName] = value;
      results[varName] = value || '(empty)';
      console.log(`  [${i}] ${varName} = "${value?.slice(0, 50) || '(empty)'}"`);
    } catch (err) {
      variables[varName] = '';
      results[varName] = '(not found)';
      console.log(`  [${i}] ${varName} = ❌ not found (${locator})`);
    }
  }
  
  return results;
}

function replaceVariables(str, variables) {
  if (!str) return str;
  return str.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => {
    return variables[name] !== undefined ? variables[name] : match;
  });
}

async function waitForKeypress(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

// CLI
const args = process.argv.slice(2);
const recipePath = args.find(a => !a.startsWith('--') && a.endsWith('.json'));

if (!recipePath) {
  console.log('Usage: node debug-recipe.js <recipe.json> --type <autocomplete|url> --input <value>');
  console.log('\nOptions:');
  console.log('  --step <n>     Run only step n');
  console.log('  --pause        Pause after each step');
  console.log('  --screenshot   Take screenshots');
  process.exit(1);
}

const options = {
  type: args.includes('--type') ? args[args.indexOf('--type') + 1] : 'autocomplete',
  input: args.includes('--input') ? args[args.indexOf('--input') + 1] : 'test',
  step: args.includes('--step') ? parseInt(args[args.indexOf('--step') + 1]) : undefined,
  pause: args.includes('--pause'),
  screenshot: args.includes('--screenshot'),
  output: args.includes('--output') ? args[args.indexOf('--output') + 1] : 'text'
};

debugRecipe(recipePath, options).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
