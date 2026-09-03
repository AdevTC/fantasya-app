const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../lib/firebase');
const {
  getSeasonContext,
  requireLeagueOwner,
  requireSeasonAdmin,
} = require('../lib/league-authz');
const { seedEmulators } = require('../scripts/seed-emulators');
const {
  resetTestEmulators,
} = require('./support/emulator-test-env');

test.beforeEach(async () => {
  await resetTestEmulators();
  await seedEmulators();
});

test('season context resolves canonical league and season documents', async () => {
  const context = await getSeasonContext({
    leagueId: 'dev-league-active',
    seasonId: 'season-1',
  });
  assert.equal(context.league.ownerId, 'dev-league-admin');
  assert.equal(context.season.name, 'Temporada Local');
  assert.equal(context.leagueRef.path, 'leagues/dev-league-active');
  assert.equal(
    context.seasonRef.path,
    'leagues/dev-league-active/seasons/season-1',
  );
});

test('owner, delegated admin and member have distinct authority', async () => {
  const seasonRef = db.doc(
    'leagues/dev-league-active/seasons/season-1',
  );
  await seasonRef.update({
    'members.dev-superadmin': {
      username: 'superadmin',
      teamName: 'Delegados FC',
      role: 'admin',
    },
  });
  const context = await getSeasonContext({
    leagueId: 'dev-league-active',
    seasonId: 'season-1',
  });

  assert.equal(requireLeagueOwner('dev-league-admin', context), 'dev-league-admin');
  assert.equal(requireSeasonAdmin('dev-league-admin', context), 'dev-league-admin');
  assert.equal(requireSeasonAdmin('dev-superadmin', context), 'dev-superadmin');
  assert.throws(
    () => requireLeagueOwner('dev-superadmin', context),
    (error) => error.code === 'permission-denied',
  );
  assert.throws(
    () => requireSeasonAdmin('dev-user', context),
    (error) => error.code === 'permission-denied',
  );
});

test('missing season is rejected', async () => {
  await assert.rejects(
    getSeasonContext({
      leagueId: 'dev-league-active',
      seasonId: 'missing-season',
    }),
    (error) => error.code === 'not-found',
  );
});
