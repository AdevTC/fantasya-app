import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAdSenseRuntime } from '../../src/config/ads-runtime.js';

const productionEnv = {
  VITE_ADSENSE_PUBLISHER_ID: 'ca-pub-5737773389228415',
};

test('disables AdSense whenever Firebase emulators are active', () => {
  assert.deepEqual(resolveAdSenseRuntime(productionEnv, true), {
    enabled: false,
    publisherId: null,
  });
});

test('enables AdSense only for a valid production publisher ID', () => {
  assert.deepEqual(resolveAdSenseRuntime(productionEnv, false), {
    enabled: true,
    publisherId: 'ca-pub-5737773389228415',
  });

  assert.deepEqual(resolveAdSenseRuntime({}, false), {
    enabled: false,
    publisherId: null,
  });
  assert.deepEqual(resolveAdSenseRuntime({
    VITE_ADSENSE_PUBLISHER_ID: 'invalid',
  }, false), {
    enabled: false,
    publisherId: null,
  });
});
