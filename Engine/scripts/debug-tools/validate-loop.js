#!/usr/bin/env node
/**
 * Validate Loop Selector - Test if a loop selector pattern actually works
 * Tests each index and reports which ones match vs fail.
 * 
 * Usage:
 *   node validate-loop.js <url> <selector-pattern> [options]
 * 
 * The selector pattern must contain $i which will be replaced with index (1, 2, 3...)
 * 
 * Options:
 *   --count <n>         How many indices to test (default: 10)
 *   --field <selector>  Also test extracting a field within each item
 *   --attr <name>       Attribute to extract from field (default: textContent)
 *   --output json|text  Output format (default: text)
 *   --wait <ms>         Wait time after page load (default: 2000)
 * 
 * Examples:
 *   node validate-loop.js "https://example.com/search?q=test" ".grid > div:nth-child(\$i)"
 *   node validate-loop.js "https://example.com" ".item:nth-of-type(\$i)" --field "a" --attr "href"
 */

const puppeteer = require('puppeteer');

async function validateLoop(url, selectorPattern, options = {}) {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    console.error(`Loading: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Dismiss cookie banners
    await page.evaluate(() => {
      document.querySelectorAll('button, [role="button"]').forEach(btn => {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('accept') || text.includes('agree') || text.includes('ok')) {
          btn.click();
        }
      });
    });
    
    await new Promise(r => setTimeout(r, options.wait || 2000));
    
    const count = options.count || 10;
    const fieldSelector = options.field || null;
    const attribute = options.attr || 'textContent';
    
    const results = [];
    
    for (let i = 1; i <= count; i++) {
      const selector = selectorPattern.replace(/\$i/g, String(i));
      const fullSelector = fieldSelector ? `${selector} ${fieldSelector}` : selector;
      
      const result = await page.evaluate((sel, baseSelector, attr) => {
        const baseEl = document.querySelector(baseSelector);
        const el = document.querySelector(sel);
        
        if (!baseEl) {
          return { found: false, baseFound: false };
        }
        
        if (!el) {
          return { found: false, baseFound: true };
        }
        
        let value;
        if (attr === 'textContent') {
          value = el.textContent?.trim();
        } else if (attr === 'innerHTML') {
          value = el.innerHTML?.trim().slice(0, 100);
        } else {
          value = el.getAttribute(attr);
        }
        
        return {
          found: true,
          baseFound: true,
          value: value?.slice(0, 80),
          tag: el.tagName.toLowerCase(),
          classes: Array.from(el.classList).slice(0, 2).join(' '),
          hasContent: (value?.length || 0) > 0
        };
      }, fullSelector, selector.replace(/ .*$/, ''), attribute);
      
      results.push({
        index: i,
        selector: fullSelector,
        ...result
      });
    }
    
    // Analyze results
    const found = results.filter(r => r.found);
    const notFound = results.filter(r => !r.found);
    const withContent = results.filter(r => r.hasContent);
    
    // Check for patterns in failures
    const failedIndices = notFound.map(r => r.index);
    const successIndices = found.map(r => r.index);
    
    let failurePattern = null;
    if (failedIndices.length > 0 && successIndices.length > 0) {
      // Check if first index fails (common issue)
      if (failedIndices.includes(1) && !failedIndices.includes(2)) {
        failurePattern = 'first-index-fails';
      }
      // Check if even/odd pattern
      else if (failedIndices.every(i => i % 2 === 0)) {
        failurePattern = 'even-indices-fail';
      } else if (failedIndices.every(i => i % 2 === 1)) {
        failurePattern = 'odd-indices-fail';
      }
      // Check if alternating
      else if (successIndices.length > 2 && successIndices.every((v, i) => i === 0 || v === successIndices[i-1] + 2)) {
        failurePattern = 'alternating';
      }
    }
    
    const output = {
      success: found.length >= 3,
      pattern: selectorPattern,
      fieldSelector,
      attribute,
      tested: count,
      found: found.length,
      withContent: withContent.length,
      successRate: Math.round((found.length / count) * 100),
      results,
      analysis: {
        failedIndices,
        successIndices,
        failurePattern,
        recommendation: getRecommendation(found.length, count, failurePattern, results)
      }
    };
    
    if (options.output === 'json') {
      console.log(JSON.stringify(output, null, 2));
    } else {
      printResult(output);
    }
    
    return output;
  } finally {
    await browser.close();
  }
}

function getRecommendation(foundCount, total, failurePattern, results) {
  if (foundCount === total) {
    return 'All indices match! Selector pattern is valid.';
  }
  
  if (foundCount === 0) {
    return 'No matches. The base selector may be wrong. Use find-loop-container.js to discover the correct container.';
  }
  
  if (failurePattern === 'first-index-fails') {
    return 'Index 1 fails but others work. Container may have a non-item first child (header, spacer). Try starting from index 2 or use nth-of-type instead.';
  }
  
  if (failurePattern === 'even-indices-fail' || failurePattern === 'odd-indices-fail') {
    return `${failurePattern.replace('-', ' ')}. Container has alternating children of different types. Use nth-of-type on the specific item tag.`;
  }
  
  if (failurePattern === 'alternating') {
    return 'Results appear at alternating indices. There are non-item elements between items. Use nth-of-type or a more specific selector.';
  }
  
  if (foundCount < total * 0.5) {
    return `Only ${foundCount}/${total} match. The selector may be targeting wrong elements or items are not consecutive children.`;
  }
  
  return `${foundCount}/${total} match. Some indices may be beyond the actual result count, or there are gaps in the grid.`;
}

function printResult(output) {
  console.log('');
  console.log(`=== Validate Loop Selector ===`);
  console.log(`Pattern: ${output.pattern}`);
  if (output.fieldSelector) {
    console.log(`Field: ${output.fieldSelector} [${output.attribute}]`);
  }
  console.log(`Tested: ${output.tested} indices`);
  console.log(`Found: ${output.found} (${output.successRate}%)`);
  console.log(`With content: ${output.withContent}`);
  
  console.log('\nResults:');
  console.log('  Idx  Status  Value');
  console.log('  ---  ------  -----');
  
  for (const r of output.results) {
    const status = r.found ? '✓' : '✗';
    const value = r.found ? (r.value?.slice(0, 50) || '(empty)') : '(no match)';
    const idx = String(r.index).padStart(3);
    console.log(`  ${idx}  ${status}       ${value}`);
  }
  
  console.log('\n=== Analysis ===');
  if (output.analysis.failedIndices.length > 0) {
    console.log(`Failed indices: [${output.analysis.failedIndices.join(', ')}]`);
  }
  if (output.analysis.failurePattern) {
    console.log(`Pattern detected: ${output.analysis.failurePattern}`);
  }
  
  console.log(`\n💡 ${output.analysis.recommendation}`);
  
  if (output.success) {
    console.log('\n✓ Selector pattern is usable (3+ matches)');
  } else {
    console.log('\n✗ Selector pattern needs adjustment (< 3 matches)');
  }
}

// CLI
const args = process.argv.slice(2);
const positionalArgs = args.filter(a => !a.startsWith('--'));
const url = positionalArgs[0];
const pattern = positionalArgs[1];

if (!url || !pattern) {
  console.log('Usage: node validate-loop.js <url> <selector-pattern> [options]');
  console.log('\nTests a loop selector pattern by trying each index (1, 2, 3...).');
  console.log('The pattern must contain $i which gets replaced with the index.\n');
  console.log('Options:');
  console.log('  --count <n>         Number of indices to test (default: 10)');
  console.log('  --field <selector>  Test extracting a field within each item');
  console.log('  --attr <name>       Attribute to extract (default: textContent)\n');
  console.log('Examples:');
  console.log('  node validate-loop.js "https://example.com/search?q=test" ".grid > div:nth-child(\\$i)"');
  console.log('  node validate-loop.js "https://example.com" ".item:nth-of-type(\\$i)" --field "a" --attr "href"');
  process.exit(1);
}

const options = {
  count: args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1]) : 10,
  field: args.includes('--field') ? args[args.indexOf('--field') + 1] : null,
  attr: args.includes('--attr') ? args[args.indexOf('--attr') + 1] : 'textContent',
  wait: args.includes('--wait') ? parseInt(args[args.indexOf('--wait') + 1]) : 2000,
  output: args.includes('--output') ? args[args.indexOf('--output') + 1] : 'text'
};

validateLoop(url, pattern, options).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
