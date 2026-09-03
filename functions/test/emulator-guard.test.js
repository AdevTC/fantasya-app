const test = require('node:test');
const assert = require('node:assert/strict');
const { assertEmulatorEnvironment } = require('../lib/emulator-guard');

const validEnv = {
  GCLOUD_PROJECT: 'demo-fantasya',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
};

test('accepts the complete demo emulator environment', () => {
  assert.doesNotThrow(() => assertEmulatorEnvironment(validEnv));
});

test('rejects production even when emulator hosts exist', () => {
  assert.throws(
    () => assertEmulatorEnvironment({
      ...validEnv,
      GCLOUD_PROJECT: 'tictaktools',
    }),
    /demo-fantasya/,
  );
});

test('rejects a missing emulator endpoint', () => {
  const env = { ...validEnv };
  delete env.FIRESTORE_EMULATOR_HOST;
  assert.throws(() => assertEmulatorEnvironment(env), /FIRESTORE_EMULATOR_HOST/);
});

test('rejects remote hosts, aliases, and unexpected emulator ports', () => {
  for (const [name, value] of [
    ['FIREBASE_AUTH_EMULATOR_HOST', 'localhost:9099'],
    ['FIRESTORE_EMULATOR_HOST', 'remote-host:8080'],
    ['FIREBASE_STORAGE_EMULATOR_HOST', '127.0.0.1:9299'],
  ]) {
    assert.throws(
      () => assertEmulatorEnvironment({ ...validEnv, [name]: value }),
      new RegExp(name),
    );
  }
});
