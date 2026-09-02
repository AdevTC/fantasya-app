# Identity, Admin, XP, and Player Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar las escaladas de rol y XP, unificar la creación de perfiles y sustituir la sincronización hardcodeada por callables V2 comprobadas como superadministrador y capaces de funcionar con fixture local.

**Architecture:** Las callable Functions delegan en handlers inyectables y pequeños; `functions/index.js` sólo configura triggers y exports. Firestore Rules niega escrituras sensibles del cliente y usa el documento `users/{uid}` como fuente de `appRole`. El cliente consume una única capa `src/services/admin-api.js` sobre la instancia de Functions centralizada en el plan 01.

**Tech Stack:** Firebase Functions v2, Firebase Admin 12.6.0, Firebase JS 11.10.0, Secret Manager mediante `defineSecret`, Node test runner, Firebase Emulator Suite y `@firebase/rules-unit-testing` 4.0.1.

## Global Constraints

- Ejecutar primero `2026-09-02-01-local-emulator-foundation.md`.
- Node 22 y `demo-fantasya` son obligatorios para implementación y tests.
- Ningún cliente puede crear perfiles directamente, escribir `appRole` o escribir `xp`.
- Sólo `appRole == "superadmin"` puede cambiar roles, mutar `players` o ejecutar sincronización/recálculo.
- No se puede revocar el último superadministrador.
- El fixture es la única fuente de fútbol en emulador salvo opt-in triple y explícito.
- `FOOTBALL_DATA_API_KEY` sólo se vincula a la nueva función de sync.
- Los endpoints HTTP antiguos permanecen desplegables hasta el plan 04.
- La puntuación conserva los valores actuales: post 10, post con imagen 15, transferencia 5, un punto por cada 10 puntos de jornada y trofeo 100.
- No se despliega a producción durante este plan.

## Security Review Amendments (override the task text below)

These amendments are mandatory. When an older step conflicts with this section,
this section wins.

- Add an exact-demo emulator reset helper before Task 1. It must refuse every
  project except `demo-fantasya`, clear Auth and Firestore through their local
  emulator endpoints, and run stateful test files with `--test-concurrency=1`.
  Each integration/rules test suite must start from an isolated known state.
- Preserve the existing public username contract everywhere: trim and lowercase,
  3–16 characters, only lowercase letters, numbers, `_` and `.`, no leading or
  trailing `.`, and no leading digit. Put the contract in shared client code,
  enforce it again in the callable, and test both signup forms plus the server.
- Once Firebase Auth registration succeeds, later profile or verification
  failures must never delete the Auth account. Keep the incomplete account,
  route it to `/complete-profile`, and make email verification independently
  retryable.
- Task 3 also owns `unlinkUserFromTeam`. Extract reusable
  `getSeasonContext()`/`requireSeasonAdmin()` authorization, read league and
  season consistently, compare the protected user with `league.ownerId` (not a
  season field), and prove that a league admin cannot unlink the league owner
  and that a normal member cannot invoke the callable.
- All Firestore transactions must perform every read before their first write.
- Task 5 must secure both generations of player-sync endpoints in the same
  change. The legacy `syncLaLigaPlayers` endpoint must delegate to the same V2
  service, require `superadmin`, and bind the same secret; it must not remain an
  authentication-only compatibility window. Preserve its current HTTP response
  shape while migrating the frontend exclusively to callable V2 APIs. The legacy
  status endpoint must reuse the protected status service.
- Player sync must never report `completed` after silently skipping failed
  teams. After the documented retry, fail before writing player documents and
  record an error status; cover this behavior with a test.
- The additive production deploy group in Plan 04 must include
  `unlinkUserFromTeam`, both V2 player-sync functions, and both hardened legacy
  endpoint names. Production rollout order is: compatible callables first,
  frontend with client-side XP removed second, XP triggers third, and explicit
  XP recalculation last. No rollout happens in this plan.

---

## File Structure

- `functions/lib/firebase.js`: singleton de Admin SDK.
- `functions/lib/authz.js`: `requireAuth` y `requireSuperAdmin`.
- `functions/handlers/profile.js`: alta idempotente de perfil/username.
- `functions/handlers/roles.js`: cambio transaccional de `appRole`.
- `functions/lib/xp.js`: concesión idempotente y cálculo completo.
- `functions/handlers/xp.js`: callable de recálculo.
- `functions/lib/player-sync.js`: normalización, fixture/live fetch y escritura.
- `functions/handlers/player-sync.js`: callables V2 y comprobaciones de modo.
- `functions/fixtures/la-liga.json`: entrada offline determinista.
- `src/services/admin-api.js`: API tipada por nombres para el frontend.
- `tests/rules/test-env.js` y `tests/rules/users-admin.test.js`: reglas de perfiles, roles y jugadores.

### Task 1: Extract Admin SDK and authorization primitives

**Files:**
- Create: `functions/lib/firebase.js`
- Create: `functions/lib/authz.js`
- Create: `functions/test/authz.integration.test.js`

**Interfaces:**
- Produces: `db`, `auth`, `FieldValue`, `requireAuth(request) -> uid`, `requireSuperAdmin(request, firestore = db) -> uid`.

- [ ] **Step 1: Write failing authorization tests**

Create `functions/test/authz.integration.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { getFirestore } = require('firebase-admin/firestore');
const { seedEmulators } = require('../scripts/seed-emulators');
const { requireAuth, requireSuperAdmin } = require('../lib/authz');

test.before(async () => {
  await seedEmulators();
});

test('requireAuth rejects an anonymous request', () => {
  assert.throws(() => requireAuth({ auth: null }), (error) => {
    assert.equal(error.code, 'unauthenticated');
    return true;
  });
});

test('requireSuperAdmin accepts only the seeded superadmin', async () => {
  assert.equal(
    await requireSuperAdmin({ auth: { uid: 'dev-superadmin' } }, getFirestore()),
    'dev-superadmin',
  );

  await assert.rejects(
    requireSuperAdmin({ auth: { uid: 'dev-user' } }, getFirestore()),
    (error) => {
      assert.equal(error.code, 'permission-denied');
      return true;
    },
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,storage "node --test functions/test/authz.integration.test.js"
```

Expected: FAIL with `MODULE_NOT_FOUND` for `functions/lib/authz.js`.

- [ ] **Step 3: Implement the Admin SDK singleton**

Create `functions/lib/firebase.js`:

```js
const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const {
  FieldValue,
  getFirestore,
} = require('firebase-admin/firestore');

if (getApps().length === 0) initializeApp();

module.exports = {
  auth: getAuth(),
  db: getFirestore(),
  FieldValue,
};
```

- [ ] **Step 4: Implement authorization**

Create `functions/lib/authz.js`:

```js
const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('./firebase');

function requireAuth(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  return uid;
}

async function requireSuperAdmin(request, firestore = db) {
  const uid = requireAuth(request);
  const profile = await firestore.doc('users/' + uid).get();
  if (!profile.exists || profile.data().appRole !== 'superadmin') {
    throw new HttpsError(
      'permission-denied',
      'Esta operación requiere superadministración.',
    );
  }
  return uid;
}

module.exports = {
  requireAuth,
  requireSuperAdmin,
};
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,storage "node --test functions/test/authz.integration.test.js"
```

Expected: 2 tests PASS.

```bash
git add functions/lib/firebase.js functions/lib/authz.js functions/test/authz.integration.test.js
git commit -m "feat: add server-side authorization primitives"
```

### Task 2: Make profile creation atomic and idempotent

**Files:**
- Create: `functions/handlers/profile.js`
- Create: `functions/test/profile.integration.test.js`
- Modify: `functions/index.js`
- Create: `src/services/admin-api.js`
- Modify: `src/pages/LoginPage.jsx`
- Modify: `src/pages/CompleteProfilePage.jsx`

**Interfaces:**
- Produces: `createProfileDocumentsHandler(request) -> { success, username }`.
- Produces client function `createProfile(username) -> Promise<{ success, username }>`.

- [ ] **Step 1: Write profile handler tests**

Create `functions/test/profile.integration.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { getFirestore } = require('firebase-admin/firestore');
const { seedEmulators } = require('../scripts/seed-emulators');
const {
  createProfileDocumentsHandler,
  normalizeUsername,
} = require('../handlers/profile');

test.before(async () => {
  await seedEmulators();
});

test('normalizes a valid username and rejects invalid shapes', () => {
  assert.equal(normalizeUsername(' Jordi_21 '), 'jordi_21');
  assert.throws(() => normalizeUsername('ab'), /3 y 24/);
  assert.throws(() => normalizeUsername('nombre con espacios'), /letras/);
});

test('creates both documents and returns the same result on retry', async () => {
  const request = {
    auth: { uid: 'new-profile', token: { email: 'new@fantasya.local' } },
    data: { username: 'Nuevo_User' },
  };

  const first = await createProfileDocumentsHandler(request);
  const second = await createProfileDocumentsHandler(request);
  const db = getFirestore();
  const profile = await db.doc('users/new-profile').get();
  const username = await db.doc('usernames/nuevo_user').get();

  assert.deepEqual(first, { success: true, username: 'nuevo_user' });
  assert.deepEqual(second, first);
  assert.equal(profile.data().xp, 0);
  assert.equal(profile.data().appRole, 'user');
  assert.equal(username.data().userId, 'new-profile');
});

test('retry repairs a missing username index without rewriting the profile', async () => {
  const db = getFirestore();
  await db.doc('usernames/nuevo_user').delete();
  const result = await createProfileDocumentsHandler({
    auth: { uid: 'new-profile', token: { email: 'new@fantasya.local' } },
    data: { username: 'nuevo_user' },
  });
  assert.deepEqual(result, { success: true, username: 'nuevo_user' });
  assert.equal(
    (await db.doc('usernames/nuevo_user').get()).data().userId,
    'new-profile',
  );
});

test('does not delete auth state when another user owns the username', async () => {
  await assert.rejects(
    createProfileDocumentsHandler({
      auth: { uid: 'conflict', token: { email: 'conflict@fantasya.local' } },
      data: { username: 'user' },
    }),
    (error) => {
      assert.equal(error.code, 'already-exists');
      return true;
    },
  );
});
```

- [ ] **Step 2: Run and observe the missing handler**

Run:

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,storage "node --test functions/test/profile.integration.test.js"
```

Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement profile creation**

Create `functions/handlers/profile.js`:

```js
const { HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('../lib/firebase');
const { requireAuth } = require('../lib/authz');

function normalizeUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (username.length < 3 || username.length > 24) {
    throw new HttpsError(
      'invalid-argument',
      'El nombre debe tener entre 3 y 24 caracteres.',
    );
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    throw new HttpsError(
      'invalid-argument',
      'El nombre sólo admite letras, números y guion bajo.',
    );
  }
  return username;
}

async function createProfileDocumentsHandler(request) {
  const uid = requireAuth(request);
  const email = request.auth?.token?.email;
  if (!email) {
    throw new HttpsError('failed-precondition', 'La cuenta no tiene email.');
  }
  const username = normalizeUsername(request.data?.username);
  const profileRef = db.doc('users/' + uid);
  const usernameRef = db.doc('usernames/' + username);

  await db.runTransaction(async (transaction) => {
    const [profile, usernameDoc] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(usernameRef),
    ]);

    if (profile.exists) {
      if (profile.data().username !== username) {
        throw new HttpsError(
          'failed-precondition',
          'La cuenta ya tiene un perfil con otro nombre.',
        );
      }
      if (usernameDoc.exists && usernameDoc.data().userId !== uid) {
        throw new HttpsError(
          'data-loss',
          'El índice de nombre no coincide con el perfil.',
        );
      }
      if (!usernameDoc.exists) transaction.set(usernameRef, { userId: uid });
      return;
    }
    if (usernameDoc.exists && usernameDoc.data().userId !== uid) {
      throw new HttpsError('already-exists', 'Ese nombre ya está ocupado.');
    }

    transaction.set(profileRef, {
      username,
      email,
      appRole: 'user',
      createdAt: FieldValue.serverTimestamp(),
      photoURL: '',
      bio: '',
      xp: 0,
      followers: [],
      following: [],
      pinnedTrophies: [],
      savedPosts: [],
    });
    transaction.set(usernameRef, { userId: uid });
  });

  return { success: true, username };
}

module.exports = {
  createProfileDocumentsHandler,
  normalizeUsername,
};
```

- [ ] **Step 4: Export the callable and add the client API**

In `functions/index.js` import:

```js
const {
  createProfileDocumentsHandler,
} = require('./handlers/profile');
```

Replace the current `createProfileDocuments` implementation with:

```js
exports.createProfileDocuments = onCall(
  {
    region: 'us-central1',
    cors: ['https://fantasya-app.vercel.app', 'http://127.0.0.1:5173'],
  },
  createProfileDocumentsHandler,
);
```

Create `src/services/admin-api.js`:

```js
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const call = (name) => httpsCallable(functions, name);

export async function createProfile(username) {
  const result = await call('createProfileDocuments')({ username });
  return result.data;
}
```

- [ ] **Step 5: Route both signup paths through the callable**

In `src/pages/LoginPage.jsx` replace the local callable construction with:

```js
import { createProfile } from '../services/admin-api';

await createProfile(username);
```

In `src/pages/CompleteProfilePage.jsx` remove `writeBatch`, `doc` and all direct `users/usernames` writes. Submit with:

```js
import { createProfile } from '../services/admin-api';

await createProfile(username);
toast.success('¡Perfil completado! Bienvenido a Fantasya.');
navigate('/dashboard');
```

- [ ] **Step 6: Test and commit**

Run:

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,storage "node --test functions/test/profile.integration.test.js"
npm run build
```

Expected: 4 profile tests PASS and build exits 0.

```bash
git add functions/handlers/profile.js functions/test/profile.integration.test.js functions/index.js src/services/admin-api.js src/pages/LoginPage.jsx src/pages/CompleteProfilePage.jsx
git commit -m "feat: make profile creation atomic and idempotent"
```

### Task 3: Protect roles, profiles, and the manual player database

**Files:**
- Create: `functions/handlers/roles.js`
- Create: `functions/test/roles.integration.test.js`
- Modify: `functions/index.js`
- Modify: `src/services/admin-api.js`
- Modify: `src/pages/SuperAdminPage.jsx`
- Create: `tests/rules/test-env.js`
- Create: `tests/rules/users-admin.test.js`
- Modify: `firestore.rules`
- Modify: `package.json`

**Interfaces:**
- Produces: `setUserAppRoleHandler(request) -> { success, userId, appRole }`.
- Client: `setUserAppRole(userId, appRole)`.
- Rules helper: `isSuperAdmin()`.

- [ ] **Step 1: Write callable tests for role changes**

Create `functions/test/roles.integration.test.js` with cases:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { getFirestore } = require('firebase-admin/firestore');
const { seedEmulators } = require('../scripts/seed-emulators');
const { setUserAppRoleHandler } = require('../handlers/roles');

test.beforeEach(async () => {
  await seedEmulators();
});

test('superadmin can promote and demote another account', async () => {
  const promote = await setUserAppRoleHandler({
    auth: { uid: 'dev-superadmin' },
    data: { userId: 'dev-user', appRole: 'superadmin' },
  });
  assert.equal(promote.appRole, 'superadmin');

  const demote = await setUserAppRoleHandler({
    auth: { uid: 'dev-superadmin' },
    data: { userId: 'dev-user', appRole: 'user' },
  });
  assert.equal(demote.appRole, 'user');
});

test('normal user cannot change a role', async () => {
  await assert.rejects(
    setUserAppRoleHandler({
      auth: { uid: 'dev-user' },
      data: { userId: 'dev-league-admin', appRole: 'superadmin' },
    }),
    (error) => error.code === 'permission-denied',
  );
});

test('last superadmin cannot be demoted', async () => {
  await assert.rejects(
    setUserAppRoleHandler({
      auth: { uid: 'dev-superadmin' },
      data: { userId: 'dev-superadmin', appRole: 'user' },
    }),
    (error) => error.code === 'failed-precondition',
  );
  assert.equal(
    (await getFirestore().doc('users/dev-superadmin').get()).data().appRole,
    'superadmin',
  );
});
```

- [ ] **Step 2: Implement the transactional role handler**

Create `functions/handlers/roles.js`:

```js
const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('../lib/firebase');
const { requireSuperAdmin } = require('../lib/authz');

const ROLES = new Set(['user', 'superadmin']);

async function setUserAppRoleHandler(request) {
  await requireSuperAdmin(request);
  const userId = String(request.data?.userId || '');
  const appRole = String(request.data?.appRole || '');
  if (!userId || !ROLES.has(appRole)) {
    throw new HttpsError('invalid-argument', 'Usuario o rol inválido.');
  }

  const targetRef = db.doc('users/' + userId);
  await db.runTransaction(async (transaction) => {
    const target = await transaction.get(targetRef);
    if (!target.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');

    if (target.data().appRole === 'superadmin' && appRole === 'user') {
      const admins = await transaction.get(
        db.collection('users').where('appRole', '==', 'superadmin'),
      );
      if (admins.size <= 1) {
        throw new HttpsError(
          'failed-precondition',
          'No se puede revocar el último superadministrador.',
        );
      }
    }
    transaction.update(targetRef, { appRole });
  });

  return { success: true, userId, appRole };
}

module.exports = { setUserAppRoleHandler };
```

- [ ] **Step 3: Export and consume the callable**

Export in `functions/index.js`:

```js
const { setUserAppRoleHandler } = require('./handlers/roles');

exports.setUserAppRole = onCall(
  { region: 'us-central1' },
  setUserAppRoleHandler,
);
```

Add to `src/services/admin-api.js`:

```js
export async function setUserAppRole(userId, appRole) {
  const result = await call('setUserAppRole')({ userId, appRole });
  return result.data;
}
```

Replace `updateDoc(userRef, { appRole: newRole })` in `SuperAdminPage.jsx` with:

```js
await setUserAppRole(userId, newRole);
```

- [ ] **Step 4: Add rules test infrastructure**

Create `tests/rules/test-env.js`:

```js
import fs from 'node:fs/promises';
import {
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

export async function createRulesEnvironment() {
  return initializeTestEnvironment({
    projectId: 'demo-fantasya',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await fs.readFile('firestore.rules', 'utf8'),
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: await fs.readFile('storage.rules', 'utf8'),
    },
  });
}
```

Create `tests/rules/users-admin.test.js` and cover these exact assertions:

```js
import test, { after, before, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { createRulesEnvironment } from './test-env.js';

let env;
before(async () => { env = await createRulesEnvironment(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/admin'), {
      username: 'admin',
      appRole: 'superadmin',
      xp: 0,
      createdAt: new Date(),
      followers: [],
      following: [],
    });
    await setDoc(doc(db, 'users/user'), {
      username: 'user',
      appRole: 'user',
      xp: 0,
      createdAt: new Date(),
      followers: [],
      following: [],
    });
  });
});
after(async () => env.cleanup());

test('user can edit bio but cannot self-promote or change xp', async () => {
  const ref = doc(env.authenticatedContext('user').firestore(), 'users/user');
  await assertSucceeds(updateDoc(ref, { bio: 'Nueva bio' }));
  await assertFails(updateDoc(ref, { appRole: 'superadmin' }));
  await assertFails(updateDoc(ref, { xp: 999999 }));
});

test('normal user cannot write players and superadmin can', async () => {
  const normalRef = doc(env.authenticatedContext('user').firestore(), 'players/p1');
  const adminRef = doc(env.authenticatedContext('admin').firestore(), 'players/p1');
  await assertFails(setDoc(normalRef, { name: 'No permitido' }));
  await assertSucceeds(setDoc(adminRef, { name: 'Permitido' }));
});
```

- [ ] **Step 5: Replace only users and players rule blocks**

Add helpers near the top of `firestore.rules`:

```text
function isSuperAdmin() {
  return isAuthenticated()
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.appRole == 'superadmin';
}

function changesOnlyOwnUid(before, after) {
  return after.toSet().difference(before.toSet()).hasOnly([request.auth.uid])
    && before.toSet().difference(after.toSet()).hasOnly([request.auth.uid]);
}
```

Replace `match /users/{userId}` direct grants with:

```text
allow read: if isAuthenticated();
allow create: if false;
allow update: if (
    isOwner(userId)
    && request.resource.data.diff(resource.data).affectedKeys()
      .hasOnly(['bio', 'photoURL', 'pinnedTrophies', 'savedPosts', 'following'])
  ) || (
    isAuthenticated()
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['followers'])
    && changesOnlyOwnUid(resource.data.followers, request.resource.data.followers)
  );
allow delete: if false;
```

Replace `match /players/{playerId}` writes with:

```text
allow read: if true;
allow create, update, delete: if isSuperAdmin();
```

Keep user subcollections unchanged until plan 03.

- [ ] **Step 6: Wire tests, run, and commit**

Add root script:

```json
"test:rules:admin": "firebase emulators:exec --project demo-fantasya --only firestore,storage \"node --test tests/rules/users-admin.test.js\""
```

Run:

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,storage "node --test functions/test/roles.integration.test.js"
npm run test:rules:admin
npm run build
```

Expected: 3 callable tests and 2 rules tests PASS; build exits 0.

```bash
git add functions/handlers/roles.js functions/test/roles.integration.test.js functions/index.js src/services/admin-api.js src/pages/SuperAdminPage.jsx tests/rules firestore.rules package.json
git commit -m "fix: protect roles and global player writes"
```

### Task 4: Move XP authority to idempotent server events

**Files:**
- Create: `functions/lib/xp.js`
- Create: `functions/handlers/xp.js`
- Create: `functions/test/xp.integration.test.js`
- Modify: `functions/index.js`
- Modify: `src/services/admin-api.js`
- Modify: `src/pages/SuperAdminPage.jsx`
- Modify: `src/components/CreatePost.jsx`
- Modify: `src/components/RegisterTransferModal.jsx`
- Delete: `src/pages/CreatePost.jsx`
- Delete: `src/utils/xp.js`

**Interfaces:**
- Produces: `awardXpOnce({ userId, eventId, amount, source }) -> boolean`.
- Produces: `recalculateAllXp() -> { usersUpdated }`.
- Client: `recalculateXp()`.

- [ ] **Step 1: Write idempotency tests**

Create `functions/test/xp.integration.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { getFirestore } = require('firebase-admin/firestore');
const { seedEmulators } = require('../scripts/seed-emulators');
const { awardXpOnce } = require('../lib/xp');

test.beforeEach(async () => {
  await seedEmulators();
  await getFirestore().doc('users/dev-user').update({ xp: 0 });
});

test('the same event awards xp exactly once', async () => {
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

  const user = await getFirestore().doc('users/dev-user').get();
  assert.equal(user.data().xp, 10);
});
```

- [ ] **Step 2: Implement XP primitives**

Create `functions/lib/xp.js`:

```js
const { db, FieldValue } = require('./firebase');

const XP_VALUES = Object.freeze({
  POINTS_PER_10: 1,
  TRANSFER: 5,
  POST: 10,
  POST_WITH_IMAGE: 15,
  TROPHY: 100,
});

async function awardXpOnce({ userId, eventId, amount, source }) {
  if (!userId || !eventId || !Number.isFinite(amount) || amount <= 0) return false;
  const userRef = db.doc('users/' + userId);
  const eventRef = userRef.collection('xpEvents').doc(eventId.replaceAll('/', '_'));

  return db.runTransaction(async (transaction) => {
    const [user, event] = await Promise.all([
      transaction.get(userRef),
      transaction.get(eventRef),
    ]);
    if (!user.exists || event.exists) return false;
    transaction.set(eventRef, {
      amount,
      source,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(userRef, { xp: FieldValue.increment(amount) });
    return true;
  });
}

async function calculateXpByUser() {
  const users = await db.collection('users').get();
  const totals = Object.fromEntries(users.docs.map((item) => [item.id, 0]));
  const posts = await db.collection('posts').get();
  posts.forEach((item) => {
    const post = item.data();
    if (totals[post.authorId] !== undefined) {
      totals[post.authorId] += post.imageURL
        ? XP_VALUES.POST_WITH_IMAGE
        : XP_VALUES.POST;
    }
  });

  const leagues = await db.collection('leagues').get();
  for (const league of leagues.docs) {
    const seasons = await league.ref.collection('seasons').get();
    for (const season of seasons.docs) {
      const [transfers, rounds, achievements] = await Promise.all([
        season.ref.collection('transfers').get(),
        season.ref.collection('rounds').get(),
        season.ref.collection('achievements').get(),
      ]);
      transfers.forEach((item) => {
        const buyerId = item.data().buyerId;
        if (totals[buyerId] !== undefined) totals[buyerId] += XP_VALUES.TRANSFER;
      });
      rounds.forEach((item) => {
        const scores = item.data().scores || {};
        for (const [uid, points] of Object.entries(scores)) {
          if (totals[uid] !== undefined && typeof points === 'number') {
            totals[uid] += Math.floor(points / 10) * XP_VALUES.POINTS_PER_10;
          }
        }
      });
      achievements.forEach((item) => {
        const data = item.data();
        if (totals[item.id] !== undefined && !data.isPlaceholder) {
          totals[item.id] += (data.trophies?.length || 0) * XP_VALUES.TROPHY;
        }
      });
    }
  }
  return totals;
}

async function recalculateAllXp() {
  const totals = await calculateXpByUser();
  const entries = Object.entries(totals);
  for (let offset = 0; offset < entries.length; offset += 450) {
    const batch = db.batch();
    for (const [uid, xp] of entries.slice(offset, offset + 450)) {
      batch.update(db.doc('users/' + uid), { xp });
    }
    await batch.commit();
  }
  return { usersUpdated: entries.length };
}

module.exports = {
  XP_VALUES,
  awardXpOnce,
  calculateXpByUser,
  recalculateAllXp,
};
```

- [ ] **Step 3: Add triggers and the protected recalc callable**

Create `functions/handlers/xp.js`:

```js
const { requireSuperAdmin } = require('../lib/authz');
const { recalculateAllXp } = require('../lib/xp');

async function recalculateXpHandler(request) {
  await requireSuperAdmin(request);
  return recalculateAllXp();
}

module.exports = { recalculateXpHandler };
```

In `functions/index.js` import `onDocumentCreated` and add:

```js
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { awardXpOnce, XP_VALUES } = require('./lib/xp');
const { recalculateXpHandler } = require('./handlers/xp');

exports.onPostCreatedAwardXp = onDocumentCreated(
  'posts/{postId}',
  async (event) => {
    const post = event.data?.data();
    if (!post?.authorId) return;
    await awardXpOnce({
      userId: post.authorId,
      eventId: 'post:' + event.params.postId,
      amount: post.imageURL ? XP_VALUES.POST_WITH_IMAGE : XP_VALUES.POST,
      source: 'post',
    });
  },
);

exports.onTransferCreatedAwardXp = onDocumentCreated(
  'leagues/{leagueId}/seasons/{seasonId}/transfers/{transferId}',
  async (event) => {
    const transfer = event.data?.data();
    if (!transfer?.buyerId || transfer.buyerId === 'market') return;
    await awardXpOnce({
      userId: transfer.buyerId,
      eventId: 'transfer:' + event.params.leagueId + ':' +
        event.params.seasonId + ':' + event.params.transferId,
      amount: XP_VALUES.TRANSFER,
      source: 'transfer',
    });
  },
);

exports.recalculateXp = onCall(
  { region: 'us-central1', timeoutSeconds: 540 },
  recalculateXpHandler,
);
```

- [ ] **Step 4: Remove all client-side XP mutation**

Add to `src/services/admin-api.js`:

```js
export async function recalculateXp() {
  const result = await call('recalculateXp')();
  return result.data;
}
```

In `SuperAdminPage.jsx` import `recalculateXp` and replace `calculateXpForAllUsers()` with `recalculateXp()`.

In `src/components/CreatePost.jsx` remove the `grantXp` import and both calls. In `src/components/RegisterTransferModal.jsx` remove the import and the post-create `grantXp` block. Delete the unused duplicate `src/pages/CreatePost.jsx` and delete `src/utils/xp.js`.

- [ ] **Step 5: Test idempotency, client cleanup, and build**

Run:

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,storage "node --test functions/test/xp.integration.test.js"
rg -n "grantXp|calculateXpForAllUsers|updateDoc.*xp" src
npm run build
```

Expected: XP test PASS; ripgrep has no matches; build exits 0.

- [ ] **Step 6: Commit**

```bash
git add functions/lib/xp.js functions/handlers/xp.js functions/test/xp.integration.test.js functions/index.js src/services/admin-api.js src/pages/SuperAdminPage.jsx src/components/CreatePost.jsx src/components/RegisterTransferModal.jsx src/pages/CreatePost.jsx src/utils/xp.js
git commit -m "fix: move XP authority to idempotent functions"
```

### Task 5: Add offline-first callable player synchronization

**Files:**
- Create: `functions/fixtures/la-liga.json`
- Create: `functions/lib/player-sync.js`
- Create: `functions/handlers/player-sync.js`
- Create: `functions/test/player-sync.integration.test.js`
- Modify: `functions/index.js`
- Modify: `src/services/admin-api.js`
- Modify: `src/components/PlayersSyncTab.jsx`
- Create (ignored): `functions/.secret.local`
- Create: `functions/.secret.local.example`

**Interfaces:**
- Produces: `syncLaLigaPlayersV2` and `getLaLigaSyncStatusV2`.
- Produces: `syncPlayers({ requestedBy, source, apiKey, fetchImpl, sleep })`.
- Client: `syncLaLigaPlayers()` and `getLaLigaSyncStatus()`.

- [ ] **Step 1: Create a deterministic fixture**

Create `functions/fixtures/la-liga.json`:

```json
{
  "teams": [
    {
      "id": 86,
      "name": "Real Madrid CF",
      "squad": [
        {
          "id": 1,
          "name": "Delantero Local",
          "firstName": "Delantero",
          "lastName": "Local",
          "dateOfBirth": "2000-01-01",
          "nationality": "Spain",
          "position": "Centre-Forward"
        },
        {
          "id": 2,
          "name": "Portero Local",
          "firstName": "Portero",
          "lastName": "Local",
          "dateOfBirth": "1998-01-01",
          "nationality": "Spain",
          "position": "Goalkeeper"
        }
      ]
    },
    {
      "id": 81,
      "name": "FC Barcelona",
      "squad": [
        {
          "id": 3,
          "name": "Medio Local",
          "firstName": "Medio",
          "lastName": "Local",
          "dateOfBirth": "2001-01-01",
          "nationality": "Spain",
          "position": "Central Midfield"
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Write fixture sync tests**

Create `functions/test/player-sync.integration.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { getFirestore } = require('firebase-admin/firestore');
const { seedEmulators } = require('../scripts/seed-emulators');
const { syncPlayers } = require('../lib/player-sync');

test.beforeEach(async () => {
  await seedEmulators();
});

test('fixture sync writes normalized players without network', async () => {
  const result = await syncPlayers({
    requestedBy: 'dev-superadmin',
    source: 'fixture',
    fetchImpl: () => {
      throw new Error('network must not be called');
    },
    sleep: async () => {},
  });

  assert.deepEqual(result, {
    success: true,
    playersSynced: 3,
    teamsProcessed: 2,
    source: 'fixture',
  });
  const player = await getFirestore().doc('laLigaPlayers/1').get();
  assert.equal(player.data().team, 'Real Madrid');
  assert.equal(player.data().position, 'DEL');
});
```

- [ ] **Step 3: Implement the sync service**

Create `functions/lib/player-sync.js` with the exact normalized maps below, then add the service implementation after them:

```js
const fixture = require('../fixtures/la-liga.json');
const { db, FieldValue } = require('./firebase');

const FOOTBALL_API_BASE = 'https://api.football-data.org/v4';

const POSITION_MAP = Object.freeze({
  Goalkeeper: 'POR',
  Defence: 'DEF',
  'Centre-Back': 'DEF',
  'Left-Back': 'DEF',
  'Right-Back': 'DEF',
  Defender: 'DEF',
  Midfield: 'MED',
  'Central Midfield': 'MED',
  'Attacking Midfield': 'MED',
  'Defensive Midfield': 'MED',
  Midfielder: 'MED',
  Forward: 'DEL',
  Offence: 'DEL',
  'Centre-Forward': 'DEL',
  'Left Winger': 'DEL',
  'Right Winger': 'DEL',
  Striker: 'DEL',
});

const TEAM_NAME_MAP = Object.freeze({
  'Real Madrid CF': 'Real Madrid',
  'FC Barcelona': 'Barcelona',
  'Atlético de Madrid': 'Atlético de Madrid',
  'Athletic Club': 'Athletic Club',
  'Sevilla FC': 'Sevilla',
  'Real Betis Balompié': 'Real Betis',
  'Real Betis': 'Real Betis',
  'Real Sociedad de Fútbol': 'Real Sociedad',
  'Real Sociedad': 'Real Sociedad',
  'Villarreal CF': 'Villarreal',
  'Valencia CF': 'Valencia',
  'RC Celta': 'Celta',
  'RC Celta de Vigo': 'Celta',
  'CA Osasuna': 'Osasuna',
  'Getafe CF': 'Getafe',
  'CD Leganés': 'Leganés',
  'Levante UD': 'Levante',
  'Real Valladolid CF': 'Valladolid',
  'SD Eibar': 'Eibar',
  'RCD Espanyol': 'Espanyol',
  'RCD Espanyol de Barcelona': 'Espanyol',
  'Deportivo Alavés': 'Alavés',
  'Granada CF': 'Granada',
  'Rayo Vallecano de Madrid': 'Rayo Vallecano',
  'Málaga CF': 'Málaga CF',
  'Racing de Santander': 'Racing de Santander',
  'Deportivo La Coruña': 'Deportivo La Coruña',
  'UD Las Palmas': 'Las Palmas',
  'UD Almería': 'Almería',
  'Cádiz CF': 'Cádiz',
  'Elche CF': 'Elche',
});

function normalizePlayer(player, teamName) {
  const team = TEAM_NAME_MAP[teamName] || teamName;
  const position = POSITION_MAP[player.position] || 'MED';
  return {
    id: player.id,
    name: player.name,
    firstName: player.firstName || '',
    lastName: player.lastName || '',
    dateOfBirth: player.dateOfBirth || null,
    nationality: player.nationality || null,
    position,
    team,
    shirtNumber: null,
    lastUpdated: FieldValue.serverTimestamp(),
    teamHistory: [{ team, since: new Date().toISOString() }],
    positionHistory: [{ position, since: new Date().toISOString() }],
  };
}

async function loadLiveTeams({ apiKey, fetchImpl, sleep }) {
  if (!apiKey) throw new Error('FOOTBALL_DATA_API_KEY is not configured.');
  const competition = await fetchImpl(
    FOOTBALL_API_BASE + '/competitions/PD/teams',
    { headers: { 'X-Auth-Token': apiKey } },
  );
  if (!competition.ok) {
    throw new Error('Football API returned ' + competition.status + '.');
  }
  const summary = await competition.json();
  const teams = [];
  for (const [index, team] of (summary.teams || []).entries()) {
    let response = await fetchImpl(FOOTBALL_API_BASE + '/teams/' + team.id, {
      headers: { 'X-Auth-Token': apiKey },
    });
    if (response.status === 429) {
      await sleep(30000);
      response = await fetchImpl(FOOTBALL_API_BASE + '/teams/' + team.id, {
        headers: { 'X-Auth-Token': apiKey },
      });
    }
    if (!response.ok) continue;
    const detail = await response.json();
    teams.push({ id: detail.id, name: detail.name, squad: detail.squad || [] });
    if (index < summary.teams.length - 1) await sleep(6500);
  }
  return teams;
}

async function syncPlayers({
  requestedBy,
  source,
  apiKey,
  fetchImpl = fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const statusRef = db.doc('config/laLigaSync');
  await statusRef.set({
    status: 'in_progress',
    startedBy: requestedBy,
    startedAt: FieldValue.serverTimestamp(),
    source,
  }, { merge: true });

  try {
    const teams = source === 'fixture'
      ? fixture.teams
      : await loadLiveTeams({ apiKey, fetchImpl, sleep });
    const players = teams.flatMap((team) =>
      team.squad.map((player) => normalizePlayer(player, team.name)));

    for (let offset = 0; offset < players.length; offset += 450) {
      const batch = db.batch();
      for (const player of players.slice(offset, offset + 450)) {
        batch.set(db.doc('laLigaPlayers/' + player.id), player, { merge: true });
      }
      await batch.commit();
    }

    await statusRef.set({
      status: 'completed',
      lastSync: FieldValue.serverTimestamp(),
      playersCount: players.length,
      syncedBy: requestedBy,
      source,
      lastError: FieldValue.delete(),
    }, { merge: true });
    return {
      success: true,
      playersSynced: players.length,
      teamsProcessed: teams.length,
      source,
    };
  } catch (error) {
    await statusRef.set({
      status: 'error',
      lastError: error.message,
      failedAt: FieldValue.serverTimestamp(),
      source,
    }, { merge: true });
    throw error;
  }
}

module.exports = {
  loadLiveTeams,
  normalizePlayer,
  syncPlayers,
};
```

- [ ] **Step 4: Implement protected V2 handlers**

Create `functions/handlers/player-sync.js`:

```js
const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('../lib/firebase');
const { requireAuth, requireSuperAdmin } = require('../lib/authz');
const { syncPlayers } = require('../lib/player-sync');

async function syncLaLigaPlayersV2Handler(request, apiKey) {
  const uid = await requireSuperAdmin(request);
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
  const liveAllowed = process.env.ALLOW_LIVE_FOOTBALL_API === 'true';
  const source = isEmulator && !liveAllowed ? 'fixture' : 'live';
  if (source === 'live' && !apiKey) {
    throw new HttpsError('failed-precondition', 'Falta la API key de fútbol.');
  }
  return syncPlayers({ requestedBy: uid, source, apiKey });
}

async function getLaLigaSyncStatusV2Handler(request) {
  requireAuth(request);
  const snapshot = await db.doc('config/laLigaSync').get();
  if (!snapshot.exists) {
    return { status: 'never_synced', lastSync: null, playersCount: 0 };
  }
  const data = snapshot.data();
  return {
    status: data.status || 'unknown',
    lastSync: data.lastSync || data.startedAt || null,
    playersCount: data.playersCount || 0,
    lastError: data.lastError || null,
    source: data.source || null,
  };
}

module.exports = {
  getLaLigaSyncStatusV2Handler,
  syncLaLigaPlayersV2Handler,
};
```

- [ ] **Step 5: Export callables with a bound secret**

In `functions/index.js`:

```js
const { defineSecret } = require('firebase-functions/params');
const {
  getLaLigaSyncStatusV2Handler,
  syncLaLigaPlayersV2Handler,
} = require('./handlers/player-sync');

const footballDataApiKey = defineSecret('FOOTBALL_DATA_API_KEY');

exports.syncLaLigaPlayersV2 = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [footballDataApiKey],
  },
  (request) => syncLaLigaPlayersV2Handler(
    request,
    process.env.FUNCTIONS_EMULATOR === 'true' &&
      process.env.ALLOW_LIVE_FOOTBALL_API !== 'true'
      ? undefined
      : footballDataApiKey.value(),
  ),
);

exports.getLaLigaSyncStatusV2 = onCall(
  { region: 'us-central1' },
  getLaLigaSyncStatusV2Handler,
);
```

Keep `syncLaLigaPlayers` and `getLaLigaSyncStatus` unchanged for compatibility.

- [ ] **Step 6: Replace hardcoded Cloud Run URLs in the client**

Add to `src/services/admin-api.js`:

```js
export async function syncLaLigaPlayers() {
  const result = await call('syncLaLigaPlayersV2')();
  return result.data;
}

export async function getLaLigaSyncStatus() {
  const result = await call('getLaLigaSyncStatusV2')();
  return result.data;
}
```

In `PlayersSyncTab.jsx` remove both raw `fetch` blocks and token plumbing. Use:

```js
import {
  getLaLigaSyncStatus,
  syncLaLigaPlayers,
} from '../services/admin-api';

const status = await getLaLigaSyncStatus();
const result = await syncLaLigaPlayers();
```

Delete the IAM banner that recommends `allAuthenticatedUsers`.

- [ ] **Step 7: Document local live opt-in without a real secret**

Create the ignored local override `functions/.secret.local`:

```dotenv
FOOTBALL_DATA_API_KEY=local-fixture-value-not-used
```

Also create the versioned template `functions/.secret.local.example`:

```dotenv
FOOTBALL_DATA_API_KEY=local-fixture-value-not-used
```

The actual `functions/.secret.local` remains ignored and prevents the emulator from attempting to read a production secret. Add to `functions/.env.example`:

```dotenv
ALLOW_LIVE_FOOTBALL_API=false
```

- [ ] **Step 8: Test, scan, and commit**

Run:

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,storage "node --test functions/test/player-sync.integration.test.js"
rg -n "a.run.app|allAuthenticatedUsers" src
npm run build
```

Expected: fixture test PASS; ripgrep has no matches; build exits 0.

```bash
git add functions/fixtures functions/lib/player-sync.js functions/handlers/player-sync.js functions/test/player-sync.integration.test.js functions/index.js functions/.env.example functions/.secret.local.example src/services/admin-api.js src/components/PlayersSyncTab.jsx
git commit -m "feat: add protected offline-first player sync"
```

### Task 6: Run the identity/admin regression gate

**Files:**
- Modify: `package.json`
- Modify: `functions/package.json`

**Interfaces:**
- Produces one `npm run test:admin` command for all work in this plan.

- [ ] **Step 1: Add aggregate scripts**

Add to `functions/package.json`:

```json
"test:admin": "node --test test/authz.integration.test.js test/profile.integration.test.js test/roles.integration.test.js test/xp.integration.test.js test/player-sync.integration.test.js"
```

Add to root `package.json`:

```json
"test:admin": "firebase emulators:exec --project demo-fantasya --only auth,firestore,functions,storage \"npm --prefix functions run test:admin\""
```

- [ ] **Step 2: Run all gates**

Run:

```powershell
npm run test:unit
npm run test:rules:admin
npm run test:admin
npm run build
node --check functions/index.js
```

Expected: every test passes, build exits 0, and Node reports no syntax error.

- [ ] **Step 3: Verify no sensitive client writes remain**

Run:

```powershell
rg -n "appRole:|xp:|grantXp|calculateXpForAllUsers|a.run.app" src
```

Expected: `appRole` may appear only in reads/rendering; no client assignment, XP mutation, old helper or Cloud Run URL remains.

- [ ] **Step 4: Commit**

```bash
git add package.json functions/package.json
git commit -m "test: add identity and admin regression gate"
```
