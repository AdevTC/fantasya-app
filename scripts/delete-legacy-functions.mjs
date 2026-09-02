import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_PRODUCTION,
  assertProductionStateUnchanged,
  printProductionReport,
  runProductionPreflight,
  spawnFirebaseCli,
} from './production-preflight.mjs';

export const LEGACY_DELETE_CONFIRMATION =
  'delete tictaktools syncLaLigaPlayers getLaLigaSyncStatus clearLaLigaPlayers';

export const LEGACY_DELETE_ARGUMENTS = Object.freeze([
  'functions:delete',
  'syncLaLigaPlayers',
  'getLaLigaSyncStatus',
  'clearLaLigaPlayers',
  '--region',
  'us-central1',
  '--project',
  EXPECTED_PRODUCTION.firebaseProject,
  '--account',
  EXPECTED_PRODUCTION.firebaseAccount,
]);

function requireInteractiveTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Production deletion requires an interactive terminal.');
  }
}

async function askForLiteralConfirmation() {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await terminal.question(
      `Type exactly "${LEGACY_DELETE_CONFIRMATION}" to continue: `,
    );
  } finally {
    terminal.close();
  }
}

async function main() {
  if (process.argv.slice(2).length !== 0) {
    throw new Error('This command accepts no function-name arguments.');
  }
  requireInteractiveTerminal();

  const report = await runProductionPreflight();
  printProductionReport(report);
  if (report.errors.length > 0) {
    throw new Error('Production preflight failed; deletion was not started.');
  }

  const answer = await askForLiteralConfirmation();
  if (answer !== LEGACY_DELETE_CONFIRMATION) {
    throw new Error('Confirmation did not match; deletion was not started.');
  }
  assertProductionStateUnchanged(report.state);

  const child = spawnFirebaseCli(LEGACY_DELETE_ARGUMENTS, {
    stdio: 'inherit',
  });
  if (child.error) {
    throw child.error;
  }
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
