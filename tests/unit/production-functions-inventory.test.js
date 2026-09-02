import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ADDITIVE_GROUPS,
  BASELINE_NAMES,
  evaluateInventory,
  expectedNamesForStage,
  fetchSanitizedInventory,
  sanitizeFunction,
} from '../../scripts/production-functions-inventory.mjs';

const rawFunction = (name, overrides = {}) => ({
  name: `projects/tictaktools/locations/us-central1/functions/${name}`,
  state: 'ACTIVE',
  buildConfig: {
    runtime: 'nodejs22',
    environmentVariables: { SENSITIVE: 'never-print' },
  },
  serviceConfig: {
    environmentVariables: { SECRET: 'never-print' },
  },
  ...overrides,
});

const sanitizedFunction = (name, overrides = {}) => ({
  name,
  region: 'us-central1',
  runtime: 'nodejs22',
  state: 'ACTIVE',
  ...overrides,
});

test('sanitizes a Functions resource to the four allowed DTO fields', () => {
  const sanitized = sanitizeFunction(rawFunction('createProfileDocuments'));

  assert.deepEqual(sanitized, {
    name: 'createProfileDocuments',
    region: 'us-central1',
    runtime: 'nodejs22',
    state: 'ACTIVE',
  });
  assert.doesNotMatch(
    JSON.stringify(sanitized),
    /never-print|SENSITIVE|SECRET|environmentVariables|serviceConfig/,
  );
});

test('defines exact cumulative inventories for every release stage', () => {
  const coreNames = ADDITIVE_GROUPS['functions-core-v2'];
  const leagueNames = ADDITIVE_GROUPS['functions-league'];
  const contentNames = ADDITIVE_GROUPS['functions-content-v2'];
  const completeNames = [
    ...BASELINE_NAMES,
    ...coreNames,
    ...leagueNames,
    ...contentNames,
  ];

  assert.deepEqual(expectedNamesForStage('baseline'), BASELINE_NAMES);
  assert.deepEqual(
    expectedNamesForStage('core-v2'),
    [...BASELINE_NAMES, ...coreNames],
  );
  assert.deepEqual(
    expectedNamesForStage('league'),
    [...BASELINE_NAMES, ...coreNames, ...leagueNames],
  );
  assert.deepEqual(expectedNamesForStage('content-v2'), completeNames);
  assert.deepEqual(
    expectedNamesForStage('legacy-players-removed'),
    completeNames.filter((name) => ![
      'syncLaLigaPlayers',
      'getLaLigaSyncStatus',
      'clearLaLigaPlayers',
    ].includes(name)),
  );
  assert.throws(
    () => expectedNamesForStage('anything'),
    /Unknown Functions inventory stage/,
  );
});

test('accepts only the exact expected inventory for a stage', () => {
  const items = expectedNamesForStage('core-v2').map(sanitizedFunction);
  const report = evaluateInventory(items, 'core-v2');

  assert.deepEqual(report.errors, []);
  assert.equal(report.stage, 'core-v2');
  assert.deepEqual(report.items, items);
  assert.deepEqual(report.expectedNames, expectedNamesForStage('core-v2'));
});

test('reports missing, unexpected and duplicate function names', () => {
  const expected = expectedNamesForStage('baseline');
  const items = expected.slice(1).map(sanitizedFunction);
  items.push(sanitizedFunction('unexpectedFunction'));
  items.push(sanitizedFunction(expected[1]));

  const errors = evaluateInventory(items, 'baseline').errors.join('\n');

  assert.match(errors, /missing Functions: clearLaLigaPlayers/);
  assert.match(errors, /unexpected Functions: unexpectedFunction/);
  assert.match(errors, /duplicate Functions: createOrGetChat/);
});

test('reports every function outside the required region, runtime or state', () => {
  const names = expectedNamesForStage('baseline');
  const items = names.map(sanitizedFunction);
  items[0] = sanitizedFunction(names[0], { region: 'europe-west1' });
  items[1] = sanitizedFunction(names[1], { runtime: 'nodejs20' });
  items[2] = sanitizedFunction(names[2], { state: 'FAILED' });

  const errors = evaluateInventory(items, 'baseline').errors.join('\n');

  assert.match(errors, /clearLaLigaPlayers.*region.*us-central1/);
  assert.match(errors, /createOrGetChat.*runtime.*nodejs22/);
  assert.match(errors, /createProfileDocuments.*state.*ACTIVE/);
});

test('pages through the projected Gen2 API and sanitizes each page immediately', async () => {
  const calls = [];
  const client = {
    async get(path, options) {
      calls.push({ path, options });
      if (!options.queryParams.pageToken) {
        return {
          body: {
            functions: [rawFunction('createProfileDocuments')],
            nextPageToken: 'page-2',
          },
        };
      }
      return {
        body: {
          functions: [rawFunction('unlinkUserFromTeam')],
        },
      };
    },
  };

  const items = await fetchSanitizedInventory({ client });

  assert.deepEqual(items, [
    sanitizedFunction('createProfileDocuments'),
    sanitizedFunction('unlinkUserFromTeam'),
  ]);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(
      call.path,
      'projects/tictaktools/locations/-/functions',
    );
    assert.equal(call.options.queryParams.filter, 'environment="GEN_2"');
    assert.equal(
      call.options.queryParams.fields,
      'functions(name,state,buildConfig/runtime),nextPageToken,unreachable',
    );
    assert.deepEqual(call.options.skipLog, {
      queryParams: true,
      resBody: true,
    });
  }
  assert.equal(calls[0].options.queryParams.pageToken, undefined);
  assert.equal(calls[1].options.queryParams.pageToken, 'page-2');
  assert.doesNotMatch(
    JSON.stringify(items),
    /never-print|SENSITIVE|SECRET|environmentVariables|serviceConfig/,
  );
});

test('rejects unreachable regions without exposing their names or raw fields', async () => {
  const client = {
    async get() {
      return {
        body: {
          functions: [rawFunction('createProfileDocuments')],
          unreachable: ['secret-region-name'],
          rawSecret: 'never-print',
        },
      };
    },
  };

  await assert.rejects(
    fetchSanitizedInventory({ client }),
    (error) => {
      assert.equal(error.message, 'Functions inventory request failed.');
      assert.doesNotMatch(
        String(error),
        /secret-region-name|never-print|rawSecret/,
      );
      return true;
    },
  );
});

test('replaces API failures with one fixed secret-free error', async () => {
  const client = {
    async get() {
      throw new Error('request failed with SECRET=never-print');
    },
  };

  await assert.rejects(
    fetchSanitizedInventory({ client }),
    (error) => {
      assert.equal(error.message, 'Functions inventory request failed.');
      assert.doesNotMatch(String(error), /SECRET|never-print/);
      assert.equal(error.cause, undefined);
      return true;
    },
  );
});

test('read-only CLI requires exactly one known stage before any API call', () => {
  const script = fileURLToPath(new URL(
    '../../scripts/production-functions-inventory.mjs',
    import.meta.url,
  ));
  const missing = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  const extra = spawnSync(
    process.execPath,
    [script, 'baseline', 'SECRET=never-print'],
    { encoding: 'utf8' },
  );
  const unknown = spawnSync(
    process.execPath,
    [script, 'SECRET=never-print'],
    { encoding: 'utf8' },
  );

  assert.equal(missing.status, 1);
  assert.equal(extra.status, 1);
  assert.equal(unknown.status, 1);
  for (const result of [missing, extra, unknown]) {
    const output = `${result.stdout}${result.stderr}`;
    assert.match(output, /exactly one Functions inventory stage/);
    assert.doesNotMatch(output, /SECRET|never-print/);
  }
});

test('package exposes only the projected read-only inventory entrypoint', () => {
  const rootPackage = JSON.parse(readFileSync(
    new URL('../../package.json', import.meta.url),
    'utf8',
  ));

  assert.equal(
    rootPackage.scripts['production:functions:inventory'],
    'node scripts/production-functions-inventory.mjs',
  );
});
