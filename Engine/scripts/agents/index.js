/**
 * Agents module - Specialized Copilot agents for RecipeKit
 * 
 * Usage:
 *   import { AgentOrchestrator, ClassifyAgent, AuthorAgent, FixerAgent, DiscoveryAgent, MODELS } from './agents/index.js';
 *   
 *   const orchestrator = new AgentOrchestrator(logger, debugMode);
 *   await orchestrator.initialize();
 *   
 *   const classifier = new ClassifyAgent(orchestrator);
 *   await classifier.initialize();
 *   const result = await classifier.classify(evidence);
 */

export { AgentOrchestrator, MODELS } from './AgentOrchestrator.js';
export { BaseAgent } from './BaseAgent.js';
export { ClassifyAgent } from './ClassifyAgent.js';
export { AuthorAgent } from './AuthorAgent.js';
export { FixerAgent } from './FixerAgent.js';
export { DiscoveryAgent } from './DiscoveryAgent.js';
