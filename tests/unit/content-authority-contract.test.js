import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const postSource = fs.readFileSync('src/components/CreatePost.jsx', 'utf8');
const transferSource = fs.readFileSync(
  'src/components/RegisterTransferModal.jsx',
  'utf8',
);
const apiPath = 'src/services/content-api.js';
const apiSource = fs.existsSync(apiPath)
  ? fs.readFileSync(apiPath, 'utf8')
  : '';

test('new content creation is routed through the V2 callable service', () => {
  assert.match(postSource, /services\/content-api/);
  assert.match(transferSource, /services\/content-api/);
  assert.doesNotMatch(postSource, /addDoc\(collection\(db, ['"]posts/);
  assert.doesNotMatch(transferSource, /await addDoc\(basePath/);
  assert.doesNotMatch(postSource + transferSource, /grantXp/);
  assert.match(apiSource, /createPostV2/);
  assert.match(apiSource, /createTransferV2/);
});

test('each unresolved creation keeps a UUID in a ref', () => {
  for (const source of [postSource, transferSource]) {
    assert.match(source, /useRef/);
    assert.match(source, /uuidv4/);
    assert.match(source, /operationIdRef\.current/);
  }
});

test('post upload retries retain the same operation before a callable payload exists', () => {
  assert.match(
    postSource,
    /pendingAttemptRef\.current = \{ fingerprint, payload: null \}/,
  );
  assert.match(postSource, /pendingAttemptRef\.current\.payload = payload/);
});

test('callable creation payloads exclude server-owned identity and XP fields', () => {
  const postCall = postSource.match(/await createPost\(\{[\s\S]*?\}\);/)?.[0] ?? '';
  const transferCall = transferSource.match(
    /await createTransfer\(\{[\s\S]*?\}\);/,
  )?.[0] ?? '';

  assert.notEqual(postCall, '');
  assert.notEqual(transferCall, '');
  assert.doesNotMatch(postCall, /authorId|authorUsername|authorPhotoURL|likes|createdAt|xp/i);
  assert.doesNotMatch(transferCall, /buyerName|sellerName|xp|role/i);
});
