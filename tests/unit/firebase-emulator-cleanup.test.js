import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { isOwnedDemoFirestoreProcess } from '../../scripts/emulator-processes.mjs';

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
