import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('the shared Firebase module owns every service and emulator connection', () => {
  const firebaseSource = source('src/config/firebase.js');

  assert.match(firebaseSource, /resolveFirebaseRuntime\(import\.meta\.env, import\.meta\.env\.DEV\)/);
  assert.match(firebaseSource, /export const functions = getFunctions/);
  assert.match(firebaseSource, /export const storage = getStorage/);
  assert.match(firebaseSource, /connectAuthEmulator/);
  assert.match(firebaseSource, /connectFirestoreEmulator/);
  assert.match(firebaseSource, /connectFunctionsEmulator/);
  assert.match(firebaseSource, /connectStorageEmulator/);
  assert.match(firebaseSource, /export const isUsingEmulators/);
});

test('callable consumers reuse the shared Functions instance', () => {
  for (const path of [
    'src/pages/LoginPage.jsx',
    'src/pages/UserProfilePage.jsx',
    'src/components/AdminTab.jsx',
  ]) {
    const fileSource = source(path);
    assert.doesNotMatch(fileSource, /\bgetFunctions\b/);
    assert.match(fileSource, /config\/firebase/);
    assert.match(fileSource, /\bfunctions\b/);
  }
});

test('the application renders the local environment banner', () => {
  const appSource = source('src/App.jsx');
  const bannerSource = source('src/components/EnvironmentBanner.jsx');

  assert.match(appSource, /<EnvironmentBanner\s*\/>/);
  assert.match(bannerSource, /Firebase local · demo-fantasya/);
  assert.match(bannerSource, /if \(!isUsingEmulators\) return null/);
});

test('AdSense is loaded by the guarded component instead of static HTML', () => {
  const htmlSource = source('index.html');
  const adSource = source('src/components/AdBanner.jsx');

  assert.doesNotMatch(htmlSource, /googlesyndication/);
  assert.match(adSource, /resolveAdSenseRuntime/);
  assert.match(adSource, /isUsingEmulators/);
});
