import test, { after, before, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  createRulesEnvironment,
  IDS,
  seedLeagueFixture,
} from './test-env.js';

let env;
const TRANSFER_ID = 'existing-transfer';

before(async () => {
  env = await createRulesEnvironment();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seedLeagueFixture(env);
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(
      db,
      'leagues',
      IDS.league,
      'seasons',
      IDS.season,
      'transfers',
      TRANSFER_ID,
    ), {
      buyerId: IDS.member,
      sellerId: 'market',
      price: 10,
    });
  });
});

after(async () => env.cleanup());

test('league creation binds ownerId to the actor', async () => {
  const db = env.authenticatedContext(IDS.member).firestore();
  await assertSucceeds(setDoc(doc(db, 'leagues', 'owned-by-member'), {
    name: 'Nueva liga',
    ownerId: IDS.member,
    activeSeason: 'season_1',
  }));
  await assertFails(setDoc(doc(db, 'leagues', 'forged-owner'), {
    name: 'Liga falsa',
    ownerId: IDS.admin,
    activeSeason: 'season_1',
  }));
});

test('owner can create a valid initial season in the same batch', async () => {
  const db = env.authenticatedContext(IDS.member).firestore();
  const leagueRef = doc(db, 'leagues', 'atomic-league');
  const seasonRef = doc(leagueRef, 'seasons', 'season_1');
  const batch = writeBatch(db);
  batch.set(leagueRef, {
    name: 'Atómica',
    ownerId: IDS.member,
    activeSeason: 'season_1',
  });
  batch.set(seasonRef, {
    name: 'Temporada 1',
    seasonNumber: 1,
    inviteCode: 'ATOM01',
    members: {
      [IDS.member]: {
        username: 'member',
        teamName: 'Atomic FC',
        role: 'admin',
        totalPoints: 0,
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
  await assertFails(updateDoc(seasonRef, {
    [`members.${IDS.member}.role`]: 'admin',
  }));
  await assertFails(updateDoc(seasonRef, {
    [`members.${IDS.member}.totalPoints`]: 9999,
  }));
  await assertFails(updateDoc(seasonRef, {
    [`members.${IDS.admin}.teamName`]: 'Secuestrado',
  }));
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

test('outsider cannot add itself directly', async () => {
  const outsiderDb = env.authenticatedContext(IDS.outsider).firestore();
  const seasonRef = doc(
    outsiderDb,
    'leagues',
    IDS.league,
    'seasons',
    IDS.season,
  );
  await assertFails(updateDoc(seasonRef, {
    [`members.${IDS.outsider}`]: {
      username: 'outsider',
      teamName: 'Injected',
      role: 'admin',
    },
  }));
});

test('direct transfer creates stay denied for members and every admin role', async () => {
  const validTransfer = {
    playerId: 'dev-player',
    playerName: 'Jugador Local',
    buyerId: IDS.member,
    buyerName: 'Members FC',
    sellerId: 'market',
    sellerName: 'Mercado',
    type: 'puja',
    price: 10,
    timestamp: new Date(),
  };
  for (const actor of [
    { id: 'member', uid: IDS.member },
    { id: 'delegated-admin', uid: IDS.superadmin },
    { id: 'league-owner', uid: IDS.admin },
  ]) {
    const db = env.authenticatedContext(actor.uid).firestore();
    const transferCollection = [
      'leagues',
      IDS.league,
      'seasons',
      IDS.season,
      'transfers',
    ];
    await assertFails(setDoc(
      doc(db, ...transferCollection, `${actor.id}-direct-create`),
      validTransfer,
    ));
    await assertFails(setDoc(
      doc(db, ...transferCollection, `${actor.id}-merge-create`),
      validTransfer,
      { merge: true },
    ));
  }
});

test('admin keeps operational access and ownerId controls deletion', async () => {
  const adminDb = env.authenticatedContext(IDS.admin).firestore();
  const delegatedAdminDb = env.authenticatedContext(IDS.superadmin).firestore();
  const memberDb = env.authenticatedContext(IDS.member).firestore();
  await assertFails(updateDoc(
    doc(delegatedAdminDb, 'leagues', IDS.league),
    { ownerId: IDS.member },
  ));
  await assertSucceeds(updateDoc(
    doc(delegatedAdminDb, 'leagues', IDS.league, 'seasons', IDS.season),
    { archived: true },
  ));
  const transferRef = doc(
    delegatedAdminDb,
    'leagues',
    IDS.league,
    'seasons',
    IDS.season,
    'transfers',
    TRANSFER_ID,
  );
  await assertSucceeds(getDoc(doc(
    memberDb,
    'leagues',
    IDS.league,
    'seasons',
    IDS.season,
    'transfers',
    TRANSFER_ID,
  )));
  await assertSucceeds(updateDoc(transferRef, { price: 12 }));
  await assertSucceeds(deleteDoc(transferRef));
  await assertFails(deleteDoc(doc(memberDb, 'leagues', IDS.league)));
  await assertSucceeds(deleteDoc(doc(adminDb, 'leagues', IDS.league)));
});
