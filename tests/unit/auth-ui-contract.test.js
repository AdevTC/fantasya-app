import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const loginSource = fs.readFileSync('src/pages/LoginPage.jsx', 'utf8');
const completeSource = fs.readFileSync(
  'src/pages/CompleteProfilePage.jsx',
  'utf8',
);

test('both profile entry points use the shared username contract and callable', () => {
  for (const source of [loginSource, completeSource]) {
    assert.match(source, /getUsernameValidationError/);
    assert.match(source, /normalizeUsername/);
    assert.match(source, /createProfile/);
  }
});

test('registration never deletes Auth state after a downstream failure', () => {
  assert.doesNotMatch(loginSource, /currentUser\.delete|deleteUser\(/);
  assert.match(loginSource, /profile-incomplete/);
  assert.match(loginSource, /verification-pending/);
  assert.match(loginSource, /complete-profile/);
  assert.match(loginSource, /handleResendVerification/);
});

test('profile completion writes only through the callable', () => {
  assert.doesNotMatch(
    completeSource,
    /writeBatch|setDoc|updateDoc|collection\(|doc\(/,
  );
});
