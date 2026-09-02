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

export const DEPLOY_TARGETS = Object.freeze({
  'functions-core': [
    'functions:createProfileDocuments',
    'functions:unlinkUserFromTeam',
    'functions:setUserAppRole',
    'functions:createOrGetChat',
    'functions:onPostCreatedAwardXp',
    'functions:onTransferCreatedAwardXp',
    'functions:recalculateXp',
  ].join(','),
  'functions-sync': [
    'functions:syncLaLigaPlayersV2',
    'functions:getLaLigaSyncStatusV2',
    'functions:syncLaLigaPlayers',
    'functions:getLaLigaSyncStatus',
  ].join(','),
  'functions-league': [
    'functions:joinSeasonByInviteCode',
    'functions:submitJoinRequest',
    'functions:reviewJoinRequest',
    'functions:replaceSeasonTrophies',
    'functions:saveSeasonChallenge',
    'functions:deleteSeasonChallenge',
    'functions:setChallengeWinners',
    'functions:refreshCareerAchievements',
  ].join(','),
  firestore: 'firestore:rules',
  indexes: 'firestore:indexes',
  storage: 'storage',
});

export function targetNeedsFootballSecret(target) {
  return target === 'functions-sync';
}

export function confirmationForTarget(target) {
  if (!Object.hasOwn(DEPLOY_TARGETS, target)) {
    throw new Error(`Unknown target: ${String(target)}`);
  }
  return `deploy ${EXPECTED_PRODUCTION.firebaseProject} ${target}`;
}

export function buildDeployArguments(target) {
  if (!Object.hasOwn(DEPLOY_TARGETS, target)) {
    throw new Error(`Unknown target: ${String(target)}`);
  }
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

function requireInteractiveTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Production deployment requires an interactive terminal.');
  }
}

async function askForLiteralConfirmation(expected) {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await terminal.question(
      `Type exactly "${expected}" to continue: `,
    );
  } finally {
    terminal.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !Object.hasOwn(DEPLOY_TARGETS, args[0])) {
    throw new Error(
      `Choose exactly one target: ${Object.keys(DEPLOY_TARGETS).join(', ')}`,
    );
  }
  requireInteractiveTerminal();

  const target = args[0];
  const report = await runProductionPreflight({
    requireFootballSecret: targetNeedsFootballSecret(target),
  });
  printProductionReport(report);
  if (report.errors.length > 0) {
    throw new Error('Production preflight failed; deployment was not started.');
  }

  const expected = confirmationForTarget(target);
  const answer = await askForLiteralConfirmation(expected);
  if (answer !== expected) {
    throw new Error('Confirmation did not match; deployment was not started.');
  }
  assertProductionStateUnchanged(report.state);

  const child = spawnFirebaseCli(buildDeployArguments(target), {
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
