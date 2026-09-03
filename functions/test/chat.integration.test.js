const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../lib/firebase');
const { createOrGetChatHandler } = require('../handlers/chat');
const { seedEmulators } = require('../scripts/seed-emulators');
const {
  resetTestEmulators,
} = require('./support/emulator-test-env');

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test.beforeEach(async () => {
  await resetTestEmulators();
  await seedEmulators();
});

test('chat creation verifies users, sorts participants and is idempotent', async () => {
  const first = await createOrGetChatHandler({
    uid: 'dev-user',
    data: { otherUserUid: 'dev-superadmin' },
  });
  const second = await createOrGetChatHandler({
    uid: 'dev-superadmin',
    data: { otherUserUid: 'dev-user' },
  });
  assert.equal(first.chatId, 'dev-superadmin_dev-user');
  assert.equal(second.chatId, first.chatId);
  assert.equal(first.created, true);
  assert.equal(second.created, false);

  const snapshot = await db.doc('chats/' + first.chatId).get();
  assert.deepEqual(snapshot.data().participants, [
    'dev-superadmin',
    'dev-user',
  ]);
  assert.equal(snapshot.data().lastMessage, '');
  assert.ok(snapshot.data().createdAt);
});

test('chat creation rejects self-chat and a missing user', async () => {
  await rejectsCode(createOrGetChatHandler({
    uid: 'dev-user',
    data: { otherUserUid: 'dev-user' },
  }), 'invalid-argument');
  await rejectsCode(createOrGetChatHandler({
    uid: 'dev-user',
    data: { otherUserUid: 'missing-user' },
  }), 'not-found');
  assert.equal(
    (await db.doc('chats/dev-user_missing-user').get()).exists,
    false,
  );
});

test('malformed existing chat is rejected without being overwritten', async () => {
  const chatRef = db.doc('chats/dev-superadmin_dev-user');
  await chatRef.set({
    participants: ['dev-superadmin', 'dev-league-admin'],
    lastMessage: 'No tocar',
  });

  await rejectsCode(createOrGetChatHandler({
    uid: 'dev-user',
    data: { otherUserUid: 'dev-superadmin' },
  }), 'failed-precondition');

  const chat = await chatRef.get();
  assert.deepEqual(chat.data().participants, [
    'dev-superadmin',
    'dev-league-admin',
  ]);
  assert.equal(chat.data().lastMessage, 'No tocar');
});
