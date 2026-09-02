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

test('unlink callable delegates to the reviewed authorization handler', () => {
  assert.match(functionsSource, /unlinkUserFromTeamHandler/);
  assert.match(
    functionsSource,
    /exports\.unlinkUserFromTeam\s*=\s*onCall/,
  );
});
