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
    /createPostAttempt\(\{[\s\S]*?operationId: operationIdRef\.current[\s\S]*?\}\)/,
  );
  assert.match(postSource, /ref\(storage, pendingAttemptRef\.current\.uploadPath\)/);
  assert.match(postSource, /pendingAttemptRef\.current\.payload = payload/);
  assert.match(postSource, /pendingAttemptRef\.current\.callableStarted = true/);
  assert.doesNotMatch(postSource, /Date\.now\(\).*image\.name/);
});

test('post replacement deletes only safely abandoned uploads before allocating a new attempt', () => {
  assert.match(postSource, /deleteObject/);
  assert.match(postSource, /isSamePostAttempt/);
  assert.match(postSource, /shouldDiscardPostUpload/);
  assert.match(postSource, /storage\/object-not-found/);

  const guardIndex = postSource.indexOf('submissionInFlightRef.current = true');
  const cleanupIndex = postSource.indexOf('await deleteObject');
  const uploadIndex = postSource.indexOf('await uploadBytes');
  const callableFlagIndex = postSource.indexOf(
    'pendingAttemptRef.current.callableStarted = true',
  );
  const callableIndex = postSource.indexOf('await createPost');
  assert.ok(guardIndex >= 0 && guardIndex < cleanupIndex);
  assert.ok(cleanupIndex < uploadIndex);
  assert.ok(callableFlagIndex >= 0 && callableFlagIndex < callableIndex);
});

test('transfer retries are scoped by stable modal identity and one parsed price', () => {
  assert.match(transferSource, /getTransferSessionIdentity/);
  assert.match(transferSource, /sessionIdentityRef\.current === nextIdentity/);
  assert.match(transferSource, /const parsedPrice = parseSpanishPrice\(price\)/);
  assert.equal(transferSource.match(/price: parsedPrice/g)?.length, 2);
  assert.match(transferSource, /if \(parsedPrice === null\) \{[\s\S]*?toast\.error[\s\S]*?return;/);
  assert.doesNotMatch(transferSource, /parseFloat|Number\.parseFloat|\|\| 0/);
});

test('post preview installs blob-only cleanup', () => {
  assert.match(postSource, /revokeBlobUrl/);
  assert.match(postSource, /useEffect\(\(\) => \(\) => revokeBlobUrl\(imagePreview\), \[imagePreview\]\)/);
});

test('all mutable content controls are disabled for the full async submission', () => {
  assert.match(
    postSource,
    /<fieldset disabled=\{loading\}[^>]*disabled:pointer-events-none[\s\S]*?<\/fieldset>/,
  );
  assert.match(
    transferSource,
    /<fieldset disabled=\{loading\}[^>]*disabled:pointer-events-none[\s\S]*?<PlayerAutocomplete[\s\S]*?<\/fieldset>/,
  );
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
