import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const helperPath = path.resolve('src/services/content-client-helpers.js');
const helpers = fs.existsSync(helperPath)
  ? await import(pathToFileURL(helperPath))
  : {};

test('transfer session identity ignores object reference churn', () => {
  assert.equal(typeof helpers.getTransferSessionIdentity, 'function');
  const first = helpers.getTransferSessionIdentity({
    isOpen: true,
    league: { id: 'league-1' },
    season: { id: 'season-1', members: {} },
    existingTransfer: null,
    user: { uid: 'user-1' },
  });
  const sameIds = helpers.getTransferSessionIdentity({
    isOpen: true,
    league: { id: 'league-1', name: 'new snapshot' },
    season: { id: 'season-1', members: { other: {} } },
    existingTransfer: null,
    user: { uid: 'user-1', displayName: 'changed snapshot' },
  });

  assert.equal(first, sameIds);
});

test('transfer session identity changes for a new modal context', () => {
  assert.equal(typeof helpers.getTransferSessionIdentity, 'function');
  const base = {
    isOpen: true,
    league: { id: 'league-1' },
    season: { id: 'season-1' },
    existingTransfer: null,
    user: { uid: 'user-1' },
  };
  const identity = helpers.getTransferSessionIdentity(base);

  assert.notEqual(
    identity,
    helpers.getTransferSessionIdentity({ ...base, season: { id: 'season-2' } }),
  );
  assert.notEqual(
    identity,
    helpers.getTransferSessionIdentity({
      ...base,
      existingTransfer: { id: 'transfer-1' },
    }),
  );
  assert.equal(
    helpers.getTransferSessionIdentity({ ...base, isOpen: false }),
    null,
  );
});

test('Spanish price parser accepts grouped integers and reasonable decimals', () => {
  assert.equal(typeof helpers.parseSpanishPrice, 'function');
  const cases = new Map([
    ['12.500.000', 12500000],
    ['12.500.000,50', 12500000.5],
    ['12500000', 12500000],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['0', 0],
  ]);

  for (const [input, expected] of cases) {
    assert.equal(helpers.parseSpanishPrice(input), expected, input);
  }
});

test('Spanish price parser rejects invalid or unsafe values', () => {
  assert.equal(typeof helpers.parseSpanishPrice, 'function');
  for (const input of ['', '   ', 'abc', 'NaN', 'Infinity', '-1', '1.2.3.4']) {
    assert.equal(helpers.parseSpanishPrice(input), null, input);
  }
  assert.equal(helpers.parseSpanishPrice(Number.NaN), null);
  assert.equal(helpers.parseSpanishPrice(Number.POSITIVE_INFINITY), null);
  assert.equal(helpers.parseSpanishPrice(-1), null);
});

test('post attempts derive one deterministic upload path from uid and operation id', () => {
  assert.equal(typeof helpers.createPostAttempt, 'function');
  const attempt = helpers.createPostAttempt({
    fingerprint: 'draft-a',
    operationId: 'operation-1',
    uid: 'user-1',
  });

  assert.deepEqual(attempt, {
    fingerprint: 'draft-a',
    operationId: 'operation-1',
    payload: null,
    uploadPath: 'posts/user-1/operation-1',
  });
});

test('blob preview cleanup revokes only blob URLs', () => {
  assert.equal(typeof helpers.revokeBlobUrl, 'function');
  const revoked = [];
  const revoke = (url) => revoked.push(url);

  assert.equal(helpers.revokeBlobUrl('blob:preview-1', revoke), true);
  assert.equal(helpers.revokeBlobUrl('https://example.com/image.png', revoke), false);
  assert.equal(helpers.revokeBlobUrl(null, revoke), false);
  assert.deepEqual(revoked, ['blob:preview-1']);
});
