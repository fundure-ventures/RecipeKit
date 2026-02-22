import { Log } from './logger.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '../../schema/fields.json');

let schema = null;

function loadSchema() {
  if (schema) return schema;
  try {
    schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  } catch (error) {
    Log.error(`FieldValidator: Failed to load schema from ${schemaPath}: ${error.message}`);
    schema = { autocomplete_fields: {}, url_fields: {} };
  }
  return schema;
}

/**
 * Validates that a step's output field is properly configured.
 *
 * @param {object} step - The recipe step to validate.
 * @param {string} stepType - Either 'autocomplete_steps' or 'url_steps'.
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateField(step, stepType) {
  if (!step.output || !step.output.name) {
    return { valid: true }; // No output to validate
  }

  const { name, show } = step.output;

  // show is required — must be explicitly true or false
  if (show === undefined || show === null) {
    return { valid: false, reason: `Field "${name}": "show" is required (must be true or false)` };
  }

  // show: false → skip schema validation, any key is fine
  if (show === false) {
    return { valid: true };
  }

  // show: true → validate against schema
  const s = loadSchema();
  const fieldName = name.replace(/\$[a-zA-Z]+/g, ''); // Strip $i index suffix
  const fields = stepType === 'autocomplete_steps' ? s.autocomplete_fields : s.url_fields;

  if (!fields[fieldName]) {
    return { valid: false, reason: `Field "${fieldName}": unknown output key for ${stepType} (show: true). Ignoring value.` };
  }

  return { valid: true };
}

/**
 * Validates all steps in a recipe for a given step type.
 * Logs warnings for unknown fields, throws on missing show.
 *
 * @param {object} recipe - The full recipe object.
 * @param {string} stepType - Either 'autocomplete_steps' or 'url_steps'.
 * @returns {Set<string>} Set of field names (stripped of $i) that should be ignored.
 */
export function validateRecipeFields(recipe, stepType) {
  const steps = recipe[stepType];
  const ignoredFields = new Set();

  if (!steps || !Array.isArray(steps)) return ignoredFields;

  for (const step of steps) {
    if (!step.output || !step.output.name) continue;

    const result = validateField(step, stepType);
    if (!result.valid) {
      if (result.reason.includes('"show" is required')) {
        Log.error(result.reason);
      } else {
        Log.warn(result.reason);
        const fieldName = step.output.name.replace(/\$[a-zA-Z]+/g, '');
        ignoredFields.add(fieldName);
      }
    }
  }

  return ignoredFields;
}
