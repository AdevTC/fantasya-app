import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_PRODUCTION,
  evaluateProductionState,
  parseActiveFirebaseAccount,
  parseFirebaseProjectIds,
  parseGitDivergence,
  shouldInspectFootballSecret,
} from '../../scripts/production-preflight.mjs';
import {
  DEPLOY_TARGETS,
  buildDeployArguments,
  confirmationForTarget,
} from '../../scripts/deploy-production.mjs';
import {
  LEGACY_DELETE_ARGUMENTS,
  LEGACY_DELETE_CONFIRMATION,
} from '../../scripts/delete-legacy-functions.mjs';

const safe = {
  branch: 'main',
  clean: true,
  originUrl: 'https://github.com/AdevTC/fantasya-app.git',
  ahead: 0,
  behind: 0,
  activeFirebaseAccount: 'jordisumba@gmail.com',
  firebaseProjectIds: ['demo-fantasya', 'tictaktools'],
};

test('accepts only the exact synchronized production identity', () => {
  assert.deepEqual(evaluateProductionState(safe), []);
  assert.deepEqual(evaluateProductionState({
    ...safe,
    activeFirebaseAccount: 'JordiSumba@gmail.com',
  }), []);
});

test('rejects a noncanonical GitHub origin even when every other check passes', () => {
  const errors = evaluateProductionState({
    ...safe,
    originUrl: 'git@github.com:someone-else/fantasya-app.git',
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /origin must/);
});

test('rejects dirty, divergent, wrong-account and missing-project state', () => {
  const errors = evaluateProductionState({
    ...safe,
    branch: 'feature/setup',
    clean: false,
    ahead: 1,
    behind: 2,
    activeFirebaseAccount: 'another@example.com',
    firebaseProjectIds: [],
  });

  assert.equal(errors.length, 6);
  assert.match(errors.join('\n'), /branch must be main/);
  assert.match(errors.join('\n'), /working tree must be clean/);
  assert.match(errors.join('\n'), /Firebase account/);
  assert.match(errors.join('\n'), /Firebase project/);
});

test('parses only sanitized Firebase and Git preflight output', () => {
  assert.equal(
    parseActiveFirebaseAccount(
      'Logged in as jordisumba@gmail.com\nOther available accounts',
    ),
    'jordisumba@gmail.com',
  );
  assert.equal(parseActiveFirebaseAccount('No authorized accounts'), null);
  assert.deepEqual(parseFirebaseProjectIds(JSON.stringify({
    status: 'success',
    result: [{ projectId: 'tictaktools' }, { projectId: 'demo-fantasya' }],
  })), ['tictaktools', 'demo-fantasya']);
  assert.deepEqual(parseGitDivergence('2\t3'), { behind: 2, ahead: 3 });
});

test('inspects Football Data secret metadata only for a strict boolean opt-in', () => {
  assert.equal(shouldInspectFootballSecret(false), false);
  assert.equal(shouldInspectFootballSecret(true), true);
  assert.equal(shouldInspectFootballSecret('true'), false);
  assert.equal(shouldInspectFootballSecret(1), false);
});

test('normal production preflight does not opt into Football Data secret inspection', () => {
  const source = readFileSync(
    new URL('../../scripts/production-preflight.mjs', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /const report = await runProductionPreflight\(\);/,
  );
  assert.match(
    source,
    /inspectProductionState\(\{\s*cwd,\s*inspectFootballSecret:\s*requireFootballSecret,?\s*\}\)/,
  );
  assert.match(
    source,
    /shouldInspectFootballSecret\(inspectFootballSecret\)[\s\S]*?probeFootballSecretStatus\(cwd, activeFirebaseAccount\)/,
  );
});

test('main-only deploy targets contain exactly rules, indexes and storage', () => {
  assert.deepEqual(Object.keys(DEPLOY_TARGETS), [
    'firestore',
    'indexes',
    'storage',
  ]);
  assert.deepEqual(DEPLOY_TARGETS, {
    firestore: 'firestore:rules',
    indexes: 'firestore:indexes',
    storage: 'storage',
  });
  assert.equal(
    confirmationForTarget('storage'),
    'deploy tictaktools storage',
  );
  for (const target of [
    'functions-core',
    'functions-sync',
    'functions-league',
  ]) {
    assert.throws(() => confirmationForTarget(target), /Unknown target/);
    assert.throws(() => buildDeployArguments(target), /Unknown target/);
  }
});

test('main-only deployment never opts into secrets or contains Function routes', () => {
  const source = readFileSync(
    new URL('../../scripts/deploy-production.mjs', import.meta.url),
    'utf8',
  );

  assert.match(source, /runProductionPreflight\(\)/);
  assert.doesNotMatch(
    source,
    /targetNeedsFootballSecret|requireFootballSecret|functions-core|functions-sync|functions-league/,
  );
});

test('main-only deployment rejects non-string targets without coercion', () => {
  const target = {
    toString() {
      throw new Error('SECRET=never-print');
    },
  };
  for (const invoke of [
    () => confirmationForTarget(target),
    () => buildDeployArguments(target),
  ]) {
    assert.throws(invoke, (error) => {
      assert.equal(error.message, 'Unknown target.');
      assert.doesNotMatch(String(error), /SECRET|never-print/);
      return true;
    });
  }
});

test('deploy arguments always pin project, account and allowlisted resources', () => {
  assert.deepEqual(buildDeployArguments('firestore'), [
    'deploy',
    '--project',
    EXPECTED_PRODUCTION.firebaseProject,
    '--account',
    EXPECTED_PRODUCTION.firebaseAccount,
    '--only',
    'firestore:rules',
  ]);
});

test('legacy deletion cannot accept arbitrary function names', () => {
  assert.equal(
    LEGACY_DELETE_CONFIRMATION,
    'delete tictaktools syncLaLigaPlayers getLaLigaSyncStatus',
  );
  assert.deepEqual(LEGACY_DELETE_ARGUMENTS, [
    'functions:delete',
    'syncLaLigaPlayers',
    'getLaLigaSyncStatus',
    '--region',
    'us-central1',
    '--project',
    'tictaktools',
    '--account',
    'jordisumba@gmail.com',
  ]);
});

test('production mutation entrypoints reject a non-interactive process', () => {
  const deployScript = fileURLToPath(new URL(
    '../../scripts/deploy-production.mjs',
    import.meta.url,
  ));
  const deleteScript = fileURLToPath(new URL(
    '../../scripts/delete-legacy-functions.mjs',
    import.meta.url,
  ));
  const deploy = spawnSync(process.execPath, [deployScript, 'firestore'], {
    encoding: 'utf8',
  });
  const deletion = spawnSync(process.execPath, [deleteScript], {
    encoding: 'utf8',
  });

  assert.equal(deploy.status, 1);
  assert.match(`${deploy.stdout}${deploy.stderr}`, /interactive terminal/);
  assert.equal(deletion.status, 1);
  assert.match(`${deletion.stdout}${deletion.stderr}`, /interactive terminal/);
});

test('package scripts expose no direct production deployment escape hatch', () => {
  const rootPackage = JSON.parse(readFileSync(
    new URL('../../package.json', import.meta.url),
    'utf8',
  ));
  const functionsPackage = JSON.parse(readFileSync(
    new URL('../../functions/package.json', import.meta.url),
    'utf8',
  ));

  assert.equal(functionsPackage.scripts.deploy, undefined);
  assert.equal(rootPackage.scripts['firebase:deploy:rules'], undefined);
  assert.equal(rootPackage.scripts['firebase:deploy:firestore'], undefined);
  assert.equal(rootPackage.scripts['firebase:deploy:functions'], undefined);
  assert.equal(rootPackage.scripts['firebase:deploy:all'], undefined);
  assert.equal(rootPackage.scripts['deploy:prod:functions:core'], undefined);
  assert.equal(rootPackage.scripts['deploy:prod:functions:sync'], undefined);
  assert.equal(rootPackage.scripts['deploy:prod:functions:league'], undefined);
});
