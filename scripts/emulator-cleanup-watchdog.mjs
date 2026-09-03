import {
  findOwnedDemoFirestoreProcesses,
  stopNewOwnedDemoFirestoreProcesses,
  terminateOwnedFirebaseCliTree,
  waitForLocalPortsAvailable,
} from './emulator-processes.mjs';

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function isProcessRunning(id) {
  try {
    process.kill(id, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

async function main() {
  const [
    ownerValue,
    firebaseValue,
    baselineValue,
    portsValue,
  ] = process.argv.slice(2);
  const ownerProcessId = parsePositiveInteger(ownerValue, 'ownerProcessId');
  const firebaseProcessId = parsePositiveInteger(
    firebaseValue,
    'firebaseProcessId',
  );
  const baselineProcessIds = new Set(JSON.parse(baselineValue));
  const ports = String(portsValue || '')
    .split(',')
    .filter(Boolean)
    .map((value) => parsePositiveInteger(value, 'port'));
  const projectRoot = process.cwd();

  while (
    isProcessRunning(ownerProcessId)
    && isProcessRunning(firebaseProcessId)
  ) {
    await delay(250);
  }

  if (!isProcessRunning(ownerProcessId)) {
    await terminateOwnedFirebaseCliTree({
      ownerProcessId,
      processId: firebaseProcessId,
      projectRoot,
    });
  }

  await delay(500);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await stopNewOwnedDemoFirestoreProcesses(
      projectRoot,
      baselineProcessIds,
    );
    const remaining = await findOwnedDemoFirestoreProcesses(projectRoot);
    const hasNewProcess = remaining.some((candidate) => (
      !baselineProcessIds.has(Number(candidate.ProcessId))
    ));

    if (!hasNewProcess) break;
    await delay(500);
  }

  await waitForLocalPortsAvailable(ports, { timeoutMs: 15000 });
}

main().catch(() => {
  process.exitCode = 1;
});
