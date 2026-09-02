import { createInterface } from 'node:readline/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADDITIVE_GROUPS,
  inspectProductionFunctions,
} from './production-functions-inventory.mjs';
import {
  assertPremergeStateUnchanged,
  inspectPremergeState,
  printPremergeReport,
} from './premerge-functions-preflight.mjs';
import {
  EXPECTED_PRODUCTION,
  assertNoFirebaseFunctionsDotenv,
  spawnFirebaseCli,
} from './production-preflight.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const INVENTORY_FIELDS = Object.freeze([
  'name',
  'region',
  'runtime',
  'state',
]);

export const PREMERGE_TRANSITIONS = Object.freeze({
  'functions-core-v2': Object.freeze({
    from: 'baseline',
    to: 'core-v2',
  }),
  'functions-league': Object.freeze({
    from: 'core-v2',
    to: 'league',
  }),
  'functions-content-v2': Object.freeze({
    from: 'league',
    to: 'content-v2',
  }),
});

function assertKnownTarget(target) {
  if (
    typeof target !== 'string'
    || !Object.hasOwn(PREMERGE_TRANSITIONS, target)
  ) {
    throw new Error('Unknown pre-merge target.');
  }
}

export function confirmationForPremergeTarget(target, sha) {
  assertKnownTarget(target);
  if (typeof sha !== 'string' || !SHA_PATTERN.test(sha)) {
    throw new Error('Confirmation requires a full commit SHA.');
  }
  return `deploy ${EXPECTED_PRODUCTION.firebaseProject} ${target} ${sha}`;
}

export function buildPremergeDeployArguments(target) {
  assertKnownTarget(target);
  const names = ADDITIVE_GROUPS[target];
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error('Pre-merge target has no additive Functions allowlist.');
  }
  const only = names.map((name) => `functions:${name}`).join(',');
  return [
    'deploy',
    '--project',
    EXPECTED_PRODUCTION.firebaseProject,
    '--account',
    EXPECTED_PRODUCTION.firebaseAccount,
    '--only',
    only,
  ];
}

function requireInteractiveTerminal(stdin, stdout) {
  if (!stdin?.isTTY || !stdout?.isTTY) {
    throw new Error('Pre-merge deployment requires an interactive terminal.');
  }
}

async function askForLiteralConfirmation(expected, { stdin, stdout }) {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    return await terminal.question(
      `Type exactly "${expected}" to continue: `,
    );
  } finally {
    terminal.close();
  }
}

function requireGreenPremergeReport(report) {
  if (
    !report
    || typeof report !== 'object'
    || !report.state
    || typeof report.state !== 'object'
    || !Array.isArray(report.errors)
    || report.errors.length !== 0
    || !Array.isArray(report.warnings)
    || report.warnings.length !== 0
  ) {
    throw new Error('Pre-merge preflight failed; deployment was not started.');
  }
}

function sanitizedInventoryItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => ({
    name: typeof item?.name === 'string' ? item.name : '',
    region: typeof item?.region === 'string' ? item.region : '',
    runtime: typeof item?.runtime === 'string' ? item.runtime : '',
    state: typeof item?.state === 'string' ? item.state : '',
  }));
}

function requireExactInventory(report, stage) {
  if (
    !report
    || typeof report !== 'object'
    || report.stage !== stage
    || !Array.isArray(report.items)
    || !Array.isArray(report.errors)
    || report.errors.length !== 0
  ) {
    throw new Error('Production Functions inventory does not match the required stage.');
  }
  return {
    stage,
    items: sanitizedInventoryItems(report.items),
    errors: [],
  };
}

export function printSanitizedPremergeInventory(report) {
  const rows = sanitizedInventoryItems(report?.items);
  console.log(`Production Functions inventory: ${report?.stage || 'unknown'}`);
  console.table(rows, INVENTORY_FIELDS);
}

export async function runPremergeDeploy(target, {
  cwd = projectRoot,
  stdin = process.stdin,
  stdout = process.stdout,
  inspectPremerge = inspectPremergeState,
  printPremerge = printPremergeReport,
  inspectFunctions = inspectProductionFunctions,
  askConfirmation = askForLiteralConfirmation,
  recheckPremerge = assertPremergeStateUnchanged,
  checkDotenv = assertNoFirebaseFunctionsDotenv,
  spawnFirebase = spawnFirebaseCli,
  printInventory = printSanitizedPremergeInventory,
} = {}) {
  assertKnownTarget(target);
  requireInteractiveTerminal(stdin, stdout);

  const transition = PREMERGE_TRANSITIONS[target];
  const report = await inspectPremerge({ cwd });
  printPremerge(report);
  requireGreenPremergeReport(report);

  const initialInventory = requireExactInventory(
    await inspectFunctions({ stage: transition.from }),
    transition.from,
  );
  printInventory(initialInventory);

  const expectedConfirmation = confirmationForPremergeTarget(
    target,
    report.state.commit,
  );
  const answer = await askConfirmation(expectedConfirmation, { stdin, stdout });
  if (answer !== expectedConfirmation) {
    throw new Error('Confirmation did not match; deployment was not started.');
  }

  await recheckPremerge(report, { cwd });
  const recheckedInventory = requireExactInventory(
    await inspectFunctions({ stage: transition.from }),
    transition.from,
  );
  printInventory(recheckedInventory);

  checkDotenv(cwd);
  const child = spawnFirebase(buildPremergeDeployArguments(target), {
    cwd,
    stdio: 'inherit',
  });
  if (child?.error) {
    throw new Error('Firebase deployment could not start.');
  }
  if (child?.signal || child?.status !== 0) {
    throw new Error('Firebase deployment failed.');
  }

  const deployedInventory = requireExactInventory(
    await inspectFunctions({ stage: transition.to }),
    transition.to,
  );
  printInventory(deployedInventory);
  return deployedInventory;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !Object.hasOwn(PREMERGE_TRANSITIONS, args[0])) {
    throw new Error(
      `Choose exactly one target: ${Object.keys(PREMERGE_TRANSITIONS).join(', ')}`,
    );
  }
  await runPremergeDeploy(args[0]);
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : '';
const currentFile = resolve(fileURLToPath(import.meta.url));

if (entrypoint.toLowerCase() === currentFile.toLowerCase()) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Pre-merge deployment failed.',
    );
    process.exitCode = 1;
  });
}
