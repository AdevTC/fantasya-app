import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const superAdminSource = fs.readFileSync(
  'src/pages/SuperAdminPage.jsx',
  'utf8',
);
const functionsSource = fs.readFileSync('functions/index.js', 'utf8');

test('role changes use the protected callable instead of client writes', () => {
  assert.match(superAdminSource, /setUserAppRole/);
  assert.doesNotMatch(superAdminSource, /updateDoc\([^)]*appRole/);
});

test('production-safe callable aliases delegate to reviewed handlers', () => {
  assert.match(
    functionsSource,
    /exports\.createProfileDocumentsV2\s*=\s*onCall/,
  );
  assert.match(functionsSource, /unlinkUserFromTeamHandler/);
  assert.match(
    functionsSource,
    /exports\.unlinkUserFromTeamV2\s*=\s*onCall/,
  );
  assert.match(
    functionsSource,
    /exports\.createOrGetChatV2\s*=\s*onCall/,
  );
});
