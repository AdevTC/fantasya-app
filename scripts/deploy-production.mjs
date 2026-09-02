import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_PRODUCTION,
  assertNoFirebaseFunctionsDotenv,
  assertProductionStateUnchanged,
  printProductionReport,
  runProductionPreflight,
  spawnFirebaseCli,
} from './production-preflight.mjs';

export const DEPLOY_TARGETS = Object.freeze({
  firestore: 'firestore:rules',
  indexes: 'firestore:indexes',
  storage: 'storage',
});

function assertKnownTarget(target) {
  if (
    typeof target !== 'string'
    || !Object.hasOwn(DEPLOY_TARGETS, target)
  ) {
    throw new Error('Unknown target.');
  }
}

export function confirmationForTarget(target) {
  assertKnownTarget(target);
  return `deploy ${EXPECTED_PRODUCTION.firebaseProject} ${target}`;
}

export function buildDeployArguments(target) {
  assertKnownTarget(target);
  return [
    'deploy',
    '--project',
    EXPECTED_PRODUCTION.firebaseProject,
    '--account',
    EXPECTED_PRODUCTION.firebaseAccount,
    '--only',
    DEPLOY_TARGETS[target],
  ];
}

function requireInteractiveTerminal(stdin, stdout) {
  if (!stdin?.isTTY || !stdout?.isTTY) {
    throw new Error('Production deployment requires an interactive terminal.');
  }
}

async function askForLiteralConfirmation(expected, { stdin, stdout }) {
  const terminal = createInterface({
    input: stdin,
    output: stdout,
  });
  try {
    return await terminal.question(
      `Type exactly "${expected}" to continue: `,
    );
  } finally {
    terminal.close();
  }
}

export async function runProductionDeploy(target, {
  cwd,
  stdin = process.stdin,
  stdout = process.stdout,
  preflight = runProductionPreflight,
  printReport = printProductionReport,
  askConfirmation = askForLiteralConfirmation,
  recheck = assertProductionStateUnchanged,
  checkDotenv = assertNoFirebaseFunctionsDotenv,
  spawnFirebase = spawnFirebaseCli,
} = {}) {
  assertKnownTarget(target);
  requireInteractiveTerminal(stdin, stdout);
  const report = await preflight({ cwd });
  printReport(report);
  if (report.errors.length > 0) {
    throw new Error('Production preflight failed; deployment was not started.');
  }

  const expected = confirmationForTarget(target);
  const answer = await askConfirmation(expected, { stdin, stdout });
  if (answer !== expected) {
    throw new Error('Confirmation did not match; deployment was not started.');
  }
  await recheck(report.state, { cwd });
  checkDotenv(cwd);

  const child = spawnFirebase(buildDeployArguments(target), {
    cwd,
    stdio: 'inherit',
  });
  if (child.error) {
    throw child.error;
  }
  return child;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !Object.hasOwn(DEPLOY_TARGETS, args[0])) {
    throw new Error(
      `Choose exactly one target: ${Object.keys(DEPLOY_TARGETS).join(', ')}`,
    );
  }
  const child = await runProductionDeploy(args[0]);
  process.exitCode = child.status ?? 1;
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
