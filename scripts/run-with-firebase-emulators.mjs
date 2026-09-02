import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  findOwnedDemoFirestoreProcesses,
  stopNewOwnedDemoFirestoreProcesses,
} from './emulator-processes.mjs';

const PROJECT_ID = 'demo-fantasya';
const EMULATORS = 'auth,firestore,functions,storage';

function parseArguments(arguments_) {
  const values = [...arguments_];
  const withUi = values[0] === '--ui';

  if (withUi) {
    values.shift();
  }

  if (values.length !== 1 || !values[0].trim()) {
    throw new Error(
      'Usage: node scripts/run-with-firebase-emulators.mjs [--ui] "<command>"',
    );
  }

  return { command: values[0], withUi };
}

function waitForChild(child) {
  return new Promise((resolveChild, rejectChild) => {
    child.once('error', rejectChild);
    child.once('exit', (code, signal) => {
      resolveChild({ code, signal });
    });
  });
}

async function main() {
  const { command, withUi } = parseArguments(process.argv.slice(2));
  const projectRoot = process.cwd();
  const firebaseCli = resolve(
    projectRoot,
    'node_modules/firebase-tools/lib/bin/firebase.js',
  );
  const baselineProcesses = await findOwnedDemoFirestoreProcesses(projectRoot);
  const baselineProcessIds = new Set(
    baselineProcesses.map((candidate) => Number(candidate.ProcessId)),
  );
  const firebaseArguments = [
    firebaseCli,
    'emulators:exec',
    '--project',
    PROJECT_ID,
    '--only',
    EMULATORS,
  ];

  if (withUi) {
    firebaseArguments.push('--ui');
  }

  firebaseArguments.push(command);

  const child = spawn(process.execPath, firebaseArguments, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  let forwardedSignal;
  const forwardSignal = (signal) => {
    forwardedSignal = signal;

    if (!child.killed) {
      child.kill(signal);
    }
  };
  const onInterrupt = () => forwardSignal('SIGINT');
  const onTerminate = () => forwardSignal('SIGTERM');

  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);

  let result;
  let cleanupError;

  try {
    result = await waitForChild(child);
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);

    try {
      await stopNewOwnedDemoFirestoreProcesses(
        projectRoot,
        baselineProcessIds,
      );
    } catch (error) {
      cleanupError = error;
    }
  }

  if (cleanupError) {
    throw cleanupError;
  }

  if (result.code !== null) {
    process.exitCode = result.code;
    return;
  }

  const signal = forwardedSignal ?? result.signal;
  process.exitCode = signal === 'SIGINT' ? 130 : 143;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
