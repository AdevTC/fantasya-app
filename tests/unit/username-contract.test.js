import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUsernameValidationError,
  normalizeUsername,
} from '../../src/config/username.js';

test('client username normalization matches the public contract', () => {
  assert.equal(normalizeUsername(' Jordi_21 '), 'jordi_21');
  assert.equal(normalizeUsername('Jordi.Sumba'), 'jordi.sumba');
  assert.equal(getUsernameValidationError('_jordi'), null);
});

test('client rejects every legacy-invalid username shape', () => {
  for (const [value, message] of [
    ['ab', '3 y 16'],
    ['abcdefghijklmnopq', '3 y 16'],
    ['1jordi', 'número'],
    ['.jordi', 'punto'],
    ['jordi.', 'punto'],
    ['jordi-sumba', 'minúsculas'],
    ['jordi sumba', 'minúsculas'],
  ]) {
    assert.match(getUsernameValidationError(value), new RegExp(message));
  }
});
