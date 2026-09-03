import test from 'node:test';
import assert from 'node:assert/strict';
import {
  finishRegistration,
} from '../../src/config/registration-flow.js';

test('profile failure preserves the Auth user and routes to profile completion', async () => {
  const user = { uid: 'new-user' };
  const profileError = new Error('username conflict');
  let verificationCalls = 0;

  const result = await finishRegistration({
    createProfile: async () => { throw profileError; },
    sendVerification: async () => { verificationCalls += 1; },
    user,
    username: 'jordi',
  });

  assert.deepEqual(result, {
    error: profileError,
    status: 'profile-incomplete',
    user,
  });
  assert.equal(verificationCalls, 0);
});

test('verification failure is returned as independently retryable', async () => {
  const user = { uid: 'new-user' };
  const verificationError = new Error('mail unavailable');
  const result = await finishRegistration({
    createProfile: async () => {},
    sendVerification: async () => { throw verificationError; },
    user,
    username: 'jordi',
  });

  assert.deepEqual(result, {
    error: verificationError,
    status: 'verification-pending',
    user,
  });
});

test('successful registration completes both downstream steps', async () => {
  const calls = [];
  const user = { uid: 'new-user' };
  const result = await finishRegistration({
    createProfile: async (username) => { calls.push(['profile', username]); },
    sendVerification: async (value) => { calls.push(['verification', value.uid]); },
    user,
    username: 'jordi',
  });

  assert.deepEqual(result, { status: 'complete', user });
  assert.deepEqual(calls, [
    ['profile', 'jordi'],
    ['verification', 'new-user'],
  ]);
});
