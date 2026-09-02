import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNodeVersion } from './check-node-version.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const require = createRequire(import.meta.url);

export const EXPECTED_PRODUCTION = Object.freeze({
  branch: 'main',
  gitOrigin: 'https://github.com/AdevTC/fantasya-app.git',
  firebaseAccount: 'jordisumba@gmail.com',
  firebaseProject: 'tictaktools',
  footballSecret: 'FOOTBALL_DATA_API_KEY',
});

export function evaluateProductionState(state) {
  const errors = [];
  if (state.branch !== EXPECTED_PRODUCTION.branch) {
    errors.push(`branch must be ${EXPECTED_PRODUCTION.branch}`);
  }
  if (state.clean !== true) {
    errors.push('working tree must be clean');
  }
  if (state.originUrl !== EXPECTED_PRODUCTION.gitOrigin) {
    errors.push('origin must point to the canonical Fantasya repository');
  }
  if (state.ahead !== 0) {
    errors.push('local main must not be ahead of origin/main');
  }
  if (state.behind !== 0) {
    errors.push('local main must not be behind origin/main');
  }
  if (
    String(state.activeFirebaseAccount || '').toLowerCase()
      !== EXPECTED_PRODUCTION.firebaseAccount
  ) {
    errors.push('required Firebase account is not active');
  }
  const projectIds = Array.isArray(state.firebaseProjectIds)
    ? state.firebaseProjectIds
    : [];
  if (!projectIds.includes(EXPECTED_PRODUCTION.firebaseProject)) {
    errors.push('production Firebase project is not visible');
  }
  return errors;
}

export function parseActiveFirebaseAccount(output) {
  const match = /Logged in as\s+([^\s]+)/i.exec(String(output || ''));
  return match?.[1] || null;
}

export function parseFirebaseProjectIds(output) {
  let payload;
  try {
    payload = JSON.parse(String(output || ''));
  } catch (error) {
    throw new Error('Firebase projects:list did not return valid JSON.', {
      cause: error,
    });
  }
  if (payload?.status !== 'success' || !Array.isArray(payload.result)) {
    throw new Error('Firebase projects:list returned an unexpected response.');
  }
  return payload.result
    .map((project) => project?.projectId)
    .filter((projectId) => typeof projectId === 'string');
}

export function parseGitDivergence(output) {
  const parts = String(output || '').trim().split(/\s+/).map(Number);
  if (
    parts.length !== 2
    || parts.some((value) => !Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error('Git returned an invalid main/origin divergence count.');
  }
  return { behind: parts[0], ahead: parts[1] };
}

function runCaptured(command, args, { cwd, label }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(`${label} could not start.`, { cause: result.error });
  }
  if (result.signal || result.status !== 0) {
    throw new Error(`${label} failed.`);
  }
  return String(result.stdout || '');
}

export function resolveFirebaseEntrypoint(cwd = projectRoot) {
  const entrypoint = resolve(
    cwd,
    'node_modules',
    'firebase-tools',
    'lib',
    'bin',
    'firebase.js',
  );
  if (!existsSync(entrypoint)) {
    throw new Error('Pinned Firebase CLI not found. Run npm ci first.');
  }
  return entrypoint;
}

export function spawnFirebaseCli(
  args,
  { cwd = projectRoot, stdio = 'pipe' } = {},
) {
  const options = {
    cwd,
    stdio,
    windowsHide: true,
  };
  if (stdio === 'pipe') {
    options.encoding = 'utf8';
  }
  return spawnSync(
    process.execPath,
    [resolveFirebaseEntrypoint(cwd), ...args],
    options,
  );
}

function runCapturedFirebase(args, { cwd, label }) {
  const result = spawnFirebaseCli(args, { cwd });
  if (result.error) {
    throw new Error(`${label} could not start.`, { cause: result.error });
  }
  if (result.signal || result.status !== 0) {
    throw new Error(`${label} failed.`);
  }
  return {
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function readLocalReleaseState(cwd) {
  const branch = runCaptured('git', ['branch', '--show-current'], {
    cwd,
    label: 'Git branch check',
  }).trim();
  const status = runCaptured(
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    { cwd, label: 'Git working-tree check' },
  );
  const commit = runCaptured('git', ['rev-parse', 'HEAD'], {
    cwd,
    label: 'Git commit check',
  }).trim();
  const originUrl = runCaptured('git', ['remote', 'get-url', 'origin'], {
    cwd,
    label: 'Git origin check',
  }).trim();
  return {
    branch,
    clean: status.trim() === '',
    commit,
    originUrl,
  };
}

export async function probeFootballSecretStatus(cwd, accountEmail) {
  try {
    const auth = require(resolve(
      cwd,
      'node_modules',
      'firebase-tools',
      'lib',
      'auth.js',
    ));
    const secretManager = require(resolve(
      cwd,
      'node_modules',
      'firebase-tools',
      'lib',
      'gcp',
      'secretManager.js',
    ));
    const account = auth.findAccountByEmail(accountEmail);
    if (!account?.tokens?.refresh_token) {
      return 'unavailable';
    }

    // This configures the pinned CLI's authenticated GET client in memory.
    // Calling secretExists directly avoids functions:secrets:get, whose CLI
    // pre-hook can enable Secret Manager and therefore is not read-only.
    auth.setActiveAccount({}, account);
    const present = await secretManager.secretExists(
      EXPECTED_PRODUCTION.firebaseProject,
      EXPECTED_PRODUCTION.footballSecret,
    );
    return present ? 'present' : 'missing';
  } catch {
    return 'unavailable';
  }
}

export async function inspectProductionState({ cwd = projectRoot } = {}) {
  assertNodeVersion();
  const localState = readLocalReleaseState(cwd);
  const localErrors = [];
  if (localState.branch !== EXPECTED_PRODUCTION.branch) {
    localErrors.push(`branch must be ${EXPECTED_PRODUCTION.branch}`);
  }
  if (!localState.clean) {
    localErrors.push('working tree must be clean');
  }
  if (localState.originUrl !== EXPECTED_PRODUCTION.gitOrigin) {
    localErrors.push('origin must point to the canonical Fantasya repository');
  }

  const uncheckedState = {
    ...localState,
    ahead: null,
    behind: null,
    activeFirebaseAccount: null,
    firebaseProjectIds: [],
    secretStatus: 'unchecked',
  };
  if (localErrors.length > 0) {
    return {
      state: uncheckedState,
      errors: localErrors,
      warnings: [
        'Remote and Firebase checks were skipped until local release state is valid.',
      ],
    };
  }

  runCaptured('git', ['fetch', '--quiet', 'origin', 'main'], {
    cwd,
    label: 'Git origin/main refresh',
  });
  const divergence = parseGitDivergence(runCaptured(
    'git',
    ['rev-list', '--left-right', '--count', 'origin/main...main'],
    { cwd, label: 'Git main/origin comparison' },
  ));

  // Deliberately avoid --json here: current firebase-tools serializes saved
  // OAuth token objects in login:list JSON. The normal output exposes email only.
  const loginResult = runCapturedFirebase(['login:list'], {
    cwd,
    label: 'Firebase active-account check',
  });
  const activeFirebaseAccount = parseActiveFirebaseAccount(
    `${loginResult.stdout}\n${loginResult.stderr}`,
  );
  const projectsResult = runCapturedFirebase([
    'projects:list',
    '--account',
    EXPECTED_PRODUCTION.firebaseAccount,
    '--json',
    '--non-interactive',
  ], {
    cwd,
    label: 'Firebase project visibility check',
  });
  const firebaseProjectIds = parseFirebaseProjectIds(projectsResult.stdout);
  const secretStatus = activeFirebaseAccount?.toLowerCase()
    === EXPECTED_PRODUCTION.firebaseAccount
    && firebaseProjectIds.includes(EXPECTED_PRODUCTION.firebaseProject)
    ? await probeFootballSecretStatus(cwd, activeFirebaseAccount)
    : 'unchecked';

  const state = {
    ...localState,
    ...divergence,
    activeFirebaseAccount,
    firebaseProjectIds,
    secretStatus,
  };
  const errors = evaluateProductionState(state);
  const warnings = [];
  if (secretStatus === 'missing') {
    warnings.push('FOOTBALL_DATA_API_KEY metadata reports that the secret is missing.');
  } else if (secretStatus === 'unavailable') {
    warnings.push('FOOTBALL_DATA_API_KEY metadata could not be verified read-only.');
  } else if (secretStatus === 'unchecked') {
    warnings.push('FOOTBALL_DATA_API_KEY metadata was not checked.');
  }

  return { state, errors, warnings };
}

export async function runProductionPreflight({
  cwd = projectRoot,
  requireFootballSecret = false,
} = {}) {
  const report = await inspectProductionState({ cwd });
  const errors = [...report.errors];
  if (
    errors.length === 0
    && requireFootballSecret
    && report.state.secretStatus !== 'present'
  ) {
    errors.push(
      'FOOTBALL_DATA_API_KEY metadata must be present before deploying sync Functions',
    );
  }
  return { ...report, errors };
}

export function printProductionReport(report) {
  const { state } = report;
  console.log('Production preflight');
  console.log(`- branch: ${state.branch || 'unknown'}`);
  console.log(`- commit: ${state.commit || 'unknown'}`);
  console.log(`- origin: ${state.originUrl || 'unknown'}`);
  console.log(`- working tree: ${state.clean ? 'clean' : 'dirty'}`);
  console.log(`- ahead of origin/main: ${state.ahead ?? 'not checked'}`);
  console.log(`- behind origin/main: ${state.behind ?? 'not checked'}`);
  console.log(`- Firebase account: ${state.activeFirebaseAccount || 'not checked'}`);
  console.log(
    `- tictaktools visible: ${state.firebaseProjectIds?.includes(EXPECTED_PRODUCTION.firebaseProject) ? 'yes' : 'not confirmed'}`,
  );
  console.log(`- FOOTBALL_DATA_API_KEY metadata: ${state.secretStatus}`);
  for (const warning of report.warnings) {
    console.warn(`WARNING: ${warning}`);
  }
  for (const error of report.errors) {
    console.error(`ERROR: ${error}`);
  }
}

export function assertProductionStateUnchanged(
  expectedState,
  { cwd = projectRoot } = {},
) {
  runCaptured('git', ['fetch', '--quiet', 'origin', 'main'], {
    cwd,
    label: 'Final Git origin/main refresh',
  });
  const current = readLocalReleaseState(cwd);
  const divergence = parseGitDivergence(runCaptured(
    'git',
    ['rev-list', '--left-right', '--count', 'origin/main...main'],
    { cwd, label: 'Final Git main/origin comparison' },
  ));
  if (
    current.branch !== expectedState.branch
    || current.commit !== expectedState.commit
    || !current.clean
    || current.originUrl !== EXPECTED_PRODUCTION.gitOrigin
    || divergence.ahead !== 0
    || divergence.behind !== 0
  ) {
    throw new Error('Local release state changed after preflight; start again.');
  }
}

async function main() {
  const report = await runProductionPreflight();
  printProductionReport(report);
  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1]
  ? resolve(process.argv[1])
  : '';
const currentFile = resolve(fileURLToPath(import.meta.url));

if (entrypoint.toLowerCase() === currentFile.toLowerCase()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
