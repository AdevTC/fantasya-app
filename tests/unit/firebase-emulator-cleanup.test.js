import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  buildWindowsTreeKillArguments,
  isOwnedFirebaseCliProcess,
  isOwnedDemoFirestoreProcess,
  resolveEmulatorCleanupError,
  selectNewOwnedProcessIds,
  terminateWindowsProcessTree,
} from '../../scripts/emulator-processes.mjs';

const projectRoot = 'C:\\work\\fantasya-app';
const rulesPath = join(projectRoot, 'firestore.rules');

function javaProcess(commandLine) {
  return {
    ProcessId: 1234,
    Name: 'java.exe',
    CommandLine: commandLine,
  };
}

test('matches only the demo Firestore emulator owned by this checkout', () => {
  const processInfo = javaProcess(
    `java -jar cloud-firestore-emulator-v1.22.0.jar --project_id demo-fantasya --rules ${rulesPath}`,
  );

  assert.equal(isOwnedDemoFirestoreProcess(processInfo, projectRoot), true);
});

test('matches Firebase CLI command lines with duplicated Windows separators', () => {
  const escapedRulesPath = rulesPath.replaceAll('\\', '\\\\');
  const processInfo = javaProcess(
    `java -jar cloud-firestore-emulator-v1.22.0.jar --project_id demo-fantasya --rules ${escapedRulesPath}`,
  );

  assert.equal(isOwnedDemoFirestoreProcess(processInfo, projectRoot), true);
});

test('does not match another Firebase project or checkout', () => {
  const production = javaProcess(
    `java -jar cloud-firestore-emulator-v1.22.0.jar --project_id tictaktools --rules ${rulesPath}`,
  );
  const otherCheckout = javaProcess(
    'java -jar cloud-firestore-emulator-v1.22.0.jar --project_id demo-fantasya --rules C:\\other\\firestore.rules',
  );

  assert.equal(isOwnedDemoFirestoreProcess(production, projectRoot), false);
  assert.equal(isOwnedDemoFirestoreProcess(otherCheckout, projectRoot), false);
});

test('does not match unrelated Java processes', () => {
  assert.equal(isOwnedDemoFirestoreProcess({
    ProcessId: 1234,
    Name: 'java.exe',
    CommandLine: 'java -jar unrelated-service.jar',
  }, projectRoot), false);
});

test('never selects a process that existed before this emulator session', () => {
  const processes = [
    { ProcessId: 10 },
    { ProcessId: 20 },
    { ProcessId: 30 },
  ];

  assert.deepEqual(
    selectNewOwnedProcessIds(processes, new Set([10, 30])),
    [20],
  );
});

test('builds a Windows taskkill command for one exact child tree', async () => {
  assert.deepEqual(buildWindowsTreeKillArguments(4321), [
    '/PID',
    '4321',
    '/T',
    '/F',
  ]);
  assert.throws(() => buildWindowsTreeKillArguments(0), /process ID/i);

  let invocation;
  const terminated = await terminateWindowsProcessTree(4321, {
    platform: 'win32',
    execFileImpl: async (file, arguments_, options) => {
      invocation = { file, arguments_, options };
    },
  });

  assert.equal(terminated, true);
  assert.equal(invocation.file, 'taskkill.exe');
  assert.deepEqual(invocation.arguments_, ['/PID', '4321', '/T', '/F']);
  assert.equal(invocation.options.windowsHide, true);
});

test('never hides a process-tree termination failure', () => {
  const treeError = new Error('taskkill failed');
  const cleanupError = new Error('port cleanup failed');

  assert.equal(resolveEmulatorCleanupError(treeError), treeError);
  assert.equal(resolveEmulatorCleanupError(undefined, cleanupError), cleanupError);

  const combined = resolveEmulatorCleanupError(treeError, cleanupError);
  assert.ok(combined instanceof AggregateError);
  assert.deepEqual(combined.errors, [treeError, cleanupError]);
});

test('matches only the Firebase CLI child owned by this wrapper and checkout', () => {
  const cliPath = join(
    projectRoot,
    'node_modules/firebase-tools/lib/bin/firebase.js',
  ).replaceAll('\\', '\\\\');
  const firebaseProcess = {
    ProcessId: 222,
    ParentProcessId: 111,
    Name: 'node.exe',
    CommandLine:
      `node ${cliPath} emulators:exec --project demo-fantasya ` +
      '--only auth,firestore,functions,storage',
  };

  assert.equal(isOwnedFirebaseCliProcess(
    firebaseProcess,
    { processId: 222, ownerProcessId: 111, projectRoot },
  ), true);
  assert.equal(isOwnedFirebaseCliProcess(
    { ...firebaseProcess, ParentProcessId: 999 },
    { processId: 222, ownerProcessId: 111, projectRoot },
  ), false);
  assert.equal(isOwnedFirebaseCliProcess(
    { ...firebaseProcess, CommandLine: 'node unrelated.js' },
    { processId: 222, ownerProcessId: 111, projectRoot },
  ), false);
});
