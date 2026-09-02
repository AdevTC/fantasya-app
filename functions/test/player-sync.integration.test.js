const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../lib/firebase');
const { seedEmulators } = require('../scripts/seed-emulators');
const {
  resetTestEmulators,
} = require('./support/emulator-test-env');
const {
  syncPlayers,
} = require('../lib/player-sync');
const {
  getLaLigaSyncStatusLegacyHandler,
  getLaLigaSyncStatusV2Handler,
  syncLaLigaPlayersLegacyHandler,
  syncLaLigaPlayersV2Handler,
} = require('../handlers/player-sync');

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function responseRecorder() {
  const state = { body: null, status: 200 };
  const response = {
    json(body) {
      state.body = body;
      return response;
    },
    send(body) {
      state.body = body;
      return response;
    },
    status(status) {
      state.status = status;
      return response;
    },
  };
  return { response, state };
}

test.beforeEach(async () => {
  await resetTestEmulators();
  await seedEmulators();
});

test('fixture sync writes normalized players without network or history churn', async () => {
  const options = {
    requestedBy: 'dev-superadmin',
    source: 'fixture',
    fetchImpl: () => {
      throw new Error('network must not be called');
    },
    sleep: async () => {},
    now: () => new Date('2026-09-02T10:00:00Z'),
  };

  assert.deepEqual(await syncPlayers(options), {
    success: true,
    playersSynced: 3,
    teamsProcessed: 2,
    source: 'fixture',
  });
  await syncPlayers({
    ...options,
    now: () => new Date('2026-09-02T11:00:00Z'),
  });

  const player = await db.doc('laLigaPlayers/1').get();
  assert.equal(player.data().team, 'Real Madrid');
  assert.equal(player.data().position, 'DEL');
  assert.deepEqual(player.data().teamHistory, [{
    team: 'Real Madrid',
    since: '2026-09-02T10:00:00.000Z',
  }]);
  assert.deepEqual(player.data().positionHistory, [{
    position: 'DEL',
    since: '2026-09-02T10:00:00.000Z',
  }]);
});

test('a failed team retry aborts before every player write and records error', async () => {
  const sleeps = [];
  const responses = [
    jsonResponse(200, { teams: [{ id: 86 }, { id: 81 }] }),
    jsonResponse(200, {
      id: 86,
      name: 'Real Madrid CF',
      squad: [{ id: 91, name: 'Fetched One', position: 'Forward' }],
    }),
    jsonResponse(429, {}),
    jsonResponse(503, {}),
  ];

  await assert.rejects(
    syncPlayers({
      requestedBy: 'dev-superadmin',
      source: 'live',
      apiKey: 'test-key',
      fetchImpl: async () => responses.shift(),
      sleep: async (milliseconds) => sleeps.push(milliseconds),
    }),
    /team 81 returned 503 after retry/i,
  );

  assert.deepEqual(sleeps, [6500, 30000]);
  assert.equal((await db.collection('laLigaPlayers').get()).empty, true);
  const status = (await db.doc('config/laLigaSync').get()).data();
  assert.equal(status.status, 'error');
  assert.match(status.lastError, /team 81 returned 503 after retry/i);
});

test('callable sync requires superadmin and defaults to fixture in emulators', async () => {
  let received;
  const syncImpl = async (options) => {
    received = options;
    return {
      success: true,
      playersSynced: 3,
      teamsProcessed: 2,
      source: options.source,
    };
  };
  const env = {
    FUNCTIONS_EMULATOR: 'true',
    ALLOW_LIVE_FOOTBALL_API: 'false',
  };

  await assert.rejects(
    syncLaLigaPlayersV2Handler(
      { auth: { uid: 'dev-user' }, data: {} },
      'local-fixture-value-not-used',
      { env, syncImpl },
    ),
    (error) => error.code === 'permission-denied',
  );
  const result = await syncLaLigaPlayersV2Handler(
    { auth: { uid: 'dev-superadmin' }, data: {} },
    'local-fixture-value-not-used',
    { env, syncImpl },
  );

  assert.equal(received.source, 'fixture');
  assert.equal(received.requestedBy, 'dev-superadmin');
  assert.equal(result.message, 'Sincronización completada: 3 jugadores actualizados.');
});

test('live emulator sync needs request, environment, and a non-placeholder key', async () => {
  const sources = [];
  const syncImpl = async ({ source }) => {
    sources.push(source);
    return {
      success: true,
      playersSynced: 0,
      teamsProcessed: 0,
      source,
    };
  };
  const baseRequest = { auth: { uid: 'dev-superadmin' }, data: {} };
  const enabledEnv = {
    FUNCTIONS_EMULATOR: 'true',
    ALLOW_LIVE_FOOTBALL_API: 'true',
  };

  await syncLaLigaPlayersV2Handler(
    baseRequest,
    'real-key',
    { env: enabledEnv, syncImpl },
  );
  await syncLaLigaPlayersV2Handler(
    { ...baseRequest, data: { source: 'live' } },
    'real-key',
    {
      env: { ...enabledEnv, ALLOW_LIVE_FOOTBALL_API: 'false' },
      syncImpl,
    },
  );
  await syncLaLigaPlayersV2Handler(
    { ...baseRequest, data: { source: 'live' } },
    'local-fixture-value-not-used',
    { env: enabledEnv, syncImpl },
  );
  await syncLaLigaPlayersV2Handler(
    { ...baseRequest, data: { source: 'live' } },
    'real-key',
    { env: enabledEnv, syncImpl },
  );

  assert.deepEqual(sources, ['fixture', 'fixture', 'fixture', 'live']);
});

test('legacy sync delegates to the protected callable service', async () => {
  let syncCalls = 0;
  const syncImpl = async ({ source }) => {
    syncCalls += 1;
    return {
      success: true,
      playersSynced: 3,
      teamsProcessed: 2,
      source,
    };
  };
  const options = {
    env: { FUNCTIONS_EMULATOR: 'true' },
    syncImpl,
    verifyIdToken: async (token) => ({
      uid: token === 'admin-token' ? 'dev-superadmin' : 'dev-user',
    }),
  };
  const denied = responseRecorder();
  await syncLaLigaPlayersLegacyHandler(
    {
      method: 'POST',
      headers: { authorization: 'Bearer user-token' },
      body: {},
    },
    denied.response,
    'local-fixture-value-not-used',
    options,
  );
  assert.equal(denied.state.status, 403);
  assert.equal(syncCalls, 0);

  const allowed = responseRecorder();
  await syncLaLigaPlayersLegacyHandler(
    {
      method: 'POST',
      headers: { authorization: 'Bearer admin-token' },
      body: {},
    },
    allowed.response,
    'local-fixture-value-not-used',
    options,
  );
  assert.equal(allowed.state.status, 200);
  assert.equal(allowed.state.body.success, true);
  assert.equal(allowed.state.body.source, 'fixture');
  assert.equal(syncCalls, 1);
});

test('both status generations require authentication and share one service', async () => {
  await assert.rejects(
    getLaLigaSyncStatusV2Handler({ auth: null }),
    (error) => error.code === 'unauthenticated',
  );
  const callable = await getLaLigaSyncStatusV2Handler({
    auth: { uid: 'dev-user' },
  });
  assert.equal(callable.status, 'never_synced');

  const unauthorized = responseRecorder();
  await getLaLigaSyncStatusLegacyHandler(
    { method: 'POST', headers: {} },
    unauthorized.response,
    { verifyIdToken: async () => assert.fail('must not verify an empty token') },
  );
  assert.equal(unauthorized.state.status, 401);

  const allowed = responseRecorder();
  await getLaLigaSyncStatusLegacyHandler(
    {
      method: 'POST',
      headers: { authorization: 'Bearer user-token' },
    },
    allowed.response,
    { verifyIdToken: async () => ({ uid: 'dev-user' }) },
  );
  assert.equal(allowed.state.status, 200);
  assert.deepEqual(allowed.state.body, callable);
});
