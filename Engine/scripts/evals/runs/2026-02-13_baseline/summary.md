# Eval Run: 2026-02-13T08:20:28.001Z — "baseline"

## Overall: 4/5 passed (80%) — avg score: 80

| Case | Mode | Score | Fields | URLs | Patterns | Errors | Status |
|------|------|-------|--------|------|----------|--------|--------|
| fragrantica | url | 80 | 3/3 | 2/2 | 1/1 | ✗ | PASS |
| amazon-product | url-only | 100 | 3/3 | 1/1 | 2/2 | ✓ | PASS |
| distiller | url | 20 | 0/3 | 0/0 | 0/1 | ✗ | FAIL |
| footballkitarchive | url | 100 | 3/3 | 1/1 | 1/1 | ✓ | PASS |
| funko | url | 100 | 3/3 | 1/1 | 1/1 | ✓ | PASS |

## Agent Turns

| Agent | Requests | Responses | Model |
|-------|----------|-----------|-------|
| author | 9 | 9 | claude-opus-4.6 |
| querytest | 4 | 4 | claude-opus-4.6 |
| fixer | 2 | 9 | claude-opus-4.6 |

## Per-Case Details

### fragrantica

- **Mode**: url
- **Score**: 80/100 (PASS)
- **Duration**: 333.3s
- **Fields extracted**: URL, TITLE, DESCRIPTION, COVER, FAVICON, AUTHOR, RATING
- **Agent turns**: 17

### amazon-product

- **Mode**: url-only
- **Score**: 100/100 (PASS)
- **Duration**: 51.1s
- **Fields extracted**: TITLE, DESCRIPTION, FAVICON, COVER, RATING, PRICE, BRAND
- **Agent turns**: 4

### distiller

- **Mode**: url
- **Score**: 20/100 (FAIL)
- **Duration**: 168.5s
- **Fields extracted**: (none)
- **Missing fields**: TITLE, COVER, DESCRIPTION
- **Pattern mismatches**: COVER (expected /^https:///)
- **Agent turns**: 6

### footballkitarchive

- **Mode**: url
- **Score**: 100/100 (PASS)
- **Duration**: 77.1s
- **Fields extracted**: TITLE, DESCRIPTION, FAVICON, COVER
- **Agent turns**: 8

### funko

- **Mode**: url
- **Score**: 100/100 (PASS)
- **Duration**: 124.5s
- **Fields extracted**: TITLE, DESCRIPTION, FAVICON, COVER
- **Agent turns**: 14

