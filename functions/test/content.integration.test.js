const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../lib/firebase');
const { describeOperation } = require('../lib/operations');
const { seedEmulators } = require('../scripts/seed-emulators');
const {
  resetTestEmulators,
} = require('./support/emulator-test-env');
const {
  createPostV2Handler,
  createTransferV2Handler,
} = require('../handlers/content');

test.beforeEach(async () => {
  await resetTestEmulators();
  await seedEmulators();
});

function postRequest(overrides = {}, uid = 'dev-user') {
  return {
    uid,
    data: {
      operationId: 'post-op',
      content: 'Hola',
      imageURL: null,
      tags: ['local'],
      ...overrides,
    },
  };
}

function transferRequest(overrides = {}, uid = 'dev-league-admin') {
  return {
    uid,
    data: {
      operationId: 'transfer-op',
      leagueId: 'dev-league-active',
      seasonId: 'season-1',
      playerId: 'dev-player',
      playerName: 'Jugador Local',
      buyerId: 'dev-user',
      sellerId: 'market',
      type: 'puja',
      price: 12.5,
      timestamp: '2026-09-02T10:15:00.000Z',
      ...overrides,
    },
  };
}

function operationFor(request, operationType, payload) {
  return describeOperation({
    uid: request.uid,
    operationType,
    operationId: request.data.operationId,
    payload,
  });
}

function failingFirestore(failOnCreatePath) {
  return {
    doc: db.doc.bind(db),
    runTransaction(updateFunction) {
      return db.runTransaction((transaction) => updateFunction({
        create(ref, data) {
          if (ref.path === failOnCreatePath) {
            throw new Error('forced transaction failure');
          }
          return transaction.create(ref, data);
        },
        get: transaction.get.bind(transaction),
        set: transaction.set.bind(transaction),
        update: transaction.update.bind(transaction),
      }));
    },
  };
}

test('post creation is idempotent and derives its author identity', async () => {
  const first = await createPostV2Handler(postRequest());
  const retry = await createPostV2Handler(postRequest());

  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(first.postId, retry.postId);
  assert.equal((await db.doc('users/dev-user').get()).data().xp, 110);

  const post = await db.doc(`posts/${first.postId}`).get();
  assert.equal(post.data().authorId, 'dev-user');
  assert.equal(post.data().authorUsername, 'user');
  assert.equal(post.data().authorPhotoURL, null);
  assert.equal(post.data().content, 'Hola');
  assert.deepEqual(post.data().tags, ['local']);
  assert.deepEqual(post.data().likes, []);
  assert.ok(post.data().createdAt);

  const event = await db.doc(
    `users/dev-user/xpEvents/post:${first.postId}`,
  ).get();
  assert.equal(event.data().amount, 10);
  assert.equal(event.data().source, 'post');
});

test('post payload normalization is stable and image posts award 15 XP', async () => {
  const request = postRequest({
    content: '  Imagen  ',
    imageURL: ' https://example.com/image.png ',
    tags: ['LOCAL', 'foto'],
  });
  const created = await createPostV2Handler(request);
  const retried = await createPostV2Handler(postRequest({
    content: 'Imagen',
    imageURL: 'https://example.com/image.png',
    tags: ['local', 'foto'],
  }));

  assert.equal(retried.created, false);
  assert.equal(retried.postId, created.postId);
  assert.equal((await db.doc('users/dev-user').get()).data().xp, 115);
  const post = (await db.doc(`posts/${created.postId}`).get()).data();
  assert.equal(post.content, 'Imagen');
  assert.equal(post.imageURL, 'https://example.com/image.png');
  assert.deepEqual(post.tags, ['local', 'foto']);
});

test('post operation IDs reject changed payloads and isolate users', async () => {
  const first = await createPostV2Handler(postRequest());

  await assert.rejects(
    createPostV2Handler(postRequest({ content: 'Distinto' })),
    (error) => error.code === 'already-exists',
  );

  const other = await createPostV2Handler(
    postRequest({}, 'dev-league-admin'),
  );
  assert.notEqual(other.postId, first.postId);
  assert.equal((await db.doc('users/dev-league-admin').get()).data().xp, 20);
});

test('post validation rejects missing content, unsafe URLs and invalid tags', async () => {
  for (const data of [
    { content: '', imageURL: null },
    { content: 'x'.repeat(281) },
    { imageURL: 'javascript:alert(1)' },
    { tags: ['uno', 'uno'] },
    { tags: ['tag-incorrecto'] },
    { tags: ['1', '2', '3', '4', '5', '6'] },
  ]) {
    await assert.rejects(
      createPostV2Handler(postRequest(data)),
      (error) => error.code === 'invalid-argument',
    );
  }
});

test('concurrent identical post calls converge on one document and XP event', async () => {
  const results = await Promise.all([
    createPostV2Handler(postRequest({ operationId: 'post-concurrent' })),
    createPostV2Handler(postRequest({ operationId: 'post-concurrent' })),
  ]);

  assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
  assert.equal(results[0].postId, results[1].postId);
  assert.equal((await db.doc('users/dev-user').get()).data().xp, 110);
  const posts = await db.collection('posts').where(
    'authorId',
    '==',
    'dev-user',
  ).get();
  assert.equal(posts.size, 1);
});

test('a forced post transaction failure leaves no content, operation or XP', async () => {
  const request = postRequest({ operationId: 'post-failure' });
  const payload = {
    content: 'Hola',
    imageURL: null,
    tags: ['local'],
  };
  const operation = operationFor(request, 'post.create.v2', payload);

  await assert.rejects(
    createPostV2Handler(
      request,
      failingFirestore(`serverOperations/${operation.key}`),
    ),
    /forced transaction failure/,
  );

  const [post, storedOperation, event, user] = await Promise.all([
    db.doc(`posts/${operation.key}`).get(),
    db.doc(`serverOperations/${operation.key}`).get(),
    db.doc(`users/dev-user/xpEvents/post:${operation.key}`).get(),
    db.doc('users/dev-user').get(),
  ]);
  assert.equal(post.exists, false);
  assert.equal(storedOperation.exists, false);
  assert.equal(event.exists, false);
  assert.equal(user.data().xp, 100);
});

test('league owner creates a transfer with server-derived names and buyer XP', async () => {
  const result = await createTransferV2Handler(transferRequest());
  const retry = await createTransferV2Handler(transferRequest());

  assert.equal(result.created, true);
  assert.equal(retry.created, false);
  assert.equal(retry.transferId, result.transferId);
  const transfer = (await db.doc(
    `leagues/dev-league-active/seasons/season-1/transfers/${result.transferId}`,
  ).get()).data();
  assert.equal(transfer.buyerName, 'Usuarios FC');
  assert.equal(transfer.sellerName, 'Mercado');
  assert.equal(transfer.timestamp.toDate().toISOString(), '2026-09-02T10:15:00.000Z');
  assert.equal((await db.doc('users/dev-user').get()).data().xp, 105);
});

test('a season admin who is not the owner can create a transfer', async () => {
  await db.doc('leagues/dev-league-active/seasons/season-1').update({
    'members.dev-user.role': 'admin',
  });

  const result = await createTransferV2Handler(transferRequest(
    { operationId: 'admin-transfer', buyerId: 'dev-league-admin' },
    'dev-user',
  ));
  assert.equal(result.created, true);
  assert.equal((await db.doc('users/dev-league-admin').get()).data().xp, 15);
});

test('a normal member cannot create a transfer', async () => {
  await assert.rejects(
    createTransferV2Handler(transferRequest({}, 'dev-user')),
    (error) => error.code === 'permission-denied',
  );
});

test('transfer validation rejects missing participants, self-trades and bad data', async () => {
  for (const data of [
    { buyerId: 'missing-user' },
    { sellerId: 'missing-user' },
    { buyerId: 'dev-user', sellerId: 'dev-user' },
    { buyerId: 'market', sellerId: 'market' },
    { type: 'regalo' },
    { price: -1 },
    { price: Number.POSITIVE_INFINITY },
    { timestamp: 'not-a-date' },
  ]) {
    await assert.rejects(
      createTransferV2Handler(transferRequest(data)),
      (error) => error.code === 'invalid-argument',
    );
  }
});

test('market and placeholder buyers are valid but never receive XP', async () => {
  const market = await createTransferV2Handler(transferRequest({
    operationId: 'market-buyer',
    buyerId: 'market',
    sellerId: 'dev-user',
    type: 'acuerdo',
  }));
  const placeholder = await createTransferV2Handler(transferRequest({
    operationId: 'placeholder-buyer',
    buyerId: 'placeholder-rival',
  }));

  const marketTransfer = (await db.doc(
    `leagues/dev-league-active/seasons/season-1/transfers/${market.transferId}`,
  ).get()).data();
  const placeholderTransfer = (await db.doc(
    `leagues/dev-league-active/seasons/season-1/transfers/${placeholder.transferId}`,
  ).get()).data();
  assert.equal(marketTransfer.buyerName, 'Mercado');
  assert.equal(marketTransfer.sellerName, 'Usuarios FC');
  assert.equal(placeholderTransfer.buyerName, 'Equipo Fantasma');
  assert.equal(placeholderTransfer.sellerName, 'Mercado');
  assert.equal((await db.doc('users/dev-user').get()).data().xp, 100);
  assert.equal((await db.doc('users/placeholder-rival').get()).exists, false);
});

test('concurrent identical transfer calls converge and changed payload is rejected', async () => {
  const request = transferRequest({ operationId: 'transfer-concurrent' });
  const results = await Promise.all([
    createTransferV2Handler(request),
    createTransferV2Handler(request),
  ]);

  assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
  assert.equal(results[0].transferId, results[1].transferId);
  assert.equal((await db.doc('users/dev-user').get()).data().xp, 105);
  await assert.rejects(
    createTransferV2Handler(transferRequest({
      operationId: 'transfer-concurrent',
      price: 99,
    })),
    (error) => error.code === 'already-exists',
  );
});

test('a forced transfer transaction failure leaves no transfer, operation or XP', async () => {
  const request = transferRequest({ operationId: 'transfer-failure' });
  const payload = {
    leagueId: 'dev-league-active',
    seasonId: 'season-1',
    playerId: 'dev-player',
    playerName: 'Jugador Local',
    buyerId: 'dev-user',
    sellerId: 'market',
    type: 'puja',
    price: 12.5,
    timestamp: '2026-09-02T10:15:00.000Z',
  };
  const operation = operationFor(request, 'transfer.create.v2', payload);
  const transferPath = 'leagues/dev-league-active/seasons/season-1/'
    + `transfers/${operation.key}`;

  await assert.rejects(
    createTransferV2Handler(
      request,
      failingFirestore(`serverOperations/${operation.key}`),
    ),
    /forced transaction failure/,
  );

  const [transfer, storedOperation, event, user] = await Promise.all([
    db.doc(transferPath).get(),
    db.doc(`serverOperations/${operation.key}`).get(),
    db.doc(`users/dev-user/xpEvents/transfer:${operation.key}`).get(),
    db.doc('users/dev-user').get(),
  ]);
  assert.equal(transfer.exists, false);
  assert.equal(storedOperation.exists, false);
  assert.equal(event.exists, false);
  assert.equal(user.data().xp, 100);
});
