const {
  onCall,
  onRequest,
} = require('firebase-functions/v2/https');
const { requireAuth } = require('./lib/authz');
const {
  createProfileDocumentsHandler,
} = require('./handlers/profile');
const { setUserAppRoleHandler } = require('./handlers/roles');
const { unlinkUserFromTeamHandler } = require('./handlers/teams');
const { recalculateXpHandler } = require('./handlers/xp');
const {
  createPostV2Handler,
  createTransferV2Handler,
} = require('./handlers/content');
const {
  joinSeasonByInviteCodeHandler,
  reviewJoinRequestHandler,
  submitJoinRequestHandler,
} = require('./handlers/membership');
const {
  deleteSeasonChallengeHandler,
  refreshCareerAchievementsHandler,
  replaceSeasonTrophiesHandler,
  saveSeasonChallengeHandler,
  setChallengeWinnersHandler,
} = require('./handlers/season-awards');
const { createOrGetChatHandler } = require('./handlers/chat');

const browserOrigins = [
  'https://fantasya-app.vercel.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];
const isDemoEmulator = process.env.FUNCTIONS_EMULATOR === 'true'
  && process.env.GCLOUD_PROJECT === 'demo-fantasya';

function localFootballApiKeyForRequest(request) {
  const explicitLiveRequest = request.data?.source === 'live';
  const localLiveEnabled = process.env.ALLOW_LIVE_FOOTBALL_API === 'true';
  return explicitLiveRequest && localLiveEnabled
    ? process.env.FOOTBALL_DATA_API_KEY
    : undefined;
}

exports.createProfileDocuments = onCall(
  { region: 'us-central1', cors: browserOrigins },
  createProfileDocumentsHandler,
);

exports.createProfileDocumentsV2 = onCall(
  { region: 'us-central1', cors: browserOrigins },
  createProfileDocumentsHandler,
);

exports.unlinkUserFromTeam = onCall(
  { region: 'us-central1', cors: browserOrigins },
  unlinkUserFromTeamHandler,
);

exports.unlinkUserFromTeamV2 = onCall(
  { region: 'us-central1', cors: browserOrigins },
  unlinkUserFromTeamHandler,
);

exports.setUserAppRole = onCall(
  { region: 'us-central1', cors: browserOrigins },
  setUserAppRoleHandler,
);

exports.joinSeasonByInviteCode = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => joinSeasonByInviteCodeHandler({
    uid: requireAuth(request),
    data: request.data,
  }),
);

exports.submitJoinRequest = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => submitJoinRequestHandler({
    uid: requireAuth(request),
    data: request.data,
  }),
);

exports.reviewJoinRequest = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => reviewJoinRequestHandler({
    uid: requireAuth(request),
    data: request.data,
  }),
);

exports.replaceSeasonTrophies = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => replaceSeasonTrophiesHandler({
    uid: requireAuth(request),
    data: request.data,
  }),
);

exports.saveSeasonChallenge = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => saveSeasonChallengeHandler({
    uid: requireAuth(request),
    data: request.data,
  }),
);

exports.deleteSeasonChallenge = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => deleteSeasonChallengeHandler({
    uid: requireAuth(request),
    data: request.data,
  }),
);

exports.setChallengeWinners = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => setChallengeWinnersHandler({
    uid: requireAuth(request),
    data: request.data,
  }),
);

exports.refreshCareerAchievements = onCall(
  { region: 'us-central1', timeoutSeconds: 120, cors: browserOrigins },
  (request) => refreshCareerAchievementsHandler({
    uid: requireAuth(request),
    data: request.data,
  }),
);

exports.createPostV2 = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => createPostV2Handler({
    uid: requireAuth(request),
    data: request.data,
  }),
);

exports.createTransferV2 = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => createTransferV2Handler({
    uid: requireAuth(request),
    data: request.data,
  }),
);

exports.recalculateXp = onCall(
  { region: 'us-central1', timeoutSeconds: 540, cors: browserOrigins },
  recalculateXpHandler,
);

exports.createOrGetChat = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => createOrGetChatHandler({
    uid: requireAuth(request),
    data: request.data,
  }),
);

exports.createOrGetChatV2 = onCall(
  { region: 'us-central1', cors: browserOrigins },
  (request) => createOrGetChatHandler({
    uid: requireAuth(request),
    data: request.data,
  }),
);

if (isDemoEmulator) {
  const {
    getLaLigaSyncStatusLegacyHandler,
    getLaLigaSyncStatusV2Handler,
    syncLaLigaPlayersLegacyHandler,
    syncLaLigaPlayersV2Handler,
  } = require('./handlers/player-sync');

  exports.syncLaLigaPlayersV2 = onCall(
    {
      region: 'us-central1',
      timeoutSeconds: 540,
      memory: '1GiB',
      cors: browserOrigins,
    },
    (request) => syncLaLigaPlayersV2Handler(
      request,
      localFootballApiKeyForRequest(request),
    ),
  );

  exports.getLaLigaSyncStatusV2 = onCall(
    { region: 'us-central1', cors: browserOrigins },
    getLaLigaSyncStatusV2Handler,
  );

  exports.syncLaLigaPlayers = onRequest(
    {
      region: 'us-central1',
      cors: browserOrigins,
      timeoutSeconds: 540,
      memory: '1GiB',
    },
    (request, response) => syncLaLigaPlayersLegacyHandler(
      request,
      response,
      localFootballApiKeyForRequest({ data: request.body || {} }),
    ),
  );

  exports.getLaLigaSyncStatus = onRequest(
    { region: 'us-central1', cors: browserOrigins },
    getLaLigaSyncStatusLegacyHandler,
  );
}
