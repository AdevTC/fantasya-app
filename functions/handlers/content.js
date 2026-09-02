const { Timestamp } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('../lib/firebase');
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

const POST_KEYS = new Set(['operationId', 'content', 'imageURL', 'tags']);
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
  const imageURL = normalizeOptionalHttpUrl(input.imageURL, 'La imagen');
  if (!content && !imageURL) {
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
  return { content, imageURL, tags };
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
  if (buyerId === sellerId) {
    invalidArgument('Comprador y vendedor deben ser distintos.');
  }
  if (buyerId === 'market' && sellerId === 'market') {
    invalidArgument('Al menos un participante debe ser un equipo.');
  }
  return {
    leagueId,
    seasonId,
    playerId,
    playerName,
    buyerId,
    sellerId,
    type,
    price,
    timestamp,
  };
}

function operationRef(firestore, operation) {
  return firestore.doc(`serverOperations/${operation.key}`);
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

async function createPostV2Handler(request, firestore = db) {
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
    amount: payload.imageURL ? XP_VALUES.POST_WITH_IMAGE : XP_VALUES.POST,
    source: 'post',
  });

  return firestore.runTransaction(async (transaction) => {
    const [storedOperation, post, user, xpEvent] = await Promise.all([
      transaction.get(storedOperationRef),
      transaction.get(postRef),
      transaction.get(xpRefs.userRef),
      transaction.get(xpRefs.eventRef),
    ]);

    if (storedOperation.exists) {
      matchStoredOperation(storedOperation.data(), operation);
      requireStoredResult(storedOperation, 'postId', operation.key, post);
      if (!xpEvent.exists) {
        throw new HttpsError('data-loss', 'Falta el evento XP de la operación.');
      }
      return { postId: operation.key, created: false };
    }
    if (post.exists || xpEvent.exists) {
      throw new HttpsError(
        'already-exists',
        'El resultado de la operación ya existe sin su registro.',
      );
    }

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
      imageURL: payload.imageURL,
      tags: payload.tags,
      likes: [],
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(storedOperationRef, {
      ...operation,
      postId: operation.key,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { postId: operation.key, created: true };
  });
}

async function createTransferV2Handler(request, firestore = db) {
  const payload = normalizeTransferData(request?.data);
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

  return firestore.runTransaction(async (transaction) => {
    const [storedOperation, transfer, league, season] = await Promise.all([
      transaction.get(storedOperationRef),
      transaction.get(transferRef),
      transaction.get(leagueRef),
      transaction.get(seasonRef),
    ]);

    if (storedOperation.exists) {
      matchStoredOperation(storedOperation.data(), operation);
      requireStoredResult(
        storedOperation,
        'transferId',
        operation.key,
        transfer,
      );
      return { transferId: operation.key, created: false };
    }
    if (transfer.exists) {
      throw new HttpsError(
        'already-exists',
        'El fichaje ya existe sin su registro de operación.',
      );
    }
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
    const buyerName = memberTeamName(context.season, payload.buyerId);
    const sellerName = memberTeamName(context.season, payload.sellerId);
    const buyer = payload.buyerId === 'market'
      ? null
      : context.season.members[payload.buyerId];
    const earnsXp = buyer && buyer.isPlaceholder !== true;
    let xpRefs;
    let xpSnapshots;
    if (earnsXp) {
      xpRefs = xpAwardRefs(firestore, {
        userId: payload.buyerId,
        eventId: `transfer:${operation.key}`,
        amount: XP_VALUES.TRANSFER,
        source: 'transfer',
      });
      xpSnapshots = await Promise.all([
        transaction.get(xpRefs.userRef),
        transaction.get(xpRefs.eventRef),
      ]);
      if (xpSnapshots[1].exists) {
        throw new HttpsError(
          'already-exists',
          'El evento XP ya existe sin su operación.',
        );
      }
    }

    if (earnsXp) {
      applyXpAward(
        transaction,
        { user: xpSnapshots[0], event: xpSnapshots[1] },
        xpRefs,
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
      timestamp: Timestamp.fromDate(new Date(payload.timestamp)),
    });
    transaction.create(storedOperationRef, {
      ...operation,
      transferId: operation.key,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { transferId: operation.key, created: true };
  });
}

module.exports = {
  createPostV2Handler,
  createTransferV2Handler,
};
