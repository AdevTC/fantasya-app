import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const activationScript = resolve('scripts/activate-node22.ps1');
const pwshLookup = process.platform === 'win32'
  ? spawnSync('where.exe', ['pwsh.exe'], { encoding: 'utf8' })
  : null;
const pwsh = pwshLookup?.status === 0
  ? pwshLookup.stdout.trim().split(/\r?\n/)[0]
  : null;

test('activation script supports the existing fnm Node 22 cache', () => {
  const source = readFileSync(activationScript, 'utf8');

  assert.match(source, /node-versions/);
  assert.match(source, /installation\\node\.exe/);
  assert.match(source, /Get-AuthenticodeSignature/);
  assert.match(source, /OpenJS Foundation/);
  assert.match(source, /npm\.cmd/);
  assert.match(source, /npm-cli\.js/);
  assert.doesNotMatch(source, /\$env:FNM_DIR/);
});

test('activation works on Windows when fnm and node are absent from PATH', {
  skip: process.platform !== 'win32' || !pwsh,
}, () => {
  const escapedScript = activationScript.replaceAll("'", "''");
  const result = spawnSync(
    pwsh,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `. '${escapedScript}'; node --version`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        FNM_DIR: join(resolve('.'), 'untrusted-fnm-directory'),
        PATH: `${process.env.SystemRoot || 'C:\\Windows'}\\System32`,
      },
    },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Fantasya usa Node v22\./);
  assert.match(result.stdout, /v22\./);
});
