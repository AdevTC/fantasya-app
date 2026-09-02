import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('player sync client uses only the shared callable API', () => {
  const component = read('src/components/PlayersSyncTab.jsx');
  const api = read('src/services/admin-api.js');

  assert.doesNotMatch(component, /a\.run\.app|allAuthenticatedUsers|getAuth|\bfetch\(/);
  assert.doesNotMatch(component, /resolvePlayerSyncRuntime|legacyRemoteEnabled/);
  assert.match(component, /getLaLigaSyncStatus/);
  assert.match(component, /syncLaLigaPlayers/);
  assert.match(api, /call\('getLaLigaSyncStatusV2'/);
  assert.match(api, /call\('syncLaLigaPlayersV2'/);
  assert.match(api, /timeout:\s*540000/);
  assert.equal(fs.existsSync('src/config/player-sync-runtime.js'), false);
});

test('both player sync generations use the same protected server handlers', () => {
  const index = read('functions/index.js');
  const handlers = read('functions/handlers/player-sync.js');

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
});
