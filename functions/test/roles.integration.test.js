const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../lib/firebase');
const { seedEmulators } = require('../scripts/seed-emulators');
const {
  resetTestEmulators,
} = require('./support/emulator-test-env');
const { setUserAppRoleHandler } = require('../handlers/roles');

test.beforeEach(async () => {
  await resetTestEmulators();
  await seedEmulators();
});

function setRole(requester, userId, appRole) {
  return setUserAppRoleHandler({
    auth: { uid: requester },
    data: { appRole, userId },
  });
}

test('superadmin can promote and demote another account', async () => {
  assert.equal(
    (await setRole('dev-superadmin', 'dev-user', 'superadmin')).appRole,
    'superadmin',
  );
  assert.equal(
    (await setRole('dev-superadmin', 'dev-user', 'user')).appRole,
    'user',
  );
});

test('normal user cannot change a role', async () => {
  await assert.rejects(
    setRole('dev-user', 'dev-league-admin', 'superadmin'),
    (error) => error.code === 'permission-denied',
  );
});

test('last superadmin cannot be demoted', async () => {
  await assert.rejects(
    setRole('dev-superadmin', 'dev-superadmin', 'user'),
    (error) => error.code === 'failed-precondition',
  );
  assert.equal(
    (await db.doc('users/dev-superadmin').get()).data().appRole,
    'superadmin',
  );
});

test('concurrent demotions always leave one superadmin', async () => {
  await setRole('dev-superadmin', 'dev-user', 'superadmin');

  const results = await Promise.allSettled([
    setRole('dev-superadmin', 'dev-user', 'user'),
    setRole('dev-user', 'dev-superadmin', 'user'),
  ]);
  const admins = await db.collection('users')
    .where('appRole', '==', 'superadmin')
    .get();

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(admins.size, 1);
});
