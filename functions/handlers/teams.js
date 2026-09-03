const { HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { db, FieldValue } = require('../lib/firebase');
const {
  requireDocumentId,
  requireSeasonAdmin,
} = require('../lib/league-authz');

const MAX_TRANSACTION_WRITES = 450;

function addTransferUpdates(updates, snapshot, fields) {
  snapshot.forEach((item) => {
    const current = updates.get(item.ref.path) || { ref: item.ref, data: {} };
    Object.assign(current.data, fields);
    updates.set(item.ref.path, current);
  });
}

async function unlinkUserFromTeamHandler(request, options = {}) {
  const firestore = options.firestore || db;
  const leagueId = requireDocumentId(request.data?.leagueId, 'leagueId');
  const seasonId = requireDocumentId(request.data?.seasonId, 'seasonId');
  const userIdToUnlink = requireDocumentId(
    request.data?.userIdToUnlink,
    'userIdToUnlink',
  );
  const leagueRef = firestore.doc('leagues/' + leagueId);
  const seasonRef = leagueRef.collection('seasons').doc(seasonId);
  const userAchievementRef = firestore.doc(
    `users/${userIdToUnlink}/achievements/${seasonId}`,
  );
  const placeholderId = 'placeholder_' + userIdToUnlink;
  const placeholderAchievementRef = seasonRef
    .collection('achievements')
    .doc(placeholderId);
  const transfersRef = seasonRef.collection('transfers');
  const roundsRef = seasonRef.collection('rounds');
  const lineupsRef = seasonRef.collection('lineups');

  const result = await firestore.runTransaction(async (transaction) => {
    const [
      league,
      season,
      userAchievement,
      buyerTransfers,
      sellerTransfers,
      rounds,
      lineups,
    ] = await Promise.all([
      transaction.get(leagueRef),
      transaction.get(seasonRef),
      transaction.get(userAchievementRef),
      transaction.get(transfersRef.where('buyerId', '==', userIdToUnlink)),
      transaction.get(transfersRef.where('sellerId', '==', userIdToUnlink)),
      transaction.get(roundsRef),
      transaction.get(lineupsRef),
    ]);

    if (!league.exists) {
      throw new HttpsError('not-found', 'La liga no existe.');
    }
    if (!season.exists) {
      throw new HttpsError('not-found', 'La temporada no existe.');
    }
    const context = {
      league: league.data(),
      leagueId,
      leagueRef,
      season: season.data(),
      seasonId,
      seasonRef,
    };
    const adminUid = requireSeasonAdmin(request, context);
    if (userIdToUnlink === context.league.ownerId) {
      throw new HttpsError(
        'permission-denied',
        'No se puede desvincular al propietario de la liga.',
      );
    }

    const userToUnlink = context.season.members?.[userIdToUnlink];
    if (!userToUnlink) {
      throw new HttpsError(
        'not-found',
        'El usuario no pertenece a esta temporada.',
      );
    }
    if (userToUnlink.isPlaceholder) {
      throw new HttpsError(
        'failed-precondition',
        'El equipo seleccionado ya es un equipo fantasma.',
      );
    }
    if (context.season.members?.[placeholderId]) {
      throw new HttpsError(
        'already-exists',
        'Ya existe el equipo fantasma de este usuario.',
      );
    }

    if (options.afterReads) {
      await options.afterReads({ adminUid, context, userIdToUnlink });
    }

    const teamName = userToUnlink.teamName;
    const placeholder = {
      finances: userToUnlink.finances || { budget: 0, teamValue: 0 },
      isPlaceholder: true,
      players: userToUnlink.players || [],
      role: 'member',
      teamName,
      totalPoints: userToUnlink.totalPoints || 0,
    };
    const transferUpdates = new Map();
    addTransferUpdates(transferUpdates, buyerTransfers, {
      buyerId: placeholderId,
      buyerName: teamName,
    });
    addTransferUpdates(transferUpdates, sellerTransfers, {
      sellerId: placeholderId,
      sellerName: teamName,
    });
    const roundUpdates = rounds.docs.filter((item) =>
      item.data().scores?.[userIdToUnlink] !== undefined);
    const lineupUpdates = lineups.docs.filter((item) =>
      item.id.endsWith('-' + userIdToUnlink));
    const writeCount =
      1 +
      (userAchievement.exists ? 2 : 0) +
      transferUpdates.size +
      roundUpdates.length +
      (lineupUpdates.length * 2);
    if (writeCount > MAX_TRANSACTION_WRITES) {
      throw new HttpsError(
        'resource-exhausted',
        'La temporada es demasiado grande para desvincularla de forma atómica.',
      );
    }

    if (userAchievement.exists) {
      transaction.set(placeholderAchievementRef, userAchievement.data());
      transaction.delete(userAchievementRef);
    }
    for (const { ref, data } of transferUpdates.values()) {
      transaction.update(ref, data);
    }
    for (const item of roundUpdates) {
      transaction.update(item.ref, {
        [`scores.${placeholderId}`]: item.data().scores[userIdToUnlink],
        [`scores.${userIdToUnlink}`]: FieldValue.delete(),
      });
    }
    for (const item of lineupUpdates) {
      const roundId = item.id.slice(0, -(userIdToUnlink.length + 1));
      transaction.set(
        lineupsRef.doc(roundId + '-' + placeholderId),
        item.data(),
      );
      transaction.delete(item.ref);
    }
    transaction.update(seasonRef, {
      [`members.${placeholderId}`]: placeholder,
      [`members.${userIdToUnlink}`]: FieldValue.delete(),
    });

    return { adminUid, placeholderId };
  });

  logger.info('League member unlinked', {
    adminUid: result.adminUid,
    leagueId,
    placeholderId: result.placeholderId,
    seasonId,
    userIdToUnlink,
  });
  return {
    success: true,
    message: 'Usuario desvinculado y convertido en equipo fantasma.',
  };
}

module.exports = { unlinkUserFromTeamHandler };
