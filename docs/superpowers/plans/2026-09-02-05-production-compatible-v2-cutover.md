# Production-Compatible V2 Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR #3 fully functional through additive V2 callables, atomic server-owned content/XP mutations, and production-disabled Football Data controls without changing existing production Functions.

**Architecture:** Existing callable names remain untouched in production and the new client moves to `V2` aliases. New post and transfer creation callables own both the canonical document and XP write in one idempotent Firestore transaction. Player sync remains available only against local emulators and the production UI becomes a read-only player catalogue.

**Tech Stack:** React 19, Vite 7, Firebase Web SDK 12, Cloud Functions for Firebase v2, Firebase Admin SDK 14, Firestore Emulator, Node.js 22 test runner.

## Global Constraints

- Node is exactly `22.x`; Node 24 installed globally is not removed.
- Preview and production must not call Football Data or any player-sync Function.
- Local sync may use only the deterministic emulator fixture.
- Existing production Functions are not overwritten by the pre-merge rollout.
- `onSeasonJoin` remains deployed and is not exported or deleted by this work.
- No production data or secret value is read, copied, seeded, or mutated while implementing this plan.
- Every behavior change starts with a failing test and ends with a focused commit.

## File map

- `functions/lib/operations.js`: pure canonicalization, operation-key and retry-contract helpers.
- `functions/lib/xp.js`: transaction-level XP write primitive plus historical recalculation.
- `functions/handlers/content.js`: `createPostV2Handler` and `createTransferV2Handler`.
- `functions/handlers/xp.js`: protected recalculation only; document triggers are retired from source.
- `functions/index.js`: additive V2 exports and no XP trigger exports.
- `src/services/admin-api.js`: V2 aliases and fail-closed sync calls.
- `src/services/content-api.js`: client wrappers for atomic content callables.
- `src/config/capability-policy.js`: pure capability policy usable by Node tests.
- `src/config/capabilities.js`: Vite runtime capability values.
- `src/components/CreatePost.jsx`: post creation through `createPostV2`.
- `src/components/RegisterTransferModal.jsx`: new transfers through `createTransferV2`; edits stay direct.
- `src/components/AdminTab.jsx`: unlink through the shared V2 service.
- `src/pages/UserProfilePage.jsx`: chat creation through the shared V2 service.
- `src/components/PlayersSyncTab.jsx`: local fixture controls or production read-only catalogue.
- `firestore.rules`: deny direct post/transfer creation after the V2 frontend is live.
- `functions/test/content.integration.test.js`: atomicity, authorization and idempotency coverage.
- `tests/rules/social-chat.test.js`, `tests/rules/leagues.test.js`: direct-create denial.
- `tests/unit/content-authority-contract.test.js`, `tests/unit/player-sync-runtime.test.js`, `tests/unit/firebase-services-contract.test.js`, `tests/unit/admin-authority-contract.test.js`, `tests/unit/xp-authority-contract.test.js`: static/runtime contracts.

---

### Task 1: Additive V2 aliases for existing callable contracts

**Files:**
- Modify: `functions/index.js`
- Modify: `src/services/admin-api.js`
- Modify: `src/components/AdminTab.jsx`
- Modify: `src/pages/UserProfilePage.jsx`
- Modify: `tests/unit/firebase-services-contract.test.js`
- Modify: `tests/unit/admin-authority-contract.test.js`

**Interfaces:**
- Consumes: existing `createProfileDocumentsHandler`, `unlinkUserFromTeamHandler`, `createOrGetChatHandler`, `setUserAppRoleHandler`, `recalculateXpHandler`.
- Produces: callable exports `createProfileDocumentsV2`, `unlinkUserFromTeamV2`, `createOrGetChatV2`, `setUserAppRole`, `recalculateXp`; client functions `createProfile`, `unlinkUserFromTeam`, `createOrGetChat`.

- [ ] **Step 1: Write failing source-contract tests**

Require the new exports and forbid direct callable construction in components:

```js
assert.match(functionsSource, /exports\.createProfileDocumentsV2\s*=\s*onCall/);
assert.match(functionsSource, /exports\.unlinkUserFromTeamV2\s*=\s*onCall/);
assert.match(functionsSource, /exports\.createOrGetChatV2\s*=\s*onCall/);
assert.match(adminApiSource, /call\('createProfileDocumentsV2'/);
assert.match(adminApiSource, /call\('unlinkUserFromTeamV2'/);
assert.match(adminApiSource, /call\('createOrGetChatV2'/);
assert.doesNotMatch(adminTabSource, /httpsCallable|\bfunctions\b/);
assert.doesNotMatch(profileSource, /httpsCallable|\bfunctions\b/);
```

- [ ] **Step 2: Run the focused tests and observe RED**

Run:

```powershell
node --test tests/unit/firebase-services-contract.test.js tests/unit/admin-authority-contract.test.js
```

Expected: failure because the three V2 exports and shared client wrappers do not exist.

- [ ] **Step 3: Export aliases without removing legacy source definitions**

Add these exports next to the existing callables in `functions/index.js`:

```js
exports.createProfileDocumentsV2 = onCall(
  { region: 'us-central1', cors: browserOrigins },
  createProfileDocumentsHandler,
);

exports.unlinkUserFromTeamV2 = onCall(
  { region: 'us-central1', cors: browserOrigins },
  unlinkUserFromTeamHandler,
);

exports.createOrGetChatV2 = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => createOrGetChatHandler({
    uid: requireAuth(request),
    data: request.data,
  }),
);
```

Keep the existing-named exports in source for emulator compatibility, but the later deploy allowlist must include only the V2 names.

- [ ] **Step 4: Route every new-client consumer through `admin-api.js`**

Use a consistent result-unwrapping helper:

```js
const invoke = (name, data, options) =>
  httpsCallable(functions, name, options)(data)
    .then(({ data: result }) => result);

export const createProfile = (username) =>
  invoke('createProfileDocumentsV2', { username });
export const unlinkUserFromTeam = (input) =>
  invoke('unlinkUserFromTeamV2', input);
export const createOrGetChat = (otherUserUid) =>
  invoke('createOrGetChatV2', { otherUserUid });
```

Replace `httpsCallable` usage in `AdminTab.jsx` and `UserProfilePage.jsx` with these wrappers. Preserve the existing loading, confirmation, toast and navigation behavior.

- [ ] **Step 5: Run tests and syntax checks**

Run:

```powershell
node --test tests/unit/firebase-services-contract.test.js tests/unit/admin-authority-contract.test.js
npm --prefix functions run check
```

Expected: all selected tests pass and Functions syntax exits `0`.

- [ ] **Step 6: Commit the alias cutover**

```powershell
git add functions/index.js src/services/admin-api.js src/components/AdminTab.jsx src/pages/UserProfilePage.jsx tests/unit/firebase-services-contract.test.js tests/unit/admin-authority-contract.test.js
git commit -m "feat: add production-safe callable v2 aliases"
```

---

### Task 2: Build the idempotency and transactional XP primitives

**Files:**
- Create: `functions/lib/operations.js`
- Modify: `functions/lib/xp.js`
- Create: `functions/test/operations.test.js`
- Modify: `functions/package.json`

**Interfaces:**
- Produces: `describeOperation({ uid, operationType, operationId, payload })`, `matchStoredOperation(data, descriptor)`, `xpAwardRefs(firestore, award)`, `applyXpAward(transaction, snapshots, award)`.

- [ ] **Step 1: Write failing pure tests**

Cover canonical keying and mismatches:

```js
const first = describeOperation({
  uid: 'dev-user',
  operationType: 'post.create.v2',
  operationId: 'op-one',
  payload: { tags: ['b', 'a'], content: 'hola' },
});
const reordered = describeOperation({
  uid: 'dev-user',
  operationType: 'post.create.v2',
  operationId: 'op-one',
  payload: { content: 'hola', tags: ['b', 'a'] },
});
assert.equal(first.key, reordered.key);
assert.equal(first.payloadHash, reordered.payloadHash);
assert.notEqual(
  first.key,
  describeOperation({
    uid: 'other-user',
    operationType: 'post.create.v2',
    operationId: 'op-one',
    payload: { content: 'hola', tags: ['b', 'a'] },
  }).key,
);
assert.throws(
  () => matchStoredOperation({ ...stored, payloadHash: 'different' }, first),
  (error) => error.code === 'already-exists',
);
```

Also reject empty IDs, slashes, IDs longer than 128, unknown operation types and non-JSON-safe values.

- [ ] **Step 2: Run the pure test and observe RED**

```powershell
node --test functions/test/operations.test.js
```

Expected: `MODULE_NOT_FOUND` for `functions/lib/operations.js`.

- [ ] **Step 3: Implement canonical operation descriptors**

Implement recursive key sorting with array order preserved and SHA-256 hashes:

```js
const OPERATION_TYPES = new Set(['post.create.v2', 'transfer.create.v2']);

function describeOperation({ uid, operationType, operationId, payload }) {
  const safeUid = requireDocumentId(uid, 'uid');
  const safeId = requireDocumentId(operationId, 'operationId');
  if (!OPERATION_TYPES.has(operationType)) {
    throw new HttpsError('invalid-argument', 'operationType no es válido.');
  }
  const canonicalPayload = canonicalJson(payload);
  return {
    key: sha256(`${safeUid}\0${operationType}\0${safeId}`),
    operationId: safeId,
    operationType,
    payloadHash: sha256(canonicalPayload),
    uid: safeUid,
  };
}
```

`matchStoredOperation` must compare all four persisted identity fields and throw `HttpsError('already-exists', ...)` on any mismatch.

- [ ] **Step 4: Expose a transaction-level XP primitive**

Refactor `functions/lib/xp.js` so `awardXpOnce` delegates to:

```js
function xpAwardRefs(firestore, award) {
  const safe = validateAward(award);
  const userRef = firestore.doc(`users/${safe.userId}`);
  return {
    award: safe,
    eventRef: userRef.collection('xpEvents').doc(safe.eventId),
    userRef,
  };
}

function applyXpAward(transaction, { user, event }, refs) {
  if (!user.exists) throw new HttpsError('failed-precondition', 'El usuario no existe.');
  if (event.exists) return false;
  transaction.create(refs.eventRef, {
    amount: refs.award.amount,
    source: refs.award.source,
    createdAt: FieldValue.serverTimestamp(),
  });
  transaction.update(refs.userRef, {
    xp: FieldValue.increment(refs.award.amount),
  });
  return true;
}
```

Keep the public behavior of `awardXpOnce` and historical recalculation unchanged.

- [ ] **Step 5: Run pure and existing XP tests**

```powershell
node --test functions/test/operations.test.js
node --test functions/test/emulator-guard.test.js
```

The emulator integration suite is run after Task 3. Expected: both pure Node test files pass without starting or editing production.

- [ ] **Step 6: Register and commit**

Add `test/operations.test.js` to `functions/package.json` `test:all` and `test:admin`, then:

```powershell
git add functions/lib/operations.js functions/lib/xp.js functions/test/operations.test.js functions/package.json
git commit -m "test: define idempotent server operation contracts"
```

---

### Task 3: Implement atomic post and transfer callables

**Files:**
- Create: `functions/handlers/content.js`
- Create: `functions/test/content.integration.test.js`
- Modify: `functions/index.js`
- Modify: `functions/handlers/xp.js`
- Modify: `functions/test/xp.integration.test.js`
- Modify: `tests/unit/xp-authority-contract.test.js`
- Modify: `functions/package.json`

**Interfaces:**
- Consumes: `describeOperation`, `matchStoredOperation`, `xpAwardRefs`, `applyXpAward`, `requireSeasonAdmin`, `XP_VALUES`.
- Produces: `createPostV2Handler(request, firestore = db) -> { postId, created }`; `createTransferV2Handler(request, firestore = db) -> { transferId, created }`.

- [ ] **Step 1: Write failing integration tests**

Add emulator cases for:

```js
const first = await createPostV2Handler({
  uid: 'dev-user',
  data: { operationId: 'post-op', content: 'Hola', hasImage: false, tags: ['local'] },
});
const retry = await createPostV2Handler({
  uid: 'dev-user',
  data: { operationId: 'post-op', content: 'Hola', hasImage: false, tags: ['local'] },
});
assert.equal(first.created, true);
assert.equal(retry.created, false);
assert.equal(first.postId, retry.postId);
assert.equal((await db.doc('users/dev-user').get()).data().xp, 110);
```

Also cover same ID/different payload rejection, same ID for another user isolation, invalid post data, admin/owner transfer success, normal-member denial, missing participant, buyer=seller, market buyer, placeholder buyer, derived names, concurrent identical calls and forced transaction failure leaving no operation/content/XP event.

- [ ] **Step 2: Run the content test and observe RED**

```powershell
node scripts/run-with-firebase-emulators.mjs "node --test --test-concurrency=1 functions/test/content.integration.test.js"
```

Expected: missing handler/export failures.

- [ ] **Step 3: Implement `createPostV2Handler`**

Normalize content to at most 280 characters, at most five unique lowercase tags matching `^[a-z0-9]{1,32}$`, and require `hasImage` to be a boolean. Require content or image. For a new operation with `hasImage: true`, derive the exact Storage path `posts/{uid}/{operationId}`, require a non-empty object no larger than 5 MiB with an allowed image MIME type, and resolve its canonical URL with the Admin SDK. A matching completed-ledger retry must not depend on the mutable Storage object still existing. Inside one Firestore transaction read the operation, deterministic post, user and XP-event documents before any write; validate retries with `matchStoredOperation`; derive `authorUsername` and `authorPhotoURL` from the user document; create the post, operation record and XP event; increment the caller by `POST` or `POST_WITH_IMAGE`.

Use result shape:

```js
{
  postId: operation.key,
  created: true,
}
```

On an identical retry return the stored `postId` with `created: false`.

- [ ] **Step 4: Implement `createTransferV2Handler`**

Normalize `leagueId`, `seasonId`, `playerId`, `playerName`, `buyerId`, `sellerId`, `type`, `price`, and ISO timestamp before hashing. Allow only `puja`, `clausulazo`, or `acuerdo`; require finite non-negative price, distinct buyer/seller and at least one non-market participant.

Inside one transaction read operation, deterministic transfer, league and season. Build context from those snapshots and call `requireSeasonAdmin(uid, context)`. Resolve both participant names from `season.members` or `Mercado`; reject missing participants. If the buyer is a real non-placeholder member, also read its user/XP-event documents and award `XP_VALUES.TRANSFER`; market and placeholders receive none. Create transfer, operation and optional XP event atomically.

- [ ] **Step 5: Remove automatic XP triggers from the deployable source**

Delete `onDocumentCreated`, `onPostCreatedAwardXp`, and `onTransferCreatedAwardXp` exports from `functions/index.js`. Keep only `recalculateXpHandler` in `functions/handlers/xp.js`. Update unit/integration tests to assert:

```js
assert.doesNotMatch(source, /exports\.onPostCreatedAwardXp/);
assert.doesNotMatch(source, /exports\.onTransferCreatedAwardXp/);
assert.match(source, /exports\.createPostV2/);
assert.match(source, /exports\.createTransferV2/);
```

- [ ] **Step 6: Export the callables**

```js
exports.createPostV2 = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => createPostV2Handler({ uid: requireAuth(request), data: request.data }),
);
exports.createTransferV2 = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => createTransferV2Handler({ uid: requireAuth(request), data: request.data }),
);
```

- [ ] **Step 7: Run the full Functions suite**

```powershell
npm run test:ci
npm --prefix functions run check
```

Expected: all seed, XP, content, membership, chat and authorization tests pass.

- [ ] **Step 8: Commit the server-owned content path**

```powershell
git add functions/lib/xp.js functions/handlers/content.js functions/handlers/xp.js functions/index.js functions/test/content.integration.test.js functions/test/xp.integration.test.js tests/unit/xp-authority-contract.test.js functions/package.json
git commit -m "feat: create content and xp atomically in functions"
```

---

### Task 4: Move the React client to content V2

**Files:**
- Create: `src/services/content-api.js`
- Modify: `src/components/CreatePost.jsx`
- Modify: `src/components/RegisterTransferModal.jsx`
- Create: `tests/unit/content-authority-contract.test.js`

**Interfaces:**
- Consumes: callable `createPostV2`, callable `createTransferV2`.
- Produces: `createPost(input)` and `createTransfer(input)` with one stable UUID per submission.

- [ ] **Step 1: Write the failing client contract test**

Assert both components import `content-api`, direct post/transfer `addDoc` is absent from creation paths, and `grantXp` remains absent:

```js
assert.match(postSource, /services\/content-api/);
assert.match(transferSource, /services\/content-api/);
assert.doesNotMatch(postSource, /addDoc\(collection\(db, ['"]posts/);
assert.doesNotMatch(transferSource, /await addDoc\(basePath/);
assert.doesNotMatch(postSource + transferSource, /grantXp/);
assert.match(apiSource, /createPostV2/);
assert.match(apiSource, /createTransferV2/);
```

- [ ] **Step 2: Run the unit test and observe RED**

```powershell
node --test tests/unit/content-authority-contract.test.js
```

Expected: missing `content-api.js` and direct writes still present.

- [ ] **Step 3: Implement the shared client API**

```js
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const call = (name, input) =>
  httpsCallable(functions, name)(input).then(({ data }) => data);

export const createPost = (input) => call('createPostV2', input);
export const createTransfer = (input) => call('createTransferV2', input);
```

- [ ] **Step 4: Replace direct creation in both components**

Use `uuidv4()` before the first callable attempt. Keep the same operation ID in a `useRef` while a submission is unresolved, clear it on confirmed success, and clear it when the modal/form is intentionally reset. If an image is present, upload it first to the deterministic path `posts/{uid}/{operationId}`. Send only user-entered canonical fields plus the boolean image declaration; do not send an image URL, author name, participant names, XP or role.

For post:

```js
await createPost({
  operationId: operationIdRef.current,
  content: content.trim(),
  hasImage: Boolean(image),
  tags,
});
```

For a new transfer:

```js
await createTransfer({
  operationId: operationIdRef.current,
  leagueId: league.id,
  seasonId: season.id,
  playerId: player.id,
  playerName: player.name,
  price: Number.parseFloat(String(price).replace(',', '.')) || 0,
  buyerId,
  sellerId,
  type: transferType,
  timestamp: combinedDateTime.toISOString(),
});
```

Keep editing an existing transfer with `updateDoc`, because edits neither create nor award XP.

- [ ] **Step 5: Run unit tests and build**

```powershell
node --test tests/unit/content-authority-contract.test.js tests/unit/xp-authority-contract.test.js
npm run build
```

Expected: tests pass and Vite builds successfully.

- [ ] **Step 6: Commit the client cutover**

```powershell
git add src/services/content-api.js src/components/CreatePost.jsx src/components/RegisterTransferModal.jsx tests/unit/content-authority-contract.test.js
git commit -m "feat: route content creation through v2 callables"
```

---

### Task 5: Deny direct content creation in the new ruleset

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/rules/social-chat.test.js`
- Modify: `tests/rules/leagues.test.js`

**Interfaces:**
- Consumes: server-owned `createPostV2` and `createTransferV2` Admin SDK writes.
- Produces: client direct creates denied; existing read/update/delete policies retained.

- [ ] **Step 1: Change rules tests to require denial**

Replace the successful member post create and delegated-admin transfer create expectations with:

```js
await assertFails(setDoc(doc(memberDb, 'posts', 'member-post'), validPost));
await assertFails(setDoc(doc(adminDb, 'leagues', IDS.league, 'seasons', IDS.season, 'transfers', 'direct'), transfer));
```

Retain positive tests for author edits, likes, moderation, transfer update/delete and all reads.

- [ ] **Step 2: Run the two rule files and observe RED**

```powershell
node scripts/run-with-firebase-emulators.mjs "node --test --test-concurrency=1 tests/rules/social-chat.test.js tests/rules/leagues.test.js"
```

Expected: direct post/admin-transfer create assertions fail because current rules still allow them.

- [ ] **Step 3: Make direct creates server-only**

In `match /posts/{postId}`, set `allow create: if false;` while retaining author edits, self-like toggles and author/superadmin deletion. In season `match /transfers/{transferId}`, set `allow create: if false;`, retain `read` for members and `update/delete` for season admins.

- [ ] **Step 4: Run rule and Functions integration suites**

```powershell
node scripts/run-with-firebase-emulators.mjs "node --test --test-concurrency=1 tests/rules/social-chat.test.js tests/rules/leagues.test.js"
npm run test:ci
```

Expected: all rules and Functions tests pass; Admin SDK content callables remain unaffected.

- [ ] **Step 5: Commit the rule contract**

```powershell
git add firestore.rules tests/rules/social-chat.test.js tests/rules/leagues.test.js
git commit -m "security: make content creation server owned"
```

---

### Task 6: Make player sync emulator-only and production read-only

**Files:**
- Create: `src/config/capability-policy.js`
- Create: `src/config/capabilities.js`
- Modify: `src/services/admin-api.js`
- Modify: `src/components/PlayersSyncTab.jsx`
- Modify: `tests/unit/player-sync-runtime.test.js`
- Modify: `tests/unit/firebase-services-contract.test.js`

**Interfaces:**
- Produces: `resolveCapabilities({ isDev, isUsingEmulators })`, `assertPlayerSyncEnabled(enabled)`, runtime `playerSyncEnabled`.

- [ ] **Step 1: Write failing policy and source tests**

```js
assert.deepEqual(resolveCapabilities({ isDev: true, isUsingEmulators: true }), { playerSync: true });
assert.equal(resolveCapabilities({ isDev: false, isUsingEmulators: false }).playerSync, false);
assert.throws(() => assertPlayerSyncEnabled(false), /sólo está disponible en local/);
assert.match(component, /playerSyncEnabled/);
assert.match(component, /actualización automática está temporalmente desactivada/i);
assert.match(api, /assertPlayerSyncEnabled\(playerSyncEnabled\)/);
```

- [ ] **Step 2: Run and observe RED**

```powershell
node --test tests/unit/player-sync-runtime.test.js tests/unit/firebase-services-contract.test.js
```

Expected: missing capability modules and old production sync copy.

- [ ] **Step 3: Implement the fail-closed capability policy**

```js
export const resolveCapabilities = ({ isDev, isUsingEmulators }) =>
  Object.freeze({ playerSync: isDev === true && isUsingEmulators === true });

export function assertPlayerSyncEnabled(enabled) {
  if (enabled !== true) {
    const error = new Error('La sincronización sólo está disponible en local.');
    error.code = 'failed-precondition';
    throw error;
  }
}
```

`capabilities.js` calls the resolver with `import.meta.env.DEV` and the shared `isUsingEmulators` export.

- [ ] **Step 4: Guard service calls before constructing a callable**

At the first line of both `syncLaLigaPlayers` and `getLaLigaSyncStatus`, call `assertPlayerSyncEnabled(playerSyncEnabled)`. Keep the V2 callable names only for local emulator use.

- [ ] **Step 5: Render the correct UI for each capability state**

When enabled, keep current fixture status/run behavior. When disabled, skip `fetchSyncStatus`, call `fetchSyncedPlayers(null)` directly, set status `disabled`, render a disabled button labelled `Sincronización no disponible` and show:

```text
La actualización automática está temporalmente desactivada. Puedes seguir consultando los jugadores ya guardados.
```

The empty table copy becomes `No hay jugadores guardados actualmente.` outside the emulator. Do not mention API limits or suggest configuring a key in preview/production.

- [ ] **Step 6: Run focused tests and build**

```powershell
node --test tests/unit/player-sync-runtime.test.js tests/unit/firebase-services-contract.test.js
npm run build
```

Expected: policy and static contracts pass; build succeeds.

- [ ] **Step 7: Commit the capability gate**

```powershell
git add src/config/capability-policy.js src/config/capabilities.js src/services/admin-api.js src/components/PlayersSyncTab.jsx tests/unit/player-sync-runtime.test.js tests/unit/firebase-services-contract.test.js
git commit -m "feat: keep production player catalogue read only"
```

---

### Task 7: Verify the complete application cutover

**Files:**
- Modify only if a verification failure identifies a regression in files owned by Tasks 1-6.

**Interfaces:**
- Produces: a clean, locally verified application commit ready for release-tooling work.

- [ ] **Step 1: Run the full gate twice if emulator infrastructure changed**

```powershell
npm run verify
npm run verify
```

Expected each time: 61 or more unit tests, all rules tests, all Functions tests including content/operations, build, Functions syntax and lint budget pass with exit `0`.

- [ ] **Step 2: Inspect the exact diff and forbidden patterns**

```powershell
git diff --check origin/main...HEAD
rg -n "grantXp|onPostCreatedAwardXp|onTransferCreatedAwardXp|call\('createProfileDocuments'|call\('unlinkUserFromTeam'|call\('createOrGetChat'" src functions tests
```

Expected: no whitespace errors; no XP trigger exports/client XP mutation; no new-client use of the three legacy callable names.

- [ ] **Step 3: Confirm the application plan ends cleanly**

```powershell
git status --short --branch
```

Expected: no modified or untracked files. If verification found a defect, return to the task that owns the failing file, add the regression test there, use that task's explicit `git add` list, and create `fix: resolve v2 cutover verification regression` as a separate commit before repeating this step.
