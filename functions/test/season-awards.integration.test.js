const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../lib/firebase');
const {
  deleteSeasonChallengeHandler,
  refreshCareerAchievementsHandler,
  replaceSeasonTrophiesHandler,
  saveSeasonChallengeHandler,
  setChallengeWinnersHandler,
} = require('../handlers/season-awards');
const { seedEmulators } = require('../scripts/seed-emulators');
const {
  resetTestEmulators,
} = require('./support/emulator-test-env');

const seasonInput = {
  leagueId: 'dev-league-active',
  seasonId: 'season-1',
};

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test.beforeEach(async () => {
  await resetTestEmulators();
  await seedEmulators();
});

test('season admin atomically replaces trophy mirrors and stale awards', async () => {
  const stale = {
    seasonName: 'Temporada Local',
    leagueName: 'Liga Local Activa',
    trophies: [{ trophyId: 'RUNNER_UP' }],
    isPlaceholder: false,
    teamName: 'Administradores FC',
  };
  await Promise.all([
    db.doc(
      'leagues/dev-league-active/seasons/season-1/' +
      'achievements/dev-league-admin',
    ).set(stale),
    db.doc('users/dev-league-admin/achievements/season-1').set(stale),
  ]);

  const result = await replaceSeasonTrophiesHandler({
    uid: 'dev-league-admin',
    data: {
      ...seasonInput,
      awards: [
        {
          userId: 'dev-user',
          data: {
            seasonName: 'Temporada Local',
            leagueName: 'Liga Local Activa',
            trophies: [{ trophyId: 'CHAMPION', value: 100 }],
          },
        },
        {
          userId: 'placeholder-rival',
          data: {
            seasonName: 'Temporada Local',
            leagueName: 'Liga Local Activa',
            trophies: [{ trophyId: 'THIRD_PLACE', value: 10 }],
          },
        },
      ],
    },
  });
  assert.equal(result.awardsWritten, 2);

  const [leagueAward, userAward, placeholderAward, placeholderUser, staleLeague,
    staleUser] = await Promise.all([
    db.doc(
      'leagues/dev-league-active/seasons/season-1/' +
      'achievements/dev-user',
    ).get(),
    db.doc('users/dev-user/achievements/season-1').get(),
    db.doc(
      'leagues/dev-league-active/seasons/season-1/' +
      'achievements/placeholder-rival',
    ).get(),
    db.doc('users/placeholder-rival/achievements/season-1').get(),
    db.doc(
      'leagues/dev-league-active/seasons/season-1/' +
      'achievements/dev-league-admin',
    ).get(),
    db.doc('users/dev-league-admin/achievements/season-1').get(),
  ]);
  assert.deepEqual(leagueAward.data(), userAward.data());
  assert.equal(leagueAward.data().teamName, 'Usuarios FC');
  assert.equal(placeholderAward.data().isPlaceholder, true);
  assert.equal(placeholderUser.exists, false);
  assert.equal(staleLeague.exists, false);
  assert.equal(staleUser.exists, false);
});

test('trophy replacement rejects outsiders and malformed recipients', async () => {
  const validAward = {
    userId: 'dev-user',
    data: {
      seasonName: 'Temporada Local',
      leagueName: 'Liga Local Activa',
      trophies: [{ trophyId: 'CHAMPION' }],
    },
  };
  await rejectsCode(replaceSeasonTrophiesHandler({
    uid: 'dev-user',
    data: { ...seasonInput, awards: [validAward] },
  }), 'permission-denied');
  await rejectsCode(replaceSeasonTrophiesHandler({
    uid: 'dev-league-admin',
    data: {
      ...seasonInput,
      awards: [{ ...validAward, userId: 'missing-user' }],
    },
  }), 'invalid-argument');
  await rejectsCode(replaceSeasonTrophiesHandler({
    uid: 'dev-league-admin',
    data: {
      ...seasonInput,
      awards: [{
        ...validAward,
        data: { ...validAward.data, seasonName: 'Otra temporada' },
      }],
    },
  }), 'invalid-argument');
});

test('challenge lifecycle keeps one stable feat instance per season', async () => {
  const created = await saveSeasonChallengeHandler({
    uid: 'dev-league-admin',
    data: {
      ...seasonInput,
      challenge: {
        title: 'Reto atómico',
        description: 'Haz algo memorable.',
        targetType: 'all',
        targetUsers: [],
      },
    },
  });

  const winnersInput = {
    ...seasonInput,
    challengeId: created.challengeId,
    winners: [{ uid: 'dev-user', teamName: 'Nombre manipulable' }],
  };
  await setChallengeWinnersHandler({
    uid: 'dev-league-admin',
    data: winnersInput,
  });
  await setChallengeWinnersHandler({
    uid: 'dev-league-admin',
    data: winnersInput,
  });

  let [challenge, feat] = await Promise.all([
    db.doc(
      `leagues/dev-league-active/seasons/season-1/challenges/${created.challengeId}`,
    ).get(),
    db.doc(`users/dev-user/feats/${created.challengeId}`).get(),
  ]);
  assert.equal(challenge.data().status, 'completed');
  assert.equal(challenge.data().winners[0].teamName, 'Usuarios FC');
  assert.equal(feat.data().instances.length, 1);
  assert.equal(feat.data().instances[0].leagueId, 'dev-league-active');
  assert.equal(feat.data().instances[0].seasonId, 'season-1');

  await saveSeasonChallengeHandler({
    uid: 'dev-league-admin',
    data: {
      ...seasonInput,
      challengeId: created.challengeId,
      challenge: {
        title: 'Reto renombrado',
        description: 'Descripción corregida.',
        targetType: 'all',
        targetUsers: [],
      },
    },
  });
  feat = await db.doc(`users/dev-user/feats/${created.challengeId}`).get();
  assert.equal(feat.data().instances[0].challengeTitle, 'Reto renombrado');
  assert.equal(feat.data().instances[0].description, 'Descripción corregida.');

  const deleted = await deleteSeasonChallengeHandler({
    uid: 'dev-league-admin',
    data: { ...seasonInput, challengeId: created.challengeId },
  });
  assert.equal(deleted.deleted, true);
  [challenge, feat] = await Promise.all([
    db.doc(
      `leagues/dev-league-active/seasons/season-1/challenges/${created.challengeId}`,
    ).get(),
    db.doc(`users/dev-user/feats/${created.challengeId}`).get(),
  ]);
  assert.equal(challenge.exists, false);
  assert.equal(feat.exists, false);
});

test('challenge writes reject non-admins and unknown targets', async () => {
  const challenge = {
    title: 'Reto',
    description: 'Descripción',
    targetType: 'single',
    targetUsers: ['missing-user'],
  };
  await rejectsCode(saveSeasonChallengeHandler({
    uid: 'dev-user',
    data: { ...seasonInput, challenge },
  }), 'permission-denied');
  await rejectsCode(saveSeasonChallengeHandler({
    uid: 'dev-league-admin',
    data: { ...seasonInput, challenge },
  }), 'invalid-argument');
});

test('career refresh computes and writes only the authenticated user', async () => {
  const batch = db.batch();
  batch.set(db.doc(
    'leagues/dev-league-active/seasons/season-1/rounds/career-round',
  ), { scores: { 'dev-user': 12, 'dev-league-admin': 99 } });
  batch.set(db.doc(
    'leagues/dev-league-active/seasons/season-1/transfers/career-transfer',
  ), { buyerId: 'dev-user' });
  batch.set(db.doc('posts/career-post-1'), {
    authorId: 'dev-user',
    content: 'Uno',
    likes: ['a', 'b'],
  });
  batch.set(db.doc('posts/career-post-2'), {
    authorId: 'dev-user',
    content: 'Dos',
    likes: ['c'],
  });
  await batch.commit();

  const progress = await refreshCareerAchievementsHandler({
    uid: 'dev-user',
    data: {},
  });
  assert.deepEqual(progress, {
    SEASONS_PLAYED_3: { current: 1 },
    CHAMPIONSHIPS_WON_3: { current: 1 },
    TOTAL_POINTS_50000: { current: 12 },
    TOTAL_TRANSFERS_100: { current: 1 },
    POSTS_CREATED_50: { current: 2 },
    LIKES_RECEIVED_500: { current: 3 },
  });

  const [stored, someoneElse] = await Promise.all([
    db.doc('career_achievements/dev-user').get(),
    db.doc('career_achievements/dev-league-admin').get(),
  ]);
  assert.deepEqual(stored.data(), progress);
  assert.equal(someoneElse.exists, false);
});
