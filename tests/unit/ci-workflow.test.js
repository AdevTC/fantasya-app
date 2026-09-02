import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);

test('CI runs the complete local verification stack on the supported runtimes', () => {
  assert.match(workflow, /uses: actions\/checkout@v7/);
  assert.match(workflow, /uses: actions\/setup-node@v6/);
  assert.match(workflow, /node-version-file: \.nvmrc/);
  assert.match(workflow, /uses: actions\/setup-java@v5/);
  assert.match(workflow, /java-version: '21'/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm --prefix functions ci/);
  assert.match(workflow, /run: npm run verify/);
});

test('CI remains credential-free and incapable of deploying production', () => {
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(
    workflow,
    /cp functions\/\.secret\.local\.example functions\/\.secret\.local/,
  );
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./i);
  assert.doesNotMatch(workflow, /tictaktools/i);
  assert.doesNotMatch(workflow, /firebase\s+deploy/i);
});
