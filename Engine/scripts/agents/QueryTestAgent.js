/**
 * QueryTestAgent - Infers optimal test queries based on website content
 * 
 * Analyzes site evidence (links, titles, meta descriptions) to determine
 * the best search query for testing autocomplete functionality.
 * Uses haiku model for fast inference.
 */

import { BaseAgent } from './BaseAgent.js';
import { MODELS } from './AgentOrchestrator.js';

export class QueryTestAgent extends BaseAgent {
  constructor(orchestrator) {
    super(orchestrator, 'querytest', MODELS.HAIKU);
  }

  /**
   * Initialize the query test agent
   */
  async initialize() {
    return super.initialize('');
  }

  /**
   * Infer an optimal test query based on site evidence
   * 
   * Analyzes the website's content (links, titles, meta descriptions, JSON-LD types)
   * to determine what kind of items the site contains and suggests a relevant search query.
   * 
   * @param {object} siteEvidence - Evidence from initial site probe
   * @returns {object} { query, reasoning, alternatives }
   */
  async inferTestQuery(siteEvidence) {
    const taskPrompt = await this.loadPrompt('query-test');
    
    // Build focused context with relevant evidence
    const context = {
      hostname: siteEvidence.hostname,
      title: siteEvidence.title,
      meta_description: siteEvidence.meta_description,
      h1: siteEvidence.h1,
      jsonld_types: siteEvidence.jsonld_types || [],
      links_sample: siteEvidence.links_sample || []
    };
    
    const result = await this.sendTask(taskPrompt, context);
    
    // Validate required fields
    if (!result.query || typeof result.query !== 'string') {
      throw new Error('QueryTestAgent response missing valid query');
    }
    
    return {
      query: result.query,
      reasoning: result.reasoning || '',
      alternatives: result.alternatives || [],
      detected_content_type: result.detected_content_type || 'unknown'
    };
  }
}

export default QueryTestAgent;
