import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_PROJECT_ID,
  resolveFirebaseRuntime,
} from '../../src/config/runtime.js';

const demoEnv = {
  VITE_FIREBASE_PROJECT_ID: 'demo-fantasya',
  VITE_USE_FIREBASE_EMULATORS: 'true',
};

test('development accepts only the demo project with emulators enabled', () => {
  assert.deepEqual(resolveFirebaseRuntime(demoEnv, true), {
    projectId: DEMO_PROJECT_ID,
    useEmulators: true,
  });
});

test('development rejects the production project', () => {
  assert.throws(
    () => resolveFirebaseRuntime({
      ...demoEnv,
      VITE_FIREBASE_PROJECT_ID: 'tictaktools',
    }, true),
    /refusing to start/i,
  );
});

test('development rejects an emulator opt-out', () => {
  assert.throws(
    () => resolveFirebaseRuntime({
      ...demoEnv,
      VITE_USE_FIREBASE_EMULATORS: 'false',
    }, true),
    /emulators must be enabled/i,
  );
});

test('production preserves its configured project without emulator wiring', () => {
  assert.deepEqual(resolveFirebaseRuntime({
    VITE_FIREBASE_PROJECT_ID: 'tictaktools',
    VITE_USE_FIREBASE_EMULATORS: 'false',
  }, false), {
    projectId: 'tictaktools',
    useEmulators: false,
  });
});
