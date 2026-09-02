const { HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { db, FieldValue } = require('../lib/firebase');
const {
  getSeasonContext,
  requireDocumentId,
  requireSeasonAdmin,
} = require('../lib/league-authz');

async function unlinkUserFromTeamHandler(request) {
  const context = await getSeasonContext(request.data);
  const adminUid = requireSeasonAdmin(request, context);
  const userIdToUnlink = requireDocumentId(
    request.data?.userIdToUnlink,
    'userIdToUnlink',
  );

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

  const placeholderId = 'placeholder_' + userIdToUnlink;
  const userAchievementRef = db.doc(
    `users/${userIdToUnlink}/achievements/${context.seasonId}`,
  );
  const placeholderAchievementRef = context.seasonRef
    .collection('achievements')
    .doc(placeholderId);
  const transfersRef = context.seasonRef.collection('transfers');
  const roundsRef = context.seasonRef.collection('rounds');
  const lineupsRef = context.seasonRef.collection('lineups');
  const [
    userAchievement,
    buyerTransfers,
    sellerTransfers,
    rounds,
    lineups,
  ] = await Promise.all([
    userAchievementRef.get(),
    transfersRef.where('buyerId', '==', userIdToUnlink).get(),
    transfersRef.where('sellerId', '==', userIdToUnlink).get(),
    roundsRef.get(),
    lineupsRef.get(),
  ]);

  const teamName = userToUnlink.teamName;
  const placeholder = {
    finances: userToUnlink.finances || { budget: 0, teamValue: 0 },
    isPlaceholder: true,
    players: userToUnlink.players || [],
    role: 'member',
    teamName,
    totalPoints: userToUnlink.totalPoints || 0,
  };
  const batch = db.batch();

  if (userAchievement.exists) {
    batch.set(placeholderAchievementRef, userAchievement.data());
    batch.delete(userAchievementRef);
  }
  buyerTransfers.forEach((item) => batch.update(item.ref, {
    buyerId: placeholderId,
    buyerName: teamName,
  }));
  sellerTransfers.forEach((item) => batch.update(item.ref, {
    sellerId: placeholderId,
    sellerName: teamName,
  }));
  rounds.forEach((item) => {
    const scores = item.data().scores;
    if (scores?.[userIdToUnlink] !== undefined) {
      batch.update(item.ref, {
        [`scores.${placeholderId}`]: scores[userIdToUnlink],
        [`scores.${userIdToUnlink}`]: FieldValue.delete(),
      });
    }
  });
  lineups.forEach((item) => {
    if (!item.id.endsWith('-' + userIdToUnlink)) return;
    const roundId = item.id.slice(0, -(userIdToUnlink.length + 1));
    batch.set(lineupsRef.doc(roundId + '-' + placeholderId), item.data());
    batch.delete(item.ref);
  });
  batch.update(context.seasonRef, {
    [`members.${placeholderId}`]: placeholder,
    [`members.${userIdToUnlink}`]: FieldValue.delete(),
  });

  await batch.commit();
  logger.info('League member unlinked', {
    adminUid,
    leagueId: context.leagueId,
    placeholderId,
    seasonId: context.seasonId,
    userIdToUnlink,
  });

  return {
    success: true,
    message: 'Usuario desvinculado y convertido en equipo fantasma.',
  };
}

module.exports = { unlinkUserFromTeamHandler };
