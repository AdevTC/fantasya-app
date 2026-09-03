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

const FIREBASE_FUNCTIONS_DOTENV_FILES = Object.freeze([
  '.env',
  `.env.${EXPECTED_PRODUCTION.firebaseProject}`,
  '.env.production',
]);
const SAFE_REMOTE_BRANCH_PATTERN
  = /^(?!-)(?!.*\.\.)(?!.*@\{)[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const FIREBASE_FUNCTIONS_DOTENV_ERROR
  = 'A Firebase Functions environment file that can be loaded in production is present.';

export function findFirebaseFunctionsDotenvFiles(cwd = projectRoot) {
  return FIREBASE_FUNCTIONS_DOTENV_FILES.filter((filename) => (
    existsSync(resolve(cwd, 'functions', filename))
  ));
}

export function assertNoFirebaseFunctionsDotenv(cwd = projectRoot) {
  if (findFirebaseFunctionsDotenvFiles(cwd).length > 0) {
    throw new Error(FIREBASE_FUNCTIONS_DOTENV_ERROR);
  }
}

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
  if (
    Array.isArray(state.firebaseFunctionsDotenvFiles)
    && state.firebaseFunctionsDotenvFiles.length > 0
  ) {
    errors.push(FIREBASE_FUNCTIONS_DOTENV_ERROR);
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

export const shouldInspectFootballSecret = (value) => value === true;

function runCaptured(command, args, { cwd, label }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  if (result.error) {
    throw new Error(`${label} could not start.`, { cause: result.error });
  }
  if (result.signal || result.status !== 0) {
    throw new Error(`${label} failed.`);
  }
  return String(result.stdout || '');
}

export function refreshOriginBranches(cwd, branches) {
  if (
    !Array.isArray(branches)
    || branches.length === 0
    || branches.some((branch) => (
      typeof branch !== 'string'
      || !SAFE_REMOTE_BRANCH_PATTERN.test(branch)
      || branch.endsWith('/')
      || branch.endsWith('.')
      || branch.endsWith('.lock')
      || branch.includes('//')
    ))
  ) {
    throw new Error('Git origin refresh received an invalid branch.');
  }
  const refspecs = branches.map(
    (branch) => `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
  );
  runCaptured('git', ['fetch', '--quiet', 'origin', ...refspecs], {
    cwd,
    label: 'Git origin refresh',
  });
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
    firebaseFunctionsDotenvFiles: findFirebaseFunctionsDotenvFiles(cwd),
  };
}

function evaluateLocalProductionState(state) {
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
  if (
    !Array.isArray(state.firebaseFunctionsDotenvFiles)
    || state.firebaseFunctionsDotenvFiles.length > 0
  ) {
    errors.push(FIREBASE_FUNCTIONS_DOTENV_ERROR);
  }
  return errors;
}

function uncheckedProductionReport(localState, errors) {
  return {
    state: {
      ...localState,
      ahead: null,
      behind: null,
      activeFirebaseAccount: null,
      firebaseProjectIds: [],
      secretStatus: 'not-requested',
    },
    errors,
    warnings: [
      'Remote and Firebase checks were skipped until local release state is valid.',
    ],
  };
}

function readProductionDivergence(cwd) {
  return parseGitDivergence(runCaptured(
    'git',
    ['rev-list', '--left-right', '--count', 'origin/main...main'],
    { cwd, label: 'Git main/origin comparison' },
  ));
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

export function inspectFirebaseIdentity({ cwd = projectRoot } = {}) {
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
  return { activeFirebaseAccount, firebaseProjectIds };
}

export async function inspectProductionState({
  cwd = projectRoot,
  inspectFootballSecret = false,
  readLocal = readLocalReleaseState,
  refreshOrigin = refreshOriginBranches,
  inspectFirebase = inspectFirebaseIdentity,
} = {}) {
  assertNodeVersion();
  const localState = readLocal(cwd);
  const localErrors = evaluateLocalProductionState(localState);
  if (localErrors.length > 0) {
    return uncheckedProductionReport(localState, localErrors);
  }

  refreshOrigin(cwd, [EXPECTED_PRODUCTION.branch]);
  const refreshedLocalState = readLocal(cwd);
  const refreshedLocalErrors = evaluateLocalProductionState(
    refreshedLocalState,
  );
  if (refreshedLocalErrors.length > 0) {
    return uncheckedProductionReport(refreshedLocalState, refreshedLocalErrors);
  }
  const divergence = readProductionDivergence(cwd);

  const { activeFirebaseAccount, firebaseProjectIds }
    = inspectFirebase({ cwd });
  let secretStatus = 'not-requested';
  if (shouldInspectFootballSecret(inspectFootballSecret)) {
    secretStatus = activeFirebaseAccount?.toLowerCase()
      === EXPECTED_PRODUCTION.firebaseAccount
      && firebaseProjectIds.includes(EXPECTED_PRODUCTION.firebaseProject)
      ? await probeFootballSecretStatus(cwd, activeFirebaseAccount)
      : 'unchecked';
  }

  const state = {
    ...refreshedLocalState,
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
  const report = await inspectProductionState({
    cwd,
    inspectFootballSecret: requireFootballSecret,
  });
  const errors = [...report.errors];
  if (
    errors.length === 0
    && shouldInspectFootballSecret(requireFootballSecret)
    && report.state.secretStatus !== 'present'
  ) {
    errors.push(
      'FOOTBALL_DATA_API_KEY metadata must be present before deploying sync Functions',
    );
  }
  return { ...report, errors };
}

export function printProductionReport(report) {
  const state = report?.state && typeof report.state === 'object'
    ? report.state
    : {};
  const branch = state.branch === EXPECTED_PRODUCTION.branch
    ? EXPECTED_PRODUCTION.branch
    : 'not confirmed';
  const commit = typeof state.commit === 'string'
    && /^[0-9a-f]{40}$/.test(state.commit)
    ? state.commit
    : 'not confirmed';
  const origin = state.originUrl === EXPECTED_PRODUCTION.gitOrigin
    ? 'canonical'
    : 'not confirmed';
  const firebaseAccount = typeof state.activeFirebaseAccount === 'string'
    && state.activeFirebaseAccount.toLowerCase()
      === EXPECTED_PRODUCTION.firebaseAccount
    ? 'expected account active'
    : 'not confirmed';
  const ahead = Number.isSafeInteger(state.ahead) && state.ahead >= 0
    ? state.ahead
    : 'not checked';
  const behind = Number.isSafeInteger(state.behind) && state.behind >= 0
    ? state.behind
    : 'not checked';
  console.log('Production preflight');
  console.log(`- branch: ${branch}`);
  console.log(`- commit: ${commit}`);
  console.log(`- origin: ${origin}`);
  console.log(`- working tree: ${state.clean === true ? 'clean' : 'dirty'}`);
  console.log(`- ahead of origin/main: ${ahead}`);
  console.log(`- behind origin/main: ${behind}`);
  console.log(`- Firebase account: ${firebaseAccount}`);
  console.log(
    `- tictaktools visible: ${Array.isArray(state.firebaseProjectIds) && state.firebaseProjectIds.includes(EXPECTED_PRODUCTION.firebaseProject) ? 'yes' : 'not confirmed'}`,
  );
  if (['present', 'missing', 'unavailable', 'unchecked'].includes(
    state.secretStatus,
  )) {
    console.log(`- FOOTBALL_DATA_API_KEY metadata: ${state.secretStatus}`);
  }
  for (const warning of Array.isArray(report?.warnings) ? report.warnings : []) {
    console.warn(`WARNING: ${warning}`);
  }
  for (const error of Array.isArray(report?.errors) ? report.errors : []) {
    console.error(`ERROR: ${error}`);
  }
}

export function assertProductionStateUnchanged(
  expectedState,
  {
    cwd = projectRoot,
    refreshOrigin = refreshOriginBranches,
    readLocal = readLocalReleaseState,
    readDivergence = readProductionDivergence,
  } = {},
) {
  assertNoFirebaseFunctionsDotenv(cwd);
  refreshOrigin(cwd, [EXPECTED_PRODUCTION.branch]);
  const current = readLocal(cwd);
  const divergence = readDivergence(cwd);
  if (
    current.branch !== expectedState.branch
    || current.commit !== expectedState.commit
    || !current.clean
    || current.originUrl !== EXPECTED_PRODUCTION.gitOrigin
    || !Array.isArray(current.firebaseFunctionsDotenvFiles)
    || current.firebaseFunctionsDotenvFiles.length > 0
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
