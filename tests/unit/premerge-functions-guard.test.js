import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADDITIVE_GROUPS } from '../../scripts/production-functions-inventory.mjs';
import {
  PREMERGE_TRANSITIONS,
  buildPremergeDeployArguments,
  confirmationForPremergeTarget,
  runPremergeDeploy,
} from '../../scripts/deploy-premerge-functions.mjs';
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

const rawCheckRun = (overrides = {}) => ({
  ...githubAction(),
  completedAt: '2026-09-02T09:07:48Z',
  detailsUrl: 'https://github.com/AdevTC/fantasya-app/actions/runs/1',
  startedAt: '2026-09-02T09:05:17Z',
  ...overrides,
});

const vercelCheck = (overrides = {}) => ({
  __typename: 'StatusContext',
  context: 'Vercel',
  state: 'SUCCESS',
  ...overrides,
});

const rawStatusContext = (overrides = {}) => ({
  ...vercelCheck(),
  startedAt: '2026-09-02T09:05:28Z',
  targetUrl: 'https://vercel.com/example/deployment',
  ...overrides,
});

const pullRequest = (overrides = {}) => ({
  number: 3,
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

const rawPullRequest = (overrides = {}) => ({
  ...pullRequest(),
  url: 'https://github.com/AdevTC/fantasya-app/pull/3',
  statusCheckRollup: [rawCheckRun(), rawStatusContext()],
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
  const parsed = parsePullRequests(JSON.stringify([rawPullRequest()]));

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
    { ...rawPullRequest(), number: '3' },
    { ...rawPullRequest(), isDraft: 'false' },
    { ...rawPullRequest(), headRefOid: 'short' },
    { ...rawPullRequest(), statusCheckRollup: null },
    {
      ...rawPullRequest(),
      statusCheckRollup: [{ __typename: 'Mystery', secret: 'never-print' }],
    },
    {
      ...rawPullRequest(),
      statusCheckRollup: [{ ...rawCheckRun(), status: null }],
    },
    {
      ...rawPullRequest(),
      statusCheckRollup: [{ ...rawStatusContext(), state: null }],
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

test('rejects non-string input, toString injection and unexpected keys', () => {
  const injected = {
    toString() {
      return JSON.stringify([rawPullRequest()]);
    },
  };
  const extraPullRequestKey = rawPullRequest({ secret: 'never-print' });
  const extraCheckRunKey = rawPullRequest({
    statusCheckRollup: [rawCheckRun({ secret: 'never-print' })],
  });
  const extraStatusContextKey = rawPullRequest({
    statusCheckRollup: [rawStatusContext({ secret: 'never-print' })],
  });

  for (const value of [
    [JSON.stringify([rawPullRequest()])],
    new String(JSON.stringify([rawPullRequest()])),
    injected,
    JSON.stringify([extraPullRequestKey]),
    JSON.stringify([extraCheckRunKey]),
    JSON.stringify([extraStatusContextKey]),
  ]) {
    assert.throws(
      () => parsePullRequests(value),
      /GitHub PR query returned an invalid response/,
    );
  }
});

test('retains only fields needed by the release decision', () => {
  const parsed = parsePullRequests(JSON.stringify([rawPullRequest()]));
  const serialized = JSON.stringify(parsed);

  assert.doesNotMatch(
    serialized,
    /url|completedAt|detailsUrl|startedAt|targetUrl|github\.com|vercel\.com/,
  );
  assert.deepEqual(parsed, [pullRequest()]);
});

test('accepts nullable workflow names without coercing them into GitHub Actions', () => {
  const checks = [
    { ...githubAction(), workflowName: null },
    vercelCheck(),
  ];
  const parsed = parsePullRequests(JSON.stringify([
    rawPullRequest({
      statusCheckRollup: [
        rawCheckRun({ workflowName: null }),
        rawStatusContext(),
      ],
    }),
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
    rawPullRequest({
      statusCheckRollup: [
        rawCheckRun(),
        rawStatusContext(),
        rawCheckRun({
          name: 'Vercel Preview Comments',
          workflowName: '',
        }),
      ],
    }),
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
      workflowName: '',
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
    },
  ]), []);
});

test('a nonempty workflow name makes a CheckRun GitHub Actions only', () => {
  const errors = evaluateChecks([{
    __typename: 'CheckRun',
    name: 'Vercel',
    workflowName: 'Vercel',
    status: 'COMPLETED',
    conclusion: 'SUCCESS',
  }]);

  assert.deepEqual(errors, [
    'at least one successful Vercel deployment check is required',
  ]);
});

test('an exact external Vercel CheckRun does not also count as GitHub Actions', () => {
  const errors = evaluateChecks([{
    __typename: 'CheckRun',
    name: 'Vercel',
    workflowName: '',
    status: 'COMPLETED',
    conclusion: 'SUCCESS',
  }]);

  assert.deepEqual(errors, [
    'at least one successful GitHub Actions CheckRun is required',
  ]);
});

test('does not accept comments, similarly named workflows or casing as Vercel deployment', () => {
  const falseProviders = [
    {
      __typename: 'CheckRun',
      name: 'Vercel Preview Comments',
      workflowName: '',
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
    },
    githubAction({ name: 'Vercel smoke' }),
    vercelCheck({ context: 'vercel' }),
  ];

  for (const candidate of falseProviders) {
    assert.match(
      evaluateChecks([githubAction(), candidate]).join('\n'),
      /successful Vercel deployment check/,
    );
  }
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
    /successful Vercel deployment check/,
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
    'a boxed Firebase account string',
    safe({ activeFirebaseAccount: new String('jordisumba@gmail.com') }),
    /Firebase account/,
  ],
  [
    'a Firebase account toString injection',
    safe({
      activeFirebaseAccount: {
        toString: () => 'jordisumba@gmail.com',
      },
    }),
    /Firebase account/,
  ],
  [
    'a missing Firebase project',
    safe({ firebaseProjectIds: [] }),
    /Firebase project/,
  ],
  [
    'a commit toString injection',
    safe({ commit: { toString: () => SHA } }),
    /HEAD must be a full commit SHA/,
  ],
  [
    'extra retained pull-request data',
    safe({ pullRequests: [pullRequest({ secret: 'never-print' })] }),
    /pull request data is invalid/,
  ],
  [
    'extra retained check data',
    safe({
      pullRequests: [pullRequest({
        statusCheckRollup: [githubAction({ secret: 'never-print' }), vercelCheck()],
      })],
    }),
    /pull request data is invalid/,
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
    /Expected premerge report is invalid/,
  );
});

test('unchanged-state assertion requires the original clean report', () => {
  const inspect = () => ({ state: safe(), errors: [], warnings: [] });

  assert.throws(
    () => assertPremergeStateUnchanged(safe(), { inspect }),
    /Expected premerge report is invalid/,
  );
  assert.throws(
    () => assertPremergeStateUnchanged({
      state: safe(),
      errors: ['not eligible'],
      warnings: [],
    }, { inspect }),
    /Expected premerge report is invalid/,
  );
  assert.throws(
    () => assertPremergeStateUnchanged({
      state: safe({ clean: false }),
      errors: [],
      warnings: [],
    }, { inspect }),
    /Expected premerge state is not eligible/,
  );
});

test('unchanged-state assertion rejects a different eligible PR number', () => {
  const expected = { state: safe(), errors: [], warnings: [] };
  const current = {
    state: safe({ pullRequests: [pullRequest({ number: 4 })] }),
    errors: [],
    warnings: [],
  };

  assert.throws(
    () => assertPremergeStateUnchanged(expected, { inspect: () => current }),
    /Premerge state changed after confirmation/,
  );
});

test('unchanged-state assertion rejects a different eligible branch identity', () => {
  const expected = { state: safe(), errors: [], warnings: [] };
  const branch = 'codex/other-safe-branch';
  const currentState = safe({
    branch,
    upstream: `origin/${branch}`,
    pullRequests: [pullRequest({ headRefName: branch })],
  });
  const current = { state: currentState, errors: [], warnings: [] };

  assert.deepEqual(evaluatePremergeState(currentState), []);
  assert.throws(
    () => assertPremergeStateUnchanged(expected, { inspect: () => current }),
    /Premerge state changed after confirmation/,
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
        branch: {
          toString() {
            throw new Error('SECRET=never-print');
          },
        },
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
        firebaseProjectIds: {
          includes() {
            throw new Error('SECRET=never-print');
          },
        },
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

test('defines only the three ordered additive premerge transitions', () => {
  assert.deepEqual(Object.keys(PREMERGE_TRANSITIONS), [
    'functions-core-v2',
    'functions-league',
    'functions-content-v2',
  ]);
  assert.deepEqual(PREMERGE_TRANSITIONS['functions-core-v2'], {
    from: 'baseline',
    to: 'core-v2',
  });
  assert.deepEqual(PREMERGE_TRANSITIONS['functions-league'], {
    from: 'core-v2',
    to: 'league',
  });
  assert.deepEqual(PREMERGE_TRANSITIONS['functions-content-v2'], {
    from: 'league',
    to: 'content-v2',
  });
});

test('binds confirmations and Firebase arguments to one exact target and SHA', () => {
  assert.equal(
    confirmationForPremergeTarget('functions-core-v2', SHA),
    `deploy tictaktools functions-core-v2 ${SHA}`,
  );
  for (const target of Object.keys(PREMERGE_TRANSITIONS)) {
    assert.deepEqual(buildPremergeDeployArguments(target), [
      'deploy',
      '--project',
      'tictaktools',
      '--account',
      'jordisumba@gmail.com',
      '--only',
      ADDITIVE_GROUPS[target].map((name) => `functions:${name}`).join(','),
    ]);
  }
  assert.throws(
    () => buildPremergeDeployArguments('functions-sync'),
    /Unknown pre-merge target/,
  );
  assert.throws(
    () => confirmationForPremergeTarget('functions-core-v2', 'short'),
    /full commit SHA/,
  );
});

test('rejects non-string deployment targets without coercing or exposing them', () => {
  const target = {
    toString() {
      throw new Error('SECRET=never-print');
    },
  };
  for (const invoke of [
    () => buildPremergeDeployArguments(target),
    () => confirmationForPremergeTarget(target, SHA),
  ]) {
    assert.throws(invoke, (error) => {
      assert.equal(error.message, 'Unknown pre-merge target.');
      assert.doesNotMatch(String(error), /SECRET|never-print/);
      return true;
    });
  }
});

test('orchestrates a deployment only after both exact-state checks', async () => {
  const calls = [];
  const premergeReport = { state: safe(), errors: [], warnings: [] };
  const inventory = (stage) => ({
    stage,
    items: [],
    errors: [],
  });
  const target = 'functions-core-v2';
  const expectedConfirmation = confirmationForPremergeTarget(target, SHA);

  await runPremergeDeploy(target, {
    stdin: { isTTY: true },
    stdout: { isTTY: true },
    inspectPremerge: () => {
      calls.push('preflight');
      return premergeReport;
    },
    printPremerge: () => calls.push('print-preflight'),
    inspectFunctions: async ({ stage }) => {
      calls.push(`inventory:${stage}`);
      return inventory(stage);
    },
    askConfirmation: async (expected) => {
      calls.push(`confirm:${expected}`);
      return expectedConfirmation;
    },
    recheckPremerge: (expected) => {
      assert.equal(expected, premergeReport);
      calls.push('recheck');
      return premergeReport;
    },
    spawnFirebase: (args, options) => {
      assert.deepEqual(args, buildPremergeDeployArguments(target));
      assert.equal(options.stdio, 'inherit');
      calls.push('deploy');
      return { status: 0, signal: null, error: undefined };
    },
    printInventory: (report) => calls.push(`print-inventory:${report.stage}`),
  });

  assert.deepEqual(calls, [
    'preflight',
    'print-preflight',
    'inventory:baseline',
    'print-inventory:baseline',
    `confirm:${expectedConfirmation}`,
    'recheck',
    'inventory:baseline',
    'print-inventory:baseline',
    'deploy',
    'inventory:core-v2',
    'print-inventory:core-v2',
  ]);
});

test('fails before remote checks when either terminal stream is not a TTY', async () => {
  let remoteCalls = 0;
  const remote = () => {
    remoteCalls += 1;
    throw new Error('remote must not run');
  };

  await assert.rejects(
    runPremergeDeploy('functions-core-v2', {
      stdin: { isTTY: false },
      stdout: { isTTY: true },
      inspectPremerge: remote,
      inspectFunctions: remote,
      spawnFirebase: remote,
    }),
    /interactive terminal/,
  );
  await assert.rejects(
    runPremergeDeploy('functions-core-v2', {
      stdin: { isTTY: true },
      stdout: { isTTY: false },
      inspectPremerge: remote,
      inspectFunctions: remote,
      spawnFirebase: remote,
    }),
    /interactive terminal/,
  );
  assert.equal(remoteCalls, 0);
});

test('does not deploy after a failed preflight, confirmation, recheck or inventory', async () => {
  const green = { state: safe(), errors: [], warnings: [] };
  let deployed = false;
  const common = {
    stdin: { isTTY: true },
    stdout: { isTTY: true },
    printPremerge: () => {},
    printInventory: () => {},
    spawnFirebase: () => {
      deployed = true;
      return { status: 0 };
    },
  };

  await assert.rejects(runPremergeDeploy('functions-core-v2', {
    ...common,
    inspectPremerge: () => ({ ...green, errors: ['not green'] }),
  }), /preflight failed/i);

  await assert.rejects(runPremergeDeploy('functions-core-v2', {
    ...common,
    inspectPremerge: () => green,
    inspectFunctions: async ({ stage }) => ({
      stage,
      items: [],
      errors: [],
    }),
    askConfirmation: async () => 'wrong',
  }), /Confirmation did not match/);

  await assert.rejects(runPremergeDeploy('functions-core-v2', {
    ...common,
    inspectPremerge: () => green,
    inspectFunctions: async ({ stage }) => ({
      stage,
      items: [],
      errors: [],
    }),
    askConfirmation: async (expected) => expected,
    recheckPremerge: () => {
      throw new Error('Premerge state changed after confirmation; start again.');
    },
  }), /Premerge state changed/);

  await assert.rejects(runPremergeDeploy('functions-core-v2', {
    ...common,
    inspectPremerge: () => green,
    inspectFunctions: async ({ stage }) => ({
      stage,
      items: [],
      errors: ['inventory mismatch'],
    }),
  }), /inventory does not match/i);

  assert.equal(deployed, false);
});

test('requires a fully green preflight with no warnings before inventory calls', async () => {
  let inventoryCalls = 0;
  await assert.rejects(runPremergeDeploy('functions-core-v2', {
    stdin: { isTTY: true },
    stdout: { isTTY: true },
    inspectPremerge: () => ({
      state: safe(),
      errors: [],
      warnings: ['not fully green'],
    }),
    printPremerge: () => {},
    inspectFunctions: async () => {
      inventoryCalls += 1;
      return { stage: 'baseline', items: [], errors: [] };
    },
  }), /preflight failed/i);
  assert.equal(inventoryCalls, 0);
});

test('requires a successful Firebase exit and the exact post-deploy stage', async () => {
  const green = { state: safe(), errors: [], warnings: [] };
  const reports = [
    { stage: 'baseline', items: [], errors: [] },
    { stage: 'baseline', items: [], errors: [] },
    { stage: 'core-v2', items: [], errors: [] },
  ];
  const common = {
    stdin: { isTTY: true },
    stdout: { isTTY: true },
    inspectPremerge: () => green,
    printPremerge: () => {},
    inspectFunctions: async () => reports.shift(),
    printInventory: () => {},
    askConfirmation: async (expected) => expected,
    recheckPremerge: () => green,
  };

  await assert.rejects(runPremergeDeploy('functions-core-v2', {
    ...common,
    inspectFunctions: async ({ stage }) => ({ stage, items: [], errors: [] }),
    spawnFirebase: () => ({ status: 1 }),
  }), /Firebase deployment failed/);

  await assert.rejects(runPremergeDeploy('functions-core-v2', {
    ...common,
    spawnFirebase: () => ({ status: 0 }),
    inspectFunctions: async ({ stage }) => {
      if (stage === 'core-v2') {
        return { stage, items: [], errors: ['missing Functions'] };
      }
      return { stage, items: [], errors: [] };
    },
  }), /inventory does not match/i);
});

test('the CLI fails closed without TTY before GitHub, Firebase or inventory calls', () => {
  const script = fileURLToPath(new URL(
    '../../scripts/deploy-premerge-functions.mjs',
    import.meta.url,
  ));
  const result = spawnSync(
    process.execPath,
    [script, 'functions-core-v2'],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: '' },
    },
  );
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /interactive terminal/);
  assert.doesNotMatch(output, /Git|GitHub|Firebase account|inventory request/i);
});

test('package exposes bounded premerge commands and removes immediate core/sync paths', () => {
  const rootPackage = JSON.parse(readFileSync(
    new URL('../../package.json', import.meta.url),
    'utf8',
  ));

  assert.equal(
    rootPackage.scripts['production:preflight:pr'],
    'node scripts/premerge-functions-preflight.mjs',
  );
  assert.equal(
    rootPackage.scripts['deploy:prod:pr:functions:core-v2'],
    'node scripts/deploy-premerge-functions.mjs functions-core-v2',
  );
  assert.equal(
    rootPackage.scripts['deploy:prod:pr:functions:league'],
    'node scripts/deploy-premerge-functions.mjs functions-league',
  );
  assert.equal(
    rootPackage.scripts['deploy:prod:pr:functions:content-v2'],
    'node scripts/deploy-premerge-functions.mjs functions-content-v2',
  );
  assert.equal(rootPackage.scripts['deploy:prod:functions:core'], undefined);
  assert.equal(rootPackage.scripts['deploy:prod:functions:sync'], undefined);
  assert.equal(
    rootPackage.scripts['deploy:prod:indexes'],
    'node scripts/deploy-production.mjs indexes',
  );
  assert.equal(
    rootPackage.scripts['deploy:prod:firestore'],
    'node scripts/deploy-production.mjs firestore',
  );
  assert.equal(
    rootPackage.scripts['deploy:prod:storage'],
    'node scripts/deploy-production.mjs storage',
  );
});
