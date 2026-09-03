import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const REQUIRED_NODE_MAJOR = 22;

export function evaluateNodeVersion(version) {
  const normalized = String(version ?? '').replace(/^v/, '');
  const match = /^(\d+)\./.exec(normalized);
  if (!match) {
    return {
      ok: false,
      error: `Invalid Node version: ${String(version)}`,
    };
  }
  if (Number(match[1]) !== REQUIRED_NODE_MAJOR) {
    return {
      ok: false,
      error: `Node ${REQUIRED_NODE_MAJOR} required; received ${normalized}`,
    };
  }
  return { ok: true };
}

export function assertNodeVersion(version = process.versions.node) {
  const evaluation = evaluateNodeVersion(version);
  if (!evaluation.ok) {
    throw new Error(evaluation.error);
  }
}

const entrypoint = process.argv[1]
  ? resolve(process.argv[1])
  : '';
const currentFile = resolve(fileURLToPath(import.meta.url));

if (entrypoint.toLowerCase() === currentFile.toLowerCase()) {
  try {
    assertNodeVersion();
    console.log(`Node ${process.versions.node} accepted.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
