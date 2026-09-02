import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlayerSyncRuntime } from '../../src/config/player-sync-runtime.js';

test('emulator mode disables every legacy remote player-sync request', () => {
  assert.deepEqual(resolvePlayerSyncRuntime(true), {
    legacyRemoteEnabled: false,
    mode: 'local-isolated',
  });
});

test('production keeps the legacy endpoint available until V2 migration', () => {
  assert.deepEqual(resolvePlayerSyncRuntime(false), {
    legacyRemoteEnabled: true,
    mode: 'legacy-remote',
  });
});
