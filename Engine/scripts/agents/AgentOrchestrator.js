/**
 * AgentOrchestrator - Manages Copilot SDK client and agent sessions
 * 
 * Responsibilities:
 * - Single CopilotClient instance shared across all agents
 * - Session registry for persistence and reuse
 * - Loads engine-reference.md once for all agents
 */

import { CopilotClient } from '@github/copilot-sdk';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, '..', 'prompts');

// Model constants
export const MODELS = {
  HAIKU: 'claude-haiku-4.5',    // Fast/cheap: classify, discovery
  SONNET: 'claude-sonnet-4',     // Balanced: fixer
  OPUS: 'claude-opus-4.5'        // Quality: authoring
};

export class AgentOrchestrator {
  constructor(logger, debugMode = false) {
    this.logger = logger;
    this.debugMode = debugMode;
    this.client = null;
    this.sessions = new Map(); // agentType -> session
    this.engineReference = null;
    
    // Usage tracking across all agents
    this.usage = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      requests: 0,
      byAgent: {}
    };
  }

  /**
   * Initialize the orchestrator - must be called before using agents
   */
  async initialize() {
    this.logger.step('Initializing AgentOrchestrator...');
    
    // Start CopilotClient
    this.client = new CopilotClient();
    await this.client.start();
    
    // Load shared engine reference
    this.engineReference = await this.loadPrompt('engine-reference');
    
    this.logger.success('AgentOrchestrator initialized');
  }

  /**
   * Load a prompt file from the prompts directory
   */
  async loadPrompt(name) {
    const path = join(PROMPTS_DIR, `${name}.md`);
    return await readFile(path, 'utf-8');
  }

  /**
   * Get or create a session for an agent type
   * Sessions are reused to maintain conversation context
   */
  async getOrCreateSession(agentType, model, extraInstructions = '') {
    if (this.sessions.has(agentType)) {
      this.logger.log?.(`Reusing existing ${agentType} session`);
      return this.sessions.get(agentType);
    }

    this.logger.log?.(`Creating new ${agentType} session with model ${model}`);
    
    // Combine engine-reference with agent-specific instructions
    const instructions = extraInstructions 
      ? `${this.engineReference}\n\n---\n\n${extraInstructions}`
      : this.engineReference;

    const session = await this.client.createSession({ 
      model,
      instructions
    });
    
    this.sessions.set(agentType, session);
    
    // Initialize usage tracking for this agent
    if (!this.usage.byAgent[agentType]) {
      this.usage.byAgent[agentType] = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requests: 0,
        model
      };
    }
    
    return session;
  }

  /**
   * Get an existing session (for iterative tasks like fixer)
   * Returns null if session doesn't exist
   */
  getSession(agentType) {
    return this.sessions.get(agentType) || null;
  }

  /**
   * Check if a session exists for an agent type
   */
  hasSession(agentType) {
    return this.sessions.has(agentType);
  }

  /**
   * Destroy a specific session
   */
  async destroySession(agentType) {
    const session = this.sessions.get(agentType);
    if (session) {
      try {
        await session.destroy();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.sessions.delete(agentType);
      this.logger.log?.(`Destroyed ${agentType} session`);
    }
  }

  /**
   * Track usage from session events
   */
  trackUsage(agentType, event) {
    if (event.type === 'session.usage_info' && event.data) {
      const { promptTokens, completionTokens, totalTokens } = event.data;
      
      // Global tracking
      if (promptTokens) this.usage.totalPromptTokens += promptTokens;
      if (completionTokens) this.usage.totalCompletionTokens += completionTokens;
      if (totalTokens) this.usage.totalTokens += totalTokens;
      
      // Per-agent tracking
      if (this.usage.byAgent[agentType]) {
        if (promptTokens) this.usage.byAgent[agentType].promptTokens += promptTokens;
        if (completionTokens) this.usage.byAgent[agentType].completionTokens += completionTokens;
        if (totalTokens) this.usage.byAgent[agentType].totalTokens += totalTokens;
      }
    }
  }

  /**
   * Track a request for an agent
   */
  trackRequest(agentType) {
    this.usage.requests++;
    if (this.usage.byAgent[agentType]) {
      this.usage.byAgent[agentType].requests++;
    }
  }

  /**
   * Get usage summary
   */
  getUsage() {
    return { ...this.usage };
  }

  /**
   * Close all sessions and stop the client
   */
  async close() {
    this.logger.log?.('Closing AgentOrchestrator...');
    
    // Destroy all sessions
    for (const [agentType, session] of this.sessions) {
      try {
        await session.destroy();
        this.logger.log?.(`Destroyed ${agentType} session`);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    this.sessions.clear();
    
    // Stop the client
    if (this.client) {
      try {
        await this.client.stop();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.client = null;
    }
    
    this.logger.log?.('AgentOrchestrator closed');
  }
}

export default AgentOrchestrator;
