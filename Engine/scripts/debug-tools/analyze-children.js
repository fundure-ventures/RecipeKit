#!/usr/bin/env node
/**
 * Analyze Children - Inspect direct children of a container element
 * Helps understand if nth-child or nth-of-type will work.
 * 
 * Usage:
 *   node analyze-children.js <url> <container-selector> [options]
 * 
 * Options:
 *   --max <n>           Max children to show (default: 20)
 *   --output json|text  Output format (default: text)
 *   --wait <ms>         Wait time after page load (default: 2000)
 * 
 * Examples:
 *   node analyze-children.js "https://example.com/search?q=test" ".results-grid"
 *   node analyze-children.js "https://example.com" "#product-list" --max 30
 */

const puppeteer = require('puppeteer');

async function analyzeChildren(url, containerSelector, options = {}) {
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
    
    const maxChildren = options.max || 20;
    
    const result = await page.evaluate((selector, max) => {
      const container = document.querySelector(selector);
      
      if (!container) {
        return {
          success: false,
          error: `Container not found: ${selector}`,
          suggestion: 'Use inspect-dom.js or find-loop-container.js to find the correct selector'
        };
      }
      
      const children = Array.from(container.children).slice(0, max);
      
      // Analyze each child
      const childData = children.map((child, index) => {
        const tag = child.tagName.toLowerCase();
        const classes = Array.from(child.classList).filter(c => 
          c.length > 1 && !c.match(/\d{6,}/)
        );
        const hasLink = !!child.querySelector('a[href]');
        const hasImage = !!child.querySelector('img');
        const textContent = child.textContent?.trim().slice(0, 60);
        const link = child.querySelector('a[href]')?.getAttribute('href');
        
        return {
          index: index + 1, // 1-based for nth-child
          tag,
          classes: classes.slice(0, 3),
          classStr: classes[0] || '',
          hasLink,
          hasImage,
          isLikelyResult: hasLink && (hasImage || textContent?.length > 10),
          textPreview: textContent?.slice(0, 40) || '',
          link: link?.slice(0, 50)
        };
      });
      
      // Group by tag
      const tagCounts = {};
      childData.forEach(c => {
        tagCounts[c.tag] = (tagCounts[c.tag] || 0) + 1;
      });
      
      // Group by tag+class
      const patternCounts = {};
      childData.forEach(c => {
        const pattern = c.classStr ? `${c.tag}.${c.classStr}` : c.tag;
        if (!patternCounts[pattern]) {
          patternCounts[pattern] = { count: 0, indices: [], hasResults: false };
        }
        patternCounts[pattern].count++;
        patternCounts[pattern].indices.push(c.index);
        if (c.isLikelyResult) patternCounts[pattern].hasResults = true;
      });
      
      // Find likely result pattern
      let resultPattern = null;
      let resultIndices = [];
      
      for (const [pattern, info] of Object.entries(patternCounts)) {
        if (info.hasResults && info.count >= 2) {
          if (!resultPattern || info.count > patternCounts[resultPattern].count) {
            resultPattern = pattern;
            resultIndices = info.indices;
          }
        }
      }
      
      // Check if result indices are consecutive
      const isConsecutive = resultIndices.length > 1 && 
        resultIndices.every((idx, i) => i === 0 || idx === resultIndices[i - 1] + 1);
      
      // Calculate gaps
      const gaps = [];
      for (let i = 1; i < resultIndices.length; i++) {
        const gap = resultIndices[i] - resultIndices[i - 1];
        if (gap > 1) {
          gaps.push({ after: resultIndices[i - 1], gap });
        }
      }
      
      return {
        success: true,
        container: selector,
        totalChildren: container.children.length,
        analyzedChildren: children.length,
        children: childData,
        tagCounts,
        patternCounts,
        analysis: {
          resultPattern,
          resultIndices,
          isConsecutive,
          gaps,
          recommendation: getRecommendation(resultPattern, isConsecutive, gaps, tagCounts)
        }
      };
      
      function getRecommendation(pattern, consecutive, gaps, tags) {
        if (!pattern) {
          return 'Could not identify result items. Children may need deeper analysis.';
        }
        
        if (consecutive) {
          return `Use nth-child: ${selector} > ${pattern}:nth-child($i)`;
        }
        
        // Check if same tag throughout (can use nth-of-type)
        const patternTag = pattern.split('.')[0];
        if (Object.keys(tags).length === 1 || tags[patternTag] === resultIndices.length) {
          return `Use nth-of-type: ${selector} > ${pattern}:nth-of-type($i)`;
        }
        
        if (gaps.length > 0) {
          return `Items not consecutive (gaps after indices: ${gaps.map(g => g.after).join(', ')}). ` +
                 `May need to filter non-result children or use a more specific selector.`;
        }
        
        return `Mixed children. Consider: ${selector} > ${pattern}:nth-of-type($i)`;
      }
    }, containerSelector, maxChildren);
    
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
  
  console.log(`=== Container: ${result.container} ===`);
  console.log(`Total children: ${result.totalChildren} (showing ${result.analyzedChildren})\n`);
  
  // Tag breakdown
  console.log('Tag breakdown:');
  for (const [tag, count] of Object.entries(result.tagCounts)) {
    console.log(`  ${tag}: ${count}`);
  }
  
  // Pattern breakdown
  console.log('\nPattern breakdown (tag.class):');
  for (const [pattern, info] of Object.entries(result.patternCounts)) {
    const marker = info.hasResults ? '📦' : '  ';
    console.log(`  ${marker} ${pattern}: ${info.count} at indices [${info.indices.join(', ')}]`);
  }
  
  // Children list
  console.log('\nChildren:');
  console.log('  Idx  Tag        Class             Link  Img   Preview');
  console.log('  ---  ---------  ----------------  ----  ----  -------');
  
  for (const child of result.children) {
    const linkMark = child.hasLink ? '🔗' : '  ';
    const imgMark = child.hasImage ? '📷' : '  ';
    const resultMark = child.isLikelyResult ? '→' : ' ';
    const classStr = child.classStr.slice(0, 16).padEnd(16);
    const tag = child.tag.padEnd(9);
    const idx = String(child.index).padStart(3);
    
    console.log(`${resultMark} ${idx}  ${tag}  ${classStr}  ${linkMark}    ${imgMark}    ${child.textPreview.slice(0, 25)}`);
  }
  
  // Analysis
  console.log('\n=== Analysis ===');
  console.log(`Result pattern: ${result.analysis.resultPattern || '(none detected)'}`);
  console.log(`Result indices: [${result.analysis.resultIndices.join(', ')}]`);
  console.log(`Consecutive: ${result.analysis.isConsecutive ? '✓ Yes' : '✗ No'}`);
  
  if (result.analysis.gaps.length > 0) {
    console.log(`Gaps: ${result.analysis.gaps.map(g => `after ${g.after} (gap=${g.gap})`).join(', ')}`);
  }
  
  console.log(`\n💡 Recommendation:`);
  console.log(`   ${result.analysis.recommendation}`);
}

// CLI
const args = process.argv.slice(2);
const positionalArgs = args.filter(a => !a.startsWith('--'));
const url = positionalArgs[0];
const selector = positionalArgs[1];

if (!url || !selector) {
  console.log('Usage: node analyze-children.js <url> <container-selector> [--max <n>] [--output json]');
  console.log('\nAnalyzes direct children of a container to understand the structure.');
  console.log('Helps determine if nth-child or nth-of-type will work.\n');
  console.log('Examples:');
  console.log('  node analyze-children.js "https://example.com/search?q=test" ".results-grid"');
  console.log('  node analyze-children.js "https://example.com" "#products" --max 30');
  process.exit(1);
}

const options = {
  max: args.includes('--max') ? parseInt(args[args.indexOf('--max') + 1]) : 20,
  wait: args.includes('--wait') ? parseInt(args[args.indexOf('--wait') + 1]) : 2000,
  output: args.includes('--output') ? args[args.indexOf('--output') + 1] : 'text'
};

analyzeChildren(url, selector, options).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
