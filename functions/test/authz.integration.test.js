const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../lib/firebase');
const { seedEmulators } = require('../scripts/seed-emulators');
const {
  resetTestEmulators,
} = require('./support/emulator-test-env');
const { requireAuth, requireSuperAdmin } = require('../lib/authz');

test.beforeEach(async () => {
  await resetTestEmulators();
  await seedEmulators();
});

test('requireAuth rejects an anonymous request', () => {
  assert.throws(() => requireAuth({ auth: null }), (error) => {
    assert.equal(error.code, 'unauthenticated');
    return true;
  });
});

test('requireSuperAdmin accepts only the seeded superadmin', async () => {
  assert.equal(
    await requireSuperAdmin({ auth: { uid: 'dev-superadmin' } }, db),
    'dev-superadmin',
  );

  await assert.rejects(
    requireSuperAdmin({ auth: { uid: 'dev-user' } }, db),
    (error) => {
      assert.equal(error.code, 'permission-denied');
      return true;
    },
  );
});
