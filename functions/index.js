const {
  onDocumentCreated,
  onDocumentUpdated,
} = require('firebase-functions/v2/firestore');
const {
  HttpsError,
  onCall,
  onRequest,
} = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { db, FieldValue } = require('./lib/firebase');
const {
  createProfileDocumentsHandler,
} = require('./handlers/profile');
const { setUserAppRoleHandler } = require('./handlers/roles');
const { unlinkUserFromTeamHandler } = require('./handlers/teams');
const {
  onPostCreatedAwardXpHandler,
  onTransferCreatedAwardXpHandler,
  recalculateXpHandler,
} = require('./handlers/xp');
const {
  getLaLigaSyncStatusLegacyHandler,
  getLaLigaSyncStatusV2Handler,
  syncLaLigaPlayersLegacyHandler,
  syncLaLigaPlayersV2Handler,
} = require('./handlers/player-sync');

const browserOrigins = [
  'https://fantasya-app.vercel.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];
const footballDataApiKey = defineSecret('FOOTBALL_DATA_API_KEY');

function footballApiKeyForRequest(request) {
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
  const explicitLiveRequest = request.data?.source === 'live';
  const localLiveEnabled = process.env.ALLOW_LIVE_FOOTBALL_API === 'true';
  if (isEmulator && (!explicitLiveRequest || !localLiveEnabled)) {
    return undefined;
  }
  return footballDataApiKey.value();
}

exports.createProfileDocuments = onCall(
  { region: 'us-central1', cors: browserOrigins },
  createProfileDocumentsHandler,
);

exports.onSeasonJoin = onDocumentUpdated(
  'leagues/{leagueId}/seasons/{seasonId}',
  async (event) => {
    const afterData = event.data.after.data();
    const beforeData = event.data.before.data();
    const { leagueId, seasonId } = event.params;
    const seasonRef = db.doc(`leagues/${leagueId}/seasons/${seasonId}`);
    for (const userId in afterData.members) {
      if (
        !beforeData.members[userId] &&
        afterData.members[userId].claimedPlaceholderId
      ) {
        const memberAfter = afterData.members[userId];
        const placeholderId = memberAfter.claimedPlaceholderId;
        if (
          !beforeData.members[placeholderId] ||
          !beforeData.members[placeholderId].isPlaceholder
        ) {
          logger.error(
            `Migration FAILED for user ${userId}: Placeholder ` +
              `${placeholderId} does not exist or is not a placeholder.`,
          );
          await seasonRef.update({
            [`members.${userId}.claimedPlaceholderId`]: FieldValue.delete(),
          });
          return;
        }
        logger.info(
          `MIGRATION START: User ${userId} claiming placeholder ` +
            `${placeholderId}.`,
        );
        const batch = db.batch();
        const newUserTeamName = memberAfter.teamName;
        if (!newUserTeamName) {
          logger.error(`Migration FAILED for ${userId}: New team name is missing.`);
          return;
        }
        const placeholderAchievementRef = seasonRef
          .collection('achievements')
          .doc(placeholderId);
        const userAchievementRef = db.doc(
          `users/${userId}/achievements/${seasonId}`,
        );
        const placeholderAchievementDoc = await placeholderAchievementRef.get();
        if (placeholderAchievementDoc.exists) {
          batch.set(userAchievementRef, placeholderAchievementDoc.data());
          batch.delete(placeholderAchievementRef);
        }
        const transfersRef = seasonRef.collection('transfers');
        const buyerQuery = transfersRef.where('buyerId', '==', placeholderId);
        const sellerQuery = transfersRef.where('sellerId', '==', placeholderId);
        const [buyerSnapshot, sellerSnapshot] = await Promise.all([
          buyerQuery.get(),
          sellerQuery.get(),
        ]);
        buyerSnapshot.forEach((snapshot) => batch.update(snapshot.ref, {
          buyerId: userId,
          buyerName: newUserTeamName,
        }));
        sellerSnapshot.forEach((snapshot) => batch.update(snapshot.ref, {
          sellerId: userId,
          sellerName: newUserTeamName,
        }));
        const roundsSnapshot = await seasonRef.collection('rounds').get();
        roundsSnapshot.forEach((roundDoc) => {
          const roundData = roundDoc.data();
          if (
            roundData.scores &&
            roundData.scores[placeholderId] !== undefined
          ) {
            batch.update(roundDoc.ref, {
              [`scores.${userId}`]: roundData.scores[placeholderId],
              [`scores.${placeholderId}`]: FieldValue.delete(),
            });
          }
        });
        const allLineupsSnapshot = await seasonRef.collection('lineups').get();
        allLineupsSnapshot.forEach((lineupDoc) => {
          if (lineupDoc.id.endsWith(`-${placeholderId}`)) {
            const roundId = lineupDoc.id.substring(
              0,
              lineupDoc.id.lastIndexOf('-'),
            );
            const newLineupRef = seasonRef
              .collection('lineups')
              .doc(`${roundId}-${userId}`);
            batch.set(newLineupRef, lineupDoc.data());
            batch.delete(lineupDoc.ref);
          }
        });
        batch.update(seasonRef, {
          [`members.${placeholderId}`]: FieldValue.delete(),
          [`members.${userId}.claimedPlaceholderId`]: FieldValue.delete(),
        });
        await batch.commit();
        logger.info(`MIGRATION SUCCESS for user ${userId}.`);
        return;
      }
    }
  },
);

exports.unlinkUserFromTeam = onCall(
  { region: 'us-central1', cors: browserOrigins },
  unlinkUserFromTeamHandler,
);

exports.setUserAppRole = onCall(
  { region: 'us-central1', cors: browserOrigins },
  setUserAppRoleHandler,
);

exports.onPostCreatedAwardXp = onDocumentCreated(
  { document: 'posts/{postId}', region: 'us-central1' },
  onPostCreatedAwardXpHandler,
);

exports.onTransferCreatedAwardXp = onDocumentCreated(
  {
    document:
      'leagues/{leagueId}/seasons/{seasonId}/transfers/{transferId}',
    region: 'us-central1',
  },
  onTransferCreatedAwardXpHandler,
);

exports.recalculateXp = onCall(
  { region: 'us-central1', timeoutSeconds: 540, cors: browserOrigins },
  recalculateXpHandler,
);

exports.createOrGetChat = onCall(
  { region: 'us-central1', cors: browserOrigins },
  async (request) => {
    const authUserUid = request.auth?.uid;
    const { otherUserUid } = request.data;
    if (!authUserUid) {
      throw new HttpsError(
        'unauthenticated',
        'Debes estar autenticado para iniciar un chat.',
      );
    }
    if (!otherUserUid) {
      throw new HttpsError('invalid-argument', 'Falta el ID del otro usuario.');
    }
    if (authUserUid === otherUserUid) {
      throw new HttpsError(
        'invalid-argument',
        'No puedes crear un chat contigo mismo.',
      );
    }
    const participants = [authUserUid, otherUserUid].sort();
    const chatId = participants.join('_');
    const chatRef = db.doc(`chats/${chatId}`);
    try {
      const chatDoc = await chatRef.get();
      if (!chatDoc.exists) {
        logger.info(
          `Creating new chat (${chatId}) between ` +
            `${authUserUid} and ${otherUserUid}`,
        );
        await chatRef.set({
          participants,
          createdAt: FieldValue.serverTimestamp(),
          lastMessage: '',
        });
      }
      return { chatId };
    } catch (error) {
      logger.error(
        `Failed to create/get chat for users ${authUserUid} and ` +
          `${otherUserUid}`,
        error,
      );
      throw new HttpsError(
        'internal',
        'Ocurrió un error inesperado al iniciar el chat.',
      );
    }
  },
);

exports.syncLaLigaPlayersV2 = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '1GiB',
    cors: browserOrigins,
    secrets: [footballDataApiKey],
  },
  (request) => syncLaLigaPlayersV2Handler(
    request,
    footballApiKeyForRequest(request),
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
    secrets: [footballDataApiKey],
  },
  (request, response) => syncLaLigaPlayersLegacyHandler(
    request,
    response,
    footballApiKeyForRequest({ data: request.body || {} }),
  ),
);

exports.getLaLigaSyncStatus = onRequest(
  { region: 'us-central1', cors: browserOrigins },
  getLaLigaSyncStatusLegacyHandler,
);
