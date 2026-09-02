import { execFile } from 'node:child_process';
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

export async function stopNewOwnedDemoFirestoreProcesses(
  projectRoot,
  baselineProcessIds = new Set(),
) {
  if (process.platform !== 'win32') {
    return;
  }

  const ownedProcesses = await findOwnedDemoFirestoreProcesses(projectRoot);
  const processIds = ownedProcesses
    .map(processId)
    .filter((id) => Number.isInteger(id) && !baselineProcessIds.has(id));

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
