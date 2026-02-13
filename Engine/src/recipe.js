import { BrowserManager } from './browser.js';
import { StepExecutor } from './commands.js';
import { Log } from './logger.js';

function cleanVariableValue(variableValue) {
  if (typeof variableValue == "string") {
    return variableValue.replace(/[\r\n\t]+/g, '').replace(/\s+/g, ' ').trim();
  } else {
    return variableValue;
  }
}

export class RecipeEngine {

  static VARIABLE_NAMES = {
    INPUT: 'INPUT',
    SYSTEM_LANGUAGE: 'SYSTEM_LANGUAGE',
    SYSTEM_REGION: 'SYSTEM_REGION',
    VARIABLE_START_CHAR: '$'
  };

  constructor() {

    this.variables = {};
    this.set(RecipeEngine.VARIABLE_NAMES.SYSTEM_LANGUAGE, process.env.SYSTEM_LANGUAGE);
    this.set(RecipeEngine.VARIABLE_NAMES.SYSTEM_REGION, process.env.SYSTEM_REGION);
    this.set(RecipeEngine.VARIABLE_NAMES.INPUT, '');

    this.browserManager = new BrowserManager();
    this.stepExecutor = new StepExecutor(this.browserManager, this);
  }

  push(key, value) {
    // Initialize the array if it doesn't exist
    if (!this.variables[key]) {
      this.variables[key] = [];
    }
    this.variables[key].push(cleanVariableValue(value));
  }

  set(key, value) {
    this.variables[key] = cleanVariableValue(value);
  }

  get(key, defaultValue = '') {
    const rawKey = key.replace(RecipeEngine.VARIABLE_NAMES.VARIABLE_START_CHAR, '');
    const value = this.variables[rawKey] ?? process.env[rawKey] ?? defaultValue;
    return value;
  }

  getAllVariables() {
    return this.variables;
  }

  setInput(input) {
    let sanitizedInput = input.replace(/\\/g, '');
    this.set(RecipeEngine.VARIABLE_NAMES.INPUT, sanitizedInput);
  }

  replaceVariablesinString(str) {     
    if (!str || typeof str !== 'string') {
      return str;
    }
    
    // Sort variables by length descending to prevent partial matches
    // (e.g., $URL1 matching inside $URL10)
    const sortedKeys = Object.keys(this.variables)
      .sort((a, b) => b.length - a.length);

    const doReplace = (input) =>
      sortedKeys.reduce((result, variable) => {
        const regex = new RegExp(`\\$${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
        const value = this.get(variable);
        return result.replace(regex, value);
      }, input);

    // Two passes: resolves chained vars like $YEAR$i → $YEAR0 → "1991"
    let result = doReplace(str);
    if (result.includes('$')) {
      result = doReplace(result);
    }
    return result;
  } 

  async initialize() {
    await this.browserManager.initialize();
  }

  async close() {
    await this.browserManager.close();
  }

  async updateHeadersFromRecipe(recipe) {
    await this.browserManager.setUserAgent(recipe.headers["User-Agent"]);
    await this.browserManager.setExtraHTTPHeaders({
      'Accept-Language': recipe.headers["Accept-Language"]
    });
  }

  matchLanguageAndRegion(recipe) {
    let matchedLanguage = recipe.languages_available.find(language => {
      return (language.toLowerCase() === this.get(RecipeEngine.VARIABLE_NAMES.SYSTEM_LANGUAGE).toLowerCase().split('_')[0])
    });

    let matchedRegion = recipe.regions_available.find(region => {
      return (region.toUpperCase() === this.get(RecipeEngine.VARIABLE_NAMES.SYSTEM_REGION).toUpperCase())
    });

    if (matchedLanguage) {
      this.set(RecipeEngine.VARIABLE_NAMES.SYSTEM_LANGUAGE, matchedLanguage);
    } else {
      this.set(RecipeEngine.VARIABLE_NAMES.SYSTEM_LANGUAGE, recipe.language_default.toLowerCase());
      Log.debug(`No language matched for: ${this.get(RecipeEngine.VARIABLE_NAMES.SYSTEM_LANGUAGE)}`);
    }

    if (matchedRegion) {
      this.set(RecipeEngine.VARIABLE_NAMES.SYSTEM_REGION, matchedRegion);
    } else {
      this.set(RecipeEngine.VARIABLE_NAMES.SYSTEM_REGION, recipe.region_default.toUpperCase());
      Log.debug(`No region matched for: ${this.get(RecipeEngine.VARIABLE_NAMES.SYSTEM_REGION)}`);
    }
  }

  async executeRecipe(recipe, stepType, input = '') {
    Log.debug(`\n🚀 Ejecutando recipe para step type: ${stepType}`);
    Log.debug(`📝 Input recibido: "${input}"`);
    const steps = recipe[stepType] || [];
    Log.debug(`📊 Total de pasos a ejecutar: ${steps.length}\n`);

    if (steps.length === 0) {
      Log.warn(`No steps found for step type: ${stepType}`);
      return {};
    }

    if (stepType != 'autocomplete_steps' && stepType != 'url_steps') {
      Log.warn(`Unknown step type: ${stepType}`);
      return {};
    }
    
    // When available, match the language and region of the recipe with the user ones
    if (recipe.languages_available && recipe.regions_available) this.matchLanguageAndRegion(recipe);

    // Override headers .env for recipe ones
    if (recipe.headers) this.updateHeadersFromRecipe(recipe);

    // Set the input from the user
    this.setInput(input);

    await this.executeSteps(steps);

    return this.getAllVariables();
  }

  async executeSteps(steps) {
    const totalSteps = steps.length;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepNumber = i + 1;
      Log.debug(`\n${'='.repeat(60)}`);
      Log.debug(`PASO ${stepNumber}/${totalSteps}: ${step.command || 'unknown'}`);
      if (step.description) {
        Log.debug(`Descripción: ${step.description}`);
      }
      Log.debug(`${'='.repeat(60)}`);
      await this.stepExecutor.execute(step, stepNumber, totalSteps);
    }
    Log.debug(`\n${'='.repeat(60)}`);
    Log.debug(`Todos los pasos completados (${totalSteps} pasos)`);
    Log.debug(`${'='.repeat(60)}\n`);
  }
}