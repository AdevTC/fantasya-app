# Local Firebase Emulator Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arrancar Fantasya con un solo comando contra Auth, Firestore, Functions y Storage locales, con datos deterministas y una barrera que haga imposible caer en producción desde Vite development.

**Architecture:** El proyecto usa `demo-fantasya` como identidad exclusiva de emuladores. Un módulo puro valida el entorno antes de inicializar Firebase; `src/config/firebase.js` centraliza todas las instancias y conexiones. `firebase emulators:exec` controla el ciclo de vida, ejecuta un seed idempotente mediante Admin SDK y después inicia Vite.

**Tech Stack:** Node.js 22, npm 10+, Java 21, React 19, Vite 7, Firebase JS SDK 11.10.0, Firebase Admin 12.6.0, Firebase CLI 15.28.2, `@firebase/rules-unit-testing` 4.0.1, `npm-run-all2` 8.0.4, Node test runner.

## Global Constraints

- El project ID local es exactamente `demo-fantasya`; desarrollo, seed y pruebas deben rechazar `tictaktools`.
- Puertos fijos: Auth 9099, Firestore 8080, Functions 5001, Storage 9199, Emulator UI 4000 y Vite 5173 sobre `127.0.0.1`.
- Node 24 global no se desinstala; `fnm` activa Node 22 sólo en la sesión del repositorio y CI usa Node 22.
- Java mínimo es 21, requisito de Firebase CLI 15.
- No se importan, copian, borran ni migran datos reales.
- Analytics y llamadas externas quedan desactivados en local.
- Los scripts de producción siempre nombran `tictaktools` explícitamente; este plan no ejecuta ninguno.
- No se actualiza Firebase JS a 12: `@firebase/rules-unit-testing@4.0.1` mantiene compatibilidad con Firebase 11.
- Cada tarea termina con tests verdes y un commit aislado.

---

## File Structure

- `src/config/runtime.js`: valida y devuelve la configuración local/producción sin importar Firebase.
- `src/config/firebase.js`: única inicialización de App, Auth, Firestore, Functions, Storage y Analytics.
- `src/components/EnvironmentBanner.jsx`: indicador visual exclusivo del emulador.
- `scripts/activate-node22.ps1`: activa de forma explícita Node 22 en la sesión PowerShell actual.
- `functions/lib/emulator-guard.js`: barrera server-side reutilizable por seed y pruebas.
- `functions/scripts/seed-emulators.js`: crea cuentas y documentos deterministas.
- `tests/unit/firebase-runtime.test.js`: contrato puro del runtime frontend.
- `functions/test/emulator-guard.test.js`: contrato puro del guard server-side.
- `functions/test/seed-emulators.integration.test.js`: idempotencia y contenido mínimo del seed.
- `.env.development`, `.firebaserc`, `firebase.json` y `package.json`: contrato de ejecución.
- `README.md`: instrucciones de una máquina limpia y credenciales ficticias.

### Task 1: Pin runtime and install local tooling

**Files:**
- Create: `.nvmrc`
- Create: `.node-version`
- Create: `scripts/activate-node22.ps1`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `fnm` instalado por usuario y Java 21 ya disponible.
- Produces: local binaries `firebase` and `run-s`; `engines.node == "22.x"`.

- [ ] **Step 1: Install the per-user Node version manager**

The machine audit found Node 24 but no `nvm`/`fnm`. With the user's approval for this one machine-level installation, run:

```powershell
winget install --exact --id Schniz.fnm --accept-source-agreements --accept-package-agreements
```

Expected: WinGet reports `Schniz.fnm` installed. Open a fresh PowerShell terminal once so the new user PATH is visible; do not uninstall or replace the existing Node 24 installation.

- [ ] **Step 2: Record and activate Node 22 for this repository**

Create both `.nvmrc` and `.node-version`:

```text
22
```

Create `scripts/activate-node22.ps1`:

```powershell
$ErrorActionPreference = 'Stop'

if (-not (Get-Command fnm -ErrorAction SilentlyContinue)) {
    throw 'fnm no está disponible. Abre una PowerShell nueva después de instalar Schniz.fnm.'
}

fnm env --shell powershell | Out-String | Invoke-Expression
fnm use --install-if-missing 22

$nodeVersion = node --version
if ($nodeVersion -notmatch '^v22\.') {
    throw "Fantasya requiere Node 22; la sesión usa $nodeVersion."
}

Write-Host "Fantasya usa $nodeVersion en esta sesión."
```

Run:

```powershell
. .\scripts\activate-node22.ps1
node --version
npm --version
java -version
```

Expected: Node prints `v22.x.x` and Java prints major `21` or newer.

- [ ] **Step 3: Add the exact engine contract**

Add this top-level field to `package.json` after `"type": "module"`:

```json
"engines": {
  "node": "22.x",
  "npm": ">=10"
},
```

- [ ] **Step 4: Install compatible development dependencies**

Run:

```powershell
npm install --save-dev firebase-tools@15.28.2 @firebase/rules-unit-testing@4.0.1 npm-run-all2@8.0.4
```

Expected: `package.json` and `package-lock.json` change; npm reports no peer conflict with `firebase@11.10.0`.

- [ ] **Step 5: Verify clean reproducible installs**

Run:

```powershell
npm ci
npm --prefix functions ci
npx firebase --version
```

Expected: both installs exit 0 and Firebase prints `15.28.2`.

- [ ] **Step 6: Commit**

```bash
git add .nvmrc .node-version scripts/activate-node22.ps1 package.json package-lock.json
git commit -m "chore: pin local Firebase development runtime"
```

### Task 2: Fail closed before Firebase initialization

**Files:**
- Create: `src/config/runtime.js`
- Create: `tests/unit/firebase-runtime.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `resolveFirebaseRuntime(env, isDev) -> { projectId, useEmulators }` and `DEMO_PROJECT_ID`.
- Invariant: development throws unless project ID is `demo-fantasya` and emulator flag is exactly `true`.

- [ ] **Step 1: Write the failing runtime tests**

Create `tests/unit/firebase-runtime.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_PROJECT_ID,
  resolveFirebaseRuntime,
} from '../../src/config/runtime.js';

const demoEnv = {
  VITE_FIREBASE_PROJECT_ID: 'demo-fantasya',
  VITE_USE_FIREBASE_EMULATORS: 'true',
};

test('development accepts only the demo project with emulators enabled', () => {
  assert.deepEqual(resolveFirebaseRuntime(demoEnv, true), {
    projectId: DEMO_PROJECT_ID,
    useEmulators: true,
  });
});

test('development rejects the production project', () => {
  assert.throws(
    () => resolveFirebaseRuntime({
      ...demoEnv,
      VITE_FIREBASE_PROJECT_ID: 'tictaktools',
    }, true),
    /refusing to start/i,
  );
});

test('development rejects an emulator opt-out', () => {
  assert.throws(
    () => resolveFirebaseRuntime({
      ...demoEnv,
      VITE_USE_FIREBASE_EMULATORS: 'false',
    }, true),
    /emulators must be enabled/i,
  );
});

test('production preserves its configured project without emulator wiring', () => {
  assert.deepEqual(resolveFirebaseRuntime({
    VITE_FIREBASE_PROJECT_ID: 'tictaktools',
    VITE_USE_FIREBASE_EMULATORS: 'false',
  }, false), {
    projectId: 'tictaktools',
    useEmulators: false,
  });
});
```

- [ ] **Step 2: Run the test and observe the missing module**

Run:

```powershell
node --test tests/unit/firebase-runtime.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/config/runtime.js`.

- [ ] **Step 3: Implement the minimal fail-closed resolver**

Create `src/config/runtime.js`:

```js
export const DEMO_PROJECT_ID = 'demo-fantasya';

export function resolveFirebaseRuntime(env, isDev) {
  const projectId = String(env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const useEmulators = env.VITE_USE_FIREBASE_EMULATORS === 'true';

  if (!projectId) {
    throw new Error('VITE_FIREBASE_PROJECT_ID is required.');
  }

  if (isDev && projectId !== DEMO_PROJECT_ID) {
    throw new Error(
      'Refusing to start development with Firebase project "' +
        projectId +
        '". Expected "' +
        DEMO_PROJECT_ID +
        '".',
    );
  }

  if (isDev && !useEmulators) {
    throw new Error('Firebase emulators must be enabled in development.');
  }

  return {
    projectId,
    useEmulators: isDev && useEmulators,
  };
}
```

- [ ] **Step 4: Add the unit-test script and run it**

Add to `package.json` scripts:

```json
"test:unit": "node --test tests/unit/firebase-runtime.test.js"
```

Run:

```powershell
npm run test:unit
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/runtime.js tests/unit/firebase-runtime.test.js package.json
git commit -m "test: enforce demo Firebase runtime"
```

### Task 3: Centralize Firebase services and show local mode

**Files:**
- Modify: `src/config/firebase.js`
- Create: `src/components/EnvironmentBanner.jsx`
- Modify: `src/App.jsx`
- Modify: `src/pages/LoginPage.jsx`
- Modify: `src/pages/UserProfilePage.jsx`
- Modify: `src/components/AdminTab.jsx`

**Interfaces:**
- Consumes: `resolveFirebaseRuntime(import.meta.env, import.meta.env.DEV)`.
- Produces: named exports `app`, `auth`, `db`, `functions`, `storage`, `analytics` and `isUsingEmulators`.

- [ ] **Step 1: Replace Firebase initialization with one guarded module**

Replace `src/config/firebase.js` with:

```js
import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import {
  getAnalytics,
  isSupported as isAnalyticsSupported,
} from 'firebase/analytics';
import { resolveFirebaseRuntime } from './runtime.js';

const runtime = resolveFirebaseRuntime(import.meta.env, import.meta.env.DEV);
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: runtime.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');
export const storage = getStorage(app);
export const isUsingEmulators = runtime.useEmulators;

if (isUsingEmulators && !globalThis.__FANTASYA_EMULATORS_CONNECTED__) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  globalThis.__FANTASYA_EMULATORS_CONNECTED__ = true;
}

export let analytics = null;
if (!isUsingEmulators && firebaseConfig.measurementId) {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) analytics = getAnalytics(app);
    })
    .catch((error) => {
      console.warn('Firebase Analytics no pudo inicializarse:', error?.message || error);
    });
}
```

- [ ] **Step 2: Make all existing callables consume the shared instance**

In `src/pages/LoginPage.jsx` and `src/pages/UserProfilePage.jsx` use:

```js
import { auth, db, functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
```

In `src/components/AdminTab.jsx` use:

```js
import { db, functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
```

Remove `getFunctions` from imports and delete every `const functions = getFunctions();` declaration. Keep existing `httpsCallable(functions, name)` calls.

- [ ] **Step 3: Add a visible emulator banner**

Create `src/components/EnvironmentBanner.jsx`:

```jsx
import React from 'react';
import { isUsingEmulators } from '../config/firebase';

export default function EnvironmentBanner() {
  if (!isUsingEmulators) return null;

  return (
    <div
      role="status"
      className="fixed bottom-3 right-3 z-[100] rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950 shadow-lg"
    >
      Firebase local · demo-fantasya
    </div>
  );
}
```

Import `EnvironmentBanner` in `src/App.jsx` and render `<EnvironmentBanner />` once inside `ThemeProvider`, immediately before the existing `<Router>` sibling:

```jsx
<ThemeProvider>
  <ThemedToaster />
  <EnvironmentBanner />
  <Router>
    {/* existing Routes tree remains unchanged */}
  </Router>
</ThemeProvider>
```

- [ ] **Step 4: Verify production build and unit tests**

Run:

```powershell
npm run test:unit
npm run build
```

Expected: 4 unit tests PASS and Vite exits 0 with assets under `dist/`.

- [ ] **Step 5: Commit**

```bash
git add src/config/firebase.js src/components/EnvironmentBanner.jsx src/App.jsx src/pages/LoginPage.jsx src/pages/UserProfilePage.jsx src/components/AdminTab.jsx
git commit -m "feat: centralize Firebase emulator connections"
```

### Task 4: Configure a one-command emulator session

**Files:**
- Create: `.env.development`
- Modify: `.firebaserc`
- Modify: `firebase.json`
- Modify: `.gitignore`
- Modify: `firestore.indexes.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run dev`, `npm run dev:web`, `npm run dev:emulators`, `npm run dev:seed` and `npm run test:seed`.
- `npm run dev` owns emulator start/stop and runs `dev:seed` before Vite.

- [ ] **Step 1: Add dummy development configuration**

Create `.env.development`:

```dotenv
VITE_USE_FIREBASE_EMULATORS=true
VITE_FIREBASE_API_KEY=fake-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-fantasya.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-fantasya
VITE_FIREBASE_STORAGE_BUCKET=demo-fantasya.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:fantasyalocal
```

- [ ] **Step 2: Make the harmless demo project the CLI default**

Replace `.firebaserc` with:

```json
{
  "projects": {
    "default": "demo-fantasya",
    "production": "tictaktools"
  }
}
```

- [ ] **Step 3: Add fixed emulator topology**

Append this top-level object in `firebase.json`:

```json
"emulators": {
  "auth": { "host": "127.0.0.1", "port": 9099 },
  "firestore": { "host": "127.0.0.1", "port": 8080 },
  "functions": { "host": "127.0.0.1", "port": 5001 },
  "storage": { "host": "127.0.0.1", "port": 9199 },
  "ui": { "enabled": true, "host": "127.0.0.1", "port": 4000 },
  "singleProjectMode": true
}
```

Keep the existing `functions`, `firestore` and `storage` blocks unchanged.

- [ ] **Step 4: Version indexes and ignore only generated state**

Remove `firestore.indexes.json` from `.gitignore` and add:

```gitignore
.firebase/
firebase-debug.log*
*-debug.log
functions/.env.local
functions/.secret.local
```

Move the existing `singleFieldOverrides` value in `firestore.indexes.json` into `fieldOverrides`. Add this composite query inside `indexes`:

```json
{
  "collectionGroup": "posts",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "tags", "arrayConfig": "CONTAINS" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

- [ ] **Step 5: Add cross-platform session scripts**

Merge these entries into root `package.json` scripts:

```json
"dev": "firebase emulators:exec --project demo-fantasya --only auth,firestore,functions,storage --ui \"npm run dev:session\"",
"dev:web": "vite --host 127.0.0.1 --port 5173",
"dev:emulators": "firebase emulators:start --project demo-fantasya --only auth,firestore,functions,storage",
"dev:seed": "npm --prefix functions run seed:emulators",
"dev:session": "run-s dev:seed dev:web",
"test:seed": "firebase emulators:exec --project demo-fantasya --only auth,firestore,functions,storage \"npm --prefix functions run test:seed\""
```

- [ ] **Step 6: Validate configuration without touching production**

Run:

```powershell
npx firebase emulators:start --project demo-fantasya --only auth,firestore,functions,storage
```

Expected: all four service ports are reported, UI is on 4000, project is `demo-fantasya`, and Ctrl+C stops them.

- [ ] **Step 7: Commit**

```bash
git add .env.development .firebaserc firebase.json .gitignore firestore.indexes.json package.json
git commit -m "chore: configure isolated Firebase emulators"
```

### Task 5: Seed deterministic accounts and representative data

**Files:**
- Create: `functions/lib/emulator-guard.js`
- Create: `functions/scripts/seed-emulators.js`
- Create: `functions/test/emulator-guard.test.js`
- Create: `functions/test/seed-emulators.integration.test.js`
- Modify: `functions/package.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `assertEmulatorEnvironment(env)` and async `seedEmulators()`.
- Stable UIDs: `dev-superadmin`, `dev-league-admin` and `dev-user`.
- Stable IDs: `dev-league-active`, `season-1` and `dev-league-archived`.

- [ ] **Step 1: Write the failing guard tests**

Create `functions/test/emulator-guard.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertEmulatorEnvironment } = require('../lib/emulator-guard');

const validEnv = {
  GCLOUD_PROJECT: 'demo-fantasya',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
};

test('accepts the complete demo emulator environment', () => {
  assert.doesNotThrow(() => assertEmulatorEnvironment(validEnv));
});

test('rejects production even when emulator hosts exist', () => {
  assert.throws(
    () => assertEmulatorEnvironment({
      ...validEnv,
      GCLOUD_PROJECT: 'tictaktools',
    }),
    /demo-fantasya/,
  );
});

test('rejects a missing emulator endpoint', () => {
  const env = { ...validEnv };
  delete env.FIRESTORE_EMULATOR_HOST;
  assert.throws(() => assertEmulatorEnvironment(env), /FIRESTORE_EMULATOR_HOST/);
});
```

- [ ] **Step 2: Run the guard tests and observe the missing module**

Run:

```powershell
node --test functions/test/emulator-guard.test.js
```

Expected: FAIL with `MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the server-side guard**

Create `functions/lib/emulator-guard.js`:

```js
const DEMO_PROJECT_ID = 'demo-fantasya';
const REQUIRED_HOSTS = [
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
];

function assertEmulatorEnvironment(env = process.env) {
  const projectId = env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT;
  if (projectId !== DEMO_PROJECT_ID) {
    throw new Error(
      'Seed refused project "' +
        (projectId || 'missing') +
        '"; expected "' +
        DEMO_PROJECT_ID +
        '".',
    );
  }

  for (const name of REQUIRED_HOSTS) {
    if (!env[name]) throw new Error('Seed requires ' + name + '.');
  }

  return { projectId };
}

module.exports = {
  DEMO_PROJECT_ID,
  assertEmulatorEnvironment,
};
```

- [ ] **Step 4: Implement an idempotent seed**

Create `functions/scripts/seed-emulators.js`:

```js
const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const {
  Timestamp,
  getFirestore,
} = require('firebase-admin/firestore');
const {
  DEMO_PROJECT_ID,
  assertEmulatorEnvironment,
} = require('../lib/emulator-guard');

const PASSWORD = 'FantasyaDev1!';
const USERS = [
  {
    uid: 'dev-superadmin',
    email: 'superadmin@fantasya.local',
    username: 'superadmin',
    appRole: 'superadmin',
  },
  {
    uid: 'dev-league-admin',
    email: 'league-admin@fantasya.local',
    username: 'leagueadmin',
    appRole: 'user',
  },
  {
    uid: 'dev-user',
    email: 'user@fantasya.local',
    username: 'user',
    appRole: 'user',
  },
];

function ensureAdminApp() {
  if (getApps().length === 0) {
    initializeApp({
      projectId: DEMO_PROJECT_ID,
      storageBucket: DEMO_PROJECT_ID + '.appspot.com',
    });
  }
}

async function upsertAuthUser(auth, user) {
  try {
    await auth.getUser(user.uid);
    await auth.updateUser(user.uid, {
      email: user.email,
      password: PASSWORD,
      emailVerified: true,
      displayName: user.username,
    });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      password: PASSWORD,
      emailVerified: true,
      displayName: user.username,
    });
  }
}

async function seedEmulators() {
  assertEmulatorEnvironment();
  ensureAdminApp();

  const auth = getAuth();
  const db = getFirestore();
  await Promise.all(USERS.map((user) => upsertAuthUser(auth, user)));

  const fixedDate = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
  const batch = db.batch();
  for (const user of USERS) {
    batch.set(db.doc('users/' + user.uid), {
      username: user.username,
      email: user.email,
      appRole: user.appRole,
      createdAt: fixedDate,
      photoURL: '',
      bio: 'Perfil local ' + user.username,
      xp: user.uid === 'dev-league-admin' ? 10 : user.uid === 'dev-user' ? 100 : 0,
      followers: user.uid === 'dev-user' ? ['dev-league-admin'] : [],
      following: user.uid === 'dev-league-admin' ? ['dev-user'] : [],
      pinnedTrophies: [],
      savedPosts: user.uid === 'dev-user' ? ['dev-post'] : [],
    }, { merge: true });
    batch.set(db.doc('usernames/' + user.username), {
      userId: user.uid,
    });
  }

  batch.set(db.doc('leagues/dev-league-active'), {
    name: 'Liga Local Activa',
    ownerId: 'dev-league-admin',
    activeSeason: 'season-1',
    rules: 'Datos exclusivos del emulador.',
    createdAt: fixedDate,
  }, { merge: true });

  batch.set(db.doc('leagues/dev-league-active/seasons/season-1'), {
    name: 'Temporada Local',
    seasonNumber: 1,
    status: 'Activa',
    archived: false,
    currentRound: 1,
    inviteCode: 'LOCAL1',
    createdAt: fixedDate,
    members: {
      'dev-league-admin': {
        username: 'leagueadmin',
        teamName: 'Administradores FC',
        role: 'admin',
        isPlaceholder: false,
        totalPoints: 30,
        finances: { budget: 190, teamValue: 10 },
      },
      'dev-user': {
        username: 'user',
        teamName: 'Usuarios FC',
        role: 'member',
        isPlaceholder: false,
        totalPoints: 20,
        finances: { budget: 195, teamValue: 5 },
      },
      'placeholder-rival': {
        teamName: 'Equipo Fantasma',
        role: 'member',
        isPlaceholder: true,
        totalPoints: 10,
        finances: { budget: 200, teamValue: 0 },
      },
    },
  }, { merge: true });

  batch.set(db.doc('leagues/dev-league-archived'), {
    name: 'Liga Local Archivada',
    ownerId: 'dev-league-admin',
    activeSeason: 'season-1',
    createdAt: fixedDate,
  }, { merge: true });

  batch.set(db.doc('leagues/dev-league-archived/seasons/season-1'), {
    name: 'Temporada Archivada',
    seasonNumber: 1,
    status: 'Finalizada',
    archived: true,
    inviteCode: 'OLD001',
    members: {
      'dev-league-admin': {
        username: 'leagueadmin',
        teamName: 'Históricos FC',
        role: 'admin',
        totalPoints: 100,
        finances: { budget: 150, teamValue: 50 },
      },
    },
  }, { merge: true });

  batch.set(db.doc('players/dev-player'), {
    name: 'Jugador Local',
    teamHistory: [{ teamName: 'Real Madrid', startDate: fixedDate, endDate: null }],
    positionHistory: [{ position: 'Delantero', startDate: fixedDate, endDate: null }],
  }, { merge: true });

  batch.set(db.doc('posts/dev-post'), {
    authorId: 'dev-league-admin',
    authorUsername: 'leagueadmin',
    authorPhotoURL: null,
    content: 'Publicación local determinista',
    imageURL: null,
    tags: ['local'],
    likes: ['dev-user'],
    createdAt: fixedDate,
  }, { merge: true });

  batch.set(db.doc('posts/dev-post/comments/dev-comment'), {
    authorId: 'dev-user',
    authorUsername: 'user',
    authorPhotoURL: null,
    content: 'Comentario local',
    likes: [],
    createdAt: fixedDate,
  }, { merge: true });

  batch.set(db.doc('posts/dev-post/comments/dev-comment/replies/dev-reply'), {
    authorId: 'dev-league-admin',
    authorUsername: 'leagueadmin',
    authorPhotoURL: null,
    content: 'Respuesta local',
    createdAt: fixedDate,
  }, { merge: true });

  batch.set(db.doc('users/dev-league-admin/xpEvents/post:dev-post'), {
    amount: 10,
    source: 'post',
    createdAt: fixedDate,
  });

  const trophyData = {
    seasonName: 'Temporada Local',
    leagueName: 'Liga Local Activa',
    trophies: [{
      trophyId: 'CHAMPION',
      name: 'Campeón',
      description: 'Campeón de la temporada local.',
    }],
    isPlaceholder: false,
    teamName: 'Usuarios FC',
  };
  batch.set(
    db.doc('leagues/dev-league-active/seasons/season-1/achievements/dev-user'),
    trophyData,
  );
  batch.set(db.doc('users/dev-user/achievements/season-1'), trophyData);
  batch.set(db.doc('career_achievements/dev-user'), {
    SEASONS_PLAYED_3: { current: 1 },
    CHAMPIONSHIPS_WON_3: { current: 1 },
    TOTAL_POINTS_50000: { current: 0 },
    TOTAL_TRANSFERS_100: { current: 0 },
    POSTS_CREATED_50: { current: 0 },
    LIKES_RECEIVED_500: { current: 0 },
  });

  batch.set(db.doc('leagues/dev-league-active/seasons/season-1/challenges/dev-challenge'), {
    title: 'Reto local',
    description: 'Escenario determinista de hazaña.',
    targetType: 'single',
    targetUsers: ['dev-user'],
    status: 'completed',
    winners: [{ uid: 'dev-user', teamName: 'Usuarios FC' }],
  });
  batch.set(db.doc('users/dev-user/feats/dev-challenge'), {
    instances: [{
      leagueId: 'dev-league-active',
      seasonId: 'season-1',
      leagueName: 'Liga Local Activa',
      seasonName: 'Temporada Local',
      challengeTitle: 'Reto local',
      description: 'Escenario determinista de hazaña.',
      date: fixedDate,
    }],
  });

  batch.set(db.doc('chats/dev-league-admin_dev-user'), {
    participants: ['dev-league-admin', 'dev-user'],
    createdAt: fixedDate,
    lastMessage: 'Mensaje local',
    lastMessageAt: fixedDate,
  });
  batch.set(db.doc('chats/dev-league-admin_dev-user/messages/dev-message'), {
    senderId: 'dev-league-admin',
    text: 'Mensaje local',
    createdAt: fixedDate,
    read: false,
  });

  batch.set(db.doc('config/laLigaSync'), {
    status: 'never_synced',
    playersCount: 0,
    seededAt: fixedDate,
  }, { merge: true });

  await batch.commit();
  return { users: USERS.length };
}

if (require.main === module) {
  seedEmulators()
    .then(({ users }) => console.log('Seeded demo-fantasya with ' + users + ' users.'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  PASSWORD,
  USERS,
  seedEmulators,
};
```

- [ ] **Step 5: Write the seed integration test**

Create `functions/test/seed-emulators.integration.test.js`:

```js
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
  assert.equal(trophySnap.data().trophies[0].trophyId, 'CHAMPION');
});
```

- [ ] **Step 6: Wire function scripts**

Add to `functions/package.json`:

```json
"seed:emulators": "node scripts/seed-emulators.js",
"test:unit": "node --test test/emulator-guard.test.js",
"test:seed": "node --test test/seed-emulators.integration.test.js"
```

Update root `test:unit`:

```json
"test:unit": "node --test tests/unit/firebase-runtime.test.js functions/test/emulator-guard.test.js"
```

- [ ] **Step 7: Run pure and emulator-backed tests**

Run:

```powershell
npm run test:unit
npm run test:seed
```

Expected: all tests PASS; the second seed invocation does not duplicate users or throw.

- [ ] **Step 8: Commit**

```bash
git add functions/lib/emulator-guard.js functions/scripts/seed-emulators.js functions/test functions/package.json package.json
git commit -m "feat: seed deterministic Firebase emulator data"
```

### Task 6: Document and smoke-test the local workflow

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: a clean-machine setup guide and the three local credentials.

- [ ] **Step 1: Replace the Vite template README with project instructions**

Document exactly:

```markdown
# Fantasya

## Requisitos

- Node.js 22 mediante `fnm` y `. .\scripts\activate-node22.ps1`
- npm 10 o superior
- Java 21 o superior

## Instalación

~~~powershell
. .\scripts\activate-node22.ps1
npm ci
npm --prefix functions ci
~~~

## Desarrollo local seguro

~~~powershell
npm run dev
~~~

Abre <http://127.0.0.1:5173>. La Emulator UI está en
<http://127.0.0.1:4000>. Debe verse “Firebase local · demo-fantasya”.

| Rol | Email | Contraseña |
| --- | --- | --- |
| Superadministrador | superadmin@fantasya.local | FantasyaDev1! |
| Administrador de liga | league-admin@fantasya.local | FantasyaDev1! |
| Usuario normal | user@fantasya.local | FantasyaDev1! |

Estas cuentas sólo existen en Auth Emulator. El comando aborta si el
project ID no es `demo-fantasya`.

## Comprobaciones

~~~powershell
npm run test:unit
npm run test:seed
npm run build
~~~

Los despliegues Firebase son manuales y nombran `tictaktools`
explícitamente. Mientras no exista staging, los previews de Vercel
deben tratarse como producción.
```

- [ ] **Step 2: Run the complete local verification**

Run:

```powershell
. .\scripts\activate-node22.ps1
npm ci
npm --prefix functions ci
npm run test:unit
npm run test:seed
npm run build
npm run dev
```

Expected: tests and build exit 0; all services report `demo-fantasya`; Vite shows the banner; all three accounts sign in; Ctrl+C stops every process.

- [ ] **Step 3: Confirm local scripts contain no production ID**

Run:

```powershell
rg -n "tictaktools" .env.development firebase.json functions/scripts tests
```

Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add local Firebase development guide"
```
