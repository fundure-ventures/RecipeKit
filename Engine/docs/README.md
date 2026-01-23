# RecipeKit Documentation

> Complete documentation for the RecipeKit AutoRecipe system

---

## 📚 Documentation Files

### Start Here

| Document | Lines | Best For | Read Time |
|----------|-------|----------|-----------|
| **[SUMMARY.md](SUMMARY.md)** | ~700 | Quick overview, getting started | 10 min |
| **[DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)** | ~7,500 | Complete reference, deep dive | 60 min |
| **[FILE_INDEX.md](FILE_INDEX.md)** | ~150 | Finding specific files | 5 min |

### Specifications

| Document | Lines | Purpose | Audience |
|----------|-------|---------|----------|
| **[autorecipe.md](autorecipe.md)** | 340 | AutoRecipe system specification | System designers, architects |
| **[engine-reference.md](engine-reference.md)** | 572 | Recipe authoring & engine API | Recipe authors, AI prompts |

---

## 🚀 Quick Start

### New to RecipeKit?

1. **Start**: Read [SUMMARY.md](SUMMARY.md) (10 minutes)
2. **Explore**: Try the Quick Start commands
3. **Deep Dive**: Read [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) (as needed)
4. **Reference**: Use [FILE_INDEX.md](FILE_INDEX.md) to find specific files

### Want to Generate a Recipe?

```bash
# Fully autonomous - just provide a URL
bun ../scripts/autoRecipe.js --url=https://example.com --debug
```

### Want to Understand the System?

Read the documentation in this order:

1. **[SUMMARY.md](SUMMARY.md)** - High-level overview
2. **[autorecipe.md](autorecipe.md)** - System design & phases
3. **[DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)** - Complete details
4. **[engine-reference.md](engine-reference.md)** - Recipe syntax reference

### Want to Debug a Recipe?

Check out `../scripts/debug-tools/README.md` and use:

```bash
# Find result items
node ../scripts/debug-tools/inspect-dom.js "URL" --find-items

# Test selectors
node ../scripts/debug-tools/test-selector.js "URL" ".selector" --loop 10

# Debug recipe step-by-step
node ../scripts/debug-tools/debug-recipe.js path/to/recipe.json --type autocomplete --input "query"
```

---

## 📖 Documentation Overview

### [SUMMARY.md](SUMMARY.md) - Executive Summary

**Best for:** Quick reference, overview, getting started

**Contains:**
- System overview & key components
- Complete architecture diagram
- Quick start commands
- Common patterns & solutions
- Troubleshooting guide
- File structure overview
- Quick command reference

**Use when:**
- You need to understand the system quickly
- You want a reference card
- You're explaining the system to others
- You need to find a quick command

### [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) - Complete Reference

**Best for:** Deep understanding, comprehensive reference, development

**Contains:**
- **13 major sections** covering everything
- Complete command catalog with examples
- All 6 AI prompts explained in detail
- Step-by-step debugging workflows
- Common patterns with real code
- Troubleshooting with diagnosis and fixes
- Architecture deep dive
- Contributing guidelines

**Use when:**
- You're developing recipes
- You need to understand how AutoRecipe works
- You're debugging complex issues
- You're contributing to the project
- You need detailed examples

### [FILE_INDEX.md](FILE_INDEX.md) - File Catalog

**Best for:** Finding specific files, understanding structure

**Contains:**
- Complete file listing with line counts
- Directory tree visualization
- File categorization by purpose
- Search tips and commands
- Dependency information
- Quick navigation guide

**Use when:**
- You need to find a specific file
- You want to understand the codebase structure
- You're looking for examples
- You need to know file locations

### [autorecipe.md](autorecipe.md) - System Specification

**Best for:** Understanding system design, phases, and roles

**Contains:**
- Autonomous recipe generation specification
- Phase-by-phase breakdown
- System roles (browser, Copilot, orchestrator)
- Evidence collection format
- Stop conditions and failure handling
- Technical requirements

**Use when:**
- You're designing or modifying the system
- You need to understand the workflow
- You're troubleshooting generation issues
- You're extending AutoRecipe

### [engine-reference.md](engine-reference.md) - Engine API Reference

**Best for:** Recipe authoring, understanding commands

**Contains:**
- Complete command reference
- Variable system explanation
- CSS selector best practices
- Output contracts by list_type
- Common mistakes and solutions
- Pattern library

**Use when:**
- You're writing recipes manually
- You're understanding AI-generated recipes
- You need command syntax
- You're troubleshooting selectors

---

## 🎯 Use Cases

### I want to...

| Goal | Start Here | Then Read | Tools to Use |
|------|------------|-----------|--------------|
| **Generate a recipe** | [SUMMARY.md](SUMMARY.md) Quick Start | [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) AutoRecipe section | `autoRecipe.js` |
| **Debug a recipe** | [SUMMARY.md](SUMMARY.md) Troubleshooting | [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) Debugging Tools | `debug-tools/*.js` |
| **Write a recipe manually** | [engine-reference.md](engine-reference.md) | [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) Recipe Reference | `debug-tools/*.js` |
| **Understand AutoRecipe** | [autorecipe.md](autorecipe.md) | [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) Deep Dive | None |
| **Understand AI prompts** | [SUMMARY.md](SUMMARY.md) Prompts | [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) Prompts section | `../scripts/prompts/*.md` |
| **Find a file** | [FILE_INDEX.md](FILE_INDEX.md) | Directory tree | `find`, `ls` |
| **Learn CSS selectors** | [engine-reference.md](engine-reference.md) | [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) Selector section | `test-selector.js` |
| **Contribute** | [SUMMARY.md](SUMMARY.md) Contributing | [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) Contributing | All tools |

---

## 🗂️ Related Files

### Source Code

- **Main Script**: `../scripts/autoRecipe.js` (2,657 lines)
- **Engine**: `../engine.js` (~1,000 lines)
- **Debug Tools**: `../scripts/debug-tools/*.js` (3 scripts)

### AI Prompts

Located in `../scripts/prompts/`:

- **`classify.md`** (55 lines) - Website classification
- **`author-autocomplete.md`** (296 lines) - Search recipe generation
- **`author-url.md`** (315 lines) - Detail recipe generation
- **`fixer.md`** (128 lines) - Recipe repair
- **`debug-strategy.md`** (296 lines) - Debug methodology
- **`engine-reference.md`** (572 lines) - Engine API reference

### Configuration

- **`../package.json`** - Dependencies & version
- **`../.env`** - Environment variables (not in repo)

---

## 📊 Documentation Statistics

| Metric | Value |
|--------|-------|
| **Total Documentation Files** | 8 |
| **Total Lines** | ~10,000 |
| **Total Words** | ~50,000 |
| **Code Examples** | 200+ |
| **Command Examples** | 150+ |
| **File References** | 20+ |
| **External Links** | 10+ |

### Coverage

- ✅ System overview and architecture
- ✅ Complete command reference
- ✅ All AI prompts explained
- ✅ All debug tools documented
- ✅ Common patterns and solutions
- ✅ Troubleshooting guides
- ✅ Contributing guidelines
- ✅ Quick reference cards
- ✅ File catalog and index

---

## 🔄 Documentation Maintenance

### Update Checklist

When the system changes, update:

- [ ] [SUMMARY.md](SUMMARY.md) - Keep overview current
- [ ] [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) - Update affected sections
- [ ] [FILE_INDEX.md](FILE_INDEX.md) - Update line counts and structure
- [ ] [autorecipe.md](autorecipe.md) - If workflow changes
- [ ] [engine-reference.md](engine-reference.md) - If commands change

### Version Tracking

Current documentation reflects:
- **Engine Version**: 20
- **Last Major Update**: 2024
- **AutoRecipe Script**: 2,657 lines
- **Total Prompts**: 6 files, ~1,700 lines

---

## 💡 Tips for Reading

### First Time Reading

1. Start with [SUMMARY.md](SUMMARY.md) to get oriented (10 min)
2. Try a Quick Start command to see it in action (5 min)
3. Read relevant sections of [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) as needed (60+ min)
4. Keep [FILE_INDEX.md](FILE_INDEX.md) open for reference (ongoing)

### Reference Usage

- Bookmark [SUMMARY.md](SUMMARY.md) → Quick Command Reference
- Search [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) for specific topics (Ctrl/Cmd+F)
- Use [FILE_INDEX.md](FILE_INDEX.md) to locate source files
- Check [engine-reference.md](engine-reference.md) for command syntax

### Learning Path

**Beginner**: SUMMARY.md → Try commands → Explore recipes
**Intermediate**: DEVELOPMENT_GUIDE.md → Write manual recipe → Debug
**Advanced**: autorecipe.md → Modify prompts → Extend system

---

## 🔍 Search & Navigation

### Find Information

```bash
# Search all documentation
grep -r "search term" *.md

# Find by section
grep -A 10 "## Section Name" DEVELOPMENT_GUIDE.md

# Find commands
grep -r "bun Engine" *.md

# Find file references
grep -r "Engine/scripts" *.md
```

### Navigate Documentation

All documents have:
- **Table of Contents** - Quick navigation
- **Consistent Heading Hierarchy** - Easy search
- **Cross-References** - Links between docs
- **Code Examples** - Copy-paste ready
- **File Paths** - Direct references

---

## 🌐 External Resources

### Official

- **RecipeKit Repository**: https://github.com/listy-is/RecipeKit
- **Listy App**: https://listy.is

### Technologies

- **Puppeteer Documentation**: https://pptr.dev
- **Copilot SDK**: https://github.com/github/copilot-sdk
- **Bun Runtime**: https://bun.sh

### Learning

- **CSS Selectors**: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors
- **JSON-LD**: https://json-ld.org/
- **Schema.org**: https://schema.org/

---

## 📞 Getting Help

1. **Search this documentation** - Use Ctrl/Cmd+F
2. **Check [SUMMARY.md](SUMMARY.md)** - Quick answers
3. **Read [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)** - Detailed explanations
4. **Review examples** - Check content type folders (../movies/, etc.)
5. **Use debug tools** - `../scripts/debug-tools/`
6. **Check prompts** - `../scripts/prompts/` for AI behavior

---

## 📝 Feedback & Contributions

Found an issue with the documentation?

- **Typo/Error**: Submit a PR with the fix
- **Missing Info**: Open an issue describing what's needed
- **Unclear Section**: Suggest improvements via issue or PR

Documentation is as important as code!

---

**Navigation**: [Up to Engine/](..) | [View SUMMARY](SUMMARY.md) | [View DEVELOPMENT_GUIDE](DEVELOPMENT_GUIDE.md) | [View FILE_INDEX](FILE_INDEX.md)

**Last Updated**: 2024 | **Engine Version**: 20 | **Total Documentation**: ~10,000 lines
