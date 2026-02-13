#!/usr/bin/env bun
/**
 * suggest-selectors.js - Auto-suggest CSS selectors for extracting items
 * 
 * Usage:
 *   bun Engine/cli/suggest-selectors.js <url> [--container <css>] [--min <n>] [--json]
 * 
 * Examples:
 *   bun Engine/cli/suggest-selectors.js "https://funko.com/search?q=test"
 *   bun Engine/cli/suggest-selectors.js "https://example.com/search" --container ".results"
 */

import puppeteer from 'puppeteer';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2), {
  string: ['container', 'c'],
  number: ['min', 'm'],
  boolean: ['json', 'help', 'h'],
  alias: { c: 'container', m: 'min', h: 'help' },
  default: { min: 3 }
});

const url = args._[0];
const containerHint = args.container;
const minItems = args.min;
const jsonOutput = args.json;

if (args.help || !url) {
  console.log(`
suggest-selectors - Auto-suggest CSS selectors for extracting items

Usage:
  bun Engine/cli/suggest-selectors.js <url> [options]

Options:
  --container, -c <css>  Hint for the container selector
  --min, -m <n>          Minimum items to consider a valid pattern (default: 3)
  --json                 Output as JSON
  --help, -h             Show this help

Examples:
  bun Engine/cli/suggest-selectors.js "https://funko.com/search?q=test"
  bun Engine/cli/suggest-selectors.js "https://example.com/search" --container ".search-results"
`);
  process.exit(0);
}

async function findRepeatingPatterns(page, containerHint, minItems) {
  return await page.evaluate((hint, min) => {
    // Common container patterns to try
    const containerSelectors = hint ? [hint] : [
      '.product-grid', '.products', '.search-results', '.results',
      '[class*="grid"]', '[class*="list"]', '[class*="results"]',
      'main', '#main', '.main-content', 'article'
    ];
    
    // Find the best container
    let container = null;
    let containerSelector = '';
    
    for (const sel of containerSelectors) {
      const el = document.querySelector(sel);
      if (el && el.children.length >= min) {
        container = el;
        containerSelector = sel;
        break;
      }
    }
    
    if (!container) {
      // Fallback: find any element with many similar children
      const candidates = document.querySelectorAll('div, section, ul, main');
      for (const el of candidates) {
        if (el.children.length >= min) {
          // Check if children are similar
          const childClasses = Array.from(el.children).map(c => 
            Array.from(c.classList).sort().join('.')
          );
          const uniquePatterns = new Set(childClasses);
          if (uniquePatterns.size <= 3) { // Mostly similar children
            container = el;
            const tag = el.tagName.toLowerCase();
            const cls = el.classList[0] ? `.${el.classList[0]}` : '';
            containerSelector = `${tag}${cls}`;
            break;
          }
        }
      }
    }
    
    if (!container) {
      return { error: 'No suitable container found with repeating items' };
    }
    
    // Analyze children to find consecutive parent
    const children = Array.from(container.children);
    const childPatterns = {};
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const tag = child.tagName.toLowerCase();
      const cls = child.classList[0] ? `.${child.classList[0]}` : '';
      const pattern = `${tag}${cls}`;
      
      if (!childPatterns[pattern]) {
        childPatterns[pattern] = { count: 0, indices: [] };
      }
      childPatterns[pattern].count++;
      childPatterns[pattern].indices.push(i + 1); // 1-indexed for nth-child
    }
    
    // Find the most common child pattern that appears consecutively
    let bestPattern = null;
    let bestCount = 0;
    
    for (const [pattern, info] of Object.entries(childPatterns)) {
      if (info.count > bestCount && info.count >= min) {
        // Check if consecutive
        const isConsecutive = info.indices.every((idx, i) => 
          i === 0 || idx === info.indices[i - 1] + 1
        );
        if (isConsecutive) {
          bestPattern = pattern;
          bestCount = info.count;
        }
      }
    }
    
    if (!bestPattern) {
      // Find any pattern with good count
      for (const [pattern, info] of Object.entries(childPatterns)) {
        if (info.count > bestCount) {
          bestPattern = pattern;
          bestCount = info.count;
        }
      }
    }
    
    // Now find selectors within the items
    const firstItem = children.find(c => {
      const tag = c.tagName.toLowerCase();
      const cls = c.classList[0] ? `.${c.classList[0]}` : '';
      return `${tag}${cls}` === bestPattern;
    });
    
    if (!firstItem) {
      return { error: 'Could not analyze item structure' };
    }
    
    // Look for common elements within item
    const suggestions = {
      container: containerSelector,
      itemSelector: bestPattern,
      itemCount: bestCount,
      loopBase: `${containerSelector} > ${bestPattern}:nth-child($i)`,
      fields: {}
    };
    
    // Find title candidates
    const titleCandidates = firstItem.querySelectorAll('h1, h2, h3, h4, a, [class*="title"], [class*="name"]');
    for (const el of titleCandidates) {
      const text = el.textContent?.trim();
      if (text && text.length > 2 && text.length < 200) {
        const tag = el.tagName.toLowerCase();
        const cls = el.classList[0] ? `.${el.classList[0]}` : '';
        suggestions.fields.TITLE = `${tag}${cls}`;
        break;
      }
    }
    
    // Find URL candidates
    const linkCandidates = firstItem.querySelectorAll('a[href]');
    for (const el of linkCandidates) {
      const href = el.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        suggestions.fields.URL = { selector: 'a', attribute: 'href' };
        break;
      }
    }
    
    // Find image candidates
    const imgCandidates = firstItem.querySelectorAll('img[src], img[data-src]');
    for (const el of imgCandidates) {
      const src = el.getAttribute('src') || el.getAttribute('data-src');
      if (src && src.length > 10) {
        const cls = el.classList[0] ? `.${el.classList[0]}` : '';
        suggestions.fields.COVER = { selector: `img${cls}`, attribute: 'src' };
        break;
      }
    }
    
    // Find price/subtitle candidates
    const priceCandidates = firstItem.querySelectorAll('[class*="price"], [class*="subtitle"], [class*="meta"], .sales');
    for (const el of priceCandidates) {
      const text = el.textContent?.trim();
      if (text && text.length < 50) {
        const tag = el.tagName.toLowerCase();
        const cls = el.classList[0] ? `.${el.classList[0]}` : '';
        suggestions.fields.SUBTITLE = `${tag}${cls}`;
        break;
      }
    }
    
    return suggestions;
  }, containerHint, minItems);
}

function printSuggestions(data) {
  if (data.error) {
    console.log(`\n❌ ${data.error}\n`);
    return;
  }
  
  console.log(`\n📦 Container: ${data.container}`);
  console.log(`📋 Item pattern: ${data.itemSelector} (${data.itemCount} items)\n`);
  
  console.log(`🔄 Loop base selector:`);
  console.log(`   ${data.loopBase}\n`);
  
  console.log(`📝 Suggested field selectors:`);
  for (const [field, value] of Object.entries(data.fields)) {
    if (typeof value === 'string') {
      console.log(`   ${field}: ${data.loopBase.replace(':nth-child($i)', ':nth-child($i)')} ${value}`);
    } else {
      console.log(`   ${field}: ${data.loopBase} ${value.selector} [${value.attribute}]`);
    }
  }
  
  console.log(`\n💡 Example recipe selectors:\n`);
  
  const base = data.loopBase;
  if (data.fields.TITLE) {
    console.log(`   TITLE:    "${base} ${data.fields.TITLE}"`);
  }
  if (data.fields.URL) {
    console.log(`   URL:      "${base} ${data.fields.URL.selector}" (attr: ${data.fields.URL.attribute})`);
  }
  if (data.fields.COVER) {
    console.log(`   COVER:    "${base} ${data.fields.COVER.selector}" (attr: ${data.fields.COVER.attribute})`);
  }
  if (data.fields.SUBTITLE) {
    console.log(`   SUBTITLE: "${base} ${data.fields.SUBTITLE}"`);
  }
  
  console.log('');
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for dynamic content
    await new Promise(r => setTimeout(r, 2000));
    
    const result = await findRepeatingPatterns(page, containerHint, minItems);
    
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printSuggestions(result);
    }
    
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
