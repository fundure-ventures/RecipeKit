import { Log } from './logger.js';
import _ from 'lodash';

export class StepExecutor {
    constructor(BrowserManager, RecipeEngine) {
      this.BrowserManager = BrowserManager;
      this.RecipeEngine = RecipeEngine;
      this.stepHandlers = {
        load: this.executeLoadStep,
        store_attribute: this.executeStoreAttributeStep,
        store_text: this.executeStoreTextStep,
        store_array: this.executeStoreArrayStep,
        regex: this.executeRegexStep,
        store: this.executeStoreStep,
        api_request: this.executeApiRequestStep,
        json_store_text: this.executeJsonStoreTextStep,
        url_encode: this.executeUrlEncodeStep,
        store_url: this.executeStoreUrlStep,
        replace: this.executeReplaceStep,
        store_count: this.executeStoreCountStep,
      };
    }
  
    async execute(step, stepNumber = null, totalSteps = null) {
      const handler = this.stepHandlers[step.command];
      const isLoop = (step?.config?.loop);
      const storeAsArray = (step?.command === 'store_array');

      let outputValue;
      let outputKey;

      if (!handler) {
        Log.error(`execute: Unknown step command: ${step.command}`);
        return;
      }
      
      // Log step configuration
      if (step.input) {
        const inputValue = this.RecipeEngine.replaceVariablesinString(step.input);
        Log.debug(`Input: ${step.input} → "${inputValue}"`);
      }
      if (step.url) {
        const urlValue = this.RecipeEngine.replaceVariablesinString(step.url);
        Log.debug(`URL: ${step.url} → "${urlValue}"`);
      }
      if (step.locator) {
        const locatorValue = this.RecipeEngine.replaceVariablesinString(step.locator);
        Log.debug(`Locator: ${step.locator} → "${locatorValue}"`);
      }
      if (step.expression) {
        Log.debug(`Expression: ${step.expression}`);
      }
      if (step.config) {
        Log.debug(`Config: ${JSON.stringify(step.config, null, 2)}`);
      }
      
      if (!step.output?.name) {
        Log.debug('⚠️  Step has no output defined');
      } else {
        Log.debug(`Output variable: ${step.output.name}`);
      }

      if (isLoop) {
        const loopFrom = parseInt(this.RecipeEngine.replaceVariablesinString(String(step.config.loop.from)), 10);
        const loopTo = parseInt(this.RecipeEngine.replaceVariablesinString(String(step.config.loop.to)), 10);
        const loopStep = parseInt(this.RecipeEngine.replaceVariablesinString(String(step.config.loop.step)), 10);
        Log.debug(`Loop: from ${loopFrom} to ${loopTo} (step: ${loopStep})`);
        for (let i = loopFrom; i <= loopTo; i += loopStep) {
          // Store loop index
          this.RecipeEngine.set(step.config.loop.index, i);
          outputKey = this.RecipeEngine.replaceVariablesinString(step?.output?.name);
          Log.debug(`  Loop iteration ${i}: output key = ${outputKey}`);

          if (storeAsArray) {
            outputValue = await handler.call(this, step);
            if (outputValue !== '') {
              this.RecipeEngine.push(outputKey, outputValue);
              Log.debug(`  → Stored in array: ${outputKey} = "${outputValue}"`);
            }
          } else {
            outputValue = await handler.call(this, step);
            this.RecipeEngine.set(outputKey, outputValue);
            Log.debug(`  → Stored: ${outputKey} = "${outputValue}"`);
          }
        }
      } else {
        outputKey = step?.output?.name;

        if (storeAsArray) {
          outputValue = await handler.call(this, step);
          if (outputValue !== '') {
            this.RecipeEngine.push(outputKey, outputValue);
            Log.debug(`→ Stored in array: ${outputKey} = "${outputValue}"`);
          }
        } else {
          outputValue = await handler.call(this, step);
          if (outputKey) {
            this.RecipeEngine.set(outputKey, outputValue);
            const displayValue = typeof outputValue === 'object' ? JSON.stringify(outputValue).substring(0, 200) : String(outputValue).substring(0, 200);
            Log.debug(`→ Stored: ${outputKey} = "${displayValue}"${outputValue && String(outputValue).length > 200 ? '...' : ''}`);
          } else {
            Log.debug(`→ Step executed (no output variable)`);
          }
        }
      }

      // Show current state of variables after step
      if (step.output?.name) {
        const finalValue = this.RecipeEngine.get(step.output.name);
        const displayFinal = typeof finalValue === 'object' ? JSON.stringify(finalValue).substring(0, 200) : String(finalValue).substring(0, 200);
        Log.debug(`✓ Paso completado. Variable ${step.output.name} = "${displayFinal}"${finalValue && String(finalValue).length > 200 ? '...' : ''}`);
      } else {
        Log.debug(`✓ Paso completado`);
      }
    }
  
    async executeLoadStep(step) {
      if (!step.url ) {
        Log.error('executeLoadStep: Missing required step properties');
        return '';
      }

      const url = this.RecipeEngine.replaceVariablesinString(step.url);
      let stepTimeout = (step.config?.timeout < process.env.MIN_PAGE_LOAD_TIMEOUT) ? process.env.MIN_PAGE_LOAD_TIMEOUT : step.config?.timeout;

      const options = {
        waitUntil: step.config?.js ? 'networkidle0' : 'domcontentloaded',
        timeout: stepTimeout || parseInt(process.env.DEFAULT_PAGE_LOAD_TIMEOUT),
      };

      if (step.config?.headers) {
        let replacedHeaders = JSON.stringify(step.config.headers);
        replacedHeaders = this.RecipeEngine.replaceVariablesinString(replacedHeaders);
        await this.BrowserManager.setExtraHTTPHeaders(JSON.parse(replacedHeaders));
      }
      
      if (step.config?.headers?.['Cookie']) {
        let cookie = this.RecipeEngine.replaceVariablesinString(step.config.headers["Cookie"]);
        let cookieParts = cookie.split("=");
        let domain = new URL(url).hostname;

        await this.BrowserManager.setCookies([
          { name: cookieParts[0], value: cookieParts[1], domain: domain }
        ]);
      }

      await this.BrowserManager.loadPage(url, options);
      Log.debug(`executeLoadStep: Page loaded: ${url} with options: ${JSON.stringify(options)} and headers: ${JSON.stringify(step.config?.headers)}`);
    }
  
    async executeStoreAttributeStep(step) {

      if (!step.locator && !step.attribute_name) {
        Log.error('executeStoreAttributeStep: Missing required step properties');
        return '';
      }

      const locator = this.RecipeEngine.replaceVariablesinString(step.locator);
      const element = await this.BrowserManager.querySelector(locator);
      
      if (!element) {
        Log.debug(`executeStoreAttributeStep: No elements found for locator: ${locator}`);
        return '';
      }

      const attributeValue = await element.evaluate((elem, attr) => elem.getAttribute(attr), step.attribute_name);

      return attributeValue;
    }
  
    async executeStoreTextStep(step) {

      if (!step.locator) {
        Log.error('executeStoreTextStep: Missing required step properties');
        return '';
      }

      const locator = this.RecipeEngine.replaceVariablesinString(step.locator);
      const element = await this.BrowserManager.querySelector(locator);

      if (!element) {
        Log.debug(`executeStoreTextStep: No elements found for locator: ${step.locator}`);
        return '';
      }

      const textValue = await element.evaluate(el => el.textContent.trim());

      return textValue;
    }

    async executeStoreArrayStep(step) {
      if (!step.locator) {
        Log.error('executeStoreArrayStep: Missing required step properties');
        return '';
      }

      const locator = this.RecipeEngine.replaceVariablesinString(step.locator);
      const element = await this.BrowserManager.querySelector(locator);

      if (!element) {
        Log.debug(`executeStoreArrayStep: No element found for locator: ${step.locator}`);
        return '';
      }

      const textValue = await element.evaluate(el => el.textContent.trim());
      return textValue;
    }
  
    async executeRegexStep(step) {
      if (!step.input || !step.expression) {
        Log.error('executeRegexStep: Missing required step properties');
        return '';
      }

      let input = this.RecipeEngine.replaceVariablesinString(step.input);
      input = input.replace(/\\([\\/?!])/g, '$1');
      Log.debug(`Applying regex "${step.expression}" to input: "${input}"`);

      try {
        const regex = new RegExp(step.expression, 'gs');
        const matches = [...input.matchAll(regex)];

        if (matches.length === 0) {
          Log.debug(`⚠️  No regex match found for expression: ${step.expression} on input: "${input}"`);
          return input;
        }

        const [fullMatch, ...captureGroups] = matches[0];
        const output = captureGroups.find(group => group !== undefined) || fullMatch;
        Log.debug(`Regex match found: "${output.trim()}"`);
        
        return output.trim();
      } catch (error) {
        Log.error(`executeRegexStep: Error ${error.message}`);
        return input;
      }
    }
  
    async executeStoreStep(step) {
      if (!step.input) {
        Log.error('executeStoreStep: Missing required step properties');
        return '';
      }

      const output = this.RecipeEngine.replaceVariablesinString(step.input);
      return output;
    }
  
    async executeApiRequestStep(step) {
      if (!step.url || !step.config) {
        Log.error('executeApiRequestStep: Missing required step properties');
        return '';
      }

      let url = this.RecipeEngine.replaceVariablesinString(step.url);
      
      // Clone config and replace variables in body if present
      let config = { ...step.config };
      if (config.body) {
        config.body = this.RecipeEngine.replaceVariablesinString(config.body);
      }
      
      Log.debug(`Making API request: ${config.method || 'GET'} ${url}`);
      try {
        const response = await fetch(url, config);
        Log.debug(`Response status: ${response.status} ${response.statusText}`);
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Could not read error response');
          Log.error(`❌ API Request failed: ${response.status} ${response.statusText}`);
          Log.error(`   URL: ${url}`);
          Log.error(`   Error response: ${errorText.substring(0, 500)}`);
          throw new Error(`executeApiRequestStep HTTP error! status: ${response.status} ${response.statusText}`);
        }
        const output = await response.json();
        Log.debug(`✅ API response received (${JSON.stringify(output).length} chars)`);
        return output;
      } catch (error) {
        Log.error(`❌ executeApiRequestStep: Error fetching data: ${error.message}`);
        Log.error(`   URL attempted: ${url}`);
        return {};
      }
    }
  
    async executeJsonStoreTextStep(step) {
      if (!step.input || !step.locator) {
        Log.error('executeJsonStoreTextStep: Missing required step properties');
        return '';
      }

      const input = this.RecipeEngine.get(step.input);
      const locator = this.RecipeEngine.replaceVariablesinString(step.locator);
      Log.debug(`Extracting from JSON: locator "${locator}" from variable "${step.input}"`);
      const output = _.get(input, locator);
      Log.debug(`Extracted value: "${output}"`);
      return output
    }
  
    async executeUrlEncodeStep(step) {
      if (!step.input) {
        Log.error('executeUrlEncodeStep: Missing required step properties');
        return '';
      }
      return encodeURIComponent(step.input);
    }
  
    async executeStoreUrlStep(step) {
      return this.BrowserManager.page.url();
    }

    async executeReplaceStep(step) {
      if (!step.input || !step.find || !step.replace) {
        Log.error('executeReplaceStep: Missing required step properties');
        return '';
      }
      const input = this.RecipeEngine.replaceVariablesinString(step.input);
      // Escape special regex characters in find string, then use global flag to replace all occurrences
      const escapedFind = step.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedFind, 'g');
      const output = input.replace(regex, step.replace);
      return output;
    }

    async executeStoreCountStep(step) {
      if (!step.locator) {
        Log.error('executeStoreCountStep: Missing required step properties (locator)');
        return '';
      }
      const locator = this.RecipeEngine.replaceVariablesinString(step.locator);
      const count = await this.BrowserManager.countElements(locator);
      return String(count);
    }

}