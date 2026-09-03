import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const superAdminSource = fs.readFileSync(
  'src/pages/SuperAdminPage.jsx',
  'utf8',
);
const functionsSource = fs.readFileSync('functions/index.js', 'utf8');
const compactFunctionsSource = functionsSource.replace(/\s+/g, '');

test('role changes use the protected callable instead of client writes', () => {
  assert.match(superAdminSource, /setUserAppRole/);
  assert.doesNotMatch(superAdminSource, /updateDoc\([^)]*appRole/);
});

test('production-safe callable aliases delegate to reviewed handlers', () => {
  assert.ok(
    compactFunctionsSource.includes(
      "exports.createProfileDocumentsV2=onCall({region:'us-central1',cors:browserOrigins},createProfileDocumentsHandler,);",
    ),
    'createProfileDocumentsV2 must delegate to createProfileDocumentsHandler',
  );
  assert.ok(
    compactFunctionsSource.includes(
      "exports.unlinkUserFromTeamV2=onCall({region:'us-central1',cors:browserOrigins},unlinkUserFromTeamHandler,);",
    ),
    'unlinkUserFromTeamV2 must delegate to unlinkUserFromTeamHandler',
  );
  assert.ok(
    compactFunctionsSource.includes(
      "exports.createOrGetChatV2=onCall({region:'us-central1',cors:browserOrigins},(request)=>createOrGetChatHandler({uid:requireAuth(request),data:request.data,}),);",
    ),
    'createOrGetChatV2 must authenticate and adapt request data for its handler',
  );
});
