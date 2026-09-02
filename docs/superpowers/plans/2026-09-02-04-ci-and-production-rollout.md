# CI and Production Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el setup local y las correcciones de seguridad en una entrega reproducible, verificable y reversible, sin depender de una plaza Pro de Vercel ni desplegar accidentalmente sobre Firebase real.

**Architecture:** GitHub Actions reproduce Node 22 + Java 21 y ejecuta una sola sesión completa de emuladores. Un wrapper local es la única vía documentada de despliegue Firebase y exige proyecto, cuenta, rama y confirmación literal. Producción se migra por compatibilidad: Functions nuevas, frontend, reglas/índices y, tras observación, retirada de endpoints antiguos.

**Tech Stack:** GitHub Actions, `actions/checkout@v6`, `actions/setup-node@v6`, `actions/setup-java@v5`, Firebase CLI 15.28.2, Emulator Suite, Node 22 y Vercel Git Integration.

## Global Constraints

- Ejecutar primero los planes 01, 02 y 03 y partir con todos sus gates verdes.
- CI jamás recibe credenciales de Firebase real, API de fútbol ni Vercel.
- CI usa exclusivamente `demo-fantasya` y fixture offline.
- Toda orden de producción lleva `--project tictaktools`; nunca depende del alias por defecto.
- El wrapper rechaza una rama distinta de `main`, un árbol sucio, un upstream divergente y una cuenta Firebase distinta de `jordisumba@gmail.com`.
- Ningún paso de este plan hace `git push`, merge, despliegue Firebase, cambio de secreto o borrado de Function sin aprobación explícita en el momento de ejecutarlo.
- Los endpoints HTTP antiguos siguen vivos durante la ventana de compatibilidad.
- El repositorio `AdevTC/fantasya-app` es público y el frontend no añade variables Vercel nuevas; no hace falta invitar la cuenta del desarrollador al proyecto Hobby.
- Si Vercel solicita autorización para una preview de fork, el propietario puede autorizar esa preview concreta; eso no equivale a añadir un miembro Pro.

---

## Verified External Assumptions

- Vercel despliega automáticamente repositorios conectados; las restricciones de autor único del plan Hobby documentadas para repositorios privados no convierten en miembro al colaborador de un repositorio público: <https://vercel.com/docs/git>.
- La conexión existente conserva sus variables de entorno; sólo el propietario de Vercel sería necesario para cambiarlas o administrar dominio/configuración.
- Firebase permite comprobar metadatos de un secreto sin revelar su valor con `functions:secrets:get`, mientras que `functions:secrets:access` sí revela el valor y no se usa: <https://firebase.google.com/docs/functions/config-env>.
- Firebase CLI 15 exige Java 21; CI fija Temurin 21.

## File Structure

- `.github/workflows/ci.yml`: build y regresión completa local.
- `scripts/check-eslint-budget.mjs`: evita aumentar la deuda lint conocida.
- `scripts/production-preflight.mjs`: comprobaciones de sólo lectura previas a un release.
- `scripts/deploy-production.mjs`: wrapper interactivo y fail-closed de Firebase.
- `.env.production.example`: nombres requeridos sin valores sensibles.
- `docs/development.md`: setup operativo y matriz de accesos.
- `docs/releases/firebase-production-runbook.md`: orden, smoke y rollback.
- `package.json`: gates y comandos explícitos de preflight/deploy.

### Task 1: Consolidate tests into one emulator session

**Files:**
- Modify: `functions/package.json`
- Modify: `package.json`

**Interfaces:**
- `npm run test:ci` starts one Auth/Firestore/Functions/Storage suite and runs every deterministic test serially.
- `npm run verify` performs local tests, build, function syntax and lint-budget checks.

- [ ] **Step 1: Add a serial Functions aggregate**

Add to `functions/package.json`:

```json
"check": "node --check index.js",
"test:all": "node --test --test-concurrency=1 test/emulator-guard.test.js test/seed-emulators.integration.test.js test/authz.integration.test.js test/profile.integration.test.js test/roles.integration.test.js test/xp.integration.test.js test/player-sync.integration.test.js test/season-authz.integration.test.js test/membership.integration.test.js test/season-awards.integration.test.js"
```

Keep the narrower test commands added by earlier plans.

- [ ] **Step 2: Add root inside-emulator aggregates**

Add to root `package.json`:

```json
"test:rules:inside": "node --test --test-concurrency=1 tests/rules/users-admin.test.js tests/rules/leagues.test.js tests/rules/social-chat.test.js tests/rules/storage.test.js",
"test:functions:inside": "npm --prefix functions run test:all",
"test:inside-emulators": "run-s dev:seed test:unit test:rules:inside test:functions:inside",
"test:ci": "firebase emulators:exec --project demo-fantasya --only auth,firestore,functions,storage \"npm run test:inside-emulators\"",
"check:functions": "npm --prefix functions run check",
"verify": "run-s test:ci build check:functions lint:budget"
```

Do not compose `test:ci` from the earlier wrapper scripts because that would start and stop the suite repeatedly.

- [ ] **Step 3: Run the consolidated gate twice**

```powershell
npm run test:ci
npm run test:ci
```

Expected: both executions exit 0; the second proves seed and handlers do not depend on residue from the first.

- [ ] **Step 4: Commit**

```powershell
git add package.json functions/package.json
git commit -m "test: consolidate Firebase emulator regression suite"
```

### Task 2: Put a non-regression budget around existing lint debt

**Files:**
- Create: `scripts/check-eslint-budget.mjs`
- Modify: `package.json`

**Interfaces:**
- Initial ceiling: 83 errors and 12 warnings, the audited pre-setup baseline.
- A lower result passes; any higher error or warning count fails.

- [ ] **Step 1: Write a failing unit test for count evaluation**

Create `tests/unit/eslint-budget.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBudget } from '../../scripts/check-eslint-budget.mjs';

test('passes at or below the legacy budget', () => {
  assert.deepEqual(evaluateBudget({ errors: 82, warnings: 12 }), { ok: true, over: [] });
});

test('fails each regression independently', () => {
  assert.deepEqual(evaluateBudget({ errors: 84, warnings: 13 }), {
    ok: false,
    over: ['errors 84 > 83', 'warnings 13 > 12'],
  });
});
```

Run `npm run test:unit`; expected FAIL because the script does not exist.

- [ ] **Step 2: Implement the budget script**

Create `scripts/check-eslint-budget.mjs`:

```js
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const LINT_BUDGET = Object.freeze({ errors: 83, warnings: 12 });

export function evaluateBudget({ errors, warnings }, budget = LINT_BUDGET) {
  const over = [];
  if (errors > budget.errors) over.push(`errors ${errors} > ${budget.errors}`);
  if (warnings > budget.warnings) over.push(`warnings ${warnings} > ${budget.warnings}`);
  return { ok: over.length === 0, over };
}

export function runEslint() {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['eslint', '.', '--format', 'json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (!result.stdout) {
    throw new Error(result.stderr || 'ESLint no produjo salida JSON.');
  }
  const report = JSON.parse(result.stdout);
  return report.reduce(
    (totals, item) => ({
      errors: totals.errors + item.errorCount,
      warnings: totals.warnings + item.warningCount,
    }),
    { errors: 0, warnings: 0 },
  );
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntrypoint) {
  const counts = runEslint();
  const evaluation = evaluateBudget(counts);
  console.log(`ESLint: ${counts.errors} errors, ${counts.warnings} warnings`);
  if (!evaluation.ok) {
    console.error(`Lint debt increased: ${evaluation.over.join(', ')}`);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 3: Add and validate the script**

Add:

```json
"test:unit": "node --test tests/unit/firebase-runtime.test.js tests/unit/eslint-budget.test.js functions/test/emulator-guard.test.js",
"lint:budget": "node scripts/check-eslint-budget.mjs"
```

Run:

```powershell
npm run test:unit
npm run lint:budget
```

Expected: unit tests pass. If plans 01-03 reduced counts, keep the original ceiling in this commit; lowering the ceiling is a separate mechanical follow-up after the release.

- [ ] **Step 4: Commit**

```powershell
git add scripts/check-eslint-budget.mjs tests/unit/eslint-budget.test.js package.json
git commit -m "ci: prevent new lint debt"
```

### Task 3: Add credential-free GitHub CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Runs on pull requests and pushes to `main`.
- Uses only checked-in fixture data and the demo project.

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - name: Check out repository
        uses: actions/checkout@v6

      - name: Set up Node
        uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: |
            package-lock.json
            functions/package-lock.json

      - name: Set up Java for Firebase emulators
        uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: '21'

      - name: Install web dependencies
        run: npm ci

      - name: Install Functions dependencies
        run: npm --prefix functions ci

      - name: Configure unused local fixture secret
        run: cp functions/.secret.local.example functions/.secret.local

      - name: Verify application
        env:
          CI: 'true'
        run: npm run verify
```

- [ ] **Step 2: Prove the workflow has no production references**

```powershell
rg -n "tictaktools|FIREBASE_TOKEN|GOOGLE_APPLICATION_CREDENTIALS|FOOTBALL_DATA_API_KEY|VERCEL_TOKEN" .github/workflows
```

Expected: no matches.

- [ ] **Step 3: Validate YAML and local parity**

Run `npm run verify` locally. Read `.github/workflows/ci.yml` once and confirm the `${{ ... }}` expressions were not expanded by PowerShell while editing.

- [ ] **Step 4: Commit without pushing**

```powershell
git add .github/workflows/ci.yml
git commit -m "ci: verify Fantasya with Firebase emulators"
```

### Task 4: Add a fail-closed production preflight and deploy wrapper

**Files:**
- Create: `scripts/production-preflight.mjs`
- Create: `scripts/deploy-production.mjs`
- Create: `scripts/delete-legacy-functions.mjs`
- Create: `tests/unit/production-guard.test.js`
- Create: `.env.production.example`
- Modify: `package.json`
- Modify: `functions/package.json`

**Interfaces:**
- `npm run production:preflight` is read-only.
- Three bounded Functions groups plus `deploy:prod:firestore`, `deploy:prod:storage` and `deploy:prod:indexes` are interactive and explicit.

- [ ] **Step 1: Write pure guard tests**

Create `tests/unit/production-guard.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProductionState } from '../../scripts/production-preflight.mjs';

const safe = {
  branch: 'main',
  clean: true,
  ahead: 0,
  behind: 0,
  activeFirebaseAccount: 'jordisumba@gmail.com',
  firebaseProjectIds: ['tictaktools'],
};

test('accepts the exact production identity', () => {
  assert.deepEqual(evaluateProductionState(safe), []);
});

test('rejects dirty, divergent, wrong-account and missing-project state', () => {
  const errors = evaluateProductionState({
    ...safe,
    branch: 'feature/setup', clean: false, ahead: 1, behind: 2,
    activeFirebaseAccount: 'another@example.com', firebaseProjectIds: [],
  });
  assert.equal(errors.length, 6);
});
```

- [ ] **Step 2: Implement read-only preflight**

`scripts/production-preflight.mjs` exports `evaluateProductionState` and, as an entrypoint, gathers:

```js
const EXPECTED = Object.freeze({
  branch: 'main',
  firebaseAccount: 'jordisumba@gmail.com',
  firebaseProject: 'tictaktools',
});

export function evaluateProductionState(state) {
  const errors = [];
  if (state.branch !== EXPECTED.branch) errors.push(`branch must be ${EXPECTED.branch}`);
  if (!state.clean) errors.push('working tree must be clean');
  if (state.ahead !== 0) errors.push('local main must not be ahead of origin/main');
  if (state.behind !== 0) errors.push('local main must not be behind origin/main');
  if (String(state.activeFirebaseAccount || '').toLowerCase() !== EXPECTED.firebaseAccount) errors.push('required Firebase account is not active');
  if (!state.firebaseProjectIds.includes(EXPECTED.firebaseProject)) errors.push('production Firebase project is not visible');
  return errors;
}
```

First run `git fetch --quiet origin main` so the comparison cannot use a stale remote-tracking ref. Then use `spawnSync` with argument arrays, never a shell string, for:

- `git branch --show-current`;
- `git status --porcelain`;
- `git rev-list --left-right --count origin/main...main`;
- `firebase login:list --json`, reading the entry marked active rather than merely accepting any saved account;
- `firebase projects:list --json`;
- `firebase functions:secrets:get FOOTBALL_DATA_API_KEY --project tictaktools`.

The last command contributes `secretStatus: present | missing` to the printed report, but never prints or invokes `functions:secrets:access`. Missing secret is a warning for fixture-only/local operation and a blocking error for Functions production deployment.

- [ ] **Step 3: Implement the interactive wrapper**

`scripts/deploy-production.mjs` accepts exactly one target from this map:

```js
const TARGETS = Object.freeze({
  'functions-core': [
    'functions:createProfileDocuments',
    'functions:setUserAppRole',
    'functions:createOrGetChat',
    'functions:onPostCreatedAwardXp',
    'functions:onTransferCreatedAwardXp',
    'functions:recalculateXp',
  ].join(','),
  'functions-sync': [
    'functions:syncLaLigaPlayersV2',
    'functions:getLaLigaSyncStatusV2',
  ].join(','),
  'functions-league': [
    'functions:joinSeasonByInviteCode',
    'functions:submitJoinRequest',
    'functions:reviewJoinRequest',
    'functions:replaceSeasonTrophies',
    'functions:saveSeasonChallenge',
    'functions:deleteSeasonChallenge',
    'functions:setChallengeWinners',
    'functions:refreshCareerAchievements',
  ].join(','),
  firestore: 'firestore:rules',
  indexes: 'firestore:indexes',
  storage: 'storage',
});
```

It must:

1. reject non-interactive stdin;
2. execute the preflight and stop on any error;
3. require the literal answer `deploy tictaktools <target>`;
4. spawn the local Firebase binary with `deploy --project tictaktools --only <mapped target>`;
5. preserve the child exit code.

Use `node_modules/.bin/firebase.cmd` on Windows and `node_modules/.bin/firebase` elsewhere so the pinned CLI is always used.

Create `scripts/delete-legacy-functions.mjs` with the same TTY and preflight functions. It accepts no arguments, requires the literal answer `delete tictaktools syncLaLigaPlayers getLaLigaSyncStatus`, then spawns only:

```js
[
  'functions:delete',
  'syncLaLigaPlayers',
  'getLaLigaSyncStatus',
  '--region',
  'us-central1',
  '--project',
  'tictaktools',
]
```

It preserves the Firebase child exit code and has no generic function-name input.

- [ ] **Step 4: Add explicit scripts and public env schema**

Add to `package.json`:

```json
"test:unit": "node --test tests/unit/firebase-runtime.test.js tests/unit/eslint-budget.test.js tests/unit/production-guard.test.js functions/test/emulator-guard.test.js",
"production:preflight": "node scripts/production-preflight.mjs",
"deploy:prod:functions:core": "node scripts/deploy-production.mjs functions-core",
"deploy:prod:functions:sync": "node scripts/deploy-production.mjs functions-sync",
"deploy:prod:functions:league": "node scripts/deploy-production.mjs functions-league",
"deploy:prod:firestore": "node scripts/deploy-production.mjs firestore",
"deploy:prod:indexes": "node scripts/deploy-production.mjs indexes",
"deploy:prod:storage": "node scripts/deploy-production.mjs storage",
"delete:prod:functions:legacy-sync": "node scripts/delete-legacy-functions.mjs"
```

Delete the original unguarded root scripts `firebase:deploy:rules`, `firebase:deploy:firestore`, `firebase:deploy:functions` and `firebase:deploy:all`. Delete the unguarded `deploy` script from `functions/package.json`; production deployment must enter through the root wrapper. Keep `firebase:login`, `serve`, `shell`, `start` and `logs` because they do not deploy production state.

Create `.env.production.example` with names only:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=tictaktools
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_ADSENSE_PUBLISHER_ID=
VITE_ADSENSE_DASHBOARD_FOOTER_SLOT=
```

Firebase web config values are identifiers, not server credentials, but the existing Vercel values remain canonical; do not copy values out of Vercel or commit a populated file.

- [ ] **Step 5: Test fail-closed behavior**

```powershell
npm run test:unit
npm run production:preflight
```

Before `main` is pushed, expected preflight result is a deliberate failure stating that local `main` is ahead of `origin/main`. That proves it cannot deploy unpublished code. Do not override it.

- [ ] **Step 6: Commit**

```powershell
git add scripts/production-preflight.mjs scripts/deploy-production.mjs scripts/delete-legacy-functions.mjs tests/unit/production-guard.test.js .env.production.example package.json functions/package.json
git commit -m "build: guard production Firebase deployments"
```

### Task 5: Document exact access requirements and daily development

**Files:**
- Create: `docs/development.md`
- Modify: `README.md`

- [ ] **Step 1: Write the current access matrix**

Include this table in `docs/development.md`:

| Capability | Needed for local setup | Current status | Account/action |
| --- | --- | --- | --- |
| Clone, branch, PR and push | Yes | Available | GitHub `JordiSRodriguez`, write on public `AdevTC/fantasya-app` |
| Auth/Firestore/Functions/Storage emulators | Yes | Available, no cloud login required at runtime | `demo-fantasya` |
| Firebase production read/deploy | Only for release | Available | `jordisumba@gmail.com`, project `tictaktools` |
| Football-data live sync | Only for production live sync | Secret metadata must pass preflight | Existing key or login at football-data.org if the secret is missing |
| Vercel source deployment | Only after merge/push | Existing Git integration; verify its GitHub check | No separate member seat required for current public-repo workflow |
| Vercel env/domain/settings | Only when settings change | Not available to Jordi | Project owner must perform the change; Pro is not needed merely to accept code |
| Gmail | Not required | Not inspected | Firebase CLI authentication is sufficient |

State clearly that the frontend has no new Vercel environment names, so the current owner does not need to prepare anything for local implementation.

- [ ] **Step 2: Document the daily loop**

Use exact commands:

```powershell
. .\scripts\activate-node22.ps1
npm ci
npm --prefix functions ci
npm run dev
```

Document Emulator UI at `http://127.0.0.1:4000`, app at `http://127.0.0.1:5173`, the three seed accounts, `npm run verify`, and how to stop the session with Ctrl+C.

- [ ] **Step 3: Link from README and commit**

```powershell
git add README.md
git add -f docs/development.md
git commit -m "docs: add development access and workflow guide"
```

### Task 6: Prepare the compatibility-first production runbook

**Files:**
- Create: `docs/releases/firebase-production-runbook.md`

**Interfaces:**
- This task writes a runbook only; it does not push or deploy.

- [ ] **Step 1: Record release prerequisites**

The runbook starts with a hard gate:

```text
1. `npm run verify` exits 0 on Node 22 / Java 21.
2. GitHub CI is green on the exact release commit.
3. `main` is clean and equal to `origin/main`.
4. `npm run production:preflight` exits 0.
5. `functions:secrets:get FOOTBALL_DATA_API_KEY` reports an enabled version.
6. A Firebase Console tab for tictaktools is available for logs only; secret values are never displayed.
7. The Vercel GitHub deployment check is present on the release commit.
```

If prerequisite 5 fails, stop and ask for the football-data.org API key. Set it interactively with:

```powershell
npx firebase functions:secrets:set FOOTBALL_DATA_API_KEY --project tictaktools
```

Do not put the value in chat, command history, `.env`, GitHub, Vercel or the runbook.

- [ ] **Step 2: Define Phase A — deploy additive Functions**

Run only after explicit approval:

```powershell
npm run deploy:prod:functions:core
npm run deploy:prod:functions:sync
npm run deploy:prod:functions:league
```

Each group contains at most eight Functions, following Firebase's current recommendation to avoid large all-at-once deployments. A failure stops the phase; do not continue with the next group until the failed group is healthy.

Verify `firebase functions:list --project tictaktools` contains at least:

```text
createProfileDocuments
setUserAppRole
recalculateXp
syncLaLigaPlayersV2
getLaLigaSyncStatusV2
joinSeasonByInviteCode
submitJoinRequest
reviewJoinRequest
replaceSeasonTrophies
saveSeasonChallenge
deleteSeasonChallenge
setChallengeWinners
refreshCareerAchievements
```

Also verify the XP triggers and existing `onSeasonJoin`, `unlinkUserFromTeam`, `createOrGetChat`, `syncLaLigaPlayers`, and `getLaLigaSyncStatus` remain deployed. Check logs for a cold-start/syntax failure; do not proceed on error.

- [ ] **Step 3: Define Phase B — release frontend through GitHub/Vercel**

After the release commit/PR is intentionally pushed or merged, record its SHA:

```powershell
git rev-parse HEAD
gh api repos/AdevTC/fantasya-app/commits/HEAD/check-runs
```

Wait for both GitHub CI and Vercel to succeed. The repository is public, so no Vercel Pro seat is part of this route. If a fork preview asks for authorization, the owner authorizes only that deployment. If the production build reports a missing existing `VITE_*` variable, stop and ask the Vercel owner to restore it; do not create a second Vercel project as a workaround.

Smoke on `https://fantasya-app.vercel.app` before tightening rules:

- sign in and sign out;
- load dashboard, an existing league, profile, feed and chat list;
- edit profile bio and restore it;
- create/like/unlike/delete a disposable post;
- open the Superadmin sync status and execute fixture only in local, never fixture against production.

- [ ] **Step 4: Define Phase C — deploy indexes and restrictive rules**

After Phase B passes:

```powershell
npm run deploy:prod:indexes
npm run deploy:prod:firestore
npm run deploy:prod:storage
```

Repeat the smoke plus:

- rename own team and restore it;
- update own finances and restore them;
- send a normal chat message to a consenting participant;
- upload and remove a profile image only if the user wants that visible change;
- have a league admin process one genuine pending request only if one already exists; otherwise leave this covered by emulator tests.

Read Functions logs for permission errors. A missing optional real-world scenario is not permission to manufacture production data.

- [ ] **Step 5: Define rollback without destructive Git operations**

If the frontend fails before rules deploy, revert the release commit/merge through a new `git revert` commit and let Vercel redeploy.

If rules fail, use the last known-good Git commit as source, restore its `firestore.rules`, `storage.rules` and `firestore.indexes.json` in a new revert commit, then run the guarded deploy scripts. Never use `git reset --hard`.

If Functions fail, keep old HTTP endpoints and revert the Functions changes in Git, then redeploy only the affected bounded group with the wrapper. Do not delete new function names during incident response unless the old frontend is already restored.

- [ ] **Step 6: Define Phase D — remove compatibility endpoints after observation**

Require all of these gates:

- at least 48 hours since Phase C;
- no calls to `syncLaLigaPlayers` or `getLaLigaSyncStatus` in production logs during the last 24 hours;
- no permission-denied spike attributable to the new rules;
- owner confirms the current production UI is the new release.

Then remove both old HTTP exports and their hardcoded Cloud Run client code if any survived `rg`. Commit the removal. After a fresh explicit user approval, run the bounded deletion wrapper:

```powershell
npm run delete:prod:functions:legacy-sync
```

Review that the prompt names exactly `syncLaLigaPlayers` and `getLaLigaSyncStatus`; type its full literal confirmation and do not accept any other deletion.

- [ ] **Step 7: Commit the runbook without executing it**

```powershell
git add -f docs/releases/firebase-production-runbook.md
git commit -m "docs: add staged Firebase production runbook"
```

### Task 7: Final readiness review

**Files:**
- Modify only files that fail the checks above.

- [ ] **Step 1: Run the entire local gate**

```powershell
. .\scripts\activate-node22.ps1
node --version
java -version
npm ci
npm --prefix functions ci
npm run verify
git status --short
```

Expected: Node 22, Java 21+, `verify` exit 0, and no generated/untracked file except intentionally ignored emulator logs.

- [ ] **Step 2: Search for forbidden production shortcuts**

```powershell
rg -n "https://.*cloudfunctions.net|run.app|sync-laliga-players|get-laliga-sync-status" src
rg -n "firebase deploy(?!.*--project tictaktools)" package.json scripts docs -g "*.json" -g "*.mjs" -g "*.md"
rg -n "FOOTBALL_DATA_API_KEY\s*=\s*[^\s]" . -g "!node_modules/**" -g "!functions/node_modules/**"
```

Expected: no client Cloud Run endpoints, no unguarded production script and no populated secret. If ripgrep reports that lookahead is unsupported, rerun the deploy search without lookahead and inspect each match manually.

- [ ] **Step 3: Review repository state and commits**

```powershell
git status --short --branch
git log --oneline --decorate -20
git diff origin/main...HEAD --stat
```

Expected: clean tree, only planned commits, no production deploy, no push performed by this plan.

- [ ] **Step 4: Stop for user release authorization**

Report the exact local commit SHA, verification results, missing access if any, and the staged release order. Do not proceed to push, merge, Vercel authorization, secret creation or Firebase deployment until the user explicitly chooses that next action.

---

## Acceptance Checklist

- [ ] One credential-free GitHub job reproduces the complete emulator suite.
- [ ] Lint debt cannot increase silently.
- [ ] Production wrappers fail closed on wrong branch, dirty/divergent Git, wrong Firebase account/project or missing live-sync secret.
- [ ] Local development requires no Vercel, Gmail, production database or third-party API login.
- [ ] The access guide distinguishes code deployment from Vercel project administration.
- [ ] The public Git workflow avoids a paid Vercel member seat.
- [ ] Functions, frontend and rules have an additive rollout and a Git-based rollback.
- [ ] Old endpoints are removed only after the explicit 48-hour compatibility gate.
- [ ] No push, merge, secret mutation or production deployment happens without a fresh explicit approval.
