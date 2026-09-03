const test = require('node:test');
const assert = require('node:assert/strict');
const {
  describeOperation,
  matchStoredOperation,
} = require('../lib/operations');
const {
  applyXpAward,
  xpAwardRefs,
} = require('../lib/xp');

function postOperation(overrides = {}) {
  return {
    uid: 'dev-user',
    operationType: 'post.create.v2',
    operationId: 'op-one',
    payload: { tags: ['b', 'a'], content: 'hola' },
    ...overrides,
  };
}

test('operation descriptors canonicalize object keys without reordering arrays', () => {
  const first = describeOperation(postOperation());
  const reordered = describeOperation(postOperation({
    payload: { content: 'hola', tags: ['b', 'a'] },
  }));
  const reorderedArray = describeOperation(postOperation({
    payload: { content: 'hola', tags: ['a', 'b'] },
  }));

  assert.equal(first.key, reordered.key);
  assert.equal(first.payloadHash, reordered.payloadHash);
  assert.notEqual(first.payloadHash, reorderedArray.payloadHash);
  assert.match(first.key, /^[a-f0-9]{64}$/);
  assert.match(first.payloadHash, /^[a-f0-9]{64}$/);
});

test('operation keys isolate users, types, and client operation IDs', () => {
  const first = describeOperation(postOperation());

  assert.notEqual(
    first.key,
    describeOperation(postOperation({ uid: 'other-user' })).key,
  );
  assert.notEqual(
    first.key,
    describeOperation(postOperation({
      operationType: 'transfer.create.v2',
    })).key,
  );
  assert.notEqual(
    first.key,
    describeOperation(postOperation({ operationId: 'op-two' })).key,
  );
});

test('operation identity rejects identifiers that would be silently normalized', () => {
  for (const overrides of [
    { uid: ' dev-user ' },
    { operationId: ' op-one ' },
    { uid: 42 },
    { operationId: 42 },
  ]) {
    assert.throws(
      () => describeOperation(postOperation(overrides)),
      (error) => error.code === 'invalid-argument',
    );
  }

  assert.doesNotThrow(() => describeOperation(postOperation()));
});

test('operation key framing distinguishes tuples containing NUL characters', () => {
  const post = describeOperation(postOperation({
    uid: 'dev-user',
    operationId: 'op-one\0transfer.create.v2\0tail',
  }));
  const transfer = describeOperation(postOperation({
    uid: 'dev-user\0post.create.v2\0op-one',
    operationType: 'transfer.create.v2',
    operationId: 'tail',
  }));

  assert.notEqual(post.key, transfer.key);
});

test('stored operation identity must match every descriptor field', () => {
  const descriptor = describeOperation(postOperation());
  const stored = {
    uid: descriptor.uid,
    operationType: descriptor.operationType,
    operationId: descriptor.operationId,
    payloadHash: descriptor.payloadHash,
  };

  assert.equal(matchStoredOperation(stored, descriptor), true);
  for (const [field, value] of [
    ['uid', 'other-user'],
    ['operationType', 'transfer.create.v2'],
    ['operationId', 'op-two'],
    ['payloadHash', 'different'],
  ]) {
    assert.throws(
      () => matchStoredOperation({ ...stored, [field]: value }, descriptor),
      (error) => error.code === 'already-exists',
    );
  }
});

test('operation descriptors reject unsafe identifiers and operation types', () => {
  for (const overrides of [
    { uid: '' },
    { uid: 'unsafe/user' },
    { uid: 'u'.repeat(129) },
    { operationId: '' },
    { operationId: 'unsafe/operation' },
    { operationId: 'o'.repeat(129) },
    { operationType: 'post.create.v1' },
  ]) {
    assert.throws(
      () => describeOperation(postOperation(overrides)),
      (error) => error.code === 'invalid-argument',
    );
  }
});

test('operation descriptors reject values that are not JSON-safe', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const arrayWithExtraProperty = ['local'];
  arrayWithExtraProperty['01'] = 'ignored-by-json';

  for (const payload of [
    undefined,
    { missing: undefined },
    { callback() {} },
    { token: Symbol('unsafe') },
    { amount: 1n },
    { amount: Number.NaN },
    { amount: Number.POSITIVE_INFINITY },
    new Date('2026-09-02T00:00:00.000Z'),
    arrayWithExtraProperty,
    cyclic,
  ]) {
    assert.throws(
      () => describeOperation(postOperation({ payload })),
      (error) => error.code === 'invalid-argument',
    );
  }
});

test('canonical payloads reject non-enumerable own properties', () => {
  const objectPayload = { content: 'hola' };
  Object.defineProperty(objectPayload, 'hidden', {
    value: 'ignored-by-json',
    enumerable: false,
  });
  const arrayPayload = ['local'];
  Object.defineProperty(arrayPayload, '0', {
    value: 'local',
    enumerable: false,
  });

  for (const payload of [objectPayload, arrayPayload]) {
    assert.throws(
      () => describeOperation(postOperation({ payload })),
      (error) => error.code === 'invalid-argument',
    );
  }
});

test('canonical payloads reject own accessors without invoking them', () => {
  let invocationCount = 0;
  const objectPayload = { content: 'hola' };
  Object.defineProperty(objectPayload, 'computed', {
    enumerable: true,
    get() {
      invocationCount += 1;
      return 'ignored-by-json';
    },
  });
  const arrayPayload = [];
  Object.defineProperty(arrayPayload, '0', {
    enumerable: true,
    get() {
      invocationCount += 1;
      return 'local';
    },
  });

  for (const payload of [objectPayload, arrayPayload]) {
    assert.throws(
      () => describeOperation(postOperation({ payload })),
      (error) => error.code === 'invalid-argument',
    );
  }
  assert.equal(invocationCount, 0);
});

test('canonical payload hashing preserves prototype-looking JSON keys', () => {
  const ordinary = describeOperation(postOperation({
    payload: { content: 'hola' },
  }));
  const withPrototypeKey = describeOperation(postOperation({
    payload: JSON.parse('{"__proto__":{"polluted":true},"content":"hola"}'),
  }));

  assert.notEqual(ordinary.payloadHash, withPrototypeKey.payloadHash);
  assert.equal({}.polluted, undefined);
});

test('xpAwardRefs validates the award and builds deterministic references', () => {
  const paths = [];
  const eventRef = { path: 'users/dev-user/xpEvents/post:one' };
  const userRef = {
    path: 'users/dev-user',
    collection(name) {
      assert.equal(name, 'xpEvents');
      return {
        doc(eventId) {
          assert.equal(eventId, 'post:one');
          return eventRef;
        },
      };
    },
  };
  const firestore = {
    doc(path) {
      paths.push(path);
      return userRef;
    },
  };

  const refs = xpAwardRefs(firestore, {
    userId: 'dev-user',
    eventId: 'post:one',
    amount: 10,
    source: 'post',
  });

  assert.deepEqual(paths, ['users/dev-user']);
  assert.equal(refs.userRef, userRef);
  assert.equal(refs.eventRef, eventRef);
  assert.deepEqual(refs.award, {
    amount: 10,
    eventId: 'post:one',
    source: 'post',
    userId: 'dev-user',
  });
});

test('applyXpAward creates the event and increments XP once', () => {
  const refs = {
    award: { amount: 10, source: 'post' },
    eventRef: { path: 'event' },
    userRef: { path: 'user' },
  };
  const calls = [];
  const transaction = {
    create(ref, data) {
      calls.push(['create', ref, data]);
    },
    update(ref, data) {
      calls.push(['update', ref, data]);
    },
  };

  assert.equal(applyXpAward(
    transaction,
    { user: { exists: true }, event: { exists: false } },
    refs,
  ), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'create');
  assert.equal(calls[0][1], refs.eventRef);
  assert.equal(calls[0][2].amount, 10);
  assert.equal(calls[0][2].source, 'post');
  assert.ok(calls[0][2].createdAt);
  assert.equal(calls[1][0], 'update');
  assert.equal(calls[1][1], refs.userRef);
  assert.ok(calls[1][2].xp);
});

test('applyXpAward skips an existing event and rejects a missing user', () => {
  const refs = {
    award: { amount: 10, source: 'post' },
    eventRef: { path: 'event' },
    userRef: { path: 'user' },
  };
  const transaction = {
    create() {
      assert.fail('must not create an existing event');
    },
    update() {
      assert.fail('must not update XP for an existing event');
    },
  };

  assert.equal(applyXpAward(
    transaction,
    { user: { exists: true }, event: { exists: true } },
    refs,
  ), false);
  assert.throws(
    () => applyXpAward(
      transaction,
      { user: { exists: false }, event: { exists: false } },
      refs,
    ),
    (error) => error.code === 'failed-precondition',
  );
});
