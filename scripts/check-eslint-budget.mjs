import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ESLINT_BUDGET = Object.freeze({
  maxErrors: 40,
  maxWarnings: 12,
});

export function summarizeEslintResults(results) {
  if (!Array.isArray(results)) {
    throw new TypeError('Expected ESLint JSON to contain an array of file results.');
  }

  return results.reduce((summary, result) => ({
    errorCount: summary.errorCount + Number(result.errorCount ?? 0),
    warningCount: summary.warningCount + Number(result.warningCount ?? 0),
  }), {
    errorCount: 0,
    warningCount: 0,
  });
}

export function evaluateEslintBudget(
  summary,
  budget = ESLINT_BUDGET,
) {
  if (
    summary.errorCount <= budget.maxErrors
    && summary.warningCount <= budget.maxWarnings
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    error: `ESLint budget exceeded: ${summary.errorCount} errors (max ${budget.maxErrors}), ${summary.warningCount} warnings (max ${budget.maxWarnings}).`,
  };
}

export function runEslintBudgetCheck({
  cwd = process.cwd(),
  spawn = spawnSync,
} = {}) {
  const eslintEntrypoint = resolve(
    cwd,
    'node_modules',
    'eslint',
    'bin',
    'eslint.js',
  );
  if (!existsSync(eslintEntrypoint)) {
    throw new Error('Local ESLint installation not found. Run npm ci first.');
  }

  const result = spawn(
    process.execPath,
    [eslintEntrypoint, '.', '--format', 'json'],
    {
      cwd,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.signal || ![0, 1].includes(result.status)) {
    const details = String(result.stderr || result.stdout || '').trim();
    throw new Error(
      `ESLint could not complete${details ? `: ${details}` : '.'}`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error('ESLint did not return valid JSON.', { cause: error });
  }

  const summary = summarizeEslintResults(parsed);
  const evaluation = evaluateEslintBudget(summary);
  if (!evaluation.ok) {
    throw new Error(evaluation.error);
  }

  return summary;
}

const entrypoint = process.argv[1]
  ? resolve(process.argv[1])
  : '';
const currentFile = resolve(fileURLToPath(import.meta.url));

if (entrypoint.toLowerCase() === currentFile.toLowerCase()) {
  try {
    const summary = runEslintBudgetCheck();
    console.log(
      `ESLint budget accepted: ${summary.errorCount} errors (max ${ESLINT_BUDGET.maxErrors}), ${summary.warningCount} warnings (max ${ESLINT_BUDGET.maxWarnings}).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
