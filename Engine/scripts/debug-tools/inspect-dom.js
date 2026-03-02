#!/usr/bin/env node
/**
 * DOM Inspector - Analyzes page structure to help build selectors
 * 
 * Usage:
 *   node inspect-dom.js <url> [options]
 * 
 * Options:
 *   --selector <css>    Find and analyze elements matching this selector
 *   --find-items        Auto-detect repeating item patterns (search results, lists)
 *   --depth <n>         How deep to traverse DOM (default: 3)
 *   --output json|text  Output format (default: text)
 * 
 * Examples:
 *   node inspect-dom.js "https://example.com/search?q=test" --find-items
 *   node inspect-dom.js "https://example.com" --selector ".product-card"
 */

const puppeteer = require('puppeteer');

async function inspectDOM(url, options = {}) {
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
        '[class*="cookie"] button', '[id*="cookie"] button',
        'button[aria-label*="Accept"]', 'button[aria-label*="Agree"]'
      ];
      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn) { btn.click(); break; }
      }
    });
    await new Promise(r => setTimeout(r, 1000));
    
    if (options.selector) {
      return await analyzeSelector(page, options.selector, options);
    } else if (options.findItems) {
      return await findRepeatingItems(page, options);
    } else {
      return await analyzePageStructure(page, options);
    }
  } finally {
    await browser.close();
  }
}

async function analyzeSelector(page, selector, options) {
  const result = await page.evaluate((sel) => {
    const elements = document.querySelectorAll(sel);
    if (elements.length === 0) {
      return { error: `No elements found for selector: ${sel}` };
    }
    
    const items = Array.from(elements).slice(0, 10).map((el, i) => {
      const parent = el.parentElement;
      const siblings = parent ? Array.from(parent.children) : [];
      
      return {
        index: i,
        tag: el.tagName,
        id: el.id || null,
        classes: el.className?.split(' ').filter(c => c) || [],
        text: el.textContent?.trim().slice(0, 100),
        
        // Links
        links: Array.from(el.querySelectorAll('a[href]')).slice(0, 3).map(a => ({
          href: a.href,
          text: a.textContent?.trim().slice(0, 50)
        })),
        
        // Images
        images: Array.from(el.querySelectorAll('img')).slice(0, 2).map(img => ({
          src: img.src?.slice(0, 80),
          alt: img.alt
        })),
        
        // Children structure
        children: Array.from(el.children).slice(0, 5).map(c => ({
          tag: c.tagName,
          class: c.className?.split(' ')[0] || ''
        })),
        
        // Parent info
        parent: {
          tag: parent?.tagName,
          class: parent?.className?.split(' ')[0] || '',
          childCount: siblings.length,
          indexInParent: siblings.indexOf(el)
        }
      };
    });
    
    return {
      selector: sel,
      totalFound: elements.length,
      items
    };
  }, selector);
  
  if (options.output === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSelectorAnalysis(result);
  }
  
  return result;
}

async function findRepeatingItems(page, options) {
  const result = await page.evaluate(() => {
    const candidates = [];
    
    // Strategy 1: Find elements with similar structure that repeat
    const allElements = document.querySelectorAll('*');
    const classCount = new Map();
    
    allElements.forEach(el => {
      if (el.children.length > 0 && el.querySelector('a[href]')) {
        const className = el.className?.split(' ')[0];
        if (className && className.length > 2 && className.length < 30) {
          const existing = classCount.get(className) || { count: 0, sample: null };
          existing.count++;
          if (!existing.sample) existing.sample = el;
          classCount.set(className, existing);
        }
      }
    });
    
    // Find classes that repeat 3+ times (likely result items)
    classCount.forEach((data, className) => {
      if (data.count >= 3 && data.count <= 100) {
        const sample = data.sample;
        const parent = sample.parentElement;
        
        candidates.push({
          selector: `.${className}`,
          count: data.count,
          hasImage: !!sample.querySelector('img'),
          hasLink: !!sample.querySelector('a[href]'),
          hasTitle: !!sample.querySelector('h1,h2,h3,h4,h5,h6,[class*="title"],[class*="name"]'),
          sampleText: sample.textContent?.trim().slice(0, 100),
          parent: {
            tag: parent?.tagName,
            class: parent?.className?.split(' ')[0] || ''
          },
          children: Array.from(sample.children).slice(0, 5).map(c => ({
            tag: c.tagName,
            class: c.className?.split(' ')[0] || ''
          }))
        });
      }
    });
    
    // Sort by likelihood of being result items
    candidates.sort((a, b) => {
      let scoreA = a.count + (a.hasImage ? 10 : 0) + (a.hasLink ? 5 : 0) + (a.hasTitle ? 8 : 0);
      let scoreB = b.count + (b.hasImage ? 10 : 0) + (b.hasLink ? 5 : 0) + (b.hasTitle ? 8 : 0);
      return scoreB - scoreA;
    });
    
    return {
      candidates: candidates.slice(0, 10),
      pageTitle: document.title,
      url: window.location.href
    };
  });
  
  if (options.output === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printItemCandidates(result);
  }
  
  return result;
}

async function analyzePageStructure(page, options) {
  const depth = options.depth || 3;
  
  const result = await page.evaluate((maxDepth) => {
    const analyze = (el, depth) => {
      if (depth <= 0) return null;
      
      const children = Array.from(el.children).slice(0, 10);
      return {
        tag: el.tagName,
        id: el.id || undefined,
        class: el.className?.split(' ')[0] || undefined,
        childCount: el.children.length,
        hasLink: !!el.querySelector('a[href]'),
        hasImage: !!el.querySelector('img'),
        children: children.map(c => analyze(c, depth - 1)).filter(Boolean)
      };
    };
    
    const main = document.querySelector('main, [role="main"], #content, .content, #main') || document.body;
    
    return {
      pageTitle: document.title,
      url: window.location.href,
      structure: analyze(main, maxDepth)
    };
  }, depth);
  
  if (options.output === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\nPage: ${result.pageTitle}`);
    console.log(`URL: ${result.url}\n`);
    printTree(result.structure, 0);
  }
  
  return result;
}

function printSelectorAnalysis(result) {
  if (result.error) {
    console.log(`\n❌ ${result.error}`);
    return;
  }
  
  console.log(`\n✓ Found ${result.totalFound} elements for: ${result.selector}\n`);
  
  result.items.forEach((item, i) => {
    console.log(`--- Item ${i} ---`);
    console.log(`  Tag: ${item.tag}`);
    if (item.id) console.log(`  ID: ${item.id}`);
    if (item.classes.length) console.log(`  Classes: ${item.classes.join(', ')}`);
    console.log(`  Text: "${item.text?.slice(0, 60)}..."`);
    
    if (item.links.length) {
      console.log(`  Links:`);
      item.links.forEach(l => console.log(`    - ${l.text} → ${l.href.slice(0, 50)}`));
    }
    
    if (item.images.length) {
      console.log(`  Images: ${item.images.length}`);
    }
    
    console.log(`  Parent: ${item.parent.tag}.${item.parent.class} (${item.parent.childCount} children, index ${item.parent.indexInParent})`);
    console.log(`  Children: ${item.children.map(c => `${c.tag}.${c.class}`).join(', ')}`);
    console.log('');
  });
}

function printItemCandidates(result) {
  console.log(`\nPage: ${result.pageTitle}`);
  console.log(`URL: ${result.url}\n`);
  console.log('=== Likely Result Item Selectors ===\n');
  
  result.candidates.forEach((c, i) => {
    const features = [];
    if (c.hasImage) features.push('📷 images');
    if (c.hasLink) features.push('🔗 links');
    if (c.hasTitle) features.push('📝 titles');
    
    console.log(`${i + 1}. ${c.selector} (${c.count} items)`);
    console.log(`   Features: ${features.join(', ')}`);
    console.log(`   Parent: ${c.parent.tag}.${c.parent.class}`);
    console.log(`   Children: ${c.children.map(ch => `${ch.tag}.${ch.class}`).join(', ')}`);
    console.log(`   Sample: "${c.sampleText?.slice(0, 60)}..."`);
    console.log('');
  });
  
  if (result.candidates.length > 0) {
    const best = result.candidates[0];
    console.log('=== Suggested Selector Pattern ===');
    console.log(`Container: ${best.parent.tag}.${best.parent.class}`);
    console.log(`Items: ${best.selector}`);
    console.log(`Full: ${best.parent.class ? `.${best.parent.class} > ${best.selector}` : best.selector}`);
  }
}

function printTree(node, indent) {
  if (!node) return;
  const prefix = '  '.repeat(indent);
  const idStr = node.id ? `#${node.id}` : '';
  const classStr = node.class ? `.${node.class}` : '';
  const features = [];
  if (node.hasLink) features.push('🔗');
  if (node.hasImage) features.push('📷');
  if (node.childCount > 0) features.push(`(${node.childCount})`);
  
  console.log(`${prefix}${node.tag}${idStr}${classStr} ${features.join(' ')}`);
  
  if (node.children) {
    node.children.forEach(child => printTree(child, indent + 1));
  }
}

// CLI
const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--'));

if (!url) {
  console.log('Usage: node inspect-dom.js <url> [--selector <css>] [--find-items] [--output json]');
  process.exit(1);
}

const options = {
  selector: args.includes('--selector') ? args[args.indexOf('--selector') + 1] : null,
  findItems: args.includes('--find-items'),
  depth: args.includes('--depth') ? parseInt(args[args.indexOf('--depth') + 1]) : 3,
  output: args.includes('--output') ? args[args.indexOf('--output') + 1] : 'text'
};

inspectDOM(url, options).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
