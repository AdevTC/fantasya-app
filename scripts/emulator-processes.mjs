import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FIRESTORE_PROCESS_QUERY = [
  'Get-CimInstance Win32_Process -Filter "Name = \'java.exe\'"',
  'Select-Object ProcessId,ParentProcessId,Name,CommandLine',
  'ConvertTo-Json -Compress',
].join(' | ');

function normalize(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
}

function processId(processInfo) {
  return Number(processInfo?.ProcessId ?? processInfo?.processId);
}

export function selectNewOwnedProcessIds(
  processes,
  baselineProcessIds = new Set(),
) {
  return processes
    .map(processId)
    .filter((id) => Number.isInteger(id) && !baselineProcessIds.has(id));
}

export function buildWindowsTreeKillArguments(id) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('A positive process ID is required.');
  }

  return ['/PID', String(id), '/T', '/F'];
}

export async function terminateWindowsProcessTree(
  id,
  {
    platform = process.platform,
    execFileImpl = execFileAsync,
  } = {},
) {
  if (platform !== 'win32') {
    return false;
  }

  try {
    await execFileImpl(
      'taskkill.exe',
      buildWindowsTreeKillArguments(id),
      { windowsHide: true },
    );
    return true;
  } catch (error) {
    if (Number(error?.code) === 128) {
      return false;
    }
    throw error;
  }
}

export function resolveEmulatorCleanupError(
  treeTerminationError,
  cleanupStepError,
) {
  if (treeTerminationError && cleanupStepError) {
    return new AggregateError(
      [treeTerminationError, cleanupStepError],
      'Firebase emulator process-tree cleanup failed.',
    );
  }

  return treeTerminationError || cleanupStepError;
}

export function isOwnedDemoFirestoreProcess(processInfo, projectRoot) {
  const name = normalize(processInfo?.Name ?? processInfo?.name);
  const commandLine = normalize(
    processInfo?.CommandLine ?? processInfo?.commandLine,
  );
  const rulesPath = normalize(resolve(projectRoot, 'firestore.rules'));

  return (name === 'java.exe' || name === 'java')
    && commandLine.includes('cloud-firestore-emulator-v')
    && /--project_id(?:=|\s+)demo-fantasya(?:\s|$)/.test(commandLine)
    && commandLine.includes(rulesPath);
}

export function isOwnedFirebaseCliProcess(
  processInfo,
  {
    processId: expectedProcessId,
    ownerProcessId,
    projectRoot,
  },
) {
  const id = processId(processInfo);
  const parentId = Number(
    processInfo?.ParentProcessId ?? processInfo?.parentProcessId,
  );
  const name = normalize(processInfo?.Name ?? processInfo?.name);
  const commandLine = normalize(
    processInfo?.CommandLine ?? processInfo?.commandLine,
  );
  const firebaseCli = normalize(resolve(
    projectRoot,
    'node_modules/firebase-tools/lib/bin/firebase.js',
  ));

  return id === expectedProcessId
    && parentId === ownerProcessId
    && (name === 'node.exe' || name === 'node')
    && commandLine.includes(firebaseCli)
    && /(?:^|\s)emulators:exec(?:\s|$)/.test(commandLine)
    && /--project(?:=|\s+)demo-fantasya(?:\s|$)/.test(commandLine);
}

export async function getWindowsProcessById(id) {
  if (process.platform !== 'win32') {
    return null;
  }

  buildWindowsTreeKillArguments(id);
  const query = [
    `Get-CimInstance Win32_Process -Filter "ProcessId = ${id}"`,
    'Select-Object ProcessId,ParentProcessId,Name,CommandLine',
    'ConvertTo-Json -Compress',
  ].join(' | ');
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', query],
    { encoding: 'utf8', windowsHide: true },
  );
  const output = stdout.trim();

  return output ? JSON.parse(output) : null;
}

export async function terminateOwnedFirebaseCliTree(options) {
  const processInfo = await getWindowsProcessById(options.processId);

  if (!processInfo || !isOwnedFirebaseCliProcess(processInfo, options)) {
    return false;
  }

  return terminateWindowsProcessTree(options.processId);
}

export async function listWindowsJavaProcesses() {
  if (process.platform !== 'win32') {
    return [];
  }

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', FIRESTORE_PROCESS_QUERY],
    { encoding: 'utf8', windowsHide: true },
  );
  const output = stdout.trim();

  if (!output) {
    return [];
  }

  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

export async function findOwnedDemoFirestoreProcesses(projectRoot) {
  const processes = await listWindowsJavaProcesses();
  return processes.filter((candidate) => (
    isOwnedDemoFirestoreProcess(candidate, projectRoot)
  ));
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function canBindLocalPort(port) {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();

    server.once('error', (error) => {
      if (error?.code === 'EADDRINUSE') {
        resolvePort(false);
        return;
      }
      rejectPort(error);
    });
    server.listen({
      exclusive: true,
      host: '127.0.0.1',
      port,
    }, () => {
      server.close(() => resolvePort(true));
    });
  });
}

export async function waitForLocalPortsAvailable(
  ports,
  { timeoutMs = 10000, intervalMs = 250 } = {},
) {
  const uniquePorts = [...new Set(ports)].filter((port) => (
    Number.isInteger(port) && port > 0
  ));
  const deadline = Date.now() + timeoutMs;
  let unavailable = [];

  do {
    const results = await Promise.all(
      uniquePorts.map(async (port) => ({
        available: await canBindLocalPort(port),
        port,
      })),
    );
    unavailable = results
      .filter((result) => !result.available)
      .map((result) => result.port);

    if (unavailable.length === 0) {
      return;
    }

    await delay(intervalMs);
  } while (Date.now() < deadline);

  throw new Error(
    `Local emulator port cleanup timed out: ${unavailable.join(', ')}`,
  );
}

export async function stopNewOwnedDemoFirestoreProcesses(
  projectRoot,
  baselineProcessIds = new Set(),
) {
  if (process.platform !== 'win32') {
    return;
  }

  const ownedProcesses = await findOwnedDemoFirestoreProcesses(projectRoot);
  const processIds = selectNewOwnedProcessIds(
    ownedProcesses,
    baselineProcessIds,
  );

  for (const id of processIds) {
    try {
      process.kill(id, 'SIGTERM');
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        throw error;
      }
    }
  }

  for (let attempt = 0; attempt < 20 && processIds.length > 0; attempt += 1) {
    const remaining = await findOwnedDemoFirestoreProcesses(projectRoot);
    const remainingIds = new Set(remaining.map(processId));

    if (processIds.every((id) => !remainingIds.has(id))) {
      return;
    }

    await delay(250);
  }

  const remaining = await findOwnedDemoFirestoreProcesses(projectRoot);
  const remainingIds = new Set(remaining.map(processId));
  const leakedIds = processIds.filter((id) => remainingIds.has(id));

  if (leakedIds.length > 0) {
    throw new Error(
      `Firestore emulator cleanup failed for owned process(es): ${leakedIds.join(', ')}`,
    );
  }
}
