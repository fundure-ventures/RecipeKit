#!/usr/bin/env node
/**
 * Find Loop Container - Discovers the container element for result items
 * Works by finding result links and tracing back to their common ancestor.
 * NO hardcoded class names - purely dynamic analysis.
 * 
 * Usage:
 *   node find-loop-container.js <url> [options]
 * 
 * Options:
 *   --links <urls>      Comma-separated list of known result URLs to trace
 *   --output json|text  Output format (default: text)
 *   --wait <ms>         Wait time after page load (default: 2000)
 * 
 * Examples:
 *   node find-loop-container.js "https://example.com/search?q=test"
 *   node find-loop-container.js "https://example.com/search?q=test" --links "/product/1,/product/2"
 */

const puppeteer = require('puppeteer');

async function findLoopContainer(url, options = {}) {
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
        if (text.includes('accept') || text.includes('agree') || text.includes('ok') || text.includes('got it')) {
          btn.click();
        }
      });
    });
    
    await new Promise(r => setTimeout(r, options.wait || 2000));
    
    const knownLinks = options.links ? options.links.split(',').map(l => l.trim()) : [];
    
    const result = await page.evaluate((providedLinks) => {
      // Helper: get a minimal selector for an element
      function getSelector(el) {
        if (!el || el === document.body) return 'body';
        const tag = el.tagName.toLowerCase();
        if (el.id && !el.id.match(/\d{6,}/)) return `#${el.id}`;
        const classes = Array.from(el.classList).filter(c => 
          c.length > 1 && c.length < 30 && !c.match(/\d{5,}/) && !c.match(/^[a-f0-9]{8,}$/i)
        );
        if (classes.length > 0) return `${tag}.${classes[0]}`;
        return tag;
      }
      
      // Helper: get full selector path to element
      function getSelectorPath(el) {
        const parts = [];
        let current = el;
        while (current && current !== document.body && parts.length < 6) {
          parts.unshift(getSelector(current));
          current = current.parentElement;
        }
        return parts.join(' > ');
      }
      
      // Helper: get sibling index (1-based)
      function getSiblingIndex(el) {
        if (!el.parentElement) return -1;
        return Array.from(el.parentElement.children).indexOf(el) + 1;
      }
      
      // Step 1: Find result links
      let resultAnchors = [];
      
      if (providedLinks.length > 0) {
        for (const href of providedLinks) {
          const anchor = document.querySelector(`a[href="${href}"], a[href*="${href}"]`);
          if (anchor) resultAnchors.push(anchor);
        }
      }
      
      // Auto-detect: find groups of links with similar URL structure
      if (resultAnchors.length < 3) {
        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        const linksByPattern = {};
        
        for (const a of allLinks) {
          const href = a.getAttribute('href') || '';
          // Skip navigation/utility links
          if (!href || href === '#' || href === '/' || href.length < 3) continue;
          if (href.includes('login') || href.includes('cart') || href.includes('account')) continue;
          if (href.includes('javascript:') || href.includes('mailto:')) continue;
          
          // Group by URL structure pattern
          const normalized = href.replace(/^https?:\/\/[^/]+/, '').replace(/\d+/g, 'N');
          const pathParts = normalized.split('/').filter(Boolean);
          if (pathParts.length < 1) continue;
          
          // Create pattern key from path structure
          const pattern = pathParts.slice(0, 3).join('/');
          if (!linksByPattern[pattern]) linksByPattern[pattern] = [];
          linksByPattern[pattern].push({ anchor: a, href });
        }
        
        // Find the pattern with most links
        let bestPattern = null;
        let bestLinks = [];
        
        for (const [pattern, links] of Object.entries(linksByPattern)) {
          if (links.length > bestLinks.length && links.length >= 3) {
            bestPattern = pattern;
            bestLinks = links;
          }
        }
        
        if (bestLinks.length > 0) {
          resultAnchors = bestLinks.slice(0, 15).map(l => l.anchor);
        }
      }
      
      if (resultAnchors.length < 3) {
        return {
          success: false,
          error: 'Could not find enough result links to analyze',
          linksFound: resultAnchors.length,
          suggestion: 'Try providing known result URLs with --links option'
        };
      }
      
      // Step 2: Trace each link up to find result item container
      // (the smallest ancestor that contains the full result item)
      const itemContainers = resultAnchors.map(anchor => {
        let current = anchor;
        
        // Walk up until we find an element that looks like an item container
        while (current.parentElement) {
          const parent = current.parentElement;
          const siblings = Array.from(parent.children);
          
          // Check if siblings have similar structure (likely a list container)
          const siblingAnchors = siblings.filter(s => 
            s !== current && s.querySelector('a[href]')
          );
          
          if (siblingAnchors.length >= 2) {
            // This parent has multiple children with links - likely the container
            return { container: parent, item: current };
          }
          
          current = parent;
        }
        
        return null;
      }).filter(Boolean);
      
      if (itemContainers.length < 3) {
        return {
          success: false,
          error: 'Could not identify item containers',
          linksFound: resultAnchors.length
        };
      }
      
      // Step 3: Find the common container
      const containers = itemContainers.map(ic => ic.container);
      const uniqueContainers = [...new Set(containers)];
      
      // Most common container wins
      const containerCounts = uniqueContainers.map(c => ({
        container: c,
        count: containers.filter(x => x === c).length
      })).sort((a, b) => b.count - a.count);
      
      const mainContainer = containerCounts[0].container;
      const items = itemContainers
        .filter(ic => ic.container === mainContainer)
        .map(ic => ic.item);
      
      // Step 4: Analyze the container structure
      const allChildren = Array.from(mainContainer.children);
      const itemIndices = items.map(item => getSiblingIndex(item));
      const sortedIndices = [...new Set(itemIndices)].sort((a, b) => a - b);
      
      // Check if consecutive
      const isConsecutive = sortedIndices.length > 1 && 
        sortedIndices.every((idx, i) => i === 0 || idx === sortedIndices[i - 1] + 1);
      
      // Determine item selector
      const itemTags = items.map(i => i.tagName.toLowerCase());
      const uniqueTags = [...new Set(itemTags)];
      
      let childSelector;
      if (uniqueTags.length === 1) {
        const sharedClasses = items.reduce((shared, el) => {
          const classes = Array.from(el.classList).filter(c => 
            c.length > 1 && !c.match(/\d{5,}/)
          );
          if (shared === null) return classes;
          return shared.filter(c => classes.includes(c));
        }, null) || [];
        
        childSelector = sharedClasses.length > 0 
          ? `${uniqueTags[0]}.${sharedClasses[0]}`
          : uniqueTags[0];
      } else {
        childSelector = null;
      }
      
      // Step 5: Analyze a sample item for field selectors
      const sampleItem = items[0];
      const fields = {};
      
      // Title
      const titleEl = sampleItem.querySelector('h1, h2, h3, h4, h5, h6') ||
                      sampleItem.querySelector('a');
      if (titleEl) {
        fields.TITLE = {
          selector: getSelector(titleEl),
          sample: titleEl.textContent?.trim().slice(0, 50)
        };
      }
      
      // URL
      const linkEl = sampleItem.querySelector('a[href]');
      if (linkEl) {
        fields.URL = {
          selector: 'a',
          attribute: 'href',
          sample: linkEl.getAttribute('href')?.slice(0, 60)
        };
      }
      
      // Image
      const imgEl = sampleItem.querySelector('img[src], img[data-src]');
      if (imgEl) {
        const imgAttr = imgEl.getAttribute('src') ? 'src' : 'data-src';
        fields.COVER = {
          selector: getSelector(imgEl),
          attribute: imgAttr,
          sample: imgEl.getAttribute(imgAttr)?.slice(0, 60)
        };
      }
      
      // Build loop selector
      const containerSelector = getSelector(mainContainer);
      let loopBase;
      let loopStrategy;
      
      if (isConsecutive && childSelector) {
        loopBase = `${containerSelector} > ${childSelector}:nth-child($i)`;
        loopStrategy = 'nth-child (consecutive siblings)';
      } else if (childSelector && uniqueTags.length === 1) {
        loopBase = `${containerSelector} > ${childSelector}:nth-of-type($i)`;
        loopStrategy = 'nth-of-type (same tag, not consecutive)';
      } else {
        loopBase = null;
        loopStrategy = 'Cannot determine - items have different tags or structure';
      }
      
      return {
        success: true,
        container: {
          selector: containerSelector,
          path: getSelectorPath(mainContainer),
          totalChildren: allChildren.length,
          resultItems: items.length
        },
        items: {
          selector: childSelector,
          tag: uniqueTags.join(', '),
          indices: sortedIndices,
          isConsecutive
        },
        loopBase,
        loopStrategy,
        fields,
        sampleItemHtml: sampleItem.outerHTML.slice(0, 800),
        linksAnalyzed: resultAnchors.length
      };
    }, knownLinks);
    
    if (options.output === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printResult(result);
    }
    
    return result;
  } finally {
    await browser.close();
  }
}

function printResult(result) {
  console.log('');
  
  if (!result.success) {
    console.log(`❌ ${result.error}`);
    if (result.suggestion) console.log(`   ${result.suggestion}`);
    return;
  }
  
  console.log('=== Container Found ===');
  console.log(`  Selector: ${result.container.selector}`);
  console.log(`  Full path: ${result.container.path}`);
  console.log(`  Children: ${result.container.totalChildren} total, ${result.container.resultItems} are results`);
  
  console.log('\n=== Item Pattern ===');
  console.log(`  Tag(s): ${result.items.tag}`);
  console.log(`  Selector: ${result.items.selector || '(mixed/no common class)'}`);
  console.log(`  Indices: ${result.items.indices.join(', ')}`);
  console.log(`  Consecutive: ${result.items.isConsecutive ? '✓ Yes' : '✗ No'}`);
  
  console.log('\n=== Recommended Loop Selector ===');
  if (result.loopBase) {
    console.log(`  ${result.loopBase}`);
    console.log(`  Strategy: ${result.loopStrategy}`);
  } else {
    console.log(`  ❌ ${result.loopStrategy}`);
  }
  
  console.log('\n=== Field Selectors ===');
  for (const [field, info] of Object.entries(result.fields)) {
    console.log(`  ${field}: ${info.selector}${info.attribute ? ` [${info.attribute}]` : ''}`);
    console.log(`    Sample: "${info.sample}"`);
  }
  
  console.log('\n=== Sample Item HTML ===');
  console.log(result.sampleItemHtml.slice(0, 400) + '...');
}

// CLI
const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--'));

if (!url) {
  console.log('Usage: node find-loop-container.js <url> [--links <urls>] [--output json]');
  console.log('\nFinds the container element for result items by analyzing link patterns.');
  console.log('No hardcoded selectors - works dynamically on any site.\n');
  console.log('Examples:');
  console.log('  node find-loop-container.js "https://example.com/search?q=test"');
  console.log('  node find-loop-container.js "https://example.com/search" --links "/item/1,/item/2,/item/3"');
  process.exit(1);
}

const options = {
  links: args.includes('--links') ? args[args.indexOf('--links') + 1] : null,
  wait: args.includes('--wait') ? parseInt(args[args.indexOf('--wait') + 1]) : 2000,
  output: args.includes('--output') ? args[args.indexOf('--output') + 1] : 'text'
};

findLoopContainer(url, options).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
