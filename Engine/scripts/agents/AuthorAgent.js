/**
 * AuthorAgent - Generates autocomplete_steps and url_steps for recipes
 * 
 * Uses opus model for high-quality recipe authoring
 * Session persists to enable feedback-based improvements
 */

import { BaseAgent } from './BaseAgent.js';
import { MODELS } from './AgentOrchestrator.js';

export class AuthorAgent extends BaseAgent {
  constructor(orchestrator) {
    super(orchestrator, 'author', MODELS.OPUS);
  }

  /**
   * Initialize the author agent
   * No extra instructions - engine-reference.md provides all needed context
   */
  async initialize() {
    return super.initialize('');
  }

  /**
   * Generate autocomplete_steps for search results extraction
   * 
   * @param {object} evidence - Evidence packet including search_evidence
   * @returns {object} { autocomplete_steps, assumptions, known_fragility, extra_probes_needed }
   */
  async generateAutocomplete(evidence) {
    const taskPrompt = await this.loadPrompt('author-autocomplete');
    
    const result = await this.sendTask(taskPrompt, evidence);
    
    // Validate required fields
    if (!result.autocomplete_steps || !Array.isArray(result.autocomplete_steps)) {
      throw new Error('Author response missing valid autocomplete_steps array');
    }
    
    if (result.autocomplete_steps.length === 0) {
      throw new Error('Author returned empty autocomplete_steps array');
    }
    
    return {
      autocomplete_steps: result.autocomplete_steps,
      assumptions: result.assumptions || [],
      known_fragility: result.known_fragility || [],
      extra_probes_needed: result.extra_probes_needed || []
    };
  }

  /**
   * Generate url_steps for detail page extraction
   * 
   * @param {object} evidence - Evidence packet including detail page data
   * @returns {object} { url_steps, assumptions, known_fragility }
   */
  async generateUrlSteps(evidence) {
    const taskPrompt = await this.loadPrompt('author-url');
    
    const result = await this.sendTask(taskPrompt, evidence);
    
    // Validate required fields
    if (!result.url_steps || !Array.isArray(result.url_steps)) {
      throw new Error('Author response missing valid url_steps array');
    }
    
    return {
      url_steps: result.url_steps,
      assumptions: result.assumptions || [],
      known_fragility: result.known_fragility || []
    };
  }

  /**
   * Provide feedback to improve generation (uses session memory)
   * 
   * @param {string} feedback - Feedback about what went wrong
   * @param {object} context - Updated context with error details
   * @returns {object} Improved steps
   */
  async improvewithFeedback(feedback, context) {
    const message = `## Feedback on Previous Output

${feedback}

## Updated Context

\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`

Please provide an improved version addressing the feedback above.

Return ONLY valid JSON with the corrected steps. No explanations.

JSON:`;

    return await this.sendFollowUp(message);
  }
}

export default AuthorAgent;
