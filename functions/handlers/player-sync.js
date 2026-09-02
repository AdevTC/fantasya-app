const { HttpsError } = require('firebase-functions/v2/https');
const { auth, db } = require('../lib/firebase');
const { requireAuth, requireSuperAdmin } = require('../lib/authz');
const { syncPlayers } = require('../lib/player-sync');

const LOCAL_PLACEHOLDER_KEY = 'local-fixture-value-not-used';

function hasLiveApiKey(apiKey) {
  return Boolean(apiKey && apiKey !== LOCAL_PLACEHOLDER_KEY);
}

function resolvePlayerSyncSource(request, apiKey, env = process.env) {
  if (env.FUNCTIONS_EMULATOR !== 'true') return 'live';
  const requestAllowsLive = request.data?.source === 'live';
  const environmentAllowsLive = env.ALLOW_LIVE_FOOTBALL_API === 'true';
  return requestAllowsLive && environmentAllowsLive && hasLiveApiKey(apiKey)
    ? 'live'
    : 'fixture';
}

function withCompletionMessage(result) {
  return {
    ...result,
    message:
      'Sincronización completada: ' + result.playersSynced +
      ' jugadores actualizados.',
  };
}

async function syncLaLigaPlayersV2Handler(request, apiKey, options = {}) {
  const uid = await requireSuperAdmin(request);
  const env = options.env || process.env;
  const source = resolvePlayerSyncSource(request, apiKey, env);
  if (source === 'live' && !hasLiveApiKey(apiKey)) {
    throw new HttpsError('failed-precondition', 'Falta la API key de fútbol.');
  }
  const syncImpl = options.syncImpl || syncPlayers;
  const result = await syncImpl({ requestedBy: uid, source, apiKey });
  return withCompletionMessage(result);
}

async function getLaLigaSyncStatusV2Handler(request) {
  requireAuth(request);
  const snapshot = await db.doc('config/laLigaSync').get();
  if (!snapshot.exists) {
    return {
      status: 'never_synced',
      lastSync: null,
      playersCount: 0,
      activeRunId: null,
    };
  }
  const data = snapshot.data();
  return {
    status: data.status || 'unknown',
    lastSync: data.lastSync || data.startedAt || null,
    playersCount: data.playersCount || 0,
    lastError: data.lastError || null,
    source: data.source || null,
    activeRunId: data.activeRunId || null,
  };
}

function tokenFromRequest(request) {
  const authorization = String(request.headers?.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  return match[1];
}

async function callableRequestFromHttp(request, verifyIdToken) {
  const token = tokenFromRequest(request);
  try {
    const decoded = await verifyIdToken(token);
    if (!decoded?.uid) throw new Error('Token without uid.');
    return { auth: { uid: decoded.uid }, data: request.body || {} };
  } catch {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
}

const HTTP_STATUS = Object.freeze({
  unauthenticated: 401,
  'permission-denied': 403,
  'already-exists': 409,
  aborted: 409,
  'failed-precondition': 412,
  'invalid-argument': 400,
});

function sendHttpError(response, error, fallback) {
  const status = HTTP_STATUS[error.code] || 500;
  const message = status === 500
    ? fallback + ': ' + (error.message || 'Error interno.')
    : error.message;
  response.status(status).json({ error: message });
}

async function syncLaLigaPlayersLegacyHandler(
  request,
  response,
  apiKey,
  options = {},
) {
  if (request.method !== 'POST') {
    response.status(405).send('Method not allowed');
    return;
  }
  const verifyIdToken = options.verifyIdToken ||
    ((token) => auth.verifyIdToken(token));
  try {
    const callableRequest = await callableRequestFromHttp(
      request,
      verifyIdToken,
    );
    const result = await syncLaLigaPlayersV2Handler(
      callableRequest,
      apiKey,
      options,
    );
    response.json(result);
  } catch (error) {
    sendHttpError(response, error, 'Error al sincronizar jugadores');
  }
}

async function getLaLigaSyncStatusLegacyHandler(
  request,
  response,
  options = {},
) {
  if (request.method !== 'POST') {
    response.status(405).send('Method not allowed');
    return;
  }
  const verifyIdToken = options.verifyIdToken ||
    ((token) => auth.verifyIdToken(token));
  try {
    const callableRequest = await callableRequestFromHttp(
      request,
      verifyIdToken,
    );
    response.json(await getLaLigaSyncStatusV2Handler(callableRequest));
  } catch (error) {
    sendHttpError(
      response,
      error,
      'Error al obtener el estado de sincronización',
    );
  }
}

module.exports = {
  getLaLigaSyncStatusLegacyHandler,
  getLaLigaSyncStatusV2Handler,
  resolvePlayerSyncSource,
  syncLaLigaPlayersLegacyHandler,
  syncLaLigaPlayersV2Handler,
};
