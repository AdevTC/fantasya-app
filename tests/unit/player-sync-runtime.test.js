import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('player sync capability is enabled only in a development emulator', async () => {
  const policyUrl = new URL('../../src/config/capability-policy.js', import.meta.url);

  await assert.doesNotReject(async () => {
    const { assertPlayerSyncEnabled, resolveCapabilities } = await import(policyUrl);

    assert.deepEqual(
      resolveCapabilities({ isDev: true, isUsingEmulators: true }),
      { playerSync: true },
    );
    assert.equal(
      resolveCapabilities({ isDev: false, isUsingEmulators: true }).playerSync,
      false,
    );
    assert.equal(
      resolveCapabilities({ isDev: true, isUsingEmulators: false }).playerSync,
      false,
    );
    assert.equal(
      resolveCapabilities({ isDev: false, isUsingEmulators: false }).playerSync,
      false,
    );

    const capabilities = resolveCapabilities({
      isDev: true,
      isUsingEmulators: true,
    });
    assert.equal(Object.isFrozen(capabilities), true);

    assert.doesNotThrow(() => assertPlayerSyncEnabled(true));
    assert.throws(
      () => assertPlayerSyncEnabled(false),
      (error) => error.code === 'failed-precondition'
        && /sólo está disponible en local/.test(error.message),
    );
  });
});

test('player sync client uses only the shared callable API', () => {
  const component = read('src/components/PlayersSyncTab.jsx');
  const api = read('src/services/admin-api.js');

  assert.doesNotMatch(component, /a\.run\.app|allAuthenticatedUsers|getAuth|\bfetch\(/);
  assert.doesNotMatch(component, /resolvePlayerSyncRuntime|legacyRemoteEnabled/);
  assert.match(component, /getLaLigaSyncStatus/);
  assert.match(component, /syncLaLigaPlayers/);
  assert.match(component, /activeRunId/);
  assert.match(component, /laLigaSyncRuns/);
  assert.match(api, /call\('getLaLigaSyncStatusV2'/);
  assert.match(api, /call\('syncLaLigaPlayersV2'/);
  assert.match(api, /timeout:\s*540000/);
  assert.equal(fs.existsSync('src/config/player-sync-runtime.js'), false);
});

test('production and preview keep the saved player catalogue read only', () => {
  const component = read('src/components/PlayersSyncTab.jsx');
  const api = read('src/services/admin-api.js');

  assert.match(component, /playerSyncEnabled/);
  assert.match(component, /fetchSyncedPlayers\(null/);
  assert.match(component, /status:\s*'disabled'/);
  assert.match(component, /Sincronización no disponible/);
  assert.match(
    component,
    /La actualización automática está temporalmente desactivada\. Puedes seguir consultando los jugadores ya guardados\./,
  );
  assert.match(component, /No hay jugadores guardados actualmente\./);
  assert.doesNotMatch(component, /football-data\.org|solicitudes por minuto|API key|clave de football/i);

  assert.match(
    api,
    /syncLaLigaPlayers\s*=\s*\(\)\s*=>\s*\{\s*assertPlayerSyncEnabled\(playerSyncEnabled\);\s*return call\('syncLaLigaPlayersV2'/s,
  );
  assert.match(
    api,
    /getLaLigaSyncStatus\s*=\s*\(\)\s*=>\s*\{\s*assertPlayerSyncEnabled\(playerSyncEnabled\);\s*return call\('getLaLigaSyncStatusV2'/s,
  );
});

test('player snapshot loading ignores stale async work after cleanup', () => {
  const component = read('src/components/PlayersSyncTab.jsx');

  assert.match(component, /let cancelled = false/);
  assert.match(component, /if \(cancelled\) return/);
  assert.match(component, /return \(\) => \{\s*cancelled = true;/s);
});

test('local sync prevents duplicate runs and clears stale progress timers', () => {
  const component = read('src/components/PlayersSyncTab.jsx');

  assert.match(component, /const syncInFlightRef = useRef\(false\)/);
  assert.match(
    component,
    /if \(!playerSyncEnabled \|\| syncInFlightRef\.current\) return;\s*syncInFlightRef\.current = true;/s,
  );
  assert.match(
    component,
    /if \(progressTimeoutRef\.current\) \{\s*clearTimeout\(progressTimeoutRef\.current\);\s*progressTimeoutRef\.current = null;/s,
  );
  assert.match(component, /finally \{\s*syncInFlightRef\.current = false;/s);
});

test('both player sync generations use the same protected server handlers', () => {
  const index = read('functions/index.js');
  const handlers = read('functions/handlers/player-sync.js');
  const service = read('functions/lib/player-sync.js');
  const rules = read('firestore.rules');

  assert.match(index, /defineSecret\('FOOTBALL_DATA_API_KEY'\)/);
  assert.match(index, /exports\.syncLaLigaPlayersV2/);
  assert.match(index, /exports\.getLaLigaSyncStatusV2/);
  assert.match(index, /exports\.syncLaLigaPlayers/);
  assert.match(index, /exports\.getLaLigaSyncStatus/);
  assert.doesNotMatch(index, /FOOTBALL_API_BASE|POSITION_MAP|TEAM_NAME_MAP/);
  assert.match(handlers, /requireSuperAdmin/);
  assert.match(handlers, /syncLaLigaPlayersV2Handler/);
  assert.match(handlers, /syncLaLigaPlayersLegacyHandler/);
  assert.match(handlers, /getLaLigaSyncStatusLegacyHandler/);
  assert.match(handlers, /activeRunId/);
  assert.match(service, /SYNC_LEASE_MS/);
  assert.match(service, /currentRunId/);
  assert.match(service, /laLigaSyncRuns/);
  assert.match(rules, /config\/laLigaSync\)\.data\.activeRunId == runId/);
});
