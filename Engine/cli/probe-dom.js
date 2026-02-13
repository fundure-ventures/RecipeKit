#!/usr/bin/env bun
/**
 * probe-dom.js - Analyze DOM structure of a page
 * 
 * Usage:
 *   bun Engine/cli/probe-dom.js <url> [--selector <css>] [--depth <n>] [--json]
 * 
 * Examples:
 *   bun Engine/cli/probe-dom.js "https://funko.com/search?q=test" --selector ".product-grid" --depth 3
 *   bun Engine/cli/probe-dom.js "https://example.com" --json
 */

import puppeteer from 'puppeteer';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2), {
  string: ['selector', 's'],
  number: ['depth', 'd'],
  boolean: ['json', 'help', 'h'],
  alias: { s: 'selector', d: 'depth', h: 'help' },
  default: { depth: 2 }
});

const url = args._[0];
const selector = args.selector || 'body';
const depth = args.depth;
const jsonOutput = args.json;

if (args.help || !url) {
  console.log(`
probe-dom - Analyze DOM structure of a page

Usage:
  bun Engine/cli/probe-dom.js <url> [options]

Options:
  --selector, -s <css>   Root selector to analyze (default: body)
  --depth, -d <n>        Max depth to traverse (default: 2)
  --json                 Output as JSON
  --help, -h             Show this help

Examples:
  bun Engine/cli/probe-dom.js "https://funko.com/search?q=test" --selector ".product-grid" --depth 3
  bun Engine/cli/probe-dom.js "https://example.com/search" -s ".results" -d 2 --json
`);
  process.exit(0);
}

async function analyzeDom(page, rootSelector, maxDepth) {
  return await page.evaluate((selector, depth) => {
    function getChildInfo(element, currentDepth, maxDepth) {
      if (currentDepth > maxDepth) return null;
      
      const tagName = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      const classes = Array.from(element.classList).map(c => `.${c}`).join('');
      const selectorStr = `${tagName}${id}${classes}` || tagName;
      
      // Get direct children grouped by their selector
      const childrenBySelector = {};
      const directChildren = Array.from(element.children);
      
      for (const child of directChildren) {
        const childTag = child.tagName.toLowerCase();
        const childClasses = Array.from(child.classList).map(c => `.${c}`).join('');
        const childSelector = `${childTag}${childClasses}` || childTag;
        
        if (!childrenBySelector[childSelector]) {
          childrenBySelector[childSelector] = { count: 0, consecutive: true, samples: [] };
        }
        childrenBySelector[childSelector].count++;
        
        // Check if this type is consecutive (appears as siblings)
        const prevSibling = child.previousElementSibling;
        if (prevSibling) {
          const prevClasses = Array.from(prevSibling.classList).map(c => `.${c}`).join('');
          const prevSelector = `${prevSibling.tagName.toLowerCase()}${prevClasses}`;
          if (prevSelector !== childSelector && childrenBySelector[childSelector].count > 1) {
            childrenBySelector[childSelector].consecutive = false;
          }
        }
        
        // Get sample text/attributes
        if (childrenBySelector[childSelector].samples.length < 2) {
          const text = child.textContent?.trim().slice(0, 50);
          const href = child.getAttribute('href');
          const src = child.getAttribute('src');
          childrenBySelector[childSelector].samples.push({ text, href, src });
        }
      }
      
      // Recurse into children
      const childrenDetails = {};
      for (const [childSel, info] of Object.entries(childrenBySelector)) {
        if (currentDepth < maxDepth) {
          const firstChild = directChildren.find(c => {
            const cs = `${c.tagName.toLowerCase()}${Array.from(c.classList).map(x => `.${x}`).join('')}`;
            return cs === childSel;
          });
          if (firstChild) {
            const nested = getChildInfo(firstChild, currentDepth + 1, maxDepth);
            if (nested) {
              info.children = nested.children;
            }
          }
        }
        childrenDetails[childSel] = info;
      }
      
      return {
        selector: selectorStr,
        childCount: directChildren.length,
        children: childrenDetails
      };
    }
    
    const root = document.querySelector(selector);
    if (!root) {
      return { error: `Selector "${selector}" not found` };
    }
    
    return getChildInfo(root, 0, depth);
  }, rootSelector, maxDepth);
}

function printTree(node, indent = '') {
  if (node.error) {
    console.log(`❌ ${node.error}`);
    return;
  }
  
  console.log(`${indent}${node.selector} (${node.childCount} children)`);
  
  for (const [childSel, info] of Object.entries(node.children || {})) {
    const consecutive = info.consecutive ? '✓ consecutive' : '✗ not consecutive';
    const marker = info.consecutive ? '├─' : '├─';
    console.log(`${indent}  ${marker} ${childSel} (${info.count}x, ${consecutive})`);
    
    if (info.children) {
      for (const [nestedSel, nestedInfo] of Object.entries(info.children)) {
        const nestedConsec = nestedInfo.consecutive ? '✓' : '✗';
        console.log(`${indent}  │   └─ ${nestedSel} (${nestedInfo.count}x ${nestedConsec})`);
      }
    }
  }
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait a bit for dynamic content
    await new Promise(r => setTimeout(r, 2000));
    
    const result = await analyzeDom(page, selector, depth);
    
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n📂 DOM Structure: ${selector}\n`);
      printTree(result);
      console.log(`\n💡 Tip: Use consecutive parents (marked ✓) with :nth-child($i)\n`);
    }
    
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
