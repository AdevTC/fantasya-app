const test = require('node:test');
const assert = require('node:assert/strict');
const { auth, db } = require('../lib/firebase');
const { seedEmulators } = require('../scripts/seed-emulators');
const {
  resetTestEmulators,
} = require('./support/emulator-test-env');
const {
  createProfileDocumentsHandler,
  normalizeUsername,
} = require('../handlers/profile');

test.beforeEach(async () => {
  await resetTestEmulators();
  await seedEmulators();
});

test('server preserves the 3-16 character username contract', () => {
  assert.equal(normalizeUsername(' Jordi_21 '), 'jordi_21');
  assert.equal(normalizeUsername('_jordi'), '_jordi');
  assert.equal(normalizeUsername('jordi.sumba'), 'jordi.sumba');

  for (const invalid of [
    'ab',
    'abcdefghijklmnopq',
    '1jordi',
    '.jordi',
    'jordi.',
    'jordi-sumba',
    'jordi sumba',
  ]) {
    assert.throws(
      () => normalizeUsername(invalid),
      (error) => error.code === 'invalid-argument',
    );
  }
});

test('creates profile and username atomically and is idempotent on retry', async () => {
  const request = {
    auth: { uid: 'new-profile', token: { email: 'new@fantasya.local' } },
    data: { username: 'Nuevo.User' },
  };

  const first = await createProfileDocumentsHandler(request);
  const second = await createProfileDocumentsHandler(request);
  const profile = await db.doc('users/new-profile').get();
  const username = await db.doc('usernames/nuevo.user').get();

  assert.deepEqual(first, { success: true, username: 'nuevo.user' });
  assert.deepEqual(second, first);
  assert.equal(profile.data().xp, 0);
  assert.equal(profile.data().appRole, 'user');
  assert.equal(username.data().userId, 'new-profile');
});

test('retry repairs a missing username index without rewriting the profile', async () => {
  const request = {
    auth: { uid: 'new-profile', token: { email: 'new@fantasya.local' } },
    data: { username: 'nuevo_user' },
  };
  await createProfileDocumentsHandler(request);
  await db.doc('users/new-profile').update({ bio: 'Se conserva' });
  await db.doc('usernames/nuevo_user').delete();

  const result = await createProfileDocumentsHandler(request);

  assert.deepEqual(result, { success: true, username: 'nuevo_user' });
  assert.equal((await db.doc('users/new-profile').get()).data().bio, 'Se conserva');
  assert.equal(
    (await db.doc('usernames/nuevo_user').get()).data().userId,
    'new-profile',
  );
});

test('username conflict keeps the Auth account available for recovery', async () => {
  await auth.createUser({
    uid: 'conflict-user',
    email: 'conflict@fantasya.local',
  });

  await assert.rejects(
    createProfileDocumentsHandler({
      auth: {
        uid: 'conflict-user',
        token: { email: 'conflict@fantasya.local' },
      },
      data: { username: 'user' },
    }),
    (error) => error.code === 'already-exists',
  );

  assert.equal((await auth.getUser('conflict-user')).uid, 'conflict-user');
  assert.equal((await db.doc('users/conflict-user').get()).exists, false);
});
