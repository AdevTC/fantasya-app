const { createHash } = require('node:crypto');
const { Timestamp } = require('firebase-admin/firestore');
const { getDownloadURL } = require('firebase-admin/storage');
const { HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue, storage } = require('../lib/firebase');
const {
  requireDocumentId,
  requireSeasonAdmin,
} = require('../lib/league-authz');
const {
  describeOperation,
  matchStoredOperation,
} = require('../lib/operations');
const {
  XP_VALUES,
  applyXpAward,
  xpAwardRefs,
} = require('../lib/xp');

const POST_KEYS = new Set(['operationId', 'content', 'hasImage', 'tags']);
const TRANSFER_KEYS = new Set([
  'operationId',
  'leagueId',
  'seasonId',
  'playerId',
  'playerName',
  'buyerId',
  'sellerId',
  'type',
  'price',
  'timestamp',
]);
const TRANSFER_TYPES = new Set(['puja', 'clausulazo', 'acuerdo']);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_POST_IMAGE_BYTES = 5 * 1024 * 1024;
const POST_IMAGE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const DEFAULT_LIMITS = Object.freeze({
  postsPerHour: 12,
  transfersPerActorLeagueHour: 60,
  rewardedTransfersPerBuyerDay: 100,
});

function invalidArgument(message) {
  throw new HttpsError('invalid-argument', message);
}

function requireData(data, allowedKeys) {
  if (
    data === null
    || typeof data !== 'object'
    || Array.isArray(data)
    || Object.keys(data).some((key) => !allowedKeys.has(key))
  ) {
    invalidArgument('Los datos de la operación no son válidos.');
  }
  return data;
}

function normalizeText(value, name, maxLength) {
  if (typeof value !== 'string') {
    invalidArgument(`${name} no es válido.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    invalidArgument(`${name} no es válido.`);
  }
  return normalized;
}

function normalizeOptionalHttpUrl(value, name) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') invalidArgument(`${name} no es válida.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > 2048) {
    invalidArgument(`${name} no es válida.`);
  }
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    invalidArgument(`${name} no es válida.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    invalidArgument(`${name} no es válida.`);
  }
  return normalized;
}

function normalizePostData(data) {
  const input = requireData(data, POST_KEYS);
  if (typeof input.content !== 'string') {
    invalidArgument('El contenido no es válido.');
  }
  const content = input.content.trim();
  if (content.length > 280) {
    invalidArgument('El contenido no puede superar 280 caracteres.');
  }
  if (typeof input.hasImage !== 'boolean') {
    invalidArgument('El indicador de imagen no es válido.');
  }
  if (!content && !input.hasImage) {
    invalidArgument('La publicación debe tener texto o una imagen.');
  }
  if (!Array.isArray(input.tags) || input.tags.length > 5) {
    invalidArgument('Las etiquetas no son válidas.');
  }
  const tags = input.tags.map((tag) => {
    if (typeof tag !== 'string') invalidArgument('Las etiquetas no son válidas.');
    const normalized = tag.trim().toLowerCase();
    if (!/^[a-z0-9]{1,32}$/.test(normalized)) {
      invalidArgument('Las etiquetas no son válidas.');
    }
    return normalized;
  });
  if (new Set(tags).size !== tags.length) {
    invalidArgument('Las etiquetas deben ser únicas.');
  }
  return { content, hasImage: input.hasImage, tags };
}

function postUploadError(message) {
  return new HttpsError('failed-precondition', message);
}

async function verifyPostUpload(objectPath, storageService = storage) {
  const file = storageService.bucket().file(objectPath);
  let metadata;
  try {
    [metadata] = await file.getMetadata();
  } catch {
    throw postUploadError('La imagen indicada no existe o no está disponible.');
  }
  const size = Number(metadata.size);
  if (
    !Number.isSafeInteger(size)
    || size <= 0
    || size > MAX_POST_IMAGE_BYTES
  ) {
    throw postUploadError('La imagen no tiene un tamaño permitido.');
  }
  if (!POST_IMAGE_TYPES.has(metadata.contentType)) {
    throw postUploadError('El tipo de la imagen no está permitido.');
  }
  try {
    const downloadURL = await getDownloadURL(file);
    const parsed = new URL(downloadURL);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      || !downloadURL
    ) {
      throw new Error('invalid download URL');
    }
    return downloadURL;
  } catch {
    throw postUploadError('No se pudo obtener la URL canónica de la imagen.');
  }
}

async function resolvePostUpload(verifier, objectPath) {
  try {
    const downloadURL = await verifier(objectPath);
    if (typeof downloadURL !== 'string' || downloadURL.length === 0) {
      throw new Error('invalid verifier result');
    }
    return downloadURL;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw postUploadError('No se pudo verificar la imagen de la publicación.');
  }
}

function normalizeParticipantId(value, name) {
  if (typeof value !== 'string') invalidArgument(`${name} no es válido.`);
  const normalized = value.trim();
  if (normalized === 'market') return normalized;
  return requireDocumentId(normalized, name);
}

function normalizeTransferData(data) {
  const input = requireData(data, TRANSFER_KEYS);
  const leagueId = requireDocumentId(input.leagueId, 'leagueId');
  const seasonId = requireDocumentId(input.seasonId, 'seasonId');
  const playerId = requireDocumentId(input.playerId, 'playerId');
  const playerName = normalizeText(input.playerName, 'playerName', 128);
  const buyerId = normalizeParticipantId(input.buyerId, 'buyerId');
  const sellerId = normalizeParticipantId(input.sellerId, 'sellerId');
  const type = typeof input.type === 'string'
    ? input.type.trim().toLowerCase()
    : '';
  if (!TRANSFER_TYPES.has(type)) {
    invalidArgument('El tipo de fichaje no es válido.');
  }
  if (
    typeof input.price !== 'number'
    || !Number.isFinite(input.price)
    || input.price < 0
  ) {
    invalidArgument('El precio no es válido.');
  }
  const price = input.price === 0 ? 0 : input.price;
  if (typeof input.timestamp !== 'string') {
    invalidArgument('La fecha no es válida.');
  }
  const date = new Date(input.timestamp.trim());
  if (!Number.isFinite(date.getTime())) invalidArgument('La fecha no es válida.');
  const timestamp = date.toISOString();
  let firestoreTimestamp;
  try {
    firestoreTimestamp = Timestamp.fromDate(date);
  } catch {
    invalidArgument('La fecha no está dentro del rango permitido.');
  }
  if (buyerId === sellerId) {
    invalidArgument('Comprador y vendedor deben ser distintos.');
  }
  if (buyerId === 'market' && sellerId === 'market') {
    invalidArgument('Al menos un participante debe ser un equipo.');
  }
  return {
    firestoreTimestamp,
    payload: {
      leagueId,
      seasonId,
      playerId,
      playerName,
      buyerId,
      sellerId,
      type,
      price,
      timestamp,
    },
  };
}

function operationRef(firestore, operation) {
  return firestore.doc(`serverOperations/${operation.key}`);
}

function rateContext(options = {}) {
  const clock = options.clock || (() => new Date());
  if (typeof clock !== 'function') invalidArgument('El reloj no es válido.');
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    invalidArgument('El reloj no es válido.');
  }
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      invalidArgument(`El límite ${name} no es válido.`);
    }
  }
  return { limits, nowMs: now.getTime() };
}

function rateLimit(firestore, { scope, subjects, windowMs, limit, nowMs }) {
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const id = createHash('sha256')
    .update(JSON.stringify([scope, subjects, windowStartMs]))
    .digest('hex');
  return {
    limit,
    ref: firestore.doc(`serverRateLimits/${id}`),
    scope,
    windowStartMs,
  };
}

function counterValue(snapshot, quota) {
  if (!snapshot.exists) return 0;
  const data = snapshot.data();
  if (
    data.scope !== quota.scope
    || data.windowStart?.toMillis?.() !== quota.windowStartMs
    || !Number.isSafeInteger(data.count)
    || data.count < 0
  ) {
    throw new HttpsError('data-loss', 'El contador de uso no es válido.');
  }
  return data.count;
}

function requireQuota(snapshot, quota) {
  if (counterValue(snapshot, quota) >= quota.limit) {
    throw new HttpsError(
      'resource-exhausted',
      'Se ha alcanzado el límite temporal de operaciones.',
    );
  }
}

function incrementQuota(transaction, quota) {
  transaction.set(quota.ref, {
    scope: quota.scope,
    windowStart: Timestamp.fromMillis(quota.windowStartMs),
    count: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

function requireStoredResult(snapshot, field, expectedId, contentSnapshot) {
  if (
    snapshot.data()?.[field] !== expectedId
    || !contentSnapshot.exists
  ) {
    throw new HttpsError(
      'data-loss',
      'La operación guardada no coincide con su resultado.',
    );
  }
}

function requireXpEvent(snapshot, amount, source, message) {
  if (
    !snapshot.exists
    || snapshot.data().amount !== amount
    || snapshot.data().source !== source
  ) {
    throw new HttpsError('data-loss', message);
  }
}

function requireStoredTransfer(
  storedOperation,
  transfer,
  operation,
  payload,
  xpEvent,
) {
  requireStoredResult(
    storedOperation,
    'transferId',
    operation.key,
    transfer,
  );
  const stored = storedOperation.data();
  const validLedgerName = (value) => typeof value === 'string'
    && value.trim() === value
    && value.length > 0
    && value.length <= 128;
  const noXp = stored.xpRecipientId === null && stored.xpEventId === null;
  const awardedXp = stored.xpRecipientId === payload.buyerId
    && stored.xpEventId === `transfer:${operation.key}`;
  const xpEventMatches = noXp
    ? !xpEvent.exists
    : awardedXp
      && xpEvent.exists
      && xpEvent.data().amount === XP_VALUES.TRANSFER
      && xpEvent.data().source === 'transfer';
  if (
    !validLedgerName(stored.buyerName)
    || !validLedgerName(stored.sellerName)
    || (!noXp && !awardedXp)
    || !xpEventMatches
  ) {
    throw new HttpsError(
      'data-loss',
      'El fichaje guardado no conserva su contrato atómico.',
    );
  }
}

function memberTeamName(season, participantId) {
  if (participantId === 'market') return 'Mercado';
  const member = season.members?.[participantId];
  if (!member) invalidArgument('El participante no pertenece a la temporada.');
  return normalizeText(member.teamName, 'El nombre del equipo', 128);
}

function safeProfilePhoto(profile) {
  try {
    return normalizeOptionalHttpUrl(profile.photoURL, 'La foto de perfil');
  } catch {
    return null;
  }
}

async function createPostV2Handler(request, firestore = db, options = {}) {
  const usage = rateContext(options);
  const payload = normalizePostData(request?.data);
  const operation = describeOperation({
    uid: request?.uid,
    operationType: 'post.create.v2',
    operationId: request?.data?.operationId,
    payload,
  });
  const storedOperationRef = operationRef(firestore, operation);
  const postRef = firestore.doc(`posts/${operation.key}`);
  const xpRefs = xpAwardRefs(firestore, {
    userId: operation.uid,
    eventId: `post:${operation.key}`,
    amount: payload.hasImage ? XP_VALUES.POST_WITH_IMAGE : XP_VALUES.POST,
    source: 'post',
  });
  const hourlyQuota = rateLimit(firestore, {
    scope: 'post-hour',
    subjects: [operation.uid],
    windowMs: HOUR_MS,
    limit: usage.limits.postsPerHour,
    nowMs: usage.nowMs,
  });
  const precheckedOperation = await storedOperationRef.get();
  if (precheckedOperation.exists) {
    matchStoredOperation(precheckedOperation.data(), operation);
  }
  let imageURL = null;
  if (payload.hasImage && !precheckedOperation.exists) {
    const verifier = options.verifyPostUpload || verifyPostUpload;
    if (typeof verifier !== 'function') {
      invalidArgument('El verificador de imagen no es válido.');
    }
    imageURL = await resolvePostUpload(
      verifier,
      `posts/${operation.uid}/${operation.operationId}`,
    );
  }

  return firestore.runTransaction(async (transaction) => {
    const [
      storedOperation,
      post,
      user,
      xpEvent,
      hourlyCounter,
    ] = await Promise.all([
      transaction.get(storedOperationRef),
      transaction.get(postRef),
      transaction.get(xpRefs.userRef),
      transaction.get(xpRefs.eventRef),
      transaction.get(hourlyQuota.ref),
    ]);

    if (storedOperation.exists) {
      matchStoredOperation(storedOperation.data(), operation);
      requireStoredResult(storedOperation, 'postId', operation.key, post);
      requireXpEvent(
        xpEvent,
        xpRefs.award.amount,
        'post',
        'El evento XP del post no conserva su contrato atómico.',
      );
      return { postId: operation.key, created: false };
    }
    if (precheckedOperation.exists) {
      throw new HttpsError(
        'data-loss',
        'El registro de la publicación desapareció durante el reintento.',
      );
    }
    if (post.exists || xpEvent.exists) {
      throw new HttpsError(
        'already-exists',
        'El resultado de la operación ya existe sin su registro.',
      );
    }
    requireQuota(hourlyCounter, hourlyQuota);

    const profile = user.data();
    const authorUsername = normalizeText(
      profile?.username,
      'El nombre de usuario',
      16,
    );
    applyXpAward(transaction, { user, event: xpEvent }, xpRefs);
    transaction.create(postRef, {
      authorId: operation.uid,
      authorUsername,
      authorPhotoURL: safeProfilePhoto(profile),
      content: payload.content,
      imageURL,
      tags: payload.tags,
      likes: [],
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(storedOperationRef, {
      ...operation,
      postId: operation.key,
      createdAt: FieldValue.serverTimestamp(),
    });
    incrementQuota(transaction, hourlyQuota);
    return { postId: operation.key, created: true };
  });
}

async function createTransferV2Handler(request, firestore = db, options = {}) {
  const usage = rateContext(options);
  const normalized = normalizeTransferData(request?.data);
  const { payload } = normalized;
  const operation = describeOperation({
    uid: request?.uid,
    operationType: 'transfer.create.v2',
    operationId: request?.data?.operationId,
    payload,
  });
  const storedOperationRef = operationRef(firestore, operation);
  const leagueRef = firestore.doc(`leagues/${payload.leagueId}`);
  const seasonRef = firestore.doc(
    `leagues/${payload.leagueId}/seasons/${payload.seasonId}`,
  );
  const transferRef = firestore.doc(
    `leagues/${payload.leagueId}/seasons/${payload.seasonId}`
      + `/transfers/${operation.key}`,
  );
  const xpEventId = `transfer:${operation.key}`;
  const candidateXpRefs = xpAwardRefs(firestore, {
    userId: payload.buyerId,
    eventId: xpEventId,
    amount: XP_VALUES.TRANSFER,
    source: 'transfer',
  });
  const actorHourlyQuota = rateLimit(firestore, {
    scope: 'transfer-actor-league-hour',
    subjects: [operation.uid, payload.leagueId],
    windowMs: HOUR_MS,
    limit: usage.limits.transfersPerActorLeagueHour,
    nowMs: usage.nowMs,
  });
  const buyerDailyQuota = rateLimit(firestore, {
    scope: 'transfer-buyer-day',
    subjects: [payload.buyerId],
    windowMs: DAY_MS,
    limit: usage.limits.rewardedTransfersPerBuyerDay,
    nowMs: usage.nowMs,
  });

  return firestore.runTransaction(async (transaction) => {
    const [
      storedOperation,
      transfer,
      league,
      season,
      buyerUser,
      xpEvent,
      actorHourlyCounter,
      buyerDailyCounter,
    ] = await Promise.all([
      transaction.get(storedOperationRef),
      transaction.get(transferRef),
      transaction.get(leagueRef),
      transaction.get(seasonRef),
      transaction.get(candidateXpRefs.userRef),
      transaction.get(candidateXpRefs.eventRef),
      transaction.get(actorHourlyQuota.ref),
      transaction.get(buyerDailyQuota.ref),
    ]);

    if (!league.exists) throw new HttpsError('not-found', 'La liga no existe.');
    if (!season.exists) {
      throw new HttpsError('not-found', 'La temporada no existe.');
    }

    const context = {
      league: league.data(),
      leagueId: payload.leagueId,
      leagueRef,
      season: season.data(),
      seasonId: payload.seasonId,
      seasonRef,
    };
    requireSeasonAdmin(operation.uid, context);

    if (storedOperation.exists) {
      matchStoredOperation(storedOperation.data(), operation);
      requireStoredTransfer(
        storedOperation,
        transfer,
        operation,
        payload,
        xpEvent,
      );
      return { transferId: operation.key, created: false };
    }
    const buyerName = memberTeamName(context.season, payload.buyerId);
    const sellerName = memberTeamName(context.season, payload.sellerId);
    const buyer = payload.buyerId === 'market'
      ? null
      : context.season.members[payload.buyerId];
    const earnsXp = buyer && buyer.isPlaceholder !== true && buyerUser.exists;
    const expectedXpRecipientId = earnsXp ? payload.buyerId : null;
    const expectedXpEventId = earnsXp ? xpEventId : null;
    if (transfer.exists) {
      throw new HttpsError(
        'already-exists',
        'El fichaje ya existe sin su registro de operación.',
      );
    }
    if (xpEvent.exists) {
      throw new HttpsError(
        'data-loss',
        'Existe un evento XP sin su operación de fichaje.',
      );
    }
    requireQuota(actorHourlyCounter, actorHourlyQuota);
    if (earnsXp) requireQuota(buyerDailyCounter, buyerDailyQuota);

    if (earnsXp) {
      applyXpAward(
        transaction,
        { user: buyerUser, event: xpEvent },
        candidateXpRefs,
      );
    }
    transaction.create(transferRef, {
      playerId: payload.playerId,
      playerName: payload.playerName,
      price: payload.price,
      buyerId: payload.buyerId,
      buyerName,
      sellerId: payload.sellerId,
      sellerName,
      type: payload.type,
      timestamp: normalized.firestoreTimestamp,
    });
    transaction.create(storedOperationRef, {
      ...operation,
      transferId: operation.key,
      buyerName,
      sellerName,
      xpRecipientId: expectedXpRecipientId,
      xpEventId: expectedXpEventId,
      createdAt: FieldValue.serverTimestamp(),
    });
    incrementQuota(transaction, actorHourlyQuota);
    if (earnsXp) incrementQuota(transaction, buyerDailyQuota);
    return { transferId: operation.key, created: true };
  });
}

module.exports = {
  createPostV2Handler,
  createTransferV2Handler,
};
