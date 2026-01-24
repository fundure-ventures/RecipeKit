/**
 * ClassifyAgent - Classifies websites into RecipeKit list_type categories
 * 
 * Uses haiku model for fast/cheap classification
 * Session can be reused for multiple classifications
 */

import { BaseAgent } from './BaseAgent.js';
import { MODELS } from './AgentOrchestrator.js';

export class ClassifyAgent extends BaseAgent {
  constructor(orchestrator) {
    super(orchestrator, 'classify', MODELS.HAIKU);
  }

  /**
   * Initialize the classify agent
   * No extra instructions needed - engine-reference.md is sufficient
   */
  async initialize() {
    return super.initialize('');
  }

  /**
   * Classify a website based on evidence packet
   * 
   * @param {object} evidence - Evidence packet from probing
   * @returns {object} { list_type, confidence, rationale, suggested_recipe_shortcut }
   */
  async classify(evidence) {
    const taskPrompt = await this.loadPrompt('classify');
    
    const result = await this.sendTask(taskPrompt, evidence);
    
    // Validate required fields
    if (!result.list_type) {
      throw new Error('Classification missing required field: list_type');
    }
    
    return {
      list_type: result.list_type,
      confidence: result.confidence || 0.5,
      rationale: result.rationale || '',
      suggested_recipe_shortcut: result.suggested_recipe_shortcut || ''
    };
  }
}

export default ClassifyAgent;
