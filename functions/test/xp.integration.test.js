const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../lib/firebase');
const { seedEmulators } = require('../scripts/seed-emulators');
const {
  resetTestEmulators,
} = require('./support/emulator-test-env');
const {
  awardXpOnce,
  calculateXpByUser,
  recalculateAllXp,
} = require('../lib/xp');
const {
  onPostCreatedAwardXpHandler,
  onTransferCreatedAwardXpHandler,
  recalculateXpHandler,
} = require('../handlers/xp');

test.beforeEach(async () => {
  await resetTestEmulators();
  await seedEmulators();
});

test('the same event awards xp exactly once', async () => {
  await db.doc('users/dev-user').update({ xp: 0 });

  assert.equal(await awardXpOnce({
    userId: 'dev-user',
    eventId: 'post:one',
    amount: 10,
    source: 'post',
  }), true);
  assert.equal(await awardXpOnce({
    userId: 'dev-user',
    eventId: 'post:one',
    amount: 10,
    source: 'post',
  }), false);

  assert.equal((await db.doc('users/dev-user').get()).data().xp, 10);
});

test('post and transfer handlers use stable idempotency keys', async () => {
  await db.doc('users/dev-user').update({ xp: 0 });
  const postEvent = {
    data: { data: () => ({ authorId: 'dev-user', imageURL: 'local://image' }) },
    params: { postId: 'post-one' },
  };
  await onPostCreatedAwardXpHandler(postEvent);
  await onPostCreatedAwardXpHandler(postEvent);
  await onTransferCreatedAwardXpHandler({
    data: { data: () => ({ buyerId: 'dev-user' }) },
    params: {
      leagueId: 'league-one',
      seasonId: 'season-one',
      transferId: 'transfer-one',
    },
  });
  await onTransferCreatedAwardXpHandler({
    data: { data: () => ({ buyerId: 'market' }) },
    params: {
      leagueId: 'league-one',
      seasonId: 'season-one',
      transferId: 'ignored',
    },
  });

  assert.equal((await db.doc('users/dev-user').get()).data().xp, 20);
});

test('historical calculation preserves the existing scoring model', async () => {
  const guardEvents = db.batch();
  guardEvents.set(db.doc('users/dev-user/xpEvents/post:xp-image'), {
    amount: 15,
    source: 'post',
  });
  guardEvents.set(db.doc(
    'users/dev-user/xpEvents/transfer:dev-league-active:season-1:transfer-one',
  ), {
    amount: 5,
    source: 'transfer',
  });
  await guardEvents.commit();
  await db.doc('posts/xp-image').set({
    authorId: 'dev-user',
    imageURL: 'local://image',
  });
  await db.doc(
    'leagues/dev-league-active/seasons/season-1/transfers/transfer-one',
  ).set({ buyerId: 'dev-user' });
  await db.doc(
    'leagues/dev-league-active/seasons/season-1/rounds/round-one',
  ).set({ scores: { 'dev-user': 25, 'placeholder-rival': 99 } });

  const totals = await calculateXpByUser();
  assert.equal(totals['dev-league-admin'], 10);
  assert.equal(totals['dev-user'], 122);
  assert.equal(totals['dev-superadmin'], 0);

  assert.deepEqual(await recalculateAllXp(), { usersUpdated: 3 });
  assert.equal((await db.doc('users/dev-user').get()).data().xp, 122);
});

test('only a superadmin can request a global recalculation', async () => {
  await assert.rejects(
    recalculateXpHandler({ auth: { uid: 'dev-user' } }),
    (error) => error.code === 'permission-denied',
  );
  assert.deepEqual(
    await recalculateXpHandler({ auth: { uid: 'dev-superadmin' } }),
    { usersUpdated: 3 },
  );
});

test('award validation rejects unsafe event payloads', async () => {
  await assert.rejects(
    awardXpOnce({
      userId: 'dev-user',
      eventId: 'unsafe/event',
      amount: 10,
      source: 'post',
    }),
    (error) => error.code === 'invalid-argument',
  );
  await assert.rejects(
    awardXpOnce({
      userId: 'dev-user',
      eventId: 'post:zero',
      amount: 0,
      source: 'post',
    }),
    (error) => error.code === 'invalid-argument',
  );
});
