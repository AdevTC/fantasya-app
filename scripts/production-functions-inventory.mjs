import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNodeVersion } from './check-node-version.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const require = createRequire(import.meta.url);

const FIREBASE_PROJECT = 'tictaktools';
const FIREBASE_ACCOUNT = 'jordisumba@gmail.com';
const REQUIRED_REGION = 'us-central1';
const REQUIRED_RUNTIME = 'nodejs22';
const REQUIRED_STATE = 'ACTIVE';
const INVENTORY_ERROR = 'Functions inventory request failed.';
const PROJECTED_FIELDS = 'functions(name,state,buildConfig/runtime),nextPageToken,unreachable';
const LEGACY_PLAYER_NAMES = Object.freeze([
  'syncLaLigaPlayers',
  'getLaLigaSyncStatus',
  'clearLaLigaPlayers',
]);

export const BASELINE_NAMES = Object.freeze([
  'clearLaLigaPlayers',
  'createOrGetChat',
  'createProfileDocuments',
  'getLaLigaSyncStatus',
  'onSeasonJoin',
  'syncLaLigaPlayers',
  'unlinkUserFromTeam',
]);

export const ADDITIVE_GROUPS = Object.freeze({
  'functions-core-v2': Object.freeze([
    'createProfileDocumentsV2',
    'unlinkUserFromTeamV2',
    'setUserAppRole',
    'createOrGetChatV2',
    'recalculateXp',
  ]),
  'functions-league': Object.freeze([
    'joinSeasonByInviteCode',
    'submitJoinRequest',
    'reviewJoinRequest',
    'replaceSeasonTrophies',
    'saveSeasonChallenge',
    'deleteSeasonChallenge',
    'setChallengeWinners',
    'refreshCareerAchievements',
  ]),
  'functions-content-v2': Object.freeze([
    'createPostV2',
    'createTransferV2',
  ]),
});

const STAGES = Object.freeze([
  'baseline',
  'core-v2',
  'league',
  'content-v2',
  'legacy-players-removed',
]);

function nameParts(resourceName) {
  if (typeof resourceName !== 'string') {
    return { name: '', region: '' };
  }
  const match = /^projects\/[^/]+\/locations\/([^/]+)\/functions\/([^/]+)$/.exec(
    resourceName,
  );
  return match
    ? { name: match[2], region: match[1] }
    : { name: '', region: '' };
}

export function sanitizeFunction(resource) {
  const { name, region } = nameParts(resource?.name);
  return {
    name,
    region,
    runtime: typeof resource?.buildConfig?.runtime === 'string'
      ? resource.buildConfig.runtime
      : '',
    state: typeof resource?.state === 'string' ? resource.state : '',
  };
}

export function expectedNamesForStage(stage) {
  if (!STAGES.includes(stage)) {
    throw new Error('Unknown Functions inventory stage.');
  }

  const names = [...BASELINE_NAMES];
  if (stage !== 'baseline') {
    names.push(...ADDITIVE_GROUPS['functions-core-v2']);
  }
  if (['league', 'content-v2', 'legacy-players-removed'].includes(stage)) {
    names.push(...ADDITIVE_GROUPS['functions-league']);
  }
  if (['content-v2', 'legacy-players-removed'].includes(stage)) {
    names.push(...ADDITIVE_GROUPS['functions-content-v2']);
  }

  const exactNames = stage === 'legacy-players-removed'
    ? names.filter((name) => !LEGACY_PLAYER_NAMES.includes(name))
    : names;
  return Object.freeze(exactNames);
}

function sanitizeInventoryItem(item) {
  if (typeof item?.name === 'string' && item.name.includes('/')) {
    return sanitizeFunction(item);
  }
  return {
    name: typeof item?.name === 'string' ? item.name : '',
    region: typeof item?.region === 'string' ? item.region : '',
    runtime: typeof item?.runtime === 'string' ? item.runtime : '',
    state: typeof item?.state === 'string' ? item.state : '',
  };
}

export function evaluateInventory(items, stage) {
  const expectedNames = expectedNamesForStage(stage);
  const sanitizedItems = Array.isArray(items)
    ? items.map(sanitizeInventoryItem)
    : [];
  const counts = new Map();
  for (const item of sanitizedItems) {
    counts.set(item.name, (counts.get(item.name) || 0) + 1);
  }

  const expectedSet = new Set(expectedNames);
  const missing = expectedNames.filter((name) => !counts.has(name));
  const unexpected = [...counts.keys()]
    .filter((name) => !expectedSet.has(name))
    .sort();
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort();
  const errors = [];

  if (missing.length > 0) {
    errors.push(`missing Functions: ${missing.join(', ')}`);
  }
  if (unexpected.length > 0) {
    errors.push(`unexpected Functions: ${unexpected.join(', ')}`);
  }
  if (duplicates.length > 0) {
    errors.push(`duplicate Functions: ${duplicates.join(', ')}`);
  }

  for (const item of sanitizedItems) {
    if (item.region !== REQUIRED_REGION) {
      errors.push(
        `${item.name || '(invalid name)'} region must be ${REQUIRED_REGION}`,
      );
    }
    if (item.runtime !== REQUIRED_RUNTIME) {
      errors.push(
        `${item.name || '(invalid name)'} runtime must be ${REQUIRED_RUNTIME}`,
      );
    }
    if (item.state !== REQUIRED_STATE) {
      errors.push(
        `${item.name || '(invalid name)'} state must be ${REQUIRED_STATE}`,
      );
    }
  }

  return {
    stage,
    expectedNames,
    items: sanitizedItems,
    errors,
  };
}

export async function fetchSanitizedInventory({ client }) {
  try {
    const items = [];
    const seenPageTokens = new Set();
    let pageToken;

    while (true) {
      const response = await client.get(
        `projects/${FIREBASE_PROJECT}/locations/-/functions`,
        {
          queryParams: {
            filter: 'environment="GEN_2"',
            fields: PROJECTED_FIELDS,
            pageToken,
          },
          skipLog: {
            queryParams: true,
            resBody: true,
          },
        },
      );
      const body = response?.body;
      if (!body || typeof body !== 'object') {
        throw new Error(INVENTORY_ERROR);
      }

      const functions = body.functions ?? [];
      const unreachable = body.unreachable ?? [];
      if (!Array.isArray(functions) || !Array.isArray(unreachable)) {
        throw new Error(INVENTORY_ERROR);
      }
      const pageItems = functions.map(sanitizeFunction);
      if (unreachable.length > 0) {
        throw new Error(INVENTORY_ERROR);
      }
      items.push(...pageItems);

      const nextPageToken = body.nextPageToken;
      if (nextPageToken === undefined || nextPageToken === '') {
        return items;
      }
      if (
        typeof nextPageToken !== 'string'
        || seenPageTokens.has(nextPageToken)
      ) {
        throw new Error(INVENTORY_ERROR);
      }
      seenPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    }
  } catch {
    throw new Error(INVENTORY_ERROR);
  }
}

export async function inspectProductionFunctions({ stage }) {
  expectedNamesForStage(stage);
  assertNodeVersion();

  try {
    const auth = require(resolve(
      projectRoot,
      'node_modules',
      'firebase-tools',
      'lib',
      'auth.js',
    ));
    const apiv2 = require(resolve(
      projectRoot,
      'node_modules',
      'firebase-tools',
      'lib',
      'apiv2.js',
    ));
    const { functionsV2Origin } = require(resolve(
      projectRoot,
      'node_modules',
      'firebase-tools',
      'lib',
      'api.js',
    ));
    const account = auth.findAccountByEmail(FIREBASE_ACCOUNT);
    if (!account) {
      throw new Error(INVENTORY_ERROR);
    }
    auth.setActiveAccount({}, account);

    const client = new apiv2.Client({
      urlPrefix: functionsV2Origin(),
      auth: true,
      apiVersion: 'v2',
    });
    const items = await fetchSanitizedInventory({ client });
    return evaluateInventory(items, stage);
  } catch {
    throw new Error(INVENTORY_ERROR);
  }
}

function printInventory(report) {
  console.log(`Production Functions inventory: ${report.stage}`);
  console.table(report.items, ['name', 'region', 'runtime', 'state']);
  for (const error of report.errors) {
    console.error(`ERROR: ${error}`);
  }
}

function usageError() {
  console.error(
    'Provide exactly one Functions inventory stage: baseline, core-v2, league, content-v2, or legacy-players-removed.',
  );
  process.exitCode = 1;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !STAGES.includes(args[0])) {
    usageError();
    return;
  }

  try {
    const report = await inspectProductionFunctions({ stage: args[0] });
    printInventory(report);
    if (report.errors.length > 0) {
      process.exitCode = 1;
    }
  } catch {
    console.error(INVENTORY_ERROR);
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : '';
const currentFile = resolve(fileURLToPath(import.meta.url));

if (entrypoint.toLowerCase() === currentFile.toLowerCase()) {
  main();
}
