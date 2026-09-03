import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_PRODUCTION,
  assertNoFirebaseFunctionsDotenv,
  assertProductionStateUnchanged,
  evaluateProductionState,
  findFirebaseFunctionsDotenvFiles,
  inspectProductionState,
  parseActiveFirebaseAccount,
  parseFirebaseProjectIds,
  parseGitDivergence,
  printProductionReport,
  refreshOriginBranches,
  shouldInspectFootballSecret,
} from '../../scripts/production-preflight.mjs';
import * as deployProduction from '../../scripts/deploy-production.mjs';
import * as deleteLegacy from '../../scripts/delete-legacy-functions.mjs';

const {
  DEPLOY_TARGETS,
  buildDeployArguments,
  confirmationForTarget,
} = deployProduction;
const {
  LEGACY_DELETE_ARGUMENTS,
  LEGACY_DELETE_CONFIRMATION,
} = deleteLegacy;

const safe = {
  branch: 'main',
  clean: true,
  originUrl: 'https://github.com/AdevTC/fantasya-app.git',
  ahead: 0,
  behind: 0,
  activeFirebaseAccount: 'jordisumba@gmail.com',
  firebaseProjectIds: ['demo-fantasya', 'tictaktools'],
  firebaseFunctionsDotenvFiles: [],
};

function runGit(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
  if (!allowFailure) {
    assert.equal(
      result.status,
      0,
      `git ${args.join(' ')} failed: ${result.stderr}`,
    );
  }
  return String(result.stdout || '').trim();
}

function createGitFixture() {
  const root = mkdtempSync(join(tmpdir(), 'fantasya-production-fetch-'));
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const client = join(root, 'client');
  mkdirSync(seed);
  runGit(root, ['init', '--bare', remote]);
  runGit(seed, ['init']);
  runGit(seed, ['config', 'user.name', 'Release Guard Test']);
  runGit(seed, ['config', 'user.email', 'release-guard@example.invalid']);
  writeFileSync(join(seed, 'release.txt'), 'initial\n');
  runGit(seed, ['add', 'release.txt']);
  runGit(seed, ['commit', '-m', 'initial']);
  runGit(seed, ['branch', '-M', 'main']);
  runGit(seed, ['remote', 'add', 'origin', remote]);
  runGit(seed, ['push', '-u', 'origin', 'main']);
  runGit(root, ['clone', '--branch', 'main', remote, client]);
  return { root, remote, seed, client };
}

function advanceMain(seed, marker) {
  writeFileSync(join(seed, 'release.txt'), `${marker}\n`);
  runGit(seed, ['add', 'release.txt']);
  runGit(seed, ['commit', '-m', marker]);
  runGit(seed, ['push', 'origin', 'main']);
  return runGit(seed, ['rev-parse', 'main']);
}

const developmentGuide = readFileSync(
  new URL('../../docs/development.md', import.meta.url),
  'utf8',
);
const productionRunbook = readFileSync(
  new URL('../../docs/releases/firebase-production-runbook.md', import.meta.url),
  'utf8',
);

function hasAmbiguousSyncGuidance(value) {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const phrases = normalized
    .split(/[.!?;:]+/u)
    .map((phrase) => phrase.trim())
    .filter(Boolean);

  return phrases.some((phrase) => {
    const tokens = phrase.match(/[a-z0-9]+/g) ?? [];
    const words = new Set(tokens);
    const mentionsSync = words.has('sync') || words.has('sincronizacion');
    const restrictsScope = words.has('solo')
      || tokens.some((word) => word.startsWith('exclusiv'));
    const mentionsLocalEnvironment = words.has('desarrollo')
      || tokens.some((word) => word.startsWith('emulador'));
    const qualifiesClientControl = (
      (words.has('control') || words.has('controles'))
      && words.has('cliente')
    );
    return mentionsSync
      && restrictsScope
      && mentionsLocalEnvironment
      && !qualifiesClientControl;
  });
}

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

test('rejects Firebase Functions dotenv files that Firebase Tools can load', () => {
  for (const filename of ['.env', '.env.tictaktools', '.env.production']) {
    const errors = evaluateProductionState({
      ...safe,
      firebaseFunctionsDotenvFiles: [filename],
    });
    assert.match(errors.join('\n'), /Functions environment file/i);
  }
});

test('dotenv inspection rejects only production-loaded files and never reads values', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fantasya-production-dotenv-'));
  const functionsDirectory = join(directory, 'functions');
  mkdirSync(functionsDirectory);
  try {
    writeFileSync(join(functionsDirectory, '.env.local'), 'SECRET=allowed-local\n');
    writeFileSync(join(functionsDirectory, '.secret.local'), 'SECRET=allowed-local\n');
    assert.deepEqual(findFirebaseFunctionsDotenvFiles(directory), []);
    assert.doesNotThrow(() => assertNoFirebaseFunctionsDotenv(directory));

    writeFileSync(join(functionsDirectory, '.env.tictaktools'), 'SECRET=never-print\n');
    assert.deepEqual(findFirebaseFunctionsDotenvFiles(directory), [
      '.env.tictaktools',
    ]);
    assert.throws(
      () => assertNoFirebaseFunctionsDotenv(directory),
      (error) => {
        assert.match(error.message, /Functions environment file/i);
        assert.doesNotMatch(String(error), /SECRET|never-print|allowed-local/);
        return true;
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('production unchanged-state recheck fails closed on a newly-created dotenv', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fantasya-production-recheck-'));
  const functionsDirectory = join(directory, 'functions');
  mkdirSync(functionsDirectory);
  try {
    writeFileSync(join(functionsDirectory, '.env.production'), 'SECRET=never-print\n');
    assert.throws(
      () => assertProductionStateUnchanged(safe, { cwd: directory }),
      (error) => {
        assert.match(error.message, /Functions environment file/i);
        assert.doesNotMatch(String(error), /SECRET|never-print/);
        return true;
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('production inspection re-reads dotenv state after the origin refresh', async () => {
  let refreshed = false;
  let firebaseInspected = false;
  const directory = mkdtempSync(join(tmpdir(), 'fantasya-production-inspect-'));
  let report;
  try {
    report = await inspectProductionState({
      cwd: directory,
      readLocal: () => ({
        ...safe,
        commit: 'a'.repeat(40),
        firebaseFunctionsDotenvFiles: refreshed ? ['.env.production'] : [],
      }),
      refreshOrigin: () => {
        refreshed = true;
      },
      inspectFirebase: () => {
        firebaseInspected = true;
        throw new Error('Firebase inspection must not run.');
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  assert.equal(refreshed, true);
  assert.match(report.errors.join('\n'), /Functions environment file/i);
  assert.equal(report.state.firebaseFunctionsDotenvFiles.length, 1);
  assert.equal(firebaseInspected, false);
});

test('production unchanged-state recheck rejects a dotenv created by refresh', () => {
  const expected = {
    ...safe,
    commit: 'a'.repeat(40),
  };
  let refreshed = false;
  const directory = mkdtempSync(join(tmpdir(), 'fantasya-production-race-'));
  try {
    assert.throws(
      () => assertProductionStateUnchanged(expected, {
        cwd: directory,
        refreshOrigin: () => {
          refreshed = true;
        },
        readLocal: () => ({
          ...expected,
          firebaseFunctionsDotenvFiles: refreshed ? ['.env.tictaktools'] : [],
        }),
        readDivergence: () => ({ ahead: 0, behind: 0 }),
      }),
      (error) => {
        assert.match(error.message, /release state changed/i);
        assert.doesNotMatch(String(error), /SECRET|never-print/);
        return true;
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('production report sanitizes every local and identity value', () => {
  const lines = [];
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  console.log = (...values) => lines.push(values.join(' '));
  console.warn = (...values) => lines.push(values.join(' '));
  console.error = (...values) => lines.push(values.join(' '));
  try {
    printProductionReport({
      state: {
        branch: 'main\nSECRET=branch',
        commit: 'SECRET=commit',
        originUrl: 'https://token:SECRET@github.com/AdevTC/fantasya-app.git',
        clean: false,
        ahead: null,
        behind: null,
        activeFirebaseAccount: 'SECRET-email@example.com',
        firebaseProjectIds: [],
        secretStatus: 'not-requested',
      },
      warnings: [],
      errors: [],
    });
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }

  const output = lines.join('\n');
  assert.doesNotMatch(output, /SECRET|token|example\.com/);
  assert.match(output, /branch: not confirmed/);
  assert.match(output, /commit: not confirmed/);
  assert.match(output, /origin: not confirmed/);
  assert.match(output, /Firebase account: not confirmed/);
});

test('production deploy checks dotenv immediately before Firebase spawn', async () => {
  const calls = [];
  await assert.rejects(
    deployProduction.runProductionDeploy('firestore', {
      cwd: process.cwd(),
      stdin: { isTTY: true },
      stdout: { isTTY: true },
      preflight: async () => ({ state: safe, errors: [], warnings: [] }),
      printReport: () => calls.push('report'),
      askConfirmation: async (expected) => expected,
      recheck: () => calls.push('recheck'),
      checkDotenv: () => {
        calls.push('dotenv');
        throw new Error('Firebase Functions environment file is present.');
      },
      spawnFirebase: () => {
        calls.push('deploy');
        return { status: 0 };
      },
    }),
    /Functions environment file/i,
  );
  assert.deepEqual(calls, ['report', 'recheck', 'dotenv']);
});

test('legacy deletion checks dotenv immediately before Firebase spawn', async () => {
  const calls = [];
  await assert.rejects(
    deleteLegacy.runLegacyDelete({
      cwd: process.cwd(),
      stdin: { isTTY: true },
      stdout: { isTTY: true },
      preflight: async () => ({ state: safe, errors: [], warnings: [] }),
      printReport: () => calls.push('report'),
      askConfirmation: async () => LEGACY_DELETE_CONFIRMATION,
      recheck: () => calls.push('recheck'),
      checkDotenv: () => {
        calls.push('dotenv');
        throw new Error('Firebase Functions environment file is present.');
      },
      spawnFirebase: () => {
        calls.push('delete');
        return { status: 0 };
      },
    }),
    /Functions environment file/i,
  );
  assert.deepEqual(calls, ['report', 'recheck', 'dotenv']);
});

test('firebase.json excludes every dotenv file from the Functions package', () => {
  const firebase = JSON.parse(readFileSync(
    new URL('../../firebase.json', import.meta.url),
    'utf8',
  ));
  const ignore = firebase.functions[0].ignore;
  assert.ok(ignore.includes('.env'));
  assert.ok(ignore.includes('.env.*'));
});

for (const [name, configureFetch] of [
  [
    'remote.origin.fetch is absent',
    (client) => runGit(client, ['config', '--unset-all', 'remote.origin.fetch'], {
      allowFailure: true,
    }),
  ],
  [
    'remote.origin.fetch is remapped',
    (client) => {
      runGit(client, ['config', '--unset-all', 'remote.origin.fetch']);
      runGit(client, [
        'config',
        '--add',
        'remote.origin.fetch',
        '+refs/heads/*:refs/remotes/remapped/*',
      ]);
    },
  ],
]) {
  test(`production refresh updates origin/main when ${name}`, () => {
    const fixture = createGitFixture();
    try {
      const stale = runGit(fixture.client, ['rev-parse', 'origin/main']);
      const current = advanceMain(fixture.seed, `advance-${name}`);
      assert.notEqual(stale, current);
      configureFetch(fixture.client);

      refreshOriginBranches(fixture.client, ['main']);

      assert.equal(
        runGit(fixture.client, ['rev-parse', 'origin/main']),
        current,
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}

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

  assert.match(source, /preflight = runProductionPreflight/);
  assert.match(source, /const report = await preflight\(\{ cwd \}\)/);
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
    'delete tictaktools syncLaLigaPlayers getLaLigaSyncStatus clearLaLigaPlayers',
  );
  assert.deepEqual(LEGACY_DELETE_ARGUMENTS, [
    'functions:delete',
    'syncLaLigaPlayers',
    'getLaLigaSyncStatus',
    'clearLaLigaPlayers',
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

test('development guide distinguishes PR Functions from main-only mutations', () => {
  assert.doesNotMatch(developmentGuide, /deploy:prod:\*/);
  assert.match(
    developmentGuide,
    /deploy:prod:pr:functions:core-v2[\s\S]*deploy:prod:pr:functions:league[\s\S]*deploy:prod:pr:functions:content-v2/,
  );
  assert.match(
    developmentGuide,
    /rama de la PR publicada[\s\S]*SHA exacto[\s\S]*no exige `main`/,
  );
  assert.match(
    developmentGuide,
    /deploy:prod:indexes[\s\S]*deploy:prod:firestore[\s\S]*deploy:prod:storage[\s\S]*delete:prod:functions:legacy-sync/,
  );
  assert.match(
    developmentGuide,
    /`main` limpia y sincronizada con `origin\/main`/,
  );
  assert.match(
    developmentGuide,
    /\+refs\/heads\/main:refs\/remotes\/origin\/main/,
  );
  assert.doesNotMatch(developmentGuide, /`git fetch origin main`/);
});

test('runbook preserves additive Functions and states billing limitations', () => {
  const introduction = productionRunbook.split(
    '## Puertas obligatorias antes de empezar',
  )[0];
  assert.match(
    introduction,
    /fixture y los\s+controles de sync del cliente nuevo se usan exclusivamente[\s\S]*desarrollo con\s+emuladores/,
  );
  assert.doesNotMatch(
    introduction,
    /endpoints\s+legacy capaces/,
  );
  assert.match(
    introduction,
    /Los tres endpoints relacionados con esta capacidad/,
  );
  assert.equal(
    hasAmbiguousSyncGuidance(productionRunbook),
    false,
  );
  assert.match(
    introduction,
    /frontend nuevo[\s\S]{0,100}no solicitará sync/,
  );
  assert.match(
    introduction,
    /syncLaLigaPlayers[\s\S]*getLaLigaSyncStatus[\s\S]*clearLaLigaPlayers[\s\S]*siguen desplegados temporalmente/,
  );
  assert.match(
    introduction,
    /Los tres endpoints relacionados[\s\S]*No deben invocarse[\s\S]{0,40}ni retirarse[\s\S]*gate/,
  );
  assert.doesNotMatch(
    productionRunbook,
    /revertir los handlers\/archivos en Git y desplegar sólo el grupo afectado/,
  );
  assert.match(
    productionRunbook,
    /Functions aditivas quedan desplegadas sin uso[\s\S]*release separada, diseñada y aprobada/,
  );
  assert.match(
    productionRunbook,
    /spend caps?[\s\S]{0,300}no (?:es|son) un\s+límite duro ni instantáneo[\s\S]{0,300}retraso[\s\S]*reporting/,
  );
});

test('sync guidance classifier rejects only unqualified ambiguous phrases', () => {
  const ambiguous = [
    'El sync sólo se usa en desarrollo con emuladores.',
    'LA SINCRONIZACIÓN   está disponible exclusivamente\n en desarrollo.',
    'La sincronizacion funciona solo con el emulador.',
    'El fixture y el sync sólo permanecen activos en desarrollo con emuladores.',
  ];
  for (const sentence of ambiguous) {
    assert.equal(hasAmbiguousSyncGuidance(sentence), true, sentence);
  }

  assert.equal(
    hasAmbiguousSyncGuidance(
      'El fixture y los controles de sync del cliente nuevo se usan '
      + 'exclusivamente en desarrollo con emuladores.',
    ),
    false,
  );
  assert.equal(
    hasAmbiguousSyncGuidance(
      'El fixture está versionado. El sync sólo se usa en desarrollo.',
    ),
    true,
    'qualification in another sentence must not exempt ambiguous guidance',
  );
});
