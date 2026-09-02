import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateNodeVersion,
} from '../../scripts/check-node-version.mjs';

test('accepts only Node 22', () => {
  assert.deepEqual(evaluateNodeVersion('22.23.2'), { ok: true });
  assert.deepEqual(evaluateNodeVersion('v22.0.0'), { ok: true });
});

test('rejects another or malformed Node version', () => {
  assert.deepEqual(evaluateNodeVersion('24.14.0'), {
    ok: false,
    error: 'Node 22 required; received 24.14.0',
  });
  assert.deepEqual(evaluateNodeVersion('unknown'), {
    ok: false,
    error: 'Invalid Node version: unknown',
  });
});
