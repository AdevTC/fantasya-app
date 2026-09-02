const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { requireDocumentId } = require('./league-authz');

const OPERATION_TYPES = new Set([
  'post.create.v2',
  'transfer.create.v2',
]);

function invalidPayload() {
  throw new HttpsError('invalid-argument', 'El payload no es JSON válido.');
}

function isArrayIndex(key, length) {
  if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index < length;
}

function requireDataProperty(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (
    !descriptor
    || !descriptor.enumerable
    || !Object.hasOwn(descriptor, 'value')
  ) {
    invalidPayload();
  }
  return descriptor.value;
}

function canonicalValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidPayload();
    return value;
  }
  if (typeof value !== 'object') invalidPayload();
  if (ancestors.has(value)) invalidPayload();

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).some((key) => (
        key !== 'length'
        && !isArrayIndex(key, value.length)
      ))) {
        invalidPayload();
      }
      const normalized = [];
      for (let index = 0; index < value.length; index += 1) {
        normalized.push(canonicalValue(
          requireDataProperty(value, String(index)),
          ancestors,
        ));
      }
      return normalized;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalidPayload();
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string')) {
      invalidPayload();
    }

    const normalized = Object.create(null);
    for (const key of keys.sort()) {
      normalized[key] = canonicalValue(
        requireDataProperty(value, key),
        ancestors,
      );
    }
    return normalized;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    return invalidPayload();
  } finally {
    ancestors.delete(value);
  }
}

function canonicalJson(payload) {
  return JSON.stringify(canonicalValue(payload));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireExactDocumentId(value, name) {
  const safe = requireDocumentId(value, name);
  if (typeof value !== 'string' || value !== safe) {
    throw new HttpsError('invalid-argument', `${name} no es válido.`);
  }
  return safe;
}

function describeOperation({ uid, operationType, operationId, payload }) {
  const safeUid = requireExactDocumentId(uid, 'uid');
  const safeId = requireExactDocumentId(operationId, 'operationId');
  if (!OPERATION_TYPES.has(operationType)) {
    throw new HttpsError('invalid-argument', 'operationType no es válido.');
  }
  const canonicalPayload = canonicalJson(payload);
  return {
    key: sha256(JSON.stringify([safeUid, operationType, safeId])),
    operationId: safeId,
    operationType,
    payloadHash: sha256(canonicalPayload),
    uid: safeUid,
  };
}

function matchStoredOperation(data, descriptor) {
  const matches = [
    'operationId',
    'operationType',
    'payloadHash',
    'uid',
  ].every((field) => data?.[field] === descriptor?.[field]);

  if (!matches) {
    throw new HttpsError(
      'already-exists',
      'El identificador de operación ya se utilizó con otros datos.',
    );
  }
  return true;
}

module.exports = {
  describeOperation,
  matchStoredOperation,
};
