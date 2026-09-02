export function getTransferSessionIdentity({
  isOpen,
  league,
  season,
  existingTransfer,
  user,
}) {
  if (!isOpen) return null;
  return JSON.stringify([
    league?.id ?? null,
    season?.id ?? null,
    existingTransfer?.id ?? null,
    user?.uid ?? null,
  ]);
}

export function parseSpanishPrice(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 ? input : null;
  }
  if (typeof input !== 'string') return null;

  const value = input.trim();
  if (!value || !/^\d+(?:[.,]\d+)*$/.test(value)) return null;

  let normalized;
  if (value.includes(',')) {
    const parts = value.split(',');
    if (parts.length !== 2) return null;
    const [integerPart, decimalPart] = parts;
    const groupedInteger = /^\d{1,3}(?:\.\d{3})*$/.test(integerPart);
    const plainInteger = /^\d+$/.test(integerPart);
    if ((!groupedInteger && !plainInteger) || !/^\d+$/.test(decimalPart)) {
      return null;
    }
    normalized = `${integerPart.replaceAll('.', '')}.${decimalPart}`;
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) {
    normalized = value.replaceAll('.', '');
  } else if (/^\d+(?:\.\d+)?$/.test(value)) {
    normalized = value;
  } else {
    return null;
  }

  const price = Number(normalized);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function createPostAttempt({ fingerprint, image, operationId, uid }) {
  return {
    callableStarted: false,
    fingerprint,
    image,
    operationId,
    payload: null,
    uid,
    uploadPath: `posts/${uid}/${operationId}`,
  };
}

export function isSamePostAttempt(attempt, { fingerprint, image, uid }) {
  return Boolean(
    attempt
    && attempt.uid === uid
    && attempt.fingerprint === fingerprint
    && attempt.image === image,
  );
}

export function shouldDiscardPostUpload(attempt) {
  return Boolean(
    attempt?.image
    && attempt.callableStarted === false
    && attempt.uploadPath,
  );
}

export function revokeBlobUrl(
  url,
  revoke = globalThis.URL?.revokeObjectURL?.bind(globalThis.URL),
) {
  if (typeof url !== 'string' || !url.startsWith('blob:')) return false;
  if (typeof revoke !== 'function') return false;
  revoke(url);
  return true;
}
