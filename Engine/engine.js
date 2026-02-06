import { file } from 'bun';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { readFile } from 'fs/promises';
import { RecipeEngine } from './src/recipe.js';
import { Log } from './src/logger.js';

class ArgumentParser {
  async parse() {
    const args = Bun.argv.slice(2);
    const parsedArgs = {};
    let isDebug = false;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--debug') {
        isDebug = true;
      } else if (args[i].startsWith('--')) {
        parsedArgs[args[i].replace('--', '')] = args[i + 1];
        i++;
      }
    }

    return { parsedArgs, isDebug };
  }

  validate(parsedArgs) {
    if (!parsedArgs.recipe || !parsedArgs.type) {
      Log.error('Usage: bun run engine.js --recipe <recipe_path> --type <step_type> [--input <input>]');
      process.exit(1);
    }
  }
}

class JsonColorizer {
  colorize(obj) {
    const json = JSON.stringify(obj, null, 2);
    return json.replace(/"(\w+)":/g, (match, p1) => `"${chalk.cyan(p1)}":`)
               .replace(/"([^"]+)"(?=,|\n|\s*})/g, (match, p1) => `"${chalk.green(p1)}"`)
               .replace(/: (\d+)(,?)/g, (match, p1, p2) => `: ${chalk.yellow(p1)}${p2}`)
               .replace(/: (true|false)(,?)/g, (match, p1, p2) => `: ${chalk.magenta(p1)}${p2}`)
               .replace(/: (null)(,?)/g, (match, p1, p2) => `: ${chalk.gray(p1)}${p2}`);
  }
}

class Engine {
  constructor() {
    this.argumentParser = new ArgumentParser();
    this.jsonColorizer = new JsonColorizer();
    this.loadEnvVariables();
  }

  async loadEnvVariables() {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const envPath = resolve(__dirname, '.env');

    try {
      const env = await file(envPath).text();
      const envVariables = Object.fromEntries(
        env.split('\n')
          .filter(line => line.trim() !== '' && !line.startsWith('#'))
          .map(line => line.split('=').map(part => part.trim()))
      );

      Object.assign(process.env, envVariables);
      Log.debug("loadEnvVariables: Environment variables loaded successfully", envVariables);
    } catch (error) {
      Log.error(`loadEnvVariables: Error loading .env file from ${envPath}:`, error.message);
    }
  }

  async loadRecipe(recipePath) {
    const recipeContent = await readFile(recipePath, 'utf-8');
    return JSON.parse(recipeContent);
  }

  getAdditionalOptions(parsedArgs) {
    return {
      debug: parsedArgs.debug === 'true',
      timeout: parseInt(process.env.DEFAULT_PAGE_LOAD_TIMEOUT) || 30000,
      userAgent: process.env.DEFAULT_USER_AGENT
    };
  }

  getEngineCommandType(commandType) {
    const commandTypeMap = {
      'autocomplete': 'autocomplete_steps',
      'url': 'url_steps'
    };
    return commandTypeMap[commandType] || commandType;
  }

  restructureOutputByIndex(result) {
    const debug = {};
    const results = [];
    const indexedVariables = {};

    for (const [key, value] of Object.entries(result)) {
      const match = key.match(/^([A-Z]+)(\d+)$/);
      if (match) {
        const [, prefix, index] = match;
        if (!indexedVariables[index]) {
          indexedVariables[index] = {};
        }
        indexedVariables[index][prefix] = value;
      } else {
        debug[key] = value;
      }
    }

    results.push(...Object.values(indexedVariables));

    // Only include debug if in debug mode
    return Log.isDebug ? { debug, results } : { results };
  }

  restructureOutputByStepConfig(result, recipe) {
    const debug = { ...result };
    const filteredResult = {};

    if (recipe.url_steps && Array.isArray(recipe.url_steps)) {
      for (const step of recipe.url_steps) {
        if (step.output && step.output.name && step.output.show) {
          const outputName = step.output.name;
          if (result.hasOwnProperty(outputName)) {
            filteredResult[outputName] = result[outputName];
          } else if (outputName.includes('$')) {
            const pattern = new RegExp('^' + outputName.replace(/\$[a-zA-Z]+/g, '\\d+') + '$');
            for (const key of Object.keys(result)) {
              if (pattern.test(key)) {
                filteredResult[key] = result[key];
              }
            }
          }
        }
      }
    }

    return Log.isDebug
      ? { debug, results: filteredResult }
      : { results: filteredResult };
  }

  async executeRecipe(recipePath, commandType, input) {
    const recipe = await this.loadRecipe(recipePath);
    Log.debug('Loaded recipe:', recipePath);

    const engine = new RecipeEngine();
    await engine.initialize();

    try {
      const rawResult = await engine.executeRecipe(recipe, this.getEngineCommandType(commandType), input);
      let finalResult;

      if (commandType === 'autocomplete') {
        finalResult = this.restructureOutputByIndex(rawResult);
      } else if (commandType === 'url') {
        finalResult = this.restructureOutputByStepConfig(rawResult, recipe);
      } else {
        Log.error('Unknown command type:', commandType);
      }

      console.log(this.jsonColorizer.colorize(finalResult));
    } finally {
      await engine.close();
    }
  }

  handleError(error) {
    if (error instanceof SyntaxError) {
      Log.error('Error parsing recipe JSON:', error);
    } else if (error instanceof TypeError) {
      Log.error('Error executing recipe steps:', error);
    } else {
      Log.error('Unexpected error:', error);
    }
  }

  async run() {
    const { parsedArgs, isDebug } = await this.argumentParser.parse();
    Log.isDebug = isDebug;

    this.argumentParser.validate(parsedArgs);

    const { recipe: recipePath, type: stepType, input = '' } = parsedArgs;

    try {
      await this.executeRecipe(recipePath, stepType, input);
    } catch (error) {
      this.handleError(error);
    }
  }
}

// Main execution
const engine = new Engine();
engine.run();