# Post-Release Firebase Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the corrected chat query behavior and make the production runbook fail closed against the unsafe Firestore rollback and low-traffic legacy-Function retirement.

**Architecture:** Add regression assertions to the existing Firestore emulator suite without changing production rules. Treat the release runbook as an executable safety contract through its existing unit test, then update the documented rollback and retirement gates to match the verified production incident evidence.

**Tech Stack:** Node.js 22, Node test runner, Firebase Rules Unit Testing, Firestore emulator, Markdown runbook contracts.

## Global Constraints

- Do not modify or deploy `firestore.rules`, `storage.rules`, Functions, indexes, Vercel, IAM, or production data.
- Keep `syncLaLigaPlayers`, `getLaLigaSyncStatus`, and `clearLaLigaPlayers` deployed.
- Never describe commit `f42effd` as a safe rollback target.
- Zero legacy calls alone are insufficient when the application has no meaningful production usage.
- Require at least 30 continuous days of observation plus meaningful current-release usage before legacy deletion can be considered.
- Any legacy deletion remains a separate destructive action requiring a new explicit approval.

## File map

- `tests/rules/social-chat.test.js`: verifies the production chat-list query returns exactly the member's chat and rejects a query scoped to another UID.
- `tests/unit/release-runbook-observability.test.js`: executable contract for the safe rollback and low-traffic retirement gates.
- `docs/releases/firebase-production-runbook.md`: current operational procedure for rollback and legacy retirement.

---

### Task 1: Strengthen the production chat-query regression

**Files:**
- Modify: `tests/rules/social-chat.test.js:1-136`

**Interfaces:**
- Consumes: the existing `IDS.chat`, `IDS.member`, `IDS.outsider` fixture and the production `array-contains` query shape.
- Produces: exact result-set and negative-query assertions with no production-code changes.

- [ ] **Step 1: Capture the current focused baseline**

Run:

```powershell
. .\scripts\activate-node22.ps1
node scripts/run-with-firebase-emulators.mjs "node --test --test-concurrency=1 tests/rules/social-chat.test.js"
```

Expected: the current suite passes before the coverage-only change.

- [ ] **Step 2: Add exact result and negative-query assertions**

Import strict assertions:

```js
import assert from 'node:assert/strict';
```

Replace the existing production-query assertion with:

```js
const result = await assertSucceeds(getDocs(ownChats));
assert.deepEqual(result.docs.map((snapshot) => snapshot.id), [IDS.chat]);

const anotherUsersChats = query(
  collection(memberDb, 'chats'),
  where('participants', 'array-contains', IDS.outsider),
);
await assertFails(getDocs(anotherUsersChats));
```

- [ ] **Step 3: Verify the focused rules suite**

Run:

```powershell
. .\scripts\activate-node22.ps1
node scripts/run-with-firebase-emulators.mjs "node --test --test-concurrency=1 tests/rules/social-chat.test.js"
```

Expected: every `social-chat` test passes, including the exact member result and rejected cross-user query.

- [ ] **Step 4: Commit**

```powershell
git add tests/rules/social-chat.test.js
git commit -m "test: strengthen chat list query coverage"
```

---

### Task 2: Make rollback and legacy retirement fail closed

**Files:**
- Modify: `tests/unit/release-runbook-observability.test.js`
- Modify: `docs/releases/firebase-production-runbook.md:1-28,188-346,357-367`

**Interfaces:**
- Produces: a tested runbook that rejects the unsafe rules rollback and requires a 30-day, usage-backed legacy observation window.

- [ ] **Step 1: Write failing runbook contract assertions**

Add a test that requires the runbook to identify `f42effd` as prohibited and to state that no broad legacy ruleset is a pre-approved rollback:

```js
test('prohibits the unsafe Firestore rollback from being reused', () => {
  assert.match(runbook, /`f42effd`[\s\S]*no (?:es|constituye)[\s\S]*rollback seguro/i);
  assert.match(runbook, /no existe[\s\S]*ruleset legacy[\s\S]*preaprobado/i);
  assert.doesNotMatch(runbook, /últimos archivos de reglas legacy conocidos como buenos/i);
});
```

Extend the retirement contract with:

```js
assert.match(runbook, /al menos 30 días continuos/i);
assert.match(runbook, /cero (?:llamadas|solicitudes)[\s\S]*no (?:basta|es suficiente)/i);
assert.match(runbook, /uso significativo[\s\S]*versión actual/i);
assert.match(runbook, /catálogo de jugadores[\s\S]*sólo lectura/i);
assert.match(runbook, /si no hay uso significativo[\s\S]*no borrar/i);
```

- [ ] **Step 2: Run the unit contract and observe RED**

Run:

```powershell
. .\scripts\activate-node22.ps1
node --test tests/unit/release-runbook-observability.test.js
```

Expected: FAIL because the current runbook still calls 24 hours sufficient and describes a generic legacy-rules restoration.

- [ ] **Step 3: Correct the rollback procedure**

Update phase 6 to state all of the following explicitly:

- `f42effd` is not a safe rollback target and must never be redeployed;
- it temporarily reopened client mutations including privileged user fields and chat membership;
- no broad legacy ruleset is pre-approved;
- prefer a reviewed forward fix based on the current verified rules;
- if an older frontend truly requires a compatibility rules change, create and test a narrow compatibility commit before publishing that frontend;
- do not weaken rules ad hoc during an incident.

- [ ] **Step 4: Correct the retirement gate for a low-traffic friends application**

Keep the existing Cloud Run metric, timeout, sampling-delay and pagination procedure, but change the minimum retirement gate to:

- `END_UTC = T0 + 30 días`;
- at least 30 continuous days;
- zero calls for all three legacy services;
- evidence that the exact current frontend SHA received meaningful authenticated use during the window;
- one controlled smoke of the player catalogue loading from Firestore in read-only mode without invoking a legacy service;
- no deletion when activity is absent or consists only of audits/smokes;
- deletion still requires a separate destructive approval.

Update the release-record checklist to store only sanitized evidence, never user identifiers, tokens, or secrets.

- [ ] **Step 5: Run the focused unit and rules tests**

Run:

```powershell
. .\scripts\activate-node22.ps1
node --test tests/unit/release-runbook-observability.test.js
node scripts/run-with-firebase-emulators.mjs "node --test --test-concurrency=1 tests/rules/social-chat.test.js"
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```powershell
git add tests/unit/release-runbook-observability.test.js docs/releases/firebase-production-runbook.md
git commit -m "docs: harden rollback and legacy retirement gates"
```

---

### Task 3: Verify the complete branch

**Files:**
- Modify only if a failing verification identifies a scoped regression.

**Interfaces:**
- Produces: a clean hardening branch with full local verification evidence and no production mutation.

- [ ] **Step 1: Run the full verification gate**

Run:

```powershell
. .\scripts\activate-node22.ps1
npm run verify
```

Expected: exit `0`; all unit, rules, Functions, build, syntax, and lint-budget checks pass.

- [ ] **Step 2: Inspect the final diff and repository state**

Run:

```powershell
git diff --check main...HEAD
git status --short --branch
git log --oneline main..HEAD
```

Expected: no whitespace errors, no uncommitted files, and only the planned hardening commits.

- [ ] **Step 3: Review before any remote action**

Generate a branch diff package and obtain a whole-branch code review. Do not push, open a PR, merge, deploy, or delete Functions as part of this task without a later explicit workflow step.
