#!/usr/bin/env node
/**
 * Selector Tester - Test CSS selectors against a live page
 * 
 * Usage:
 *   node test-selector.js <url> <selector> [options]
 * 
 * Options:
 *   --attribute <name>  Extract this attribute (default: textContent)
 *   --loop <n>          Test with nth-child/nth-of-type from 1 to n
 *   --wait <ms>         Wait time after page load (default: 1000)
 *   --output json|text  Output format (default: text)
 * 
 * Examples:
 *   node test-selector.js "https://example.com/search?q=test" ".result-item .title"
 *   node test-selector.js "https://example.com" ".product:nth-of-type(\$i) .name" --loop 5
 *   node test-selector.js "https://example.com" ".product a" --attribute href
 */

const puppeteer = require('puppeteer');

async function testSelector(url, selector, options = {}) {
  const browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    console.log(`Loading: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Dismiss cookie banners
    await page.evaluate(() => {
      const selectors = [
        'button[class*="consent"]', 'button[class*="accept"]',
        '[class*="cookie"] button', '[id*="cookie"] button'
      ];
      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn) { btn.click(); break; }
      }
    });
    
    await new Promise(r => setTimeout(r, options.wait || 1000));
    
    if (options.loop && selector.includes('$i')) {
      return await testLoopSelector(page, selector, options);
    } else {
      return await testSingleSelector(page, selector, options);
    }
  } finally {
    await browser.close();
  }
}

async function testSingleSelector(page, selector, options) {
  const attribute = options.attribute || 'textContent';
  
  const result = await page.evaluate((sel, attr) => {
    const elements = document.querySelectorAll(sel);
    
    if (elements.length === 0) {
      return { 
        success: false, 
        error: `No elements found`,
        selector: sel
      };
    }
    
    const getValue = (el) => {
      if (attr === 'textContent') return el.textContent?.trim();
      if (attr === 'innerHTML') return el.innerHTML?.trim().slice(0, 200);
      return el.getAttribute(attr);
    };
    
    return {
      success: true,
      selector: sel,
      count: elements.length,
      attribute: attr,
      values: Array.from(elements).slice(0, 10).map((el, i) => ({
        index: i,
        value: getValue(el),
        tag: el.tagName,
        classes: el.className?.split(' ').slice(0, 3).join(' ')
      }))
    };
  }, selector, attribute);
  
  printResult(result, options);
  return result;
}

async function testLoopSelector(page, selectorTemplate, options) {
  const loopCount = options.loop || 5;
  const attribute = options.attribute || 'textContent';
  
  const results = [];
  
  for (let i = 1; i <= loopCount; i++) {
    const selector = selectorTemplate.replace(/\$i/g, i);
    
    const result = await page.evaluate((sel, attr) => {
      const el = document.querySelector(sel);
      
      if (!el) {
        return { index: null, value: null, found: false };
      }
      
      const getValue = (el) => {
        if (attr === 'textContent') return el.textContent?.trim();
        if (attr === 'innerHTML') return el.innerHTML?.trim().slice(0, 200);
        return el.getAttribute(attr);
      };
      
      return {
        found: true,
        value: getValue(el),
        tag: el.tagName,
        classes: el.className?.split(' ').slice(0, 3).join(' ')
      };
    }, selector, attribute);
    
    results.push({
      index: i,
      selector,
      ...result
    });
  }
  
  const output = {
    template: selectorTemplate,
    attribute,
    loopRange: `1-${loopCount}`,
    foundCount: results.filter(r => r.found).length,
    results
  };
  
  printLoopResult(output, options);
  return output;
}

function printResult(result, options) {
  if (options.output === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  
  console.log('');
  if (!result.success) {
    console.log(`❌ ${result.error}`);
    console.log(`   Selector: ${result.selector}`);
    return;
  }
  
  console.log(`✓ Found ${result.count} elements for: ${result.selector}`);
  console.log(`  Extracting: ${result.attribute}\n`);
  
  result.values.forEach(v => {
    const valuePreview = v.value?.slice(0, 60) || '(empty)';
    console.log(`  [${v.index}] ${v.tag}.${v.classes || '(no class)'}`);
    console.log(`      → "${valuePreview}${v.value?.length > 60 ? '...' : ''}"`);
  });
}

function printLoopResult(output, options) {
  if (options.output === 'json') {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  
  console.log('');
  console.log(`Loop Test: ${output.template}`);
  console.log(`Attribute: ${output.attribute}`);
  console.log(`Range: ${output.loopRange}`);
  console.log(`Found: ${output.foundCount}/${output.results.length}\n`);
  
  output.results.forEach(r => {
    if (r.found) {
      const valuePreview = r.value?.slice(0, 50) || '(empty)';
      console.log(`  ✓ [${r.index}] "${valuePreview}${r.value?.length > 50 ? '...' : ''}"`);
    } else {
      console.log(`  ✗ [${r.index}] (no match)`);
    }
  });
  
  // Recommendations
  console.log('\n--- Analysis ---');
  const firstFound = output.results.findIndex(r => r.found);
  const lastFound = output.results.map(r => r.found).lastIndexOf(true);
  
  if (output.foundCount === 0) {
    console.log('❌ No elements matched. Check your selector.');
    console.log('   Try using --find-items with inspect-dom.js to discover correct selectors.');
  } else if (firstFound > 0) {
    console.log(`⚠️  First match at index ${firstFound + 1}, not 1.`);
    console.log(`   This suggests elements aren't consecutive children.`);
    console.log(`   Consider using nth-of-type instead of nth-child.`);
  } else if (output.foundCount < output.results.length) {
    console.log(`ℹ️  Only ${output.foundCount} items found (requested ${output.results.length}).`);
    console.log(`   The page may have fewer results, or selectors may need adjustment.`);
  } else {
    console.log('✓ All positions matched successfully!');
  }
}

// CLI
const args = process.argv.slice(2);
const positionalArgs = args.filter(a => !a.startsWith('--'));
const url = positionalArgs[0];
const selector = positionalArgs[1];

if (!url || !selector) {
  console.log('Usage: node test-selector.js <url> <selector> [--attribute <name>] [--loop <n>]');
  console.log('\nExamples:');
  console.log('  node test-selector.js "https://example.com" ".item .title"');
  console.log('  node test-selector.js "https://example.com" ".item:nth-of-type(\\$i)" --loop 5');
  process.exit(1);
}

const options = {
  attribute: args.includes('--attribute') ? args[args.indexOf('--attribute') + 1] : null,
  loop: args.includes('--loop') ? parseInt(args[args.indexOf('--loop') + 1]) : null,
  wait: args.includes('--wait') ? parseInt(args[args.indexOf('--wait') + 1]) : 1000,
  output: args.includes('--output') ? args[args.indexOf('--output') + 1] : 'text'
};

testSelector(url, selector, options).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
