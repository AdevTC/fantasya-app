import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPremergeStateUnchanged,
  evaluateChecks,
  evaluatePremergeState,
  inspectPremergeState,
  parsePullRequests,
  printPremergeReport,
} from '../../scripts/premerge-functions-preflight.mjs';

const SHA = '1234567890abcdef1234567890abcdef12345678';

const githubAction = (overrides = {}) => ({
  __typename: 'CheckRun',
  name: 'test',
  workflowName: 'CI',
  status: 'COMPLETED',
  conclusion: 'SUCCESS',
  ...overrides,
});

const vercelCheck = (overrides = {}) => ({
  __typename: 'StatusContext',
  context: 'Vercel',
  state: 'SUCCESS',
  ...overrides,
});

const pullRequest = (overrides = {}) => ({
  number: 3,
  url: 'https://github.com/AdevTC/fantasya-app/pull/3',
  state: 'OPEN',
  isDraft: false,
  baseRefName: 'main',
  headRefName: 'codex/firebase-safe-development',
  headRefOid: SHA,
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  statusCheckRollup: [githubAction(), vercelCheck()],
  ...overrides,
});

const safe = (overrides = {}) => ({
  branch: 'codex/firebase-safe-development',
  clean: true,
  commit: SHA,
  originUrl: 'https://github.com/AdevTC/fantasya-app.git',
  upstream: 'origin/codex/firebase-safe-development',
  ahead: 0,
  behind: 0,
  activeFirebaseAccount: 'jordisumba@gmail.com',
  firebaseProjectIds: ['tictaktools'],
  pullRequests: [pullRequest()],
  ...overrides,
});

function joinedErrors(state) {
  return evaluatePremergeState(state).join('\n');
}

test('parses the exact GitHub PR array shape without coercion', () => {
  const parsed = parsePullRequests(JSON.stringify([pullRequest()]));

  assert.deepEqual(parsed, [pullRequest()]);
  assert.deepEqual(evaluatePremergeState(safe()), []);
});

test('rejects malformed JSON and every non-array top-level shape', () => {
  for (const value of ['', '{', '{}', 'null', '"[]"', '3']) {
    assert.throws(
      () => parsePullRequests(value),
      /GitHub PR query returned an invalid response/,
    );
  }
});

test('rejects malformed PR and status-check shapes without leaking input', () => {
  const malformed = [
    { ...pullRequest(), number: '3' },
    { ...pullRequest(), isDraft: 'false' },
    { ...pullRequest(), headRefOid: 'short' },
    { ...pullRequest(), statusCheckRollup: null },
    {
      ...pullRequest(),
      statusCheckRollup: [{ __typename: 'Mystery', secret: 'never-print' }],
    },
    {
      ...pullRequest(),
      statusCheckRollup: [{ ...githubAction(), status: null }],
    },
    {
      ...pullRequest(),
      statusCheckRollup: [{ ...vercelCheck(), state: null }],
    },
  ];

  for (const item of malformed) {
    assert.throws(
      () => parsePullRequests(JSON.stringify([item])),
      (error) => {
        assert.equal(
          error.message,
          'GitHub PR query returned an invalid response.',
        );
        assert.doesNotMatch(String(error), /never-print|secret/);
        return true;
      },
    );
  }
});

test('accepts nullable workflow names without coercing them into GitHub Actions', () => {
  const checks = [
    { ...githubAction(), workflowName: null },
    vercelCheck(),
  ];
  const parsed = parsePullRequests(JSON.stringify([
    pullRequest({ statusCheckRollup: checks }),
  ]));

  assert.equal(parsed[0].statusCheckRollup[0].workflowName, null);
  assert.match(
    evaluateChecks(checks).join('\n'),
    /successful GitHub Actions/,
  );
});

test('accepts the empty workflow name returned by Vercel Preview Comments', () => {
  const checks = [
    githubAction(),
    vercelCheck(),
    {
      __typename: 'CheckRun',
      name: 'Vercel Preview Comments',
      workflowName: '',
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
    },
  ];
  const parsed = parsePullRequests(JSON.stringify([
    pullRequest({ statusCheckRollup: checks }),
  ]));

  assert.equal(parsed[0].statusCheckRollup[2].workflowName, '');
  assert.deepEqual(evaluateChecks(checks), []);
});

test('accepts successful GitHub Actions and Vercel checks in both supported shapes', () => {
  assert.deepEqual(evaluateChecks([githubAction(), vercelCheck()]), []);
  assert.deepEqual(evaluateChecks([
    githubAction(),
    {
      __typename: 'CheckRun',
      name: 'Vercel',
      workflowName: 'Vercel',
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
    },
  ]), []);
});

test('does not count a Vercel CheckRun as the required GitHub Actions provider', () => {
  const errors = evaluateChecks([{
    __typename: 'CheckRun',
    name: 'Vercel',
    workflowName: 'Vercel',
    status: 'COMPLETED',
    conclusion: 'SUCCESS',
  }]);

  assert.deepEqual(errors, [
    'at least one successful GitHub Actions CheckRun is required',
  ]);
});

test('allows known neutral or skipped terminal checks without counting them as success providers', () => {
  const checks = [
    githubAction(),
    vercelCheck(),
    githubAction({ name: 'optional', conclusion: 'NEUTRAL' }),
    githubAction({ name: 'not-applicable', conclusion: 'SKIPPED' }),
  ];

  assert.deepEqual(evaluateChecks(checks), []);
});

test('rejects non-arrays, unknown check types and unknown check states', () => {
  assert.match(evaluateChecks(null).join('\n'), /checks must be an array/);
  assert.match(
    evaluateChecks([{ __typename: 'Mystery' }]).join('\n'),
    /unsupported check result/,
  );
  assert.match(
    evaluateChecks([githubAction({ conclusion: 'STALE' }), vercelCheck()]).join('\n'),
    /not an allowed terminal result/,
  );
  assert.match(
    evaluateChecks([githubAction(), vercelCheck({ state: 'EXPECTED' })]).join('\n'),
    /not successful/,
  );
});

test('check failures do not echo remote-controlled check labels', () => {
  const errors = evaluateChecks([
    githubAction({
      name: 'SECRET=never-print',
      conclusion: 'FAILURE',
    }),
    vercelCheck(),
  ]).join('\n');

  assert.doesNotMatch(errors, /SECRET|never-print/);
  assert.match(errors, /check result 1/);
});

for (const [name, checks, pattern] of [
  [
    'pending CheckRun',
    [githubAction({ status: 'IN_PROGRESS', conclusion: null }), vercelCheck()],
    /not completed/,
  ],
  [
    'cancelled CheckRun',
    [githubAction({ conclusion: 'CANCELLED' }), vercelCheck()],
    /not an allowed terminal result/,
  ],
  [
    'failing CheckRun',
    [githubAction({ conclusion: 'FAILURE' }), vercelCheck()],
    /not an allowed terminal result/,
  ],
  [
    'pending StatusContext',
    [githubAction(), vercelCheck({ state: 'PENDING' })],
    /not successful/,
  ],
  [
    'failing StatusContext',
    [githubAction(), vercelCheck({ state: 'FAILURE' })],
    /not successful/,
  ],
  [
    'missing GitHub Actions provider',
    [vercelCheck()],
    /successful GitHub Actions/,
  ],
  [
    'missing Vercel provider',
    [githubAction()],
    /successful Vercel/,
  ],
]) {
  test(`rejects ${name}`, () => {
    assert.match(evaluateChecks(checks).join('\n'), pattern);
  });
}

for (const [name, state, pattern] of [
  ['a dirty tree', safe({ clean: false }), /working tree must be clean/],
  [
    'an unsafe branch name',
    safe({ branch: 'feature/' }),
    /safe non-empty Git ref name/,
  ],
  ['main as the current branch', safe({ branch: 'main' }), /must not be main/],
  ['a missing upstream', safe({ upstream: null }), /upstream/],
  [
    'an upstream for another branch',
    safe({ upstream: 'origin/other' }),
    /upstream must match/,
  ],
  ['a branch ahead of upstream', safe({ ahead: 1 }), /must not be ahead/],
  ['a branch behind upstream', safe({ behind: 1 }), /must not be behind/],
  [
    'a noncanonical origin',
    safe({ originUrl: 'git@github.com:AdevTC/fantasya-app.git' }),
    /canonical Fantasya repository/,
  ],
  ['zero pull requests', safe({ pullRequests: [] }), /exactly one open pull request/],
  [
    'two pull requests',
    safe({ pullRequests: [pullRequest(), pullRequest({ number: 4 })] }),
    /exactly one open pull request/,
  ],
  [
    'a pull request to another base',
    safe({ pullRequests: [pullRequest({ baseRefName: 'develop' })] }),
    /base must be main/,
  ],
  [
    'a pull request from another head',
    safe({ pullRequests: [pullRequest({ headRefName: 'other' })] }),
    /head must match/,
  ],
  [
    'a closed pull request',
    safe({ pullRequests: [pullRequest({ state: 'CLOSED' })] }),
    /must be open/,
  ],
  [
    'a draft pull request',
    safe({ pullRequests: [pullRequest({ isDraft: true })] }),
    /must not be a draft/,
  ],
  [
    'unknown mergeability',
    safe({ pullRequests: [pullRequest({ mergeable: 'UNKNOWN' })] }),
    /must be MERGEABLE/,
  ],
  [
    'a conflicting pull request',
    safe({ pullRequests: [pullRequest({ mergeable: 'CONFLICTING' })] }),
    /must be MERGEABLE/,
  ],
  [
    'a non-clean merge state',
    safe({ pullRequests: [pullRequest({ mergeStateStatus: 'UNSTABLE' })] }),
    /merge state must be CLEAN/,
  ],
  [
    'a mismatched PR head SHA',
    safe({
      pullRequests: [pullRequest({
        headRefOid: 'abcdef1234567890abcdef1234567890abcdef12',
      })],
    }),
    /head SHA must match/,
  ],
  [
    'the wrong Firebase account',
    safe({ activeFirebaseAccount: 'other@example.com' }),
    /Firebase account/,
  ],
  [
    'a missing Firebase project',
    safe({ firebaseProjectIds: [] }),
    /Firebase project/,
  ],
]) {
  test(`rejects ${name}`, () => {
    assert.match(joinedErrors(state), pattern);
  });
}

test('includes check failures in the deterministic premerge error list', () => {
  const errors = evaluatePremergeState(safe({
    pullRequests: [pullRequest({
      statusCheckRollup: [
        githubAction({ conclusion: 'CANCELLED' }),
        vercelCheck(),
      ],
    })],
  }));

  assert.deepEqual(errors, [
    'check result 1 is not an allowed terminal result',
    'at least one successful GitHub Actions CheckRun is required',
  ]);
});

test('fails closed instead of throwing for a malformed single PR state', () => {
  assert.match(
    joinedErrors(safe({ pullRequests: [null] })),
    /pull request data is invalid/,
  );
});

test('inspection fails closed on command errors without exposing command output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fantasya-preflight-'));
  try {
    assert.throws(
      () => inspectPremergeState({ cwd: directory }),
      (error) => {
        assert.match(error.message, /Git branch check failed/);
        assert.doesNotMatch(String(error), /stderr|fatal:/i);
        return true;
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('unchanged-state assertion rejects malformed expected state before commands', () => {
  assert.throws(
    () => assertPremergeStateUnchanged({}, { cwd: process.cwd() }),
    /Expected premerge state is invalid/,
  );
});

test('printed reports never echo malformed local or identity values', () => {
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
    printPremergeReport({
      state: {
        branch: 'SECRET=never-print',
        clean: false,
        commit: 'SECRET=never-print',
        originUrl: 'SECRET=never-print',
        upstream: 'SECRET=never-print',
        ahead: null,
        behind: null,
        pullRequests: [{
          number: 3,
          headRefOid: 'SECRET=never-print',
        }],
        activeFirebaseAccount: 'SECRET=never-print',
        firebaseProjectIds: [],
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
  assert.doesNotMatch(output, /SECRET|never-print/);
  assert.match(output, /branch: unknown/);
  assert.match(output, /origin: not confirmed/);
  assert.match(output, /Firebase account: not confirmed/);
});

test('inspection uses argument arrays and explicitly disables shell execution', () => {
  const source = readFileSync(
    new URL('../../scripts/premerge-functions-preflight.mjs', import.meta.url),
    'utf8',
  );

  assert.match(source, /spawnSync\(command, args, \{/);
  assert.match(source, /shell:\s*false/);
  assert.match(
    source,
    /\['fetch', '--quiet', 'origin', 'main', branch\]/,
  );
  assert.match(
    source,
    /\['rev-list', '--left-right', '--count', 'HEAD\.\.\.@\{upstream\}'\]/,
  );
  assert.match(source, /'gh',\s*\[\s*'pr',\s*'list'/);
  assert.match(source, /'--head',\s*branch/);
  assert.doesNotMatch(source, /functions:list|FOOTBALL_DATA_API_KEY/);
});
