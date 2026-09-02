import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(?:js|jsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

test('client contains no XP mutation helper or call site', () => {
  const source = listSourceFiles('src')
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');

  assert.equal(fs.existsSync('src/utils/xp.js'), false);
  assert.equal(fs.existsSync('src/pages/CreatePost.jsx'), false);
  assert.doesNotMatch(source, /grantXp|calculateXpForAllUsers/);
  assert.match(source, /recalculateXp/);
});

test('Functions export idempotent XP triggers and protected recalc', () => {
  const source = fs.readFileSync('functions/index.js', 'utf8');
  assert.match(source, /exports\.onPostCreatedAwardXp/);
  assert.match(source, /exports\.onTransferCreatedAwardXp/);
  assert.match(source, /exports\.recalculateXp/);
});
