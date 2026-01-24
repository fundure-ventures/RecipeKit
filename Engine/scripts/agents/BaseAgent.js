/**
 * BaseAgent - Common functionality for all specialized agents
 * 
 * Provides:
 * - Session management via orchestrator
 * - Message sending with JSON format enforcement
 * - Response parsing with markdown code block handling
 * - Usage tracking
 */

export class BaseAgent {
  constructor(orchestrator, agentType, model) {
    this.orchestrator = orchestrator;
    this.agentType = agentType;
    this.model = model;
    this.session = null;
    this.logger = orchestrator.logger;
    this.debugMode = orchestrator.debugMode;
  }

  /**
   * Initialize the agent's session
   * Override in subclasses to provide extra instructions
   */
  async initialize(extraInstructions = '') {
    this.session = await this.orchestrator.getOrCreateSession(
      this.agentType,
      this.model,
      extraInstructions
    );
    return this;
  }

  /**
   * Get the existing session (for iterative tasks)
   */
  getSession() {
    return this.orchestrator.getSession(this.agentType);
  }

  /**
   * Check if session exists
   */
  hasSession() {
    return this.orchestrator.hasSession(this.agentType);
  }

  /**
   * Send a task and wait for JSON response
   * 
   * @param {string} taskPrompt - The task-specific prompt (from .md file)
   * @param {object} context - Context data to include
   * @param {object} options - Additional options
   * @returns {object} Parsed JSON response
   */
  async sendTask(taskPrompt, context = null, options = {}) {
    if (!this.session) {
      throw new Error(`${this.agentType} agent not initialized`);
    }

    // Build message with explicit JSON format request
    let message = taskPrompt;
    
    if (context) {
      message += `\n\n## Context\n\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
    }
    
    // Add format enforcement
    message += `\n\n## IMPORTANT: Output Format\n\nReturn ONLY valid JSON. No markdown code blocks, no explanations before or after.\n\nJSON:`;

    this.logger.log?.(`[${this.agentType}] Sending task...`);
    
    // Track request
    this.orchestrator.trackRequest(this.agentType);
    
    // Send and wait for response
    const response = await this.sendAndWait(message);
    
    // Parse JSON from response
    return this.parseJSON(response);
  }

  /**
   * Send a message and wait for complete response
   * Used internally and can be used for non-JSON responses
   */
  async sendAndWait(message, timeout = 120000) {
    let responseContent = '';
    
    const done = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`${this.agentType} response timeout after ${timeout}ms`));
      }, timeout);

      const unsubscribe = this.session.on((event) => {
        // Track usage
        this.orchestrator.trackUsage(this.agentType, event);
        
        // Log events in debug mode
        if (this.debugMode && event.type !== 'session.usage_info') {
          this.logger.log?.(`[${this.agentType}] Event: ${event.type}`);
        }

        // Handle streaming message chunks
        if (event.type === 'assistant.message_delta' && event.data?.deltaContent) {
          responseContent += event.data.deltaContent;
        }
        // Handle final message
        if (event.type === 'assistant.message' && event.data?.content) {
          responseContent = event.data.content;
        }
        // Handle legacy content field
        if (event.type === 'assistant.message_delta' && event.data?.content) {
          responseContent += event.data.content;
        }
        // Session finished processing
        if (event.type === 'session.idle') {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve();
        }
        // Handle errors
        if (event.type === 'error') {
          clearTimeout(timeoutId);
          unsubscribe();
          reject(new Error(event.data?.message || 'Unknown Copilot error'));
        }
      });
    });

    // Send the message
    await this.session.send({ prompt: message });
    
    // Wait for completion
    await done;
    
    this.logger.log?.(`[${this.agentType}] Response received (${responseContent.length} chars)`);
    
    return responseContent;
  }

  /**
   * Send a follow-up message to existing session (for iterative tasks)
   * Does not add JSON format enforcement - use for conversational follow-ups
   */
  async sendFollowUp(message, timeout = 120000) {
    if (!this.session) {
      throw new Error(`${this.agentType} agent not initialized`);
    }
    
    this.orchestrator.trackRequest(this.agentType);
    const response = await this.sendAndWait(message, timeout);
    return this.parseJSON(response);
  }

  /**
   * Parse JSON from response, handling markdown code blocks
   */
  parseJSON(response) {
    if (!response || typeof response !== 'string') {
      throw new Error('Empty or invalid response');
    }

    // Try to extract JSON from markdown code blocks first
    const codeBlockMatch = response.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (e) {
        // Fall through to try other methods
      }
    }

    // Try to find raw JSON object or array
    const jsonMatch = response.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e) {
        // Fall through
      }
    }

    // Try parsing the entire response
    try {
      return JSON.parse(response.trim());
    } catch (e) {
      this.logger.log?.(`[${this.agentType}] Failed to parse JSON: ${response.slice(0, 200)}...`);
      throw new Error(`Failed to parse JSON response from ${this.agentType}: ${e.message}`);
    }
  }

  /**
   * Load a prompt file
   */
  async loadPrompt(name) {
    return this.orchestrator.loadPrompt(name);
  }

  /**
   * Destroy this agent's session
   */
  async destroy() {
    await this.orchestrator.destroySession(this.agentType);
    this.session = null;
  }
}

export default BaseAgent;
