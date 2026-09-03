import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESLINT_BUDGET,
  evaluateEslintBudget,
  summarizeEslintResults,
} from '../../scripts/check-eslint-budget.mjs';

test('summarizes ESLint JSON without trusting its process exit code', () => {
  assert.deepEqual(summarizeEslintResults([
    { errorCount: 2, warningCount: 1 },
    { errorCount: 3, warningCount: 4 },
  ]), {
    errorCount: 5,
    warningCount: 5,
  });
});

test('accepts the current lint debt or an improvement', () => {
  assert.deepEqual(ESLINT_BUDGET, { maxErrors: 40, maxWarnings: 12 });

  assert.deepEqual(evaluateEslintBudget(
    { errorCount: 40, warningCount: 12 },
  ), { ok: true });
  assert.deepEqual(evaluateEslintBudget(
    { errorCount: 38, warningCount: 10 },
  ), { ok: true });
});

test('rejects a new lint error or warning independently', () => {
  assert.deepEqual(evaluateEslintBudget(
    { errorCount: 41, warningCount: 12 },
  ), {
    ok: false,
    error: 'ESLint budget exceeded: 41 errors (max 40), 12 warnings (max 12).',
  });
  assert.deepEqual(evaluateEslintBudget(
    { errorCount: 40, warningCount: 13 },
  ), {
    ok: false,
    error: 'ESLint budget exceeded: 40 errors (max 40), 13 warnings (max 12).',
  });
});
