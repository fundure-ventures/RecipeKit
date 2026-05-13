import { expect } from "bun:test";
import { spawn, file } from "bun";
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Log } from '../src/logger.js';

Log.setDebug(process.env.DEBUG === 'true');

export async function loadEnvVariables() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(__dirname, '../.env');

  try {
    const env = await file(envPath).text();
    const envVariables = Object.fromEntries(
      env.split('\n')
        .filter(line => line.trim() !== '' && !line.startsWith('#'))
        .map(line => line.split('=').map(part => part.trim()))
    );

    Object.assign(process.env, envVariables);
  } catch (error) {
    console.log(`loadEnvVariables: Error loading .env file from ${envPath}:`, error.message);
  }
}

export async function runEngine(recipe, type, input) {
  const bunExecutable = process.execPath || Bun.which("bun") || "bun";
  const proc = spawn([
    bunExecutable,
    "Engine/engine.js", 
    "--recipe", recipe,
    "--type", type,
    "--input", input
  ]);

  const output = await new Response(proc.stdout).text();
  const data = JSON.parse(output);
  const results = data.results;

  Log.debug(results);

  // Generic validations
  if (type === "autocomplete") {
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  } else if (type === "url") {
    expect(typeof results).toBe('object');
    expect(Object.keys(results).length).toBeGreaterThan(0);
  }

  return results;
}

export function findEntry(results, title, subtitle = null) {
  const entry = results.find(item => {
    if (item.TITLE !== title) return false;
    if (!subtitle) return true;
    return item.SUBTITLE === subtitle;
  });

  expect(entry).toBeDefined(`No entry found for title "${title}" ${subtitle ? `and subtitle "${subtitle}"` : ''}`);

  return entry;
}
