const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resetTestEmulators,
} = require('./support/emulator-test-env');
const { auth, db } = require('../lib/firebase');

test('resetTestEmulators clears only the demo Auth and Firestore emulators', async () => {
  await resetTestEmulators();
  await auth.createUser({
    uid: 'reset-probe',
    email: 'reset-probe@fantasya.local',
  });
  await db.doc('reset-probes/one').set({ exists: true });

  await resetTestEmulators();

  await assert.rejects(
    auth.getUser('reset-probe'),
    (error) => error.code === 'auth/user-not-found',
  );
  assert.equal((await db.doc('reset-probes/one').get()).exists, false);
});

test('resetTestEmulators rejects a non-demo environment', async () => {
  await assert.rejects(
    resetTestEmulators({
      ...process.env,
      GCLOUD_PROJECT: 'tictaktools',
    }),
    /expected "demo-fantasya"/,
  );
});
