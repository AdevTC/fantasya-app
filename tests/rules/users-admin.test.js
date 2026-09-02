import test, { after, before, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { createRulesEnvironment } from './test-env.js';

let env;

before(async () => {
  env = await createRulesEnvironment();
});

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
    await setDoc(doc(db, 'usernames/user'), { userId: 'user' });
  });
});

after(async () => env.cleanup());

test('user can edit safe fields but cannot self-promote or change xp', async () => {
  const ref = doc(env.authenticatedContext('user').firestore(), 'users/user');
  await assertSucceeds(updateDoc(ref, { bio: 'Nueva bio' }));
  await assertFails(updateDoc(ref, { appRole: 'superadmin' }));
  await assertFails(updateDoc(ref, { xp: 999999 }));

  const otherUser = doc(
    env.authenticatedContext('admin').firestore(),
    'users/user',
  );
  await assertFails(updateDoc(otherUser, { appRole: 'superadmin' }));
});

test('profile creation and deletion are server-only', async () => {
  const newUserDb = env.authenticatedContext('new-user').firestore();
  await assertFails(setDoc(doc(newUserDb, 'users/new-user'), {
    username: 'new-user',
    appRole: 'user',
    xp: 0,
  }));
  const userDb = env.authenticatedContext('user').firestore();
  await assertFails(deleteDoc(doc(userDb, 'users/user')));
  await assertFails(deleteDoc(doc(userDb, 'usernames/user')));
});

test('a follower can change only their own membership in another profile', async () => {
  const target = doc(
    env.authenticatedContext('user').firestore(),
    'users/admin',
  );
  await assertSucceeds(updateDoc(target, { followers: ['user'] }));
  await assertFails(updateDoc(target, { followers: ['someone-else'] }));
});

test('normal user cannot write players and superadmin can', async () => {
  const normalRef = doc(
    env.authenticatedContext('user').firestore(),
    'players/p1',
  );
  const adminRef = doc(
    env.authenticatedContext('admin').firestore(),
    'players/p1',
  );
  await assertFails(setDoc(normalRef, { name: 'No permitido' }));
  await assertSucceeds(setDoc(adminRef, { name: 'Permitido' }));
});

test('published player snapshots are public read and server-only write', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'config/laLigaSync'), {
      activeRunId: 'stable',
      status: 'completed',
    });
    await setDoc(doc(
      context.firestore(),
      'laLigaSyncRuns/stable/players/one',
    ), { name: 'Jugador visible' });
    await setDoc(doc(
      context.firestore(),
      'laLigaSyncRuns/failed/players/one',
    ), { name: 'Jugador incompleto' });
  });
  const publicRef = doc(
    env.unauthenticatedContext().firestore(),
    'laLigaSyncRuns/stable/players/one',
  );
  await assertSucceeds(getDoc(publicRef));
  const unpublishedRef = doc(
    env.unauthenticatedContext().firestore(),
    'laLigaSyncRuns/failed/players/one',
  );
  await assertFails(getDoc(unpublishedRef));
  const adminRef = doc(
    env.authenticatedContext('admin').firestore(),
    'laLigaSyncRuns/stable/players/two',
  );
  await assertFails(setDoc(adminRef, { name: 'No permitido' }));
});
