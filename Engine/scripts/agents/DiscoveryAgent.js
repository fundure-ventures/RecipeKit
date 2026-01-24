/**
 * DiscoveryAgent - Searches and evaluates candidate websites
 * 
 * Uses haiku model for fast discovery and evaluation
 */

import { BaseAgent } from './BaseAgent.js';
import { MODELS } from './AgentOrchestrator.js';

export class DiscoveryAgent extends BaseAgent {
  constructor(orchestrator) {
    super(orchestrator, 'discovery', MODELS.HAIKU);
  }

  /**
   * Initialize the discovery agent
   * No extra instructions needed
   */
  async initialize() {
    return super.initialize('');
  }

  /**
   * Search and evaluate candidate websites for a given query
   * 
   * @param {string} query - User's search query/prompt
   * @param {object} searchResults - Raw search results from web search
   * @returns {object} { candidates, top_recommendation, search_strategy }
   */
  async searchAndEvaluate(query, searchResults) {
    const taskPrompt = await this.loadPrompt('discover-sources');
    
    const context = {
      user_query: query,
      search_results: searchResults
    };
    
    const result = await this.sendTask(taskPrompt, context);
    
    // Validate required fields
    if (!result.candidates || !Array.isArray(result.candidates)) {
      throw new Error('Discovery response missing valid candidates array');
    }
    
    return {
      candidates: result.candidates,
      top_recommendation: result.top_recommendation || null,
      search_strategy: result.search_strategy || '',
      reasoning: result.reasoning || ''
    };
  }

  /**
   * Clarify user intent for better search
   * 
   * @param {string} query - Original user query
   * @returns {object} { clarified_query, search_terms, filters }
   */
  async clarifyIntent(query) {
    const message = `## Intent Clarification

The user wants to find websites for: "${query}"

Analyze this query and provide:
1. A clarified, more specific version of the query
2. Optimal search terms to find relevant websites
3. Any filters or criteria to apply

Return JSON:
{
  "clarified_query": "...",
  "search_terms": ["term1", "term2"],
  "list_type_hint": "movies|books|etc or null",
  "filters": {
    "require_search": true/false,
    "require_api": true/false
  }
}

JSON:`;

    return await this.sendFollowUp(message);
  }
}

export default DiscoveryAgent;
