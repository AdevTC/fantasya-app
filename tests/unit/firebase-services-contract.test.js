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

test('callable consumers route protected operations through shared services', () => {
  const loginSource = source('src/pages/LoginPage.jsx');
  const adminApiSource = source('src/services/admin-api.js');
  const adminTabSource = source('src/components/AdminTab.jsx');
  const profileSource = source('src/pages/UserProfilePage.jsx');

  assert.doesNotMatch(loginSource, /\bgetFunctions\b/);
  assert.match(loginSource, /config\/firebase/);
  assert.match(loginSource, /\bfunctions\b/);

  assert.match(adminApiSource, /call\('createProfileDocumentsV2'/);
  assert.match(adminApiSource, /call\('unlinkUserFromTeamV2'/);
  assert.match(adminApiSource, /call\('createOrGetChatV2'/);
  assert.doesNotMatch(adminTabSource, /httpsCallable|\bfunctions\b/);
  assert.doesNotMatch(profileSource, /httpsCallable|\bfunctions\b/);
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

test('player sync uses the centralized Functions service', () => {
  const syncSource = source('src/components/PlayersSyncTab.jsx');
  const apiSource = source('src/services/admin-api.js');

  assert.doesNotMatch(syncSource, /a\.run\.app|\bfetch\(/);
  assert.match(syncSource, /services\/admin-api/);
  assert.match(apiSource, /syncLaLigaPlayersV2/);
  assert.match(apiSource, /getLaLigaSyncStatusV2/);
});
