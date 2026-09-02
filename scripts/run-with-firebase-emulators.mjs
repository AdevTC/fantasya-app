import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  findOwnedDemoFirestoreProcesses,
  resolveEmulatorCleanupError,
  stopNewOwnedDemoFirestoreProcesses,
  terminateWindowsProcessTree,
  waitForLocalPortsAvailable,
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

function startWindowsCleanupWatchdog({
  baselineProcessIds,
  firebaseProcessId,
  ownerProcessId,
  ports,
  projectRoot,
}) {
  if (process.platform !== 'win32') {
    return Promise.resolve();
  }

  const watchdogPath = resolve(
    projectRoot,
    'scripts/emulator-cleanup-watchdog.mjs',
  );
  const watchdog = spawn(process.execPath, [
    watchdogPath,
    String(ownerProcessId),
    String(firebaseProcessId),
    JSON.stringify([...baselineProcessIds]),
    ports.join(','),
  ], {
    cwd: projectRoot,
    detached: true,
    env: process.env,
    stdio: 'ignore',
    windowsHide: true,
  });

  return new Promise((resolveWatchdog, rejectWatchdog) => {
    watchdog.once('error', rejectWatchdog);
    watchdog.once('spawn', () => {
      watchdog.removeListener('error', rejectWatchdog);
      watchdog.unref();
      resolveWatchdog();
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

  const portsToRelease = [9099, 8080, 5001, 9199];
  if (withUi) portsToRelease.push(4000);
  if (command === 'npm run dev:session') portsToRelease.push(5173);

  const child = spawn(process.execPath, firebaseArguments, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });

  try {
    await startWindowsCleanupWatchdog({
      baselineProcessIds,
      firebaseProcessId: child.pid,
      ownerProcessId: process.pid,
      ports: portsToRelease,
      projectRoot,
    });
  } catch (error) {
    await terminateWindowsProcessTree(child.pid);
    throw error;
  }
  let forwardedSignal;
  let treeTerminationPromise;
  let treeTerminationError;
  const forwardSignal = (signal) => {
    forwardedSignal = signal;

    if (process.platform === 'win32' && !treeTerminationPromise) {
      treeTerminationPromise = terminateWindowsProcessTree(child.pid)
        .catch((error) => {
          treeTerminationError = error;
        });
    } else if (process.platform !== 'win32' && !child.killed) {
      child.kill(signal);
    }
  };
  const onInterrupt = () => forwardSignal('SIGINT');
  const onTerminate = () => forwardSignal('SIGTERM');

  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);

  let result;
  let cleanupStepError;

  try {
    result = await waitForChild(child);
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);

    try {
      if (treeTerminationPromise) {
        await treeTerminationPromise;
      }
      await stopNewOwnedDemoFirestoreProcesses(
        projectRoot,
        baselineProcessIds,
      );
      await waitForLocalPortsAvailable(portsToRelease);
    } catch (error) {
      cleanupStepError = error;
    }
  }

  const cleanupError = resolveEmulatorCleanupError(
    treeTerminationError,
    cleanupStepError,
  );
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
