#!/usr/bin/env bun
/**
 * test-selector.js - Test a CSS selector on a page
 * 
 * Usage:
 *   bun Engine/cli/test-selector.js <url> <selector> [--loop] [--attr <name>] [--json]
 * 
 * Examples:
 *   bun Engine/cli/test-selector.js "https://funko.com/search?q=test" ".product-tile"
 *   bun Engine/cli/test-selector.js "https://funko.com/search?q=test" ".col-6:nth-child(\$i) .pdp-link" --loop
 *   bun Engine/cli/test-selector.js "https://example.com" "meta[property='og:title']" --attr content
 */

import puppeteer from 'puppeteer';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2), {
  string: ['attr', 'a'],
  boolean: ['loop', 'l', 'json', 'help', 'h'],
  number: ['max', 'm'],
  alias: { a: 'attr', l: 'loop', h: 'help', m: 'max' },
  default: { max: 10 }
});

const url = args._[0];
const selector = args._[1];
const testLoop = args.loop || selector?.includes('$i');
const attrName = args.attr;
const jsonOutput = args.json;
const maxItems = args.max;

if (args.help || !url || !selector) {
  console.log(`
test-selector - Test a CSS selector on a page

Usage:
  bun Engine/cli/test-selector.js <url> <selector> [options]

Options:
  --loop, -l             Test as loop pattern (replace $i with 1,2,3...)
  --attr, -a <name>      Extract attribute instead of text
  --max, -m <n>          Max items to test in loop (default: 10)
  --json                 Output as JSON
  --help, -h             Show this help

Examples:
  # Test a simple selector
  bun Engine/cli/test-selector.js "https://funko.com/search?q=test" ".product-tile"

  # Test a loop pattern (use $i placeholder)
  bun Engine/cli/test-selector.js "https://funko.com/search?q=test" ".col-6:nth-child(\\$i) .pdp-link" --loop

  # Extract an attribute
  bun Engine/cli/test-selector.js "https://example.com" "meta[property='og:image']" --attr content
`);
  process.exit(0);
}

async function testSelector(page, sel, attribute) {
  return await page.evaluate((selector, attr) => {
    const elements = document.querySelectorAll(selector);
    const results = [];
    
    for (const el of elements) {
      const text = el.textContent?.trim().slice(0, 100);
      const value = attr ? el.getAttribute(attr) : text;
      const tagName = el.tagName.toLowerCase();
      
      results.push({
        tag: tagName,
        text: text?.slice(0, 60),
        value: value?.slice(0, 200),
        hasContent: !!value && value.length > 0
      });
    }
    
    return {
      selector,
      count: elements.length,
      results: results.slice(0, 20)
    };
  }, sel, attribute);
}

async function testLoopPattern(page, selectorPattern, attribute, max) {
  const results = [];
  
  for (let i = 1; i <= max; i++) {
    const sel = selectorPattern.replace(/\$i/g, String(i));
    const result = await page.evaluate((selector, attr) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      
      const text = el.textContent?.trim();
      const value = attr ? el.getAttribute(attr) : text;
      
      return {
        text: text?.slice(0, 60),
        value: value?.slice(0, 200),
        hasContent: !!value && value.length > 0
      };
    }, sel, attribute);
    
    results.push({
      index: i,
      selector: sel,
      found: !!result,
      ...result
    });
  }
  
  const foundCount = results.filter(r => r.found).length;
  const withContent = results.filter(r => r.hasContent).length;
  
  return {
    pattern: selectorPattern,
    testedRange: `1-${max}`,
    found: foundCount,
    withContent,
    results
  };
}

function printResults(data, isLoop) {
  if (isLoop) {
    console.log(`\n🔄 Loop Pattern: ${data.pattern}`);
    console.log(`   Range: ${data.testedRange}`);
    console.log(`   Found: ${data.found}/${data.results.length}`);
    console.log(`   With content: ${data.withContent}/${data.found}\n`);
    
    for (const r of data.results) {
      const status = r.found ? (r.hasContent ? '✓' : '○') : '✗';
      const value = r.value?.slice(0, 50) || '(empty)';
      console.log(`   $i=${r.index}: ${status} ${r.found ? value : 'not found'}`);
    }
    
    if (data.found === 1 && data.results[0].found) {
      console.log(`\n⚠️  Only first item found - elements likely NOT consecutive siblings`);
      console.log(`   Try finding the consecutive parent container\n`);
    } else if (data.found > 1 && data.withContent === data.found) {
      console.log(`\n✅ Pattern works! Found ${data.found} items with content\n`);
    }
  } else {
    console.log(`\n🎯 Selector: ${data.selector}`);
    console.log(`   Found: ${data.count} element(s)\n`);
    
    for (let i = 0; i < Math.min(data.results.length, 10); i++) {
      const r = data.results[i];
      const status = r.hasContent ? '✓' : '○';
      console.log(`   ${i + 1}. ${status} <${r.tag}> ${r.value?.slice(0, 60) || '(empty)'}`);
    }
    
    if (data.count > 10) {
      console.log(`   ... and ${data.count - 10} more`);
    }
    console.log('');
  }
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for dynamic content
    await new Promise(r => setTimeout(r, 2000));
    
    let result;
    if (testLoop) {
      result = await testLoopPattern(page, selector, attrName, maxItems);
    } else {
      result = await testSelector(page, selector, attrName);
    }
    
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printResults(result, testLoop);
    }
    
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
