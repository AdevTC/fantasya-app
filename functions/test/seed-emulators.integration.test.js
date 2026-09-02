const test = require('node:test');
const assert = require('node:assert/strict');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { seedEmulators } = require('../scripts/seed-emulators');

test('seed is idempotent and creates the required scenario', async () => {
  await seedEmulators();
  await seedEmulators();

  const authUsers = await getAuth().listUsers(10);
  const db = getFirestore();
  const userSnap = await db.doc('users/dev-user').get();
  const activeSnap = await db
    .doc('leagues/dev-league-active/seasons/season-1')
    .get();
  const archivedSnap = await db
    .doc('leagues/dev-league-archived/seasons/season-1')
    .get();
  const chatSnap = await db.doc('chats/dev-league-admin_dev-user').get();
  const trophySnap = await db
    .doc('users/dev-user/achievements/season-1')
    .get();

  assert.equal(authUsers.users.length, 3);
  assert.equal(userSnap.data().appRole, 'user');
  assert.equal(activeSnap.data().members['dev-league-admin'].role, 'admin');
  assert.equal(activeSnap.data().members['placeholder-rival'].isPlaceholder, true);
  assert.equal(archivedSnap.data().archived, true);
  assert.deepEqual(chatSnap.data().participants, ['dev-league-admin', 'dev-user']);
  assert.ok(chatSnap.data().lastMessageTimestamp);
  assert.equal(Object.hasOwn(chatSnap.data(), 'lastMessageAt'), false);
  assert.equal(trophySnap.data().trophies[0].trophyId, 'CHAMPION');
});
