# League, Chat, Feed, and Storage Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endurecer ligas, temporadas, solicitudes, chat, feed y Storage sin perder ninguna operación visible de la aplicación, moviendo al backend las mutaciones que abarcan varios documentos o identidades.

**Architecture:** Firestore Rules permite al cliente sólo mutaciones locales y demostrables: editar campos propios, alternar el UID propio en una reacción y escribir mensajes como participante. Las incorporaciones, revisiones, trofeos y retos pasan por callable Functions V2 con handlers transaccionales. Storage consulta como máximo un documento Firestore para autorizar chat o temporada y valida tipo y tamaño del fichero.

**Tech Stack:** Firebase Functions v2, Firebase Admin 12.6.0, Firebase JS 11.10.0, Firestore/Storage Emulator, `@firebase/rules-unit-testing` 4.0.1 y Node test runner.

## Global Constraints

- Ejecutar primero los planes 01 y 02.
- Todos los tests usan `demo-fantasya`; ninguna tarea lee o escribe `tictaktools`.
- `ownerId`, no `creatorId`, es el campo canónico de propietario de liga.
- La entrada mediante código conserva los dos caminos existentes: crear equipo o reclamar un `placeholder`.
- La solicitud a un administrador sigue disponible y su revisión es atómica.
- Un miembro normal sólo puede editar `teamName`, `photoURL` y `finances` de su propia entrada; nunca `role`, `totalPoints`, `players` ni entradas ajenas.
- Sólo un participante puede leer un chat o sus ficheros; `participants` no puede cambiarse desde el cliente.
- Un like sólo puede añadir o retirar el UID del actor.
- Las imágenes admitidas son JPEG, PNG, WebP o GIF y pesan como máximo 5 MiB.
- Los cálculos de trofeos pueden seguir en el cliente en esta iteración, pero sólo un administrador de temporada puede enviar el resultado y el backend valida destinatarios y replica los documentos.
- No se despliega a producción durante este plan.

---

## File Structure

- `functions/lib/season-authz.js`: lectura y comprobación uniforme de propietario, administrador y miembro.
- `functions/handlers/membership.js`: unión por código, envío y revisión de solicitudes.
- `functions/handlers/season-awards.js`: escritura atómica de trofeos y hazañas.
- `src/services/league-api.js`: única capa callable para mutaciones cruzadas.
- `tests/rules/leagues.test.js`: matriz de permisos de liga y temporada.
- `tests/rules/social-chat.test.js`: seguidores, likes, moderación y chats.
- `tests/rules/storage.test.js`: rutas, pertenencia, MIME y tamaño.
- `functions/test/membership.integration.test.js`: idempotencia y autorización de altas/revisiones.
- `functions/test/season-awards.integration.test.js`: réplica coherente de trofeos/retos.
- `firestore.rules` y `storage.rules`: política completa de cliente.

### Task 1: Add reusable season authorization and league-rule tests

**Files:**
- Create: `functions/lib/season-authz.js`
- Create: `tests/rules/leagues.test.js`
- Modify: `tests/rules/test-env.js`

**Interfaces:**
- Produces: `getSeasonContext({ leagueId, seasonId }, firestore) -> { leagueRef, league, seasonRef, season }`.
- Produces: `requireSeasonAdmin(uid, context)` and `requireLeagueOwner(uid, context)`.

- [ ] **Step 1: Extend the shared rules fixture**

Add the following IDs and documents to the seed used by `tests/rules/test-env.js`:

```js
export const IDS = Object.freeze({
  superadmin: 'dev-superadmin',
  admin: 'dev-league-admin',
  member: 'dev-user',
  outsider: 'dev-outsider',
  league: 'dev-league-active',
  season: 'season-1',
  placeholder: 'placeholder-rival',
  chat: 'dev-league-admin_dev-user',
});

export async function seedLeagueFixture(testEnv) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', IDS.superadmin), {
      username: 'superadmin', appRole: 'superadmin', followers: [], following: [], savedPosts: [], pinnedTrophies: [], xp: 0,
    });
    await setDoc(doc(db, 'users', IDS.admin), {
      username: 'leagueadmin', appRole: 'user', followers: [], following: [], savedPosts: [], pinnedTrophies: [], xp: 0,
    });
    await setDoc(doc(db, 'users', IDS.member), {
      username: 'member', appRole: 'user', followers: [], following: [], savedPosts: [], pinnedTrophies: [], xp: 0,
    });
    await setDoc(doc(db, 'users', IDS.outsider), {
      username: 'outsider', appRole: 'user', followers: [], following: [], savedPosts: [], pinnedTrophies: [], xp: 0,
    });
    await setDoc(doc(db, 'leagues', IDS.league), {
      name: 'Liga local', ownerId: IDS.admin, activeSeason: IDS.season,
    });
    await setDoc(doc(db, 'leagues', IDS.league, 'seasons', IDS.season), {
      name: 'Temporada local',
      seasonNumber: 1,
      inviteCode: 'LOCAL1',
      members: {
        [IDS.admin]: {
          username: 'leagueadmin', teamName: 'Admins FC', role: 'admin', totalPoints: 0,
          finances: { budget: 200, teamValue: 0 },
        },
        [IDS.member]: {
          username: 'member', teamName: 'Members FC', role: 'member', totalPoints: 0,
          finances: { budget: 200, teamValue: 0 },
        },
        [IDS.placeholder]: {
          teamName: 'Equipo Fantasma', role: 'member', isPlaceholder: true, totalPoints: 10,
          finances: { budget: 200, teamValue: 0 },
        },
      },
    });
  });
}
```

Import `setDoc` and `doc` from `firebase/firestore`. Call `seedLeagueFixture(testEnv)` from each suite after `clearFirestore()`.

- [ ] **Step 2: Write the failing league permission matrix**

Create `tests/rules/leagues.test.js` with these cases, using `assertSucceeds`/`assertFails`:

```js
test('league creation binds ownerId to the actor', async () => {
  const db = env.authenticatedContext(IDS.member).firestore();
  await assertSucceeds(setDoc(doc(db, 'leagues', 'owned-by-member'), {
    name: 'Nueva liga', ownerId: IDS.member, activeSeason: 'season_1',
  }));
  await assertFails(setDoc(doc(db, 'leagues', 'forged-owner'), {
    name: 'Liga falsa', ownerId: IDS.admin, activeSeason: 'season_1',
  }));
});

test('owner can create a valid initial season in the same batch', async () => {
  const db = env.authenticatedContext(IDS.member).firestore();
  const leagueRef = doc(db, 'leagues', 'atomic-league');
  const seasonRef = doc(leagueRef, 'seasons', 'season_1');
  const batch = writeBatch(db);
  batch.set(leagueRef, { name: 'Atómica', ownerId: IDS.member, activeSeason: 'season_1' });
  batch.set(seasonRef, {
    name: 'Temporada 1', seasonNumber: 1, inviteCode: 'ATOM01',
    members: {
      [IDS.member]: {
        username: 'member', teamName: 'Atomic FC', role: 'admin', totalPoints: 0,
        finances: { budget: 200, teamValue: 0 },
      },
    },
  });
  await assertSucceeds(batch.commit());
});

test('member can edit only own safe member fields', async () => {
  const db = env.authenticatedContext(IDS.member).firestore();
  const seasonRef = doc(db, 'leagues', IDS.league, 'seasons', IDS.season);
  await assertSucceeds(updateDoc(seasonRef, {
    [`members.${IDS.member}.teamName`]: 'Nuevo nombre',
    [`members.${IDS.member}.finances`]: { budget: 190, teamValue: 10 },
  }));
  await assertFails(updateDoc(seasonRef, { [`members.${IDS.member}.role`]: 'admin' }));
  await assertFails(updateDoc(seasonRef, { [`members.${IDS.member}.totalPoints`]: 9999 }));
  await assertFails(updateDoc(seasonRef, { [`members.${IDS.admin}.teamName`]: 'Secuestrado' }));
});

test('member may leave only by removing itself and owner membership is invariant', async () => {
  const memberDb = env.authenticatedContext(IDS.member).firestore();
  await assertSucceeds(updateDoc(
    doc(memberDb, 'leagues', IDS.league, 'seasons', IDS.season),
    { [`members.${IDS.member}`]: deleteField() },
  ));

  const adminDb = env.authenticatedContext(IDS.admin).firestore();
  await assertFails(updateDoc(
    doc(adminDb, 'leagues', IDS.league, 'seasons', IDS.season),
    { [`members.${IDS.admin}`]: deleteField() },
  ));
  await assertFails(updateDoc(
    doc(adminDb, 'leagues', IDS.league, 'seasons', IDS.season),
    { [`members.${IDS.admin}.role`]: 'member' },
  ));
});

test('outsider cannot add itself directly and member cannot write transfers', async () => {
  const outsiderDb = env.authenticatedContext(IDS.outsider).firestore();
  const seasonRef = doc(outsiderDb, 'leagues', IDS.league, 'seasons', IDS.season);
  await assertFails(updateDoc(seasonRef, {
    [`members.${IDS.outsider}`]: { username: 'outsider', teamName: 'Injected', role: 'admin' },
  }));

  const memberDb = env.authenticatedContext(IDS.member).firestore();
  await assertFails(setDoc(doc(memberDb, 'leagues', IDS.league, 'seasons', IDS.season, 'transfers', 'forged'), {
    buyerId: IDS.member, sellerId: 'market', price: 1,
  }));
});

test('admin keeps operational access and ownerId controls deletion', async () => {
  const adminDb = env.authenticatedContext(IDS.admin).firestore();
  const memberDb = env.authenticatedContext(IDS.member).firestore();
  await assertFails(updateDoc(doc(adminDb, 'leagues', IDS.league), { ownerId: IDS.member }));
  await assertSucceeds(updateDoc(doc(adminDb, 'leagues', IDS.league, 'seasons', IDS.season), { archived: true }));
  await assertSucceeds(setDoc(doc(adminDb, 'leagues', IDS.league, 'seasons', IDS.season, 'transfers', 'valid'), {
    buyerId: IDS.member, sellerId: 'market', price: 10,
  }));
  await assertFails(deleteDoc(doc(memberDb, 'leagues', IDS.league)));
  await assertSucceeds(deleteDoc(doc(adminDb, 'leagues', IDS.league)));
});
```

Import `deleteDoc`, `deleteField`, `doc`, `setDoc`, `updateDoc`, and `writeBatch` from `firebase/firestore`.

- [ ] **Step 3: Run and observe the security failures**

Run:

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,storage "node --test tests/rules/leagues.test.js"
```

Expected: at least the forged owner, role escalation, outsider self-join, member transfer and owner deletion assertions fail against the current rules.

- [ ] **Step 4: Implement the server authorization helper**

Create `functions/lib/season-authz.js`:

```js
const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('./firebase');

async function getSeasonContext({ leagueId, seasonId }, firestore = db) {
  if (typeof leagueId !== 'string' || typeof seasonId !== 'string' || !leagueId || !seasonId) {
    throw new HttpsError('invalid-argument', 'leagueId y seasonId son obligatorios.');
  }
  const leagueRef = firestore.doc(`leagues/${leagueId}`);
  const seasonRef = leagueRef.collection('seasons').doc(seasonId);
  const [leagueSnapshot, seasonSnapshot] = await Promise.all([leagueRef.get(), seasonRef.get()]);
  if (!leagueSnapshot.exists || !seasonSnapshot.exists) {
    throw new HttpsError('not-found', 'La liga o la temporada no existe.');
  }
  return {
    leagueRef,
    league: leagueSnapshot.data(),
    seasonRef,
    season: seasonSnapshot.data(),
  };
}

function requireLeagueOwner(uid, context) {
  if (context.league.ownerId !== uid) {
    throw new HttpsError('permission-denied', 'Debes ser propietario de la liga.');
  }
  return uid;
}

function requireSeasonAdmin(uid, context) {
  const member = context.season.members?.[uid];
  if (context.league.ownerId !== uid && member?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Debes administrar esta temporada.');
  }
  return uid;
}

module.exports = { getSeasonContext, requireLeagueOwner, requireSeasonAdmin };
```

- [ ] **Step 5: Commit the red rules tests and green helper tests**

Add a small `functions/test/season-authz.integration.test.js` that covers owner, admin, member and missing season, then run it inside Auth/Firestore/Storage emulators.

```powershell
git add functions/lib/season-authz.js functions/test/season-authz.integration.test.js tests/rules/test-env.js tests/rules/leagues.test.js
git commit -m "test: define league authorization matrix"
```

### Task 2: Enforce least privilege in league and season rules

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/rules/leagues.test.js`

**Interfaces:**
- Firestore client remains able to create a league plus its initial season atomically.
- Direct joining is denied; plan callables use Admin SDK and bypass client rules.

- [ ] **Step 1: Replace the league helper and match blocks**

Keep unrelated collection matches, but replace league helpers and the `/leagues/{leagueId}` block with policy equivalent to:

```rules
function isSuperAdmin() {
  return isAuthenticated()
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.appRole == 'superadmin';
}

function leagueAfter(leagueId) {
  return getAfter(/databases/$(database)/documents/leagues/$(leagueId)).data;
}

function seasonData(leagueId, seasonId) {
  return get(/databases/$(database)/documents/leagues/$(leagueId)/seasons/$(seasonId)).data;
}

function isLeagueOwner(leagueId) {
  return isAuthenticated()
    && get(/databases/$(database)/documents/leagues/$(leagueId)).data.ownerId == request.auth.uid;
}

function isLeagueOwnerAfter(leagueId) {
  return isAuthenticated() && leagueAfter(leagueId).ownerId == request.auth.uid;
}

function isLeagueMember(leagueId, seasonId) {
  return isAuthenticated() && request.auth.uid in seasonData(leagueId, seasonId).members;
}

function isLeagueAdmin(leagueId, seasonId) {
  return isLeagueMember(leagueId, seasonId)
    && seasonData(leagueId, seasonId).members[request.auth.uid].role == 'admin';
}

function changesOnlyOwnMember() {
  return request.resource.data.diff(resource.data).affectedKeys().hasOnly(['members'])
    && request.resource.data.members.diff(resource.data.members).affectedKeys().hasOnly([request.auth.uid])
    && request.resource.data.members[request.auth.uid]
      .diff(resource.data.members[request.auth.uid]).affectedKeys()
      .hasOnly(['teamName', 'photoURL', 'finances']);
}

function removesOnlyOwnMembership(leagueId) {
  return request.auth.uid != get(
      /databases/$(database)/documents/leagues/$(leagueId)
    ).data.ownerId
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['members'])
    && request.resource.data.members.diff(resource.data.members).affectedKeys().hasOnly([request.auth.uid])
    && request.auth.uid in resource.data.members
    && !(request.auth.uid in request.resource.data.members);
}

function preservesLeagueOwner(leagueId) {
  let ownerId = get(
    /databases/$(database)/documents/leagues/$(leagueId)
  ).data.ownerId;
  return ownerId in request.resource.data.members
    && request.resource.data.members[ownerId].role == 'admin';
}

match /leagues/{leagueId} {
  allow read: if true;
  allow create: if isAuthenticated()
    && request.resource.data.ownerId == request.auth.uid
    && request.resource.data.keys().hasAll(['name', 'ownerId', 'activeSeason']);
  allow update: if request.resource.data.ownerId == resource.data.ownerId
    && (isLeagueOwner(leagueId)
      || (resource.data.activeSeason != null
        && isLeagueAdmin(leagueId, resource.data.activeSeason)));
  allow delete: if isLeagueOwner(leagueId);

  match /seasons/{seasonId} {
    allow read: if isAuthenticated();
    allow create: if isLeagueOwnerAfter(leagueId)
      && request.resource.data.keys().hasAll(['name', 'seasonNumber', 'inviteCode', 'members'])
      && request.auth.uid in request.resource.data.members
      && request.resource.data.members[request.auth.uid].role == 'admin';
    allow update: if (isLeagueOwner(leagueId) || isLeagueAdmin(leagueId, seasonId))
      && preservesLeagueOwner(leagueId);
    allow update: if isLeagueMember(leagueId, seasonId) && changesOnlyOwnMember();
    allow update: if isLeagueMember(leagueId, seasonId)
      && removesOnlyOwnMembership(leagueId);
    allow delete: if isLeagueOwner(leagueId);

    match /members/{userId} {
      allow read: if isLeagueMember(leagueId, seasonId);
      allow write: if false;
    }

    match /rounds/{roundId} {
      allow read: if isAuthenticated();
      allow write: if isLeagueAdmin(leagueId, seasonId);
    }

    match /lineups/{lineupId} {
      allow read: if isAuthenticated();
      allow create, update: if isLeagueAdmin(leagueId, seasonId)
        || (isLeagueMember(leagueId, seasonId)
          && lineupId.matches('.*-' + request.auth.uid + '$'));
      allow delete: if isLeagueAdmin(leagueId, seasonId);
    }

    match /transfers/{transferId} {
      allow read: if isLeagueMember(leagueId, seasonId);
      allow write: if isLeagueAdmin(leagueId, seasonId);
    }

    match /achievements/{userId} {
      allow read: if isAuthenticated();
      allow write: if false;
    }

    match /challenges/{challengeId} {
      allow read: if isAuthenticated();
      allow write: if false;
    }

    match /joinRequests/{requestId} {
      allow create, update, delete: if false;
      allow read: if isLeagueAdmin(leagueId, seasonId)
        || (isAuthenticated() && resource.data.userId == request.auth.uid);
    }

    match /porra/{porraId} {
      allow read: if isAuthenticated();
      allow write: if isLeagueAdmin(leagueId, seasonId);

      match /predictions/{predictionId} {
        allow read: if isAuthenticated();
        allow create, update: if isLeagueAdmin(leagueId, seasonId)
          || (isLeagueMember(leagueId, seasonId)
            && predictionId == request.auth.uid);
        allow delete: if isLeagueAdmin(leagueId, seasonId);
      }
    }
  }
}
```

`PorraTab.jsx` currently builds `predictionRef` as `doc(porraRef, 'predictions', userToSubmitFor)`, so `predictionId` is the target UID. The admin branch above intentionally preserves the existing UI that lets an administrator submit for another member.

- [ ] **Step 2: Verify bounded self-removal**

The audit found no visible leave-season action, but the approved data contract supports it safely. Run `rg -n "leave|abandonar|salir.*liga|members.*deleteField" src`; the existing match should remain the administrator kick in `AdminTab.jsx`. The rules test above proves a member can remove exactly its own entry, while neither owner nor administrator can delete/demote the owner through the broad admin update branch.

- [ ] **Step 3: Run the full league rules test**

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,storage "node --test tests/rules/leagues.test.js"
```

Expected: all league cases pass.

- [ ] **Step 4: Validate rule syntax and commit**

```powershell
npx firebase emulators:exec --project demo-fantasya --only firestore "node -e \"console.log('Firestore rules compiled')\""
git add firestore.rules tests/rules/leagues.test.js
git commit -m "fix: restrict league and season writes"
```

### Task 3: Move both join flows to atomic callable handlers

**Files:**
- Create: `functions/handlers/membership.js`
- Create: `functions/test/membership.integration.test.js`
- Create: `src/services/league-api.js`
- Modify: `functions/index.js`
- Modify: `src/components/JoinLeagueModal.jsx`
- Modify: `src/components/RequestJoinModal.jsx`
- Modify: `src/components/AdminTab.jsx`
- Modify: `src/pages/ChatPage.jsx`

**Interfaces:**
- `joinSeasonByInviteCode({ leagueId, seasonId, inviteCode, mode, teamName?, placeholderId? })`.
- `submitJoinRequest({ leagueId, seasonId, adminId, teamName, message })`.
- `reviewJoinRequest({ leagueId, seasonId, requestId, action, messageId? })` where `action` is `approve` or `reject`.

- [ ] **Step 1: Write integration tests before handlers**

Cover all of these assertions in `functions/test/membership.integration.test.js`:

```js
test('invite join creates a safe member and is idempotent', async () => {
  const first = await joinSeasonByInviteCodeHandler({
    uid: 'dev-superadmin',
    data: { leagueId: 'dev-league-active', seasonId: 'season-1', inviteCode: 'local1', mode: 'create', teamName: 'Outsiders FC' },
  });
  assert.equal(first.joined, true);
  const second = await joinSeasonByInviteCodeHandler({
    uid: 'dev-superadmin',
    data: { leagueId: 'dev-league-active', seasonId: 'season-1', inviteCode: 'LOCAL1', mode: 'create', teamName: 'Outsiders FC' },
  });
  assert.equal(second.alreadyMember, true);
  const season = await db.doc('leagues/dev-league-active/seasons/season-1').get();
  assert.equal(season.data().members['dev-superadmin'].role, 'member');
  assert.equal(season.data().members['dev-superadmin'].totalPoints, 0);
});

test('placeholder claim preserves history and completes migration', async () => {
  const result = await joinSeasonByInviteCodeHandler({
    uid: 'dev-superadmin',
    data: { leagueId: 'dev-league-active', seasonId: 'season-1', inviteCode: 'LOCAL1', mode: 'claim', placeholderId: 'placeholder-rival' },
  });
  assert.equal(result.claimedPlaceholderId, 'placeholder-rival');
  await eventually(async () => {
    const season = await db.doc('leagues/dev-league-active/seasons/season-1').get();
    assert.equal(season.data().members['dev-superadmin'].totalPoints, 10);
    assert.equal(season.data().members['placeholder-rival'], undefined);
    assert.equal(season.data().members['dev-superadmin'].claimedPlaceholderId, undefined);
  });
});

test('request review atomically changes request, membership and chat message', async () => {
  const submitted = await submitJoinRequestHandler({
    uid: 'dev-superadmin',
    data: { leagueId: 'dev-league-active', seasonId: 'season-1', adminId: 'dev-league-admin', teamName: 'Request FC', message: 'Hola' },
  });
  const reviewed = await reviewJoinRequestHandler({
    uid: 'dev-league-admin',
    data: { leagueId: 'dev-league-active', seasonId: 'season-1', requestId: submitted.requestId, action: 'approve', messageId: submitted.messageId },
  });
  assert.equal(reviewed.status, 'approved');
  const [request, season, message] = await Promise.all([
    db.doc(`leagues/dev-league-active/seasons/season-1/joinRequests/${submitted.requestId}`).get(),
    db.doc('leagues/dev-league-active/seasons/season-1').get(),
    db.doc(`chats/${submitted.chatId}/messages/${submitted.messageId}`).get(),
  ]);
  assert.equal(request.data().status, 'approved');
  assert.equal(season.data().members['dev-superadmin'].role, 'member');
  assert.equal(message.data().requestStatus, 'approved');
});
```

Also assert wrong code, duplicate team name, stolen placeholder, non-admin review, invalid action and second review all reject with the expected `HttpsError.code`.

Define `eventually` at the top of the test file to retry only assertion failures for up to 5 seconds with a 50 ms interval. This waits for the retained `onSeasonJoin` trigger; it must throw the last assertion error on timeout and must not swallow handler errors.

- [ ] **Step 2: Implement input normalization and transaction boundaries**

In `functions/handlers/membership.js`, export plain handlers accepting `{ uid, data }` plus an optional Firestore dependency. Use these exact invariants:

```js
const TEAM_NAME_MAX = 24;

function cleanTeamName(value) {
  const teamName = typeof value === 'string' ? value.trim() : '';
  if (!teamName || teamName.length > TEAM_NAME_MAX) {
    throw new HttpsError('invalid-argument', 'El nombre del equipo debe tener entre 1 y 24 caracteres.');
  }
  return teamName;
}

function memberFromProfile(profile, teamName, extra = {}) {
  return {
    ...extra,
    username: profile.username,
    teamName,
    photoURL: profile.photoURL || '',
    role: 'member',
    isPlaceholder: false,
  };
}
```

For a new team, call `memberFromProfile(profile, teamName, { totalPoints: 0, finances: { budget: 200, teamValue: 0 } })`.

`joinSeasonByInviteCodeHandler` must perform all reads before the single transaction write. Normalize the code with `trim().toUpperCase()`, compare it to the current season, verify the profile exists, reject an existing non-idempotent conflict, and ensure no case-insensitive duplicate `teamName` exists. For `claim`, pass the placeholder as `extra`; the helper ordering above then preserves points/players/finances but force-overwrites identity, `role` and `isPlaceholder`. Exclude the selected placeholder itself from the duplicate-name check and set `claimedPlaceholderId` for the existing `onSeasonJoin` migration trigger.

`submitJoinRequestHandler` must derive `username` and photo from `users/{uid}`, verify `adminId` is currently an admin, and use the deterministic request ref `seasonRef.collection('joinRequests').doc(uid)`. Repeating an identical pending submission returns its existing IDs; a different payload while one is pending throws `already-exists`; a rejected request may be replaced by a fresh pending submission. Trim `message` and reject more than 500 characters. Preallocate the message ref so one transaction creates:

```js
const requestData = {
  userId: uid,
  username: profile.username,
  teamName,
  message: cleanMessage,
  status: 'pending',
  createdAt: FieldValue.serverTimestamp(),
  chatId,
  adminId,
  messageId: messageRef.id,
};

const requestMessage = {
  senderId: uid,
  text: `¡Hola! Me gustaría unirme a la liga "${context.league.name}" con el equipo "${teamName}"${cleanMessage ? `. Mensaje: ${cleanMessage}` : ''}`,
  createdAt: FieldValue.serverTimestamp(),
  read: false,
  isJoinRequest: true,
  requestId: requestRef.id,
  leagueId,
  seasonId,
  requestStatus: 'pending',
};
```

`reviewJoinRequestHandler` must re-read the request and season inside a transaction, call `requireSeasonAdmin`, require `status == 'pending'`, require the requested user not yet be a member on approval, and update request, season, original message and a generated system-notification message in the same transaction. The canonical original-message path comes from `request.chatId` plus `request.messageId`; if `ChatPage` supplies `messageId`, require it to equal the canonical value. `AdminTab` can omit it without a query.

- [ ] **Step 3: Export callable V2 wrappers**

In `functions/index.js`, import `onCall` only once and export:

```js
exports.joinSeasonByInviteCode = onCall({ region: 'us-central1' }, async (request) =>
  joinSeasonByInviteCodeHandler({ uid: requireAuth(request), data: request.data }));

exports.submitJoinRequest = onCall({ region: 'us-central1' }, async (request) =>
  submitJoinRequestHandler({ uid: requireAuth(request), data: request.data }));

exports.reviewJoinRequest = onCall({ region: 'us-central1' }, async (request) =>
  reviewJoinRequestHandler({ uid: requireAuth(request), data: request.data }));
```

- [ ] **Step 4: Centralize the client API**

Create `src/services/league-api.js`:

```js
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const call = (name, data) => httpsCallable(functions, name)(data).then(({ data: result }) => result);

export const joinSeasonByInviteCode = (input) => call('joinSeasonByInviteCode', input);
export const submitJoinRequest = (input) => call('submitJoinRequest', input);
export const reviewJoinRequest = (input) => call('reviewJoinRequest', input);
```

- [ ] **Step 5: Replace direct client mutations**

In `JoinLeagueModal.jsx`, keep its discovery screen read-only but replace the Firestore transaction with `joinSeasonByInviteCode`. Send `leagueToJoin.id`, `seasonToJoin.id`, the typed invite code, and either `{ mode: 'claim', placeholderId: selectedClaim }` or `{ mode: 'create', teamName }`.

In `RequestJoinModal.jsx`, remove direct chat/request writes and call `submitJoinRequest`; navigate to `result.chatId`.

In both `AdminTab.jsx` and `ChatPage.jsx`, delete duplicated approval batches and call `reviewJoinRequest`. `ChatPage` passes `message.id`; `AdminTab` omits it. Keep current confirmation dialogs and toasts.

- [ ] **Step 6: Run handler and UI gates**

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,functions,storage "node --test functions/test/membership.integration.test.js"
npm run build
```

Expected: tests and build exit 0, and `rg -n "members\.\$\{|joinRequests.*addDoc|requestStatus.*updateDoc" src` finds no direct membership/review mutation.

- [ ] **Step 7: Commit**

```powershell
git add functions/handlers/membership.js functions/test/membership.integration.test.js functions/index.js src/services/league-api.js src/components/JoinLeagueModal.jsx src/components/RequestJoinModal.jsx src/components/AdminTab.jsx src/pages/ChatPage.jsx
git commit -m "feat: make league membership changes atomic"
```

### Task 4: Restrict chats to participants

**Files:**
- Modify: `functions/index.js`
- Modify: `firestore.rules`
- Modify: `tests/rules/social-chat.test.js`
- Modify: `src/pages/UserProfilePage.jsx`

**Interfaces:**
- `createOrGetChat` stays callable and returns `{ chatId }`.
- Chat clients can only update `lastMessage` and `lastMessageAt`; message updates are server-only.

- [ ] **Step 1: Write failing chat tests**

Seed a canonical chat with `participants: [IDS.admin, IDS.member]`, then cover:

```js
test('only participants can read a chat and its messages', async () => {
  const memberDb = env.authenticatedContext(IDS.member).firestore();
  const outsiderDb = env.authenticatedContext(IDS.outsider).firestore();
  await assertSucceeds(getDoc(doc(memberDb, 'chats', IDS.chat)));
  await assertFails(getDoc(doc(outsiderDb, 'chats', IDS.chat)));
  await assertFails(getDocs(collection(outsiderDb, 'chats', IDS.chat, 'messages')));
});

test('participant may send as self but cannot replace participants or request status', async () => {
  const memberDb = env.authenticatedContext(IDS.member).firestore();
  await assertSucceeds(addDoc(collection(memberDb, 'chats', IDS.chat, 'messages'), {
    senderId: IDS.member, text: 'Hola', createdAt: serverTimestamp(), read: false,
  }));
  await assertFails(addDoc(collection(memberDb, 'chats', IDS.chat, 'messages'), {
    senderId: IDS.admin, text: 'Suplantación', createdAt: serverTimestamp(), read: false,
  }));
  await assertFails(updateDoc(doc(memberDb, 'chats', IDS.chat), { participants: [IDS.member, IDS.outsider] }));
  await assertFails(updateDoc(doc(memberDb, 'chats', IDS.chat, 'messages', 'join-request'), { requestStatus: 'approved' }));
});
```

- [ ] **Step 2: Replace chat rules**

```rules
function isChatParticipant(chatId) {
  return isAuthenticated()
    && request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.participants;
}

match /chats/{chatId} {
  allow read: if isAuthenticated() && request.auth.uid in resource.data.participants;
  allow create, delete: if false;
  allow update: if isAuthenticated()
    && request.auth.uid in resource.data.participants
    && request.resource.data.participants == resource.data.participants
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lastMessage', 'lastMessageAt']);

  match /messages/{messageId} {
    allow read: if isChatParticipant(chatId);
    allow create: if isChatParticipant(chatId)
      && request.resource.data.senderId == request.auth.uid
      && request.resource.data.keys().hasAll(['senderId', 'createdAt']);
    allow update, delete: if false;
  }
}
```

- [ ] **Step 3: Harden chat creation and reuse centralized Functions**

Update `createOrGetChat` so it verifies both `users/{uid}` documents exist, always stores sorted unique participants, and refuses malformed existing chats whose participants differ. Import the centralized `functions` instance in `UserProfilePage.jsx`; remove `getFunctions()`.

- [ ] **Step 4: Run tests and commit**

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,storage "node --test tests/rules/social-chat.test.js"
git add firestore.rules tests/rules/social-chat.test.js functions/index.js src/pages/UserProfilePage.jsx
git commit -m "fix: isolate chats by participant"
```

### Task 5: Make profiles, reactions, and moderation rules match the UI

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/rules/social-chat.test.js`

**Interfaces:**
- Profile owner: `bio`, `photoURL`, `pinnedTrophies`, `savedPosts`, `following`.
- Another authenticated user: may only toggle its own UID in target `followers`.
- Post/comment/reply author: content fields only; any authenticated user may toggle only its UID in `likes`.
- Superadmin: may delete posts/comments/replies for moderation, but cannot impersonate an author.

- [ ] **Step 1: Add a set-delta helper and failing tests**

Use this rules helper:

```rules
function togglesOnlyOwnUid(before, after) {
  return after is list
    && before is list
    && after.size() == after.toSet().size()
    && after.toSet().difference(before.toSet()).hasOnly([request.auth.uid])
    && before.toSet().difference(after.toSet()).hasOnly([request.auth.uid]);
}
```

Tests must prove:

- owner can edit bio, photo, pinned trophies, saved posts and following;
- owner cannot edit `appRole`, `xp`, `username`, `email`, `createdAt` or `followers` arbitrarily;
- follower can add/remove only its UID from the target;
- liker can add/remove only its UID without changing content or another UID;
- post/comment author can edit content without replacing likes;
- superadmin can delete another author’s post; normal outsider cannot;
- direct writes to `users/{uid}/achievements`, `users/{uid}/feats` and `career_achievements/{uid}` are denied.

- [ ] **Step 2: Implement explicit profile fields**

Refine the Plan 02 `/users/{userId}` rule to:

```rules
match /users/{userId} {
  allow read: if isAuthenticated();
  allow create, delete: if false;
  allow update: if isOwner(userId)
    && request.resource.data.diff(resource.data).affectedKeys()
      .hasOnly(['bio', 'photoURL', 'pinnedTrophies', 'savedPosts', 'following']);
  allow update: if isAuthenticated()
    && request.auth.uid != userId
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['followers'])
    && togglesOnlyOwnUid(resource.data.followers, request.resource.data.followers);

  match /achievements/{seasonId} {
    allow read: if isAuthenticated();
    allow write: if false;
  }

  match /feats/{featId} {
    allow read: if isAuthenticated();
    allow write: if false;
  }
}

match /career_achievements/{userId} {
  allow read: if isOwner(userId);
  allow write: if false;
}
```

- [ ] **Step 3: Implement author/reaction/moderation splits**

Use separate allow clauses for author edits and reactions:

```rules
match /posts/{postId} {
  allow read: if true;
  allow create: if isAuthenticated()
    && request.resource.data.authorId == request.auth.uid
    && request.resource.data.keys().hasAll(['authorId', 'content', 'createdAt', 'likes'])
    && request.resource.data.likes.size() == 0;
  allow update: if isAuthenticated()
    && resource.data.authorId == request.auth.uid
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['content', 'imageURL', 'tags']);
  allow update: if isAuthenticated()
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes'])
    && togglesOnlyOwnUid(resource.data.likes, request.resource.data.likes);
  allow delete: if isAuthenticated()
    && (resource.data.authorId == request.auth.uid || isSuperAdmin());

  match /comments/{commentId} {
    allow read: if true;
    allow create: if isAuthenticated()
      && request.resource.data.authorId == request.auth.uid
      && request.resource.data.likes.size() == 0;
    allow update: if isAuthenticated()
      && resource.data.authorId == request.auth.uid
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['content']);
    allow update: if isAuthenticated()
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes'])
      && togglesOnlyOwnUid(resource.data.likes, request.resource.data.likes);
    allow delete: if isAuthenticated()
      && (resource.data.authorId == request.auth.uid || isSuperAdmin());

    match /replies/{replyId} {
      allow read: if true;
      allow create: if isAuthenticated()
        && request.resource.data.authorId == request.auth.uid;
      allow update: if isAuthenticated()
        && resource.data.authorId == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['content']);
      allow delete: if isAuthenticated()
        && (resource.data.authorId == request.auth.uid || isSuperAdmin());
    }
  }
}
```

Both inspected post creators, `src/components/CreatePost.jsx` and `src/pages/CreatePost.jsx`, already initialize `likes: []`; keep that invariant and do not loosen the create rule.

- [ ] **Step 4: Run tests and commit**

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,storage "node --test tests/rules/social-chat.test.js"
git add firestore.rules tests/rules/social-chat.test.js
git commit -m "fix: align social rules with user interactions"
```

### Task 6: Preserve trophies, challenges, feats, and career progress through callables

**Files:**
- Create: `functions/handlers/season-awards.js`
- Create: `functions/test/season-awards.integration.test.js`
- Modify: `functions/index.js`
- Modify: `src/services/league-api.js`
- Modify: `src/utils/trophyUtils.js`
- Modify: `src/utils/awardFeat.jsx`
- Modify: `src/components/ChallengesTab.jsx`
- Modify: `src/components/ChallengeModal.jsx`
- Modify: `src/pages/AchievementsPage.jsx`

**Interfaces:**
- `replaceSeasonTrophies({ leagueId, seasonId, awards })`.
- `saveSeasonChallenge({ leagueId, seasonId, challengeId?, challenge })`.
- `deleteSeasonChallenge({ leagueId, seasonId, challengeId })`.
- `setChallengeWinners({ leagueId, seasonId, challengeId, winners })`.
- `refreshCareerAchievements()` recalculates only the authenticated user.

- [ ] **Step 1: Write server integration tests**

Test that a season admin can replace trophy documents for actual members, that the same payload is reflected in both `leagues/.../achievements/{uid}` and `users/{uid}/achievements/{seasonId}`, and that omitted former winners are deleted from both places. Reject outsider callers, unknown users, placeholder user-profile writes and an award whose `seasonName` or `leagueName` does not match current documents.

For challenges, assert create/edit/delete and winner changes update `users/{uid}/feats/{challengeId}` in the same transaction. Two identical winner calls must not duplicate the same `{ leagueId, seasonId }` instance.

For career progress, seed post/like/achievement data, call as `dev-user`, and assert the backend writes only `career_achievements/dev-user` with these exact counters: number of seasons containing the UID, number of user achievement documents containing trophy `CHAMPION`, sum of the UID's numeric round scores, number of transfers whose `buyerId` is the UID, number of posts authored by the UID, and sum of their `likes.length`. Persist them under `SEASONS_PLAYED_3`, `CHAMPIONSHIPS_WON_3`, `TOTAL_POINTS_50000`, `TOTAL_TRANSFERS_100`, `POSTS_CREATED_50`, and `LIKES_RECEIVED_500`, each shaped as `{ current: number }`.

- [ ] **Step 2: Implement bounded payload validation**

Use these limits in `season-awards.js`:

```js
const MAX_AWARDS = 100;
const MAX_TROPHIES_PER_USER = 50;
const MAX_WINNERS = 100;

function validateAwards(awards, context) {
  if (!Array.isArray(awards) || awards.length > MAX_AWARDS) {
    throw new HttpsError('invalid-argument', 'El lote de trofeos no es válido.');
  }
  const seen = new Set();
  return awards.map(({ userId, data }) => {
    const member = context.season.members?.[userId];
    if (!member || seen.has(userId) || !Array.isArray(data?.trophies) || data.trophies.length > MAX_TROPHIES_PER_USER) {
      throw new HttpsError('invalid-argument', 'Un destinatario o su lista de trofeos no es válido.');
    }
    seen.add(userId);
    return {
      userId,
      isPlaceholder: Boolean(member.isPlaceholder),
      data: {
        seasonName: context.season.name,
        leagueName: context.league.name,
        trophies: data.trophies,
        isPlaceholder: Boolean(member.isPlaceholder),
        teamName: member.teamName,
      },
    };
  });
}
```

Preload all existing league achievement documents, then use a single `WriteBatch` to replace desired league/user mirrors and delete stale mirrors. Abort if the operation would exceed 450 writes.

Store each feat instance with stable identifiers:

```js
{
  leagueId,
  seasonId,
  leagueName: context.league.name,
  seasonName: context.season.name,
  challengeTitle: challenge.title,
  description: challenge.description,
  date: Timestamp.now(),
}
```

Identify an instance by `leagueId + seasonId`, not mutable display names.
Import `Timestamp` from `firebase-admin/firestore`; a server-timestamp transform cannot be nested inside an array value.

- [ ] **Step 3: Export callable wrappers and client methods**

Add wrappers using `requireAuth`, `getSeasonContext`, and `requireSeasonAdmin`. Extend `league-api.js` with one method per interface. `refreshCareerAchievements` requires only authentication because the handler ignores any supplied UID.

- [ ] **Step 4: Replace direct cross-user writes**

`trophyUtils.js` continues computing `userTrophies`, but converts it to `awards` and calls `replaceSeasonTrophies`; revocation sends an empty array. `ChallengesTab` and `ChallengeModal` call the challenge API and stop importing Firestore write primitives for challenge/feat mutations. Remove `awardFeat.jsx` after `rg -n "awardFeat" src` proves there are no remaining imports.

Implement those six counters in the backend handler using Admin SDK. Replace `AchievementsPage`'s client-side league/round/transfer/post reads and `setDoc(progressRef, ...)` with `refreshCareerAchievements()`, then set state from the returned six-key progress object. Badge thresholds remain defined by `src/config/achievements.jsx`; no threshold is moved or changed.

- [ ] **Step 5: Prove no protected client writes remain**

```powershell
rg -n "career_achievements.*setDoc|users.*feats.*(setDoc|updateDoc|deleteDoc)|users.*achievements.*(setDoc|updateDoc|deleteDoc)" src
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,functions,storage "node --test functions/test/season-awards.integration.test.js"
npm run build
```

Expected: `rg` returns no matches; tests and build exit 0.

- [ ] **Step 6: Commit**

```powershell
git add functions/handlers/season-awards.js functions/test/season-awards.integration.test.js functions/index.js src/services/league-api.js src/utils/trophyUtils.js src/utils/awardFeat.jsx src/components/ChallengesTab.jsx src/components/ChallengeModal.jsx src/pages/AchievementsPage.jsx
git commit -m "feat: protect season awards and achievements"
```

### Task 7: Align Storage paths and validate every upload

**Files:**
- Modify: `storage.rules`
- Create: `tests/rules/storage.test.js`

**Interfaces:**
- `posts/{uid}/{file}`: public read, owner write.
- `profile-pictures/{uid}`: public read, owner write.
- `chats/{chatId}/{file}`: participant read/write.
- `season-pictures/{leagueId}/{seasonId}`: authenticated read, season-admin write.

- [ ] **Step 1: Write failing Storage tests**

Create helpers:

```js
const onePixelPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const validMetadata = { contentType: 'image/png' };

const upload = (storage, path, bytes = onePixelPng, metadata = validMetadata) =>
  uploadBytes(ref(storage, path), bytes, metadata);
```

Test successful upload/read/delete for the four legitimate paths and reject:

- another user writing a profile or post path;
- outsider reading or writing a chat path;
- member writing a season image;
- authenticated user uploading `text/plain`;
- authenticated user uploading `new Uint8Array(5 * 1024 * 1024 + 1)`;
- any path not listed.

Use `env.authenticatedContext(uid).storage()` and `env.unauthenticatedContext().storage()`.

- [ ] **Step 2: Replace Storage rules**

```rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isAuthenticated() {
      return request.auth != null;
    }

    function isValidImage() {
      return request.resource != null
        && request.resource.size <= 5 * 1024 * 1024
        && request.resource.contentType.matches('image/(jpeg|png|webp|gif)');
    }

    function chatParticipant(chatId) {
      return isAuthenticated()
        && request.auth.uid in firestore.get(
          /databases/(default)/documents/chats/$(chatId)
        ).data.participants;
    }

    function seasonAdmin(leagueId, seasonId) {
      return isAuthenticated()
        && firestore.get(
          /databases/(default)/documents/leagues/$(leagueId)/seasons/$(seasonId)
        ).data.members[request.auth.uid].role == 'admin';
    }

    match /posts/{userId}/{fileName} {
      allow read: if true;
      allow create, update: if isAuthenticated() && request.auth.uid == userId && isValidImage();
      allow delete: if isAuthenticated() && request.auth.uid == userId;
    }

    match /profile-pictures/{userId} {
      allow read: if true;
      allow create, update: if isAuthenticated() && request.auth.uid == userId && isValidImage();
      allow delete: if isAuthenticated() && request.auth.uid == userId;
    }

    match /chats/{chatId}/{fileName} {
      allow read: if chatParticipant(chatId);
      allow create, update: if chatParticipant(chatId) && isValidImage();
      allow delete: if chatParticipant(chatId);
    }

    match /season-pictures/{leagueId}/{seasonId} {
      allow read: if isAuthenticated();
      allow create, update: if seasonAdmin(leagueId, seasonId) && isValidImage();
      allow delete: if seasonAdmin(leagueId, seasonId);
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

This policy performs one Firestore lookup per chat/season decision, below the Storage Rules limit of two cross-service document accesses.

- [ ] **Step 3: Run Storage and app tests**

```powershell
npx firebase emulators:exec --project demo-fantasya --only auth,firestore,storage "node --test tests/rules/storage.test.js"
npm run build
```

Expected: all Storage tests pass and current four client paths need no rename.

- [ ] **Step 4: Commit**

```powershell
git add storage.rules tests/rules/storage.test.js
git commit -m "fix: authorize and validate Firebase Storage uploads"
```

### Task 8: Add a single integrity regression gate

**Files:**
- Modify: `functions/package.json`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add inside-emulator scripts**

Add to `functions/package.json`:

```json
"test:integrity": "node --test test/season-authz.integration.test.js test/membership.integration.test.js test/season-awards.integration.test.js"
```

Add to root `package.json`:

```json
"test:rules:integrity": "firebase emulators:exec --project demo-fantasya --only auth,firestore,functions,storage \"node --test tests/rules/leagues.test.js tests/rules/social-chat.test.js tests/rules/storage.test.js\"",
"test:functions:integrity": "firebase emulators:exec --project demo-fantasya --only auth,firestore,functions,storage \"npm --prefix functions run test:integrity\"",
"test:integrity": "run-s test:rules:integrity test:functions:integrity"
```

- [ ] **Step 2: Document the permission model**

Add a `Seguridad local verificable` table to `README.md` listing member, league admin, superadmin and outsider permissions, followed by the exact `npm run test:integrity` command.

- [ ] **Step 3: Run all gates**

```powershell
npm run test:unit
npm run test:seed
npm run test:admin
npm run test:integrity
npm run build
```

Expected: every command exits 0. Lint is measured separately in plan 04 because the repository starts with known baseline debt.

- [ ] **Step 4: Commit**

```powershell
git add package.json functions/package.json README.md
git commit -m "test: add application integrity regression gate"
```

---

## Acceptance Checklist

- [ ] A forged owner, role, XP, member, transfer or join state is denied.
- [ ] Code-based join and request-based join both work against emulators.
- [ ] Approval/rejection cannot leave request, chat and membership inconsistent.
- [ ] Normal chat remains functional for participants and invisible to outsiders.
- [ ] Likes, follows, saves, pinned trophies and superadmin moderation match the UI.
- [ ] Trophy, challenge, feat and career-achievement flows work without client writes to protected paths.
- [ ] The four real Storage paths accept legitimate images and reject cross-user, MIME and size violations.
- [ ] Seed, admin, integrity and build gates all pass on Node 22.
