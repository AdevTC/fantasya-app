const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../lib/firebase');
const { seedEmulators } = require('../scripts/seed-emulators');
const {
  resetTestEmulators,
} = require('./support/emulator-test-env');
const { unlinkUserFromTeamHandler } = require('../handlers/teams');

test.beforeEach(async () => {
  await resetTestEmulators();
  await seedEmulators();
});

function unlink(requester, target) {
  return unlinkUserFromTeamHandler({
    auth: { uid: requester },
    data: {
      leagueId: 'dev-league-active',
      seasonId: 'season-1',
      userIdToUnlink: target,
    },
  });
}

test('normal member cannot unlink another team', async () => {
  await assert.rejects(
    unlink('dev-user', 'placeholder-rival'),
    (error) => error.code === 'permission-denied',
  );
});

test('non-owner league admin cannot unlink the league owner', async () => {
  await db.doc('leagues/dev-league-active/seasons/season-1').update({
    'members.dev-user.role': 'admin',
  });

  await assert.rejects(
    unlink('dev-user', 'dev-league-admin'),
    (error) => error.code === 'permission-denied',
  );
});

test('league owner can unlink a member into a clean placeholder', async () => {
  const result = await unlink('dev-league-admin', 'dev-user');
  const season = (
    await db.doc('leagues/dev-league-active/seasons/season-1').get()
  ).data();

  assert.equal(result.success, true);
  assert.equal(Object.hasOwn(season.members, 'dev-user'), false);
  assert.equal(season.members['placeholder_dev-user'].isPlaceholder, true);
  assert.equal(season.members['placeholder_dev-user'].teamName, 'Usuarios FC');
});
