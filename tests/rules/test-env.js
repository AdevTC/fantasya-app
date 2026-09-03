import fs from 'node:fs/promises';
import {
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

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

export async function seedLeagueFixture(testEnv) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users', IDS.superadmin), {
        username: 'superadmin',
        appRole: 'superadmin',
        followers: [],
        following: [],
        savedPosts: [],
        pinnedTrophies: [],
        xp: 0,
      }),
      setDoc(doc(db, 'users', IDS.admin), {
        username: 'leagueadmin',
        appRole: 'user',
        followers: [],
        following: [],
        savedPosts: [],
        pinnedTrophies: [],
        xp: 0,
      }),
      setDoc(doc(db, 'users', IDS.member), {
        username: 'member',
        appRole: 'user',
        followers: [],
        following: [],
        savedPosts: [],
        pinnedTrophies: [],
        xp: 0,
      }),
      setDoc(doc(db, 'users', IDS.outsider), {
        username: 'outsider',
        appRole: 'user',
        followers: [],
        following: [],
        savedPosts: [],
        pinnedTrophies: [],
        xp: 0,
      }),
      setDoc(doc(db, 'leagues', IDS.league), {
        name: 'Liga local',
        ownerId: IDS.admin,
        activeSeason: IDS.season,
      }),
      setDoc(doc(db, 'leagues', IDS.league, 'seasons', IDS.season), {
        name: 'Temporada local',
        seasonNumber: 1,
        inviteCode: 'LOCAL1',
        members: {
          [IDS.admin]: {
            username: 'leagueadmin',
            teamName: 'Admins FC',
            role: 'admin',
            totalPoints: 0,
            finances: { budget: 200, teamValue: 0 },
          },
          [IDS.superadmin]: {
            username: 'superadmin',
            teamName: 'Delegados FC',
            role: 'admin',
            totalPoints: 0,
            finances: { budget: 200, teamValue: 0 },
          },
          [IDS.member]: {
            username: 'member',
            teamName: 'Members FC',
            role: 'member',
            totalPoints: 0,
            finances: { budget: 200, teamValue: 0 },
          },
          [IDS.placeholder]: {
            teamName: 'Equipo Fantasma',
            role: 'member',
            isPlaceholder: true,
            totalPoints: 10,
            finances: { budget: 200, teamValue: 0 },
          },
        },
      }),
    ]);
  });
}
