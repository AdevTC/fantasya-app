import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function text(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function json(path) {
  return JSON.parse(text(path));
}

function dotenv(path) {
  return Object.fromEntries(
    text(path)
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

test('development environment can only target the demo project', () => {
  const env = dotenv('.env.development');

  assert.equal(env.VITE_USE_FIREBASE_EMULATORS, 'true');
  assert.equal(env.VITE_FIREBASE_PROJECT_ID, 'demo-fantasya');
  assert.equal(env.VITE_FIREBASE_API_KEY, 'fake-api-key');
});

test('Firebase CLI defaults to demo-fantasya with fixed local ports', () => {
  const aliases = json('.firebaserc');
  const firebase = json('firebase.json');

  assert.deepEqual(aliases.projects, {
    default: 'demo-fantasya',
    production: 'tictaktools',
  });
  assert.deepEqual(firebase.emulators, {
    auth: { host: '127.0.0.1', port: 9099 },
    firestore: { host: '127.0.0.1', port: 8080 },
    functions: { host: '127.0.0.1', port: 5001 },
    storage: { host: '127.0.0.1', port: 9199 },
    ui: { enabled: true, host: '127.0.0.1', port: 4000 },
    singleProjectMode: true,
  });
});

test('local scripts name the demo project and own the emulator lifecycle', () => {
  const scripts = json('package.json').scripts;

  assert.equal(
    scripts.dev,
    'node scripts/run-with-firebase-emulators.mjs --ui "npm run dev:session"',
  );
  assert.match(scripts['dev:emulators'], /emulators:start --project demo-fantasya/);
  assert.equal(scripts['dev:session'], 'run-s dev:seed dev:web');
  assert.match(scripts['dev:web'], /--strictPort(?:\s|$)/);
  assert.equal(
    scripts['test:seed'],
    'node scripts/run-with-firebase-emulators.mjs "npm --prefix functions run test:seed"',
  );
});

test('Firestore indexes are versioned using the current schema', () => {
  const indexes = json('firestore.indexes.json');
  const ignore = text('.gitignore');

  assert.doesNotMatch(ignore, /^firestore\.indexes\.json$/m);
  assert.equal(Object.hasOwn(indexes, 'singleFieldOverrides'), false);
  assert.ok(indexes.fieldOverrides.some((entry) => (
    entry.collectionGroup === 'posts' && entry.fieldPath === 'createdAt'
  )));
  assert.ok(indexes.indexes.some((entry) => (
    entry.collectionGroup === 'posts' &&
    entry.fields.some((field) => field.fieldPath === 'tags') &&
    entry.fields.some((field) => field.fieldPath === 'createdAt')
  )));
});
