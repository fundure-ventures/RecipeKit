# Quick Reference: Integration APIs

This document provides exact API references for integrating external tools with the autonomous recipe authoring system.

## Agent-Browser Commands

### Navigation
```bash
# Open a URL
agent-browser open <url>

# Navigate back
agent-browser back

# Reload page
agent-browser reload
```

### DOM Inspection
```bash
# Take snapshot with element references
agent-browser snapshot --json

# Get page title
agent-browser get title

# Get current URL
agent-browser get url

# Get element text
agent-browser get text <selector>

# Get element HTML
agent-browser get html <selector>

# Get element attribute
agent-browser get attr <selector> <attribute>
```

### Interaction
```bash
# Click element
agent-browser click <selector>

# Fill input field
agent-browser fill <selector> <text>

# Type text (with delay)
agent-browser type <selector> <text>

# Press keyboard key
agent-browser press <key>

# Scroll direction
agent-browser scroll up|down|left|right
```

### Waiting
```bash
# Wait milliseconds
agent-browser wait <ms>

# Wait for selector
agent-browser wait <selector>

# Wait for network idle
agent-browser wait --load networkidle
```

### Example Workflow
```javascript
// In WebProber.extractFingerprint():
import { spawn } from 'child_process';

function execCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => stdout += data.toString());
    proc.stderr.on('data', (data) => stderr += data.toString());
    
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr));
      else resolve({ stdout, stderr });
    });
  });
}

// Use it
const { stdout } = await execCommand('agent-browser', [
  'open', url
]);

const { stdout: snapshotJson } = await execCommand('agent-browser', [
  'snapshot', '--json'
]);

const snapshot = JSON.parse(snapshotJson);
const fingerprint = {
  url: snapshot.url,
  title: snapshot.title,
  // Extract from snapshot...
};
```

## Copilot SDK (Node.js)

### Installation
```bash
npm install @github/copilot-sdk
```

### Basic Usage
```javascript
import { CopilotClient } from '@github/copilot-sdk';

// Initialize client
const client = new CopilotClient({
  // Optional configuration
});

// Start client
await client.start();

// Create session
const session = await client.createSession({
  model: 'gpt-4',
  systemMessage: {
    content: 'You are an expert RecipeKit recipe author...'
  },
  streaming: false
});

// Send prompt
await session.send({
  prompt: 'Given this fingerprint, classify...',
  attachments: [],
  mode: 'default'
});

// Listen for events
session.on('assistant.message', (event) => {
  console.log('AI response:', event.content);
});

session.on('session.idle', () => {
  console.log('Session ready for next request');
});

// Cleanup
await session.destroy();
await client.stop();
```

### Integration Points in autoRecipe.js

#### 1. CopilotSession.start()
```javascript
async start() {
  this.client = new CopilotClient();
  await this.client.start();
  
  this.session = await this.client.createSession({
    model: "gpt-4",
    systemMessage: {
      content: "You are an autonomous RecipeKit recipe author. Always respond with STRICT JSON. No prose."
    },
    streaming: false
  });
}
```

#### 2. CopilotSession.send()
```javascript
async send(prompt, attachments = []) {
  return new Promise((resolve, reject) => {
    let response = '';
    
    const messageHandler = (event) => {
      response += event.content;
    };
    
    const idleHandler = () => {
      this.session.off('assistant.message', messageHandler);
      this.session.off('session.idle', idleHandler);
      
      try {
        // Parse JSON response
        const parsed = JSON.parse(response);
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Failed to parse AI response: ${error.message}`));
      }
    };
    
    this.session.on('assistant.message', messageHandler);
    this.session.on('session.idle', idleHandler);
    
    this.session.send({ prompt, attachments }).catch(reject);
  });
}
```

#### 3. CopilotSession.destroy()
```javascript
async destroy() {
  if (this.session) {
    await this.session.destroy();
  }
  if (this.client) {
    await this.client.stop();
  }
}
```

### Complete Integration Example

```javascript
// In RecipeManager.classifyWebsite()
const template = await this.loadPrompt('classify');
const prompt = template.replace('{{FINGERPRINT}}', JSON.stringify(fingerprint, null, 2));

// Send to Copilot
const classification = await copilot.send(prompt);

// Expected response format:
// {
//   "topic": "movies",
//   "folder": "movies",
//   "confidence": 0.98,
//   "rationale": "..."
// }

return classification;
```

## RecipeKit Engine

### Command Line
```bash
# Autocomplete test
bun run ./Engine/engine.js \
  --recipe <path> \
  --type autocomplete \
  --input "<query>" \
  [--debug]

# URL test
bun run ./Engine/engine.js \
  --recipe <path> \
  --type url \
  --input "<url>" \
  [--debug]
```

### Programmatic Usage
```javascript
import { spawn } from 'child_process';
import { join } from 'path';

function runEngine(recipePath, type, input) {
  return new Promise((resolve, reject) => {
    const proc = spawn('bun', [
      'run',
      join(ROOT_DIR, 'Engine', 'engine.js'),
      '--recipe', recipePath,
      '--type', type,
      '--input', input
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || 'Engine failed'));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        resolve({ success: true, results: data.results });
      } catch (error) {
        reject(error);
      }
    });
  });
}
```

### Expected Output Formats

**Autocomplete (array)**:
```json
{
  "results": [
    {
      "TITLE": "The Matrix",
      "SUBTITLE": "1999",
      "URL": "https://example.com/movie/603",
      "COVER": "https://example.com/cover.jpg"
    }
  ]
}
```

**URL (object)**:
```json
{
  "results": {
    "TITLE": "The Matrix",
    "DATE": "1999",
    "DESCRIPTION": "...",
    "COVER": "https://example.com/cover.jpg",
    "URL": "https://example.com/movie/603",
    "RATING": "8.7",
    "AUTHOR": "Wachowski Brothers"
  }
}
```

## Environment Variables

### Required
None (system works with defaults)

### Optional
```bash
# Enable debug logging
DEBUG=true

# Test timeout (milliseconds)
TEST_TIMEOUT=30000

# Max repair iterations
MAX_REPAIR_ITERATIONS=5
```

### .env File Example
```env
# Auto Recipe Configuration
DEBUG=false
TEST_TIMEOUT=30000
MAX_REPAIR_ITERATIONS=5

# Copilot API (if needed)
# COPILOT_API_KEY=your-key-here
```

## Error Handling

### Copilot SDK Errors
```javascript
try {
  const response = await copilot.send(prompt);
} catch (error) {
  if (error.message.includes('rate limit')) {
    Logger.warn('Rate limited, waiting...');
    await sleep(5000);
    // Retry
  } else if (error.message.includes('Invalid JSON')) {
    Logger.error('AI returned invalid JSON:', error);
    // Ask for fix
  } else {
    throw error;
  }
}
```

### Agent-Browser Errors
```javascript
try {
  const fingerprint = await WebProber.extractFingerprint(url);
} catch (error) {
  if (error.message.includes('timeout')) {
    Logger.warn('Browser timeout, retrying with longer timeout...');
    // Retry with increased timeout
  } else if (error.message.includes('selector not found')) {
    Logger.warn('Page structure unexpected');
    // Collect more evidence
  } else {
    throw error;
  }
}
```

### Engine Errors
```javascript
const result = await RecipeValidator.runEngine(recipePath, type, input);

if (!result.success) {
  switch (result.type) {
    case 'SELECTOR_MISSING':
      // Collect new snapshot, ask AI to fix selectors
      break;
    case 'JS_RENDERED':
      // Enable JS, increase timeout
      break;
    case 'BOT_WALL':
      // Hard fail, manual intervention needed
      throw new Error('Bot detection encountered');
    default:
      // Unknown error, log and continue
      Logger.error('Unknown error:', result.error);
  }
}
```

## Testing the Integration

### Test Agent-Browser
```bash
# Check availability
which agent-browser

# Test basic commands
agent-browser open https://example.com
agent-browser get title
agent-browser snapshot --json
```

### Test Copilot SDK
```javascript
import { CopilotClient } from '@github/copilot-sdk';

const client = new CopilotClient();
await client.start();

const session = await client.createSession({
  model: 'gpt-4',
  systemMessage: { content: 'You are a helpful assistant.' }
});

await session.send({ prompt: 'Say hello' });

session.on('assistant.message', (event) => {
  console.log('Response:', event.content);
});

await session.destroy();
await client.stop();
```

### Test RecipeKit Engine
```bash
cd /path/to/RecipeKit

# Test existing recipe
bun run ./Engine/engine.js \
  --recipe movies/tmdb.json \
  --type autocomplete \
  --input "The Matrix"
```

## Complete Integration Checklist

- [ ] Install agent-browser CLI tool
- [ ] Test agent-browser commands work
- [ ] Install @github/copilot-sdk package
- [ ] Configure Copilot API credentials (if needed)
- [ ] Update CopilotSession class with real SDK
- [ ] Update WebProber class with agent-browser calls
- [ ] Parse JSON responses from Copilot
- [ ] Handle streaming events from Copilot
- [ ] Test classification prompt
- [ ] Test autocomplete generation prompt
- [ ] Test URL generation prompt
- [ ] Test fixer prompt
- [ ] Run end-to-end test with real website
- [ ] Verify generated recipes work
- [ ] Check generated tests pass

## Debugging Tips

### Enable verbose logging
```javascript
// In autoRecipe.js
process.env.DEBUG = 'true';
```

### Inspect Copilot responses
```javascript
session.on('assistant.message', (event) => {
  console.log('=== COPILOT RESPONSE ===');
  console.log(event.content);
  console.log('========================');
});
```

### Save snapshots for inspection
```javascript
const snapshot = await WebProber.extractFingerprint(url);
await writeFile('/tmp/snapshot.json', JSON.stringify(snapshot, null, 2));
```

### Run engine with debug flag
```bash
bun run ./Engine/engine.js \
  --recipe <path> \
  --type <type> \
  --input "<input>" \
  --debug
```

This opens a browser window for manual inspection.
