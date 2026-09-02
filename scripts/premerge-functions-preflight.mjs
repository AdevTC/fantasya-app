import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNodeVersion } from './check-node-version.mjs';
import {
  EXPECTED_PRODUCTION,
  inspectFirebaseIdentity,
} from './production-preflight.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const GITHUB_REPOSITORY = 'AdevTC/fantasya-app';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SAFE_BRANCH_PATTERN = /^(?!-)(?!.*\.\.)(?!.*@\{)[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const ALLOWED_CHECKRUN_CONCLUSIONS = new Set([
  'SUCCESS',
  'NEUTRAL',
  'SKIPPED',
]);
const PR_FIELDS = [
  'number',
  'url',
  'state',
  'isDraft',
  'baseRefName',
  'headRefName',
  'headRefOid',
  'mergeable',
  'mergeStateStatus',
  'statusCheckRollup',
].join(',');
const INVALID_PR_RESPONSE = 'GitHub PR query returned an invalid response.';

function invalidPullRequestResponse() {
  return new Error(INVALID_PR_RESPONSE);
}

function isNonemptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isSafeBranch(branch) {
  return SAFE_BRANCH_PATTERN.test(branch)
    && !branch.endsWith('/')
    && !branch.endsWith('.')
    && !branch.endsWith('.lock')
    && !branch.includes('//');
}

function isCheckRun(item) {
  return item?.__typename === 'CheckRun'
    && isNonemptyString(item.name)
    && (item.workflowName === null || typeof item.workflowName === 'string')
    && isNonemptyString(item.status)
    && (item.conclusion === null || isNonemptyString(item.conclusion));
}

function isStatusContext(item) {
  return item?.__typename === 'StatusContext'
    && isNonemptyString(item.context)
    && isNonemptyString(item.state);
}

function isPullRequest(item) {
  return item !== null
    && typeof item === 'object'
    && Number.isSafeInteger(item.number)
    && item.number > 0
    && isNonemptyString(item.url)
    && isNonemptyString(item.state)
    && typeof item.isDraft === 'boolean'
    && isNonemptyString(item.baseRefName)
    && isNonemptyString(item.headRefName)
    && SHA_PATTERN.test(item.headRefOid)
    && isNonemptyString(item.mergeable)
    && isNonemptyString(item.mergeStateStatus)
    && Array.isArray(item.statusCheckRollup)
    && item.statusCheckRollup.every((check) => (
      isCheckRun(check) || isStatusContext(check)
    ));
}

export function parsePullRequests(output) {
  let parsed;
  try {
    parsed = JSON.parse(String(output));
  } catch {
    throw invalidPullRequestResponse();
  }
  if (!Array.isArray(parsed) || !parsed.every(isPullRequest)) {
    throw invalidPullRequestResponse();
  }
  return parsed;
}

function identifiesVercel(item) {
  const candidates = item?.__typename === 'CheckRun'
    ? [item.name, item.workflowName]
    : [item?.context];
  return candidates.some((value) => (
    typeof value === 'string' && /vercel/i.test(value)
  ));
}

export function evaluateChecks(items) {
  if (!Array.isArray(items)) {
    return ['checks must be an array'];
  }

  const errors = [];
  let hasSuccessfulGithubActions = false;
  let hasSuccessfulVercel = false;

  for (const [index, item] of items.entries()) {
    const resultNumber = index + 1;
    if (isCheckRun(item)) {
      if (item.status !== 'COMPLETED') {
        errors.push(`check result ${resultNumber} is not completed`);
        continue;
      }
      if (!ALLOWED_CHECKRUN_CONCLUSIONS.has(item.conclusion)) {
        errors.push(
          `check result ${resultNumber} is not an allowed terminal result`,
        );
        continue;
      }
      if (item.conclusion === 'SUCCESS') {
        const isVercel = identifiesVercel(item);
        if (isNonemptyString(item.workflowName) && !isVercel) {
          hasSuccessfulGithubActions = true;
        }
        if (isVercel) {
          hasSuccessfulVercel = true;
        }
      }
      continue;
    }

    if (isStatusContext(item)) {
      if (item.state !== 'SUCCESS') {
        errors.push(`status context result ${resultNumber} is not successful`);
        continue;
      }
      if (identifiesVercel(item)) {
        hasSuccessfulVercel = true;
      }
      continue;
    }

    errors.push(`unsupported check result ${resultNumber}`);
  }

  if (!hasSuccessfulGithubActions) {
    errors.push('at least one successful GitHub Actions CheckRun is required');
  }
  if (!hasSuccessfulVercel) {
    errors.push('at least one successful Vercel check is required');
  }
  return errors;
}

export function evaluatePremergeState(state) {
  const errors = [];
  const branch = typeof state?.branch === 'string' ? state.branch : '';
  if (!isSafeBranch(branch)) {
    errors.push('branch must be a safe non-empty Git ref name');
  }
  if (branch === EXPECTED_PRODUCTION.branch) {
    errors.push(`branch must not be ${EXPECTED_PRODUCTION.branch}`);
  }
  if (state?.clean !== true) {
    errors.push('working tree must be clean');
  }
  if (!SHA_PATTERN.test(state?.commit || '')) {
    errors.push('HEAD must be a full commit SHA');
  }
  if (state?.originUrl !== EXPECTED_PRODUCTION.gitOrigin) {
    errors.push('origin must point to the canonical Fantasya repository');
  }
  if (!isNonemptyString(state?.upstream)) {
    errors.push('branch upstream is required');
  } else if (state.upstream !== `origin/${branch}`) {
    errors.push('upstream must match origin/current-branch');
  }
  if (state?.ahead !== 0) {
    errors.push('branch must not be ahead of its upstream');
  }
  if (state?.behind !== 0) {
    errors.push('branch must not be behind its upstream');
  }
  if (
    String(state?.activeFirebaseAccount || '').toLowerCase()
      !== EXPECTED_PRODUCTION.firebaseAccount
  ) {
    errors.push('required Firebase account is not active');
  }
  const firebaseProjectIds = Array.isArray(state?.firebaseProjectIds)
    ? state.firebaseProjectIds
    : [];
  if (!firebaseProjectIds.includes(EXPECTED_PRODUCTION.firebaseProject)) {
    errors.push('production Firebase project is not visible');
  }

  const pullRequests = Array.isArray(state?.pullRequests)
    ? state.pullRequests
    : [];
  if (pullRequests.length !== 1) {
    errors.push('exactly one open pull request is required');
    return errors;
  }

  const [pullRequest] = pullRequests;
  if (!isPullRequest(pullRequest)) {
    errors.push('pull request data is invalid');
    return errors;
  }
  if (pullRequest.state !== 'OPEN') {
    errors.push('pull request must be open');
  }
  if (pullRequest.baseRefName !== EXPECTED_PRODUCTION.branch) {
    errors.push(`pull request base must be ${EXPECTED_PRODUCTION.branch}`);
  }
  if (pullRequest.headRefName !== branch) {
    errors.push('pull request head must match the current branch');
  }
  if (pullRequest.isDraft !== false) {
    errors.push('pull request must not be a draft');
  }
  if (pullRequest.mergeable !== 'MERGEABLE') {
    errors.push('pull request must be MERGEABLE');
  }
  if (pullRequest.mergeStateStatus !== 'CLEAN') {
    errors.push('pull request merge state must be CLEAN');
  }
  if (pullRequest.headRefOid !== state?.commit) {
    errors.push('pull request head SHA must match local HEAD');
  }
  errors.push(...evaluateChecks(pullRequest.statusCheckRollup));
  return errors;
}

function runCaptured(command, args, { cwd, label }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  if (result.error) {
    throw new Error(`${label} could not start.`);
  }
  if (result.signal || result.status !== 0) {
    throw new Error(`${label} failed.`);
  }
  return String(result.stdout || '');
}

function readUpstream(cwd) {
  const result = spawnSync(
    'git',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
    },
  );
  if (result.error) {
    throw new Error('Git upstream check could not start.');
  }
  return result.status === 0 && !result.signal
    ? String(result.stdout || '').trim()
    : null;
}

function readLocalState(cwd) {
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
  const upstream = readUpstream(cwd);
  return {
    branch,
    clean: status.trim() === '',
    commit,
    originUrl,
    upstream,
  };
}

function parseHeadUpstreamDivergence(output) {
  const parts = String(output || '').trim().split(/\s+/).map(Number);
  if (
    parts.length !== 2
    || parts.some((value) => !Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error('Git returned an invalid HEAD/upstream divergence count.');
  }
  return { ahead: parts[0], behind: parts[1] };
}

function readPullRequests(cwd, branch) {
  const output = runCaptured('gh', [
    'pr',
    'list',
    '--repo',
    GITHUB_REPOSITORY,
    '--head',
    branch,
    '--base',
    EXPECTED_PRODUCTION.branch,
    '--state',
    'open',
    '--limit',
    '2',
    '--json',
    PR_FIELDS,
  ], {
    cwd,
    label: 'GitHub pull-request check',
  });
  return parsePullRequests(output);
}

export function inspectPremergeState({ cwd = projectRoot } = {}) {
  assertNodeVersion();
  const localState = readLocalState(cwd);
  const { branch } = localState;

  if (!isSafeBranch(branch)) {
    return {
      state: {
        ...localState,
        ahead: null,
        behind: null,
        activeFirebaseAccount: null,
        firebaseProjectIds: [],
        pullRequests: [],
      },
      errors: evaluatePremergeState(localState),
      warnings: ['Remote and Firebase checks were skipped for an unsafe branch name.'],
    };
  }
  if (localState.originUrl !== EXPECTED_PRODUCTION.gitOrigin) {
    return {
      state: {
        ...localState,
        ahead: null,
        behind: null,
        activeFirebaseAccount: null,
        firebaseProjectIds: [],
        pullRequests: [],
      },
      errors: evaluatePremergeState(localState),
      warnings: ['Remote and Firebase checks were skipped for a noncanonical origin.'],
    };
  }

  runCaptured('git', ['fetch', '--quiet', 'origin', 'main', branch], {
    cwd,
    label: 'Git origin refresh',
  });
  const refreshedLocalState = readLocalState(cwd);
  const divergence = refreshedLocalState.upstream
    ? parseHeadUpstreamDivergence(runCaptured(
      'git',
      ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
      { cwd, label: 'Git HEAD/upstream comparison' },
    ))
    : { ahead: null, behind: null };
  const pullRequests = readPullRequests(cwd, refreshedLocalState.branch);
  const { activeFirebaseAccount, firebaseProjectIds }
    = inspectFirebaseIdentity({ cwd });
  const state = {
    ...refreshedLocalState,
    ...divergence,
    activeFirebaseAccount,
    firebaseProjectIds,
    pullRequests,
  };
  return {
    state,
    errors: evaluatePremergeState(state),
    warnings: [],
  };
}

export function assertPremergeStateUnchanged(
  expected,
  { cwd = projectRoot } = {},
) {
  const expectedState = expected?.state ?? expected;
  if (
    !SHA_PATTERN.test(expectedState?.commit || '')
    || !Number.isSafeInteger(expectedState?.pullRequests?.[0]?.number)
  ) {
    throw new Error('Expected premerge state is invalid.');
  }

  const report = inspectPremergeState({ cwd });
  const currentPullRequest = report.state.pullRequests?.[0];
  if (
    report.errors.length > 0
    || report.state.commit !== expectedState.commit
    || currentPullRequest?.number !== expectedState.pullRequests[0].number
  ) {
    throw new Error('Premerge state changed after confirmation; start again.');
  }
  return report;
}

export function printPremergeReport(report) {
  const { state } = report;
  const branch = isSafeBranch(state.branch) ? state.branch : 'unknown';
  const commit = SHA_PATTERN.test(state.commit) ? state.commit : 'unknown';
  const origin = state.originUrl === EXPECTED_PRODUCTION.gitOrigin
    ? 'canonical'
    : 'not confirmed';
  const upstream = state.upstream === `origin/${state.branch}`
    ? 'matches branch'
    : 'not confirmed';
  const pullRequest = state.pullRequests?.length === 1
    && isPullRequest(state.pullRequests[0])
    ? state.pullRequests[0]
    : null;
  console.log('Pre-merge Functions preflight');
  console.log(`- branch: ${branch}`);
  console.log(`- commit: ${commit}`);
  console.log(`- origin: ${origin}`);
  console.log(`- upstream: ${upstream}`);
  console.log(`- working tree: ${state.clean ? 'clean' : 'dirty'}`);
  console.log(`- ahead of upstream: ${state.ahead ?? 'not checked'}`);
  console.log(`- behind upstream: ${state.behind ?? 'not checked'}`);
  console.log(`- pull request: ${pullRequest ? `#${pullRequest.number}` : 'not confirmed'}`);
  console.log(`- pull-request head: ${pullRequest?.headRefOid || 'not confirmed'}`);
  console.log(
    `- Firebase account: ${String(state.activeFirebaseAccount || '').toLowerCase() === EXPECTED_PRODUCTION.firebaseAccount ? 'expected account active' : 'not confirmed'}`,
  );
  console.log(
    `- tictaktools visible: ${state.firebaseProjectIds?.includes(EXPECTED_PRODUCTION.firebaseProject) ? 'yes' : 'not confirmed'}`,
  );
  for (const warning of report.warnings) {
    console.warn(`WARNING: ${warning}`);
  }
  for (const error of report.errors) {
    console.error(`ERROR: ${error}`);
  }
}

async function main() {
  const report = inspectPremergeState();
  printPremergeReport(report);
  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : '';
const currentFile = resolve(fileURLToPath(import.meta.url));

if (entrypoint.toLowerCase() === currentFile.toLowerCase()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Premerge preflight failed.');
    process.exitCode = 1;
  });
}
