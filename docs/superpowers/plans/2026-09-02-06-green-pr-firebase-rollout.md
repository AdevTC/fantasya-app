# Green-PR Firebase Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed path that deploys only additive Functions from the exact green SHA of PR #3, verifies a secret-free production inventory, and documents the compatible merge/rules/legacy-retirement sequence.

**Architecture:** The existing `main`-only production guard remains authoritative for rules, indexes, Storage and deletions. A separate pre-merge guard binds a clean local branch, its upstream, one open GitHub PR, all successful checks and a full commit SHA to three ordered additive Function groups. Inventory is read through a projected Cloud Functions v2 API response and compared against exact cumulative sets without ever requesting environment variables.

**Tech Stack:** Node.js 22 ESM scripts, Git CLI, GitHub CLI, Firebase CLI 15.28.2 internals, Cloud Functions v2 REST API, Node test runner, GitHub Actions and Vercel Git Integration.

## Global Constraints

- Canonical repository is exactly `https://github.com/AdevTC/fantasya-app.git`.
- Production Firebase is exactly `tictaktools` under `jordisumba@gmail.com`.
- Pre-merge targets are exactly `functions-core-v2`, `functions-league`, and `functions-content-v2` in that order.
- No pre-merge target may include rules, indexes, Storage, sync, legacy names or deletions.
- Every mutation requires an interactive TTY, a literal confirmation containing the full SHA, and a second unchanged-state check.
- Football Data secret metadata and values are not queried by any non-sync path.
- `firebase functions:list --json` is never invoked.
- Production deployment and merge remain outside implementation; they require the release gate after this plan is verified and pushed.

## File map

- `scripts/production-preflight.mjs`: shared local/Firebase identity checks; secret lookup strictly opt-in.
- `scripts/production-functions-inventory.mjs`: projected API query, DTO sanitizer and exact stage evaluator.
- `scripts/premerge-functions-preflight.mjs`: Git/upstream/PR/check/SHA inspection and fail-closed evaluation.
- `scripts/deploy-premerge-functions.mjs`: ordered target allowlist, literal confirmation, revalidation, deploy and post-deploy inventory check.
- `scripts/deploy-production.mjs`: `main`-only targets for rules/indexes/Storage; sync group removed from the immediate workflow.
- `scripts/delete-legacy-functions.mjs`: exact three-name legacy player Function deletion.
- `tests/unit/production-guard.test.js`: main guard and deletion contract.
- `tests/unit/production-functions-inventory.test.js`: sanitizer and cumulative-stage tests.
- `tests/unit/premerge-functions-guard.test.js`: PR/check/SHA/transition tests.
- `package.json`: only guarded user-facing commands.
- `docs/development.md`: current access/capability facts without secret values.
- `docs/releases/firebase-production-runbook.md`: exact release, smoke, rollback and observation order.

---

### Task 1: Make secret inspection explicitly opt-in

**Files:**
- Modify: `scripts/production-preflight.mjs`
- Modify: `tests/unit/production-guard.test.js`

**Interfaces:**
- Produces: `inspectFirebaseIdentity({ cwd })`; `inspectProductionState({ cwd, inspectFootballSecret = false })`; `runProductionPreflight({ cwd, requireFootballSecret = false })`.

- [ ] **Step 1: Write failing source and behavior tests**

Add a pure decision helper test:

```js
assert.equal(shouldInspectFootballSecret(false), false);
assert.equal(shouldInspectFootballSecret(true), true);
```

Add a source contract that the default entrypoint calls `runProductionPreflight()` without opting into the secret and that only `requireFootballSecret: true` can reach `probeFootballSecretStatus`.

- [ ] **Step 2: Run the guard test and observe RED**

```powershell
node --test tests/unit/production-guard.test.js
```

Expected: the current implementation probes secret metadata unconditionally.

- [ ] **Step 3: Refactor without weakening the main guard**

Extract the existing login/project commands into `inspectFirebaseIdentity({ cwd })`, returning only `{ activeFirebaseAccount, firebaseProjectIds }`. Change `inspectProductionState` to initialize `secretStatus: 'not-requested'` and call `probeFootballSecretStatus` only when `inspectFootballSecret === true` and Firebase identity is valid. `runProductionPreflight` passes `inspectFootballSecret: requireFootballSecret`. `printProductionReport` prints the secret line and warnings only when status is not `not-requested`.

Use:

```js
export const shouldInspectFootballSecret = (value) => value === true;
```

Keep all current branch, origin, divergence, account and project checks unchanged.

- [ ] **Step 4: Run tests and preflight locally without network mutation**

```powershell
node --test tests/unit/production-guard.test.js
node scripts/production-preflight.mjs
```

Expected: unit tests pass; the branch preflight fails early because this is not `main`, and its output contains no `FOOTBALL_DATA_API_KEY` line.

- [ ] **Step 5: Commit**

```powershell
git add scripts/production-preflight.mjs tests/unit/production-guard.test.js
git commit -m "security: make production secret checks opt in"
```

---

### Task 2: Add a projected, secret-free Functions inventory

**Files:**
- Create: `scripts/production-functions-inventory.mjs`
- Create: `tests/unit/production-functions-inventory.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `sanitizeFunction(resource)`, `expectedNamesForStage(stage)`, `evaluateInventory(items, stage)`, `fetchSanitizedInventory({ client })`, `inspectProductionFunctions({ stage })`.

- [ ] **Step 1: Write failing sanitizer and stage tests**

Use a fixture that deliberately contains sensitive extra fields:

```js
const raw = {
  name: 'projects/tictaktools/locations/us-central1/functions/createProfileDocuments',
  state: 'ACTIVE',
  buildConfig: { runtime: 'nodejs22', environmentVariables: { SENSITIVE: 'never-print' } },
  serviceConfig: { environmentVariables: { SECRET: 'never-print' } },
};
assert.deepEqual(sanitizeFunction(raw), {
  name: 'createProfileDocuments',
  region: 'us-central1',
  runtime: 'nodejs22',
  state: 'ACTIVE',
});
assert.doesNotMatch(JSON.stringify(sanitizeFunction(raw)), /never-print|SENSITIVE|SECRET/);
```

Test exact baseline, cumulative core/league/content stages, missing names, unexpected names, duplicates, wrong region/runtime/state and unreachable regions.

- [ ] **Step 2: Run and observe RED**

```powershell
node --test tests/unit/production-functions-inventory.test.js
```

Expected: module missing.

- [ ] **Step 3: Define exact cumulative inventories**

```js
export const BASELINE_NAMES = Object.freeze([
  'clearLaLigaPlayers',
  'createOrGetChat',
  'createProfileDocuments',
  'getLaLigaSyncStatus',
  'onSeasonJoin',
  'syncLaLigaPlayers',
  'unlinkUserFromTeam',
]);
export const ADDITIVE_GROUPS = Object.freeze({
  'functions-core-v2': [
    'createProfileDocumentsV2',
    'unlinkUserFromTeamV2',
    'setUserAppRole',
    'createOrGetChatV2',
    'recalculateXp',
  ],
  'functions-league': [
    'joinSeasonByInviteCode',
    'submitJoinRequest',
    'reviewJoinRequest',
    'replaceSeasonTrophies',
    'saveSeasonChallenge',
    'deleteSeasonChallenge',
    'setChallengeWinners',
    'refreshCareerAchievements',
  ],
  'functions-content-v2': ['createPostV2', 'createTransferV2'],
});
```

Stages are `baseline`, `core-v2`, `league`, `content-v2`, and `legacy-players-removed`; each is an exact set, not a filter.

- [ ] **Step 4: Query only projected Cloud Functions fields**

Resolve the pinned Firebase CLI with `createRequire`, select `jordisumba@gmail.com` via `auth.findAccountByEmail`, and call `auth.setActiveAccount({}, account)`. Instantiate `apiv2.Client` with `functionsV2Origin()` and API version `v2`.

Page over:

```js
client.get('projects/tictaktools/locations/-/functions', {
  queryParams: {
    filter: 'environment="GEN_2"',
    fields: 'functions(name,state,buildConfig/runtime),nextPageToken,unreachable',
    pageToken,
  },
  skipLog: { queryParams: true },
});
```

Reject any non-empty `unreachable`, sanitize each item immediately, and never return or log the raw body. Catch errors and emit only `Functions inventory request failed.` without serializing the thrown object.

- [ ] **Step 5: Add a read-only command**

Expose:

```json
"production:functions:inventory": "node scripts/production-functions-inventory.mjs"
```

The CLI requires exactly one stage argument, prints the four DTO fields as a table and exits `1` on any mismatch. It does not deploy or delete.

- [ ] **Step 6: Run unit tests**

```powershell
node --test tests/unit/production-functions-inventory.test.js
```

Expected: all sanitizer, pagination and exact-stage tests pass; captured stdout/stderr contains neither fixture secret value nor extra key names.

- [ ] **Step 7: Commit**

```powershell
git add scripts/production-functions-inventory.mjs tests/unit/production-functions-inventory.test.js package.json
git commit -m "build: add sanitized production functions inventory"
```

---

### Task 3: Bind pre-merge eligibility to one exact green PR SHA

**Files:**
- Create: `scripts/premerge-functions-preflight.mjs`
- Create: `tests/unit/premerge-functions-guard.test.js`

**Interfaces:**
- Produces: `parsePullRequests(output)`, `evaluateChecks(items)`, `evaluatePremergeState(state)`, `inspectPremergeState({ cwd })`, `assertPremergeStateUnchanged(expected, { cwd })`.

- [ ] **Step 1: Write failing evaluator tests**

Define a safe fixture with clean worktree, canonical origin, non-main branch, matching upstream/head/PR SHA, one open non-draft PR to `main`, `MERGEABLE`, `CLEAN`, Firebase identity and two successful check providers.

Test rejection of each independent fault: dirty tree, `main`, missing upstream, ahead/behind, wrong origin, zero/two PRs, base other than `main`, draft, `UNKNOWN`/`CONFLICTING`, merge state other than `CLEAN`, head SHA mismatch, pending/cancelled/failing checks, absent GitHub Actions and absent Vercel.

Checks use both GitHub shapes:

```js
{ __typename: 'CheckRun', name: 'test', workflowName: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' }
{ __typename: 'StatusContext', context: 'Vercel', state: 'SUCCESS' }
```

- [ ] **Step 2: Run and observe RED**

```powershell
node --test tests/unit/premerge-functions-guard.test.js
```

Expected: module missing.

- [ ] **Step 3: Implement pure parsing and fail-closed evaluation**

`parsePullRequests` accepts only a JSON array and rejects malformed/unexpected shapes. `evaluateChecks` requires at least one successful GitHub Actions `CheckRun`, at least one successful Vercel item and no item that is pending or outside `SUCCESS`, `NEUTRAL`, `SKIPPED` terminal conclusions. `evaluatePremergeState` returns a deterministic error array and never coerces an unknown state into success.

- [ ] **Step 4: Implement read-only inspection**

Using argument arrays rather than shell strings:

1. read branch, status, HEAD, origin and upstream;
2. fetch `origin`, `main` and the branch name returned by step 1 as separate `spawnSync` arguments;
3. compare `HEAD...@{upstream}` and require zero/zero;
4. invoke `gh pr list --repo AdevTC/fantasya-app --head codex/firebase-safe-development --base main --state open --limit 2 --json number,url,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup`, while the implementation substitutes the safely captured branch argument rather than a shell string;
5. reuse the sanitized Firebase account/project probe from `production-preflight.mjs` with secret inspection disabled.

The recheck repeats fetch, Git state, PR query and checks, then compares the full expected SHA and PR number.

- [ ] **Step 5: Run evaluator tests and a read-only live preflight**

```powershell
node --test tests/unit/premerge-functions-guard.test.js
node scripts/premerge-functions-preflight.mjs
```

Expected: unit tests pass. The live preflight may report the current branch dirty until all implementation commits exist; it must make no remote mutation and print no secret metadata.

- [ ] **Step 6: Commit**

```powershell
git add scripts/premerge-functions-preflight.mjs tests/unit/premerge-functions-guard.test.js
git commit -m "build: bind function deploys to a green pr sha"
```

---

### Task 4: Add the ordered pre-merge deploy wrapper

**Files:**
- Create: `scripts/deploy-premerge-functions.mjs`
- Modify: `tests/unit/premerge-functions-guard.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: premerge state/recheck, `ADDITIVE_GROUPS`, exact inventory stages, `spawnFirebaseCli`.
- Produces: `PREMERGE_TRANSITIONS`, `confirmationForPremergeTarget(target, sha)`, `buildPremergeDeployArguments(target)`.

- [ ] **Step 1: Write failing allowlist/transition tests**

```js
assert.deepEqual(Object.keys(PREMERGE_TRANSITIONS), [
  'functions-core-v2',
  'functions-league',
  'functions-content-v2',
]);
assert.deepEqual(PREMERGE_TRANSITIONS['functions-core-v2'], { from: 'baseline', to: 'core-v2' });
assert.deepEqual(PREMERGE_TRANSITIONS['functions-league'], { from: 'core-v2', to: 'league' });
assert.deepEqual(PREMERGE_TRANSITIONS['functions-content-v2'], { from: 'league', to: 'content-v2' });
assert.match(confirmationForPremergeTarget('functions-core-v2', SHA), new RegExp(SHA));
assert.throws(() => buildPremergeDeployArguments('functions-sync'), /Unknown pre-merge target/);
```

Also spawn the script without a TTY and require failure before GitHub/Firebase calls.

- [ ] **Step 2: Run and observe RED**

```powershell
node --test tests/unit/premerge-functions-guard.test.js
```

Expected: wrapper module missing.

- [ ] **Step 3: Implement the ordered interactive wrapper**

For exactly one target argument:

1. require stdin/stdout TTY;
2. run and print premerge report;
3. fetch sanitized inventory and require the transition's `from` stage;
4. ask for the exact string produced by `` `deploy tictaktools ${target} ${report.state.commit}` ``;
5. rerun `assertPremergeStateUnchanged`;
6. re-fetch inventory and require the same `from` stage;
7. spawn pinned Firebase CLI with project, account and exact comma-separated allowlist;
8. on exit `0`, fetch inventory and require the `to` stage;
9. print only sanitized inventory rows.

Never accept a raw `--only` value from argv.

- [ ] **Step 4: Expose only bounded npm commands**

```json
"production:preflight:pr": "node scripts/premerge-functions-preflight.mjs",
"deploy:prod:pr:functions:core-v2": "node scripts/deploy-premerge-functions.mjs functions-core-v2",
"deploy:prod:pr:functions:league": "node scripts/deploy-premerge-functions.mjs functions-league",
"deploy:prod:pr:functions:content-v2": "node scripts/deploy-premerge-functions.mjs functions-content-v2"
```

Remove the old immediate `deploy:prod:functions:core` and `deploy:prod:functions:sync` scripts. Keep `deploy:prod:indexes`, `deploy:prod:firestore`, `deploy:prod:storage` on the `main`-only wrapper.

- [ ] **Step 5: Run all release-tool tests**

```powershell
node --test tests/unit/production-guard.test.js tests/unit/production-functions-inventory.test.js tests/unit/premerge-functions-guard.test.js
```

Expected: all pass; noninteractive mutation entrypoints fail closed.

- [ ] **Step 6: Commit**

```powershell
git add scripts/deploy-premerge-functions.mjs tests/unit/premerge-functions-guard.test.js package.json
git commit -m "build: deploy additive functions from an exact pr sha"
```

---

### Task 5: Correct legacy deletion and release documentation

**Files:**
- Modify: `scripts/delete-legacy-functions.mjs`
- Modify: `tests/unit/production-guard.test.js`
- Modify: `docs/releases/firebase-production-runbook.md`
- Modify: `docs/development.md`

**Interfaces:**
- Produces: deletion allowlist exactly `syncLaLigaPlayers`, `getLaLigaSyncStatus`, `clearLaLigaPlayers`; current executable runbook.

- [ ] **Step 1: Write the failing deletion contract**

```js
assert.equal(
  LEGACY_DELETE_CONFIRMATION,
  'delete tictaktools syncLaLigaPlayers getLaLigaSyncStatus clearLaLigaPlayers',
);
assert.deepEqual(LEGACY_DELETE_ARGUMENTS.slice(1, 4), [
  'syncLaLigaPlayers',
  'getLaLigaSyncStatus',
  'clearLaLigaPlayers',
]);
```

- [ ] **Step 2: Run and observe RED**

```powershell
node --test tests/unit/production-guard.test.js
```

Expected: current deletion list contains only two names.

- [ ] **Step 3: Update deletion without executing it**

Add only `clearLaLigaPlayers` to the literal prompt and Firebase argument array. Do not add a generic function-name parameter. Keep `main`-only preflight, interactive TTY and unchanged-state recheck.

- [ ] **Step 4: Rewrite the runbook to the approved order**

Document these exact phases:

1. exact-SHA premerge groups `core-v2`, `league`, `content-v2`;
2. merge commit only after all three inventories pass;
3. wait for `main` CI and Vercel SHA;
4. read-only smoke;
5. indexes, Firestore rules and Storage from synchronized `main`, one approval/group;
6. rollback after rules: restore and verify legacy rules first while V2 frontend remains live, then publish frontend revert;
7. observe all three legacy player Functions for at least 24 hours and delete none unless all show zero calls;
8. rotate the externally exposed Football Data credential in a later dedicated task before any reactivation;
9. state accurately that `onSeasonJoin` exists and remains untouched.

Remove the false requirement that Football Data secret metadata be present for this release and prohibit `functions:list --json`.

- [ ] **Step 5: Update access documentation**

In `docs/development.md`, mark Football Data integration disabled/deferred, Firebase CLI access available, GitHub/Vercel Git deployment available without a Pro seat, and Vercel project settings still owner-only. Mention the credential-rotation requirement without any value.

- [ ] **Step 6: Run tests and search for stale dangerous guidance**

```powershell
node --test tests/unit/production-guard.test.js
rg -n "functions:list --json|No existe una Function `onSeasonJoin`|deploy:prod:functions:sync|FOOTBALL_DATA_API_KEY metadata: present" docs package.json scripts
```

Expected: test passes; no executable/current guidance contains those stale instructions. Historical design/plan documents may mention old decisions and are not rewritten.

- [ ] **Step 7: Commit**

```powershell
git add scripts/delete-legacy-functions.mjs tests/unit/production-guard.test.js docs/releases/firebase-production-runbook.md docs/development.md
git commit -m "docs: align production runbook with additive rollout"
```

---

### Task 6: Full verification and remote readiness

**Files:**
- Modify only when a failing test identifies a scoped regression.

**Interfaces:**
- Produces: clean branch, complete verification evidence and a single release SHA suitable for push and PR checks.

- [ ] **Step 1: Run the full verification gate twice**

```powershell
npm run verify
npm run verify
```

Expected: both runs exit `0`; all unit, rules, Functions, build, syntax and lint-budget checks pass.

- [ ] **Step 2: Prove there is no deployment escape hatch or secret output path**

```powershell
rg -n "functions:list --json|functions:secrets:access|firebase deploy|functions:delete" package.json scripts docs/releases docs/development.md
rg -n "FOOTBALL_DATA_API_KEY\s*=\s*[^\s]" . -g "!node_modules/**" -g "!functions/node_modules/**"
```

Expected: Firebase mutations appear only inside guarded wrappers/runbook examples; no secret value assignment exists.

- [ ] **Step 3: Inspect Git state and diff**

```powershell
git diff --check origin/main...HEAD
git status --short --branch
git log --oneline --decorate -15
```

Expected: clean worktree and only intentional commits.

- [ ] **Step 4: Stop at the implementation boundary**

Do not push, deploy, delete or merge in this task. If verification found a regression, reopen the task owning that exact file, add a reproducing test, rerun its focused command and create `fix: close additive rollout verification gap` before repeating Steps 1-3. Production actions begin only after the verified commit is reviewed and explicitly authorized.
