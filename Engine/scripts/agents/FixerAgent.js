/**
 * FixerAgent - Repairs broken recipes based on test failures
 * 
 * Uses sonnet model for balanced quality/speed in iterative debugging
 * Session MUST persist across iterations to remember failed approaches
 */

import { BaseAgent } from './BaseAgent.js';
import { MODELS } from './AgentOrchestrator.js';

export class FixerAgent extends BaseAgent {
  constructor(orchestrator) {
    super(orchestrator, 'fixer', MODELS.SONNET);
    this.iteration = 0;
  }

  /**
   * Initialize the fixer agent with debugging-specific instructions
   * Loads debug-strategy.md and css-selector-guide.md as extra context
   */
  async initialize() {
    const debugStrategy = await this.loadPrompt('debug-strategy');
    const cssGuide = await this.loadPrompt('css-selector-guide');
    
    const extraInstructions = `${debugStrategy}\n\n---\n\n${cssGuide}`;
    
    return super.initialize(extraInstructions);
  }

  /**
   * Start a new fix session with initial context
   * 
   * @param {object} recipe - Current recipe JSON
   * @param {string} stepType - 'autocomplete_steps' or 'url_steps'
   * @param {string} testError - Test failure output
   * @param {string} engineError - Engine error output (if any)
   * @param {object} evidence - Evidence packet from probing
   * @returns {object} Fix instructions { action, patches, ... }
   */
  async startFix(recipe, stepType, testError, engineError, evidence) {
    this.iteration = 1;
    
    const taskPrompt = await this.loadPrompt('fixer');
    
    const context = {
      recipe,
      step_type: stepType,
      test_error: testError || 'No test output',
      engine_error: engineError || 'Engine ran successfully',
      evidence,
      iteration: this.iteration
    };
    
    const result = await this.sendTask(taskPrompt, context);
    
    return this.validateFixResult(result);
  }

  /**
   * Continue fixing with new error output (uses session memory)
   * The session remembers previous attempts, avoiding repeated failures
   * 
   * @param {object} recipe - Updated recipe after previous fix
   * @param {string} testError - New test failure output
   * @param {string} engineError - New engine error output (if any)
   * @returns {object} Fix instructions
   */
  async continueFix(recipe, testError, engineError) {
    this.iteration++;
    
    const message = `## Iteration ${this.iteration} - Still Failing

The previous fix didn't work. Here's the updated state:

### Updated Recipe (after your last fix)
\`\`\`json
${JSON.stringify(recipe, null, 2)}
\`\`\`

### New Test Error Output
\`\`\`
${testError || 'No test output'}
\`\`\`

### Engine Error (if any)
\`\`\`
${engineError || 'Engine ran successfully'}
\`\`\`

**IMPORTANT:** This is iteration ${this.iteration}. Your previous approaches have failed. Try something DIFFERENT:
1. Look at the error carefully - what's actually wrong?
2. Check if the selectors exist in the evidence
3. Consider if the site structure is different than expected
4. Don't repeat the same fix that already failed

Return ONLY valid JSON with your new fix. No explanations.

JSON:`;

    const result = await this.sendFollowUp(message);
    return this.validateFixResult(result);
  }

  /**
   * Validate fix result has required structure
   */
  validateFixResult(result) {
    if (!result.action) {
      throw new Error('Fix response missing required field: action');
    }
    
    if (result.action === 'patch') {
      if (!result.patches || !Array.isArray(result.patches)) {
        throw new Error('Patch action requires patches array');
      }
    } else if (result.action === 'rewrite') {
      if (!result.steps || !Array.isArray(result.steps)) {
        throw new Error('Rewrite action requires steps array');
      }
    } else if (result.action !== 'give_up') {
      throw new Error(`Unknown action: ${result.action}`);
    }
    
    return {
      action: result.action,
      patches: result.patches || [],
      steps: result.steps || [],
      new_steps: result.new_steps || [],
      insert_at: result.insert_at || null,
      delete_indices: result.delete_indices || [],
      explanation: result.explanation || ''
    };
  }

  /**
   * Get current iteration count
   */
  getIteration() {
    return this.iteration;
  }

  /**
   * Reset iteration counter (when starting fresh)
   */
  resetIteration() {
    this.iteration = 0;
  }
}

export default FixerAgent;
