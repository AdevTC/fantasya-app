const { HttpsError } = require('firebase-functions/v2/https');
const { Timestamp } = require('firebase-admin/firestore');
const { db } = require('../lib/firebase');
const {
  requireDocumentId,
  requireSeasonAdmin,
} = require('../lib/league-authz');

const MAX_AWARDS = 100;
const MAX_TROPHIES_PER_USER = 50;
const MAX_WINNERS = 100;
const MAX_CHALLENGE_TITLE = 120;
const MAX_CHALLENGE_DESCRIPTION = 1000;
const MAX_ATOMIC_WRITES = 450;
const MAX_CAREER_SEASONS = 200;

function requireBoundedArray(value, maximum, message) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new HttpsError('invalid-argument', message);
  }
  return value;
}

function cleanText(value, maximum, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maximum) {
    throw new HttpsError(
      'invalid-argument',
      `${label} no es válido.`,
    );
  }
  return text;
}

function assertWriteLimit(writeCount) {
  if (writeCount > MAX_ATOMIC_WRITES) {
    throw new HttpsError(
      'resource-exhausted',
      'La operación es demasiado grande para completarla de forma atómica.',
    );
  }
}

function refsForSeason(firestore, data) {
  const leagueId = requireDocumentId(data?.leagueId, 'leagueId');
  const seasonId = requireDocumentId(data?.seasonId, 'seasonId');
  const leagueRef = firestore.doc('leagues/' + leagueId);
  return {
    leagueId,
    leagueRef,
    seasonId,
    seasonRef: leagueRef.collection('seasons').doc(seasonId),
  };
}

async function readContext(transaction, refs) {
  const [leagueSnapshot, seasonSnapshot] = await Promise.all([
    transaction.get(refs.leagueRef),
    transaction.get(refs.seasonRef),
  ]);
  if (!leagueSnapshot.exists) {
    throw new HttpsError('not-found', 'La liga no existe.');
  }
  if (!seasonSnapshot.exists) {
    throw new HttpsError('not-found', 'La temporada no existe.');
  }
  return {
    ...refs,
    league: leagueSnapshot.data(),
    season: seasonSnapshot.data(),
  };
}

function validateTrophies(value) {
  return requireBoundedArray(
    value,
    MAX_TROPHIES_PER_USER,
    'La lista de trofeos no es válida.',
  ).map((trophy) => {
    if (!trophy || typeof trophy !== 'object' || Array.isArray(trophy)) {
      throw new HttpsError(
        'invalid-argument',
        'Un trofeo no es válido.',
      );
    }
    requireDocumentId(trophy.trophyId, 'trophyId');
    return { ...trophy };
  });
}

function validateAwards(value, context) {
  const awards = requireBoundedArray(
    value,
    MAX_AWARDS,
    'El lote de trofeos no es válido.',
  );
  const seen = new Set();
  return awards.map((award) => {
    const userId = requireDocumentId(award?.userId, 'userId');
    const member = context.season.members?.[userId];
    const data = award?.data;
    if (!member || seen.has(userId) || !data || typeof data !== 'object') {
      throw new HttpsError(
        'invalid-argument',
        'Un destinatario de trofeos no es válido.',
      );
    }
    if (
      data.seasonName !== context.season.name
      || data.leagueName !== context.league.name
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Los nombres del premio no coinciden con la liga y temporada.',
      );
    }
    seen.add(userId);
    const isPlaceholder = member.isPlaceholder === true;
    return {
      data: {
        seasonName: context.season.name,
        leagueName: context.league.name,
        trophies: validateTrophies(data.trophies),
        isPlaceholder,
        teamName: cleanText(member.teamName, 120, 'El equipo'),
      },
      isPlaceholder,
      userId,
    };
  });
}

async function replaceSeasonTrophiesHandler(request, firestore = db) {
  const uid = requireDocumentId(request?.uid, 'uid');
  const refs = refsForSeason(firestore, request?.data);
  requireBoundedArray(
    request?.data?.awards,
    MAX_AWARDS,
    'El lote de trofeos no es válido.',
  );

  return firestore.runTransaction(async (transaction) => {
    const context = await readContext(transaction, refs);
    requireSeasonAdmin(uid, context);
    const awards = validateAwards(request.data.awards, context);
    const existingSnapshot = await transaction.get(
      refs.seasonRef.collection('achievements'),
    );
    const realAwards = awards.filter((award) => !award.isPlaceholder);
    const profileSnapshots = await Promise.all(realAwards.map((award) =>
      transaction.get(firestore.doc('users/' + award.userId))));
    if (profileSnapshots.some((snapshot) => !snapshot.exists)) {
      throw new HttpsError(
        'invalid-argument',
        'Un destinatario real no tiene perfil.',
      );
    }

    const desiredIds = new Set(awards.map((award) => award.userId));
    const existingById = new Map(
      existingSnapshot.docs.map((snapshot) => [snapshot.id, snapshot]),
    );
    let writeCount = 0;

    awards.forEach((award) => {
      writeCount += award.isPlaceholder ? 1 : 2;
      const previous = existingById.get(award.userId)?.data();
      if (award.isPlaceholder && previous?.isPlaceholder === false) {
        writeCount += 1;
      }
    });
    existingSnapshot.docs.forEach((snapshot) => {
      if (!desiredIds.has(snapshot.id)) {
        writeCount += snapshot.data().isPlaceholder === true ? 1 : 2;
      }
    });
    assertWriteLimit(writeCount);

    awards.forEach((award) => {
      transaction.set(
        refs.seasonRef.collection('achievements').doc(award.userId),
        award.data,
      );
      if (award.isPlaceholder) {
        if (existingById.get(award.userId)?.data().isPlaceholder === false) {
          transaction.delete(firestore.doc(
            `users/${award.userId}/achievements/${refs.seasonId}`,
          ));
        }
      } else {
        transaction.set(firestore.doc(
          `users/${award.userId}/achievements/${refs.seasonId}`,
        ), award.data);
      }
    });
    existingSnapshot.docs.forEach((snapshot) => {
      if (desiredIds.has(snapshot.id)) return;
      transaction.delete(snapshot.ref);
      if (snapshot.data().isPlaceholder !== true) {
        transaction.delete(firestore.doc(
          `users/${snapshot.id}/achievements/${refs.seasonId}`,
        ));
      }
    });

    return {
      awardsWritten: awards.length,
      staleAwardsDeleted: existingSnapshot.docs.filter(
        (snapshot) => !desiredIds.has(snapshot.id),
      ).length,
    };
  });
}

function validateChallenge(value, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'El reto no es válido.');
  }
  const targetType = value.targetType;
  if (!['all', 'selection', 'single'].includes(targetType)) {
    throw new HttpsError(
      'invalid-argument',
      'El tipo de destinatario no es válido.',
    );
  }
  const targetUsers = requireBoundedArray(
    value.targetUsers,
    MAX_WINNERS,
    'La selección de participantes no es válida.',
  ).map((userId) => requireDocumentId(userId, 'targetUserId'));
  if (new Set(targetUsers).size !== targetUsers.length) {
    throw new HttpsError(
      'invalid-argument',
      'La selección de participantes contiene duplicados.',
    );
  }
  if (
    (targetType === 'all' && targetUsers.length !== 0)
    || (targetType === 'single' && targetUsers.length !== 1)
    || (targetType === 'selection' && targetUsers.length < 2)
    || targetUsers.some((userId) => !context.season.members?.[userId])
  ) {
    throw new HttpsError(
      'invalid-argument',
      'La selección de participantes no es válida.',
    );
  }
  return {
    description: cleanText(
      value.description,
      MAX_CHALLENGE_DESCRIPTION,
      'La descripción',
    ),
    targetType,
    targetUsers,
    title: cleanText(value.title, MAX_CHALLENGE_TITLE, 'El título'),
  };
}

function currentFeatInstance(instance, context) {
  if (!instance || typeof instance !== 'object') return false;
  if (
    instance.leagueId === context.leagueId
    && instance.seasonId === context.seasonId
  ) {
    return true;
  }
  return !instance.leagueId
    && !instance.seasonId
    && instance.leagueName === context.league.name
    && instance.seasonName === context.season.name;
}

function canonicalFeatInstance(context, challenge, previous) {
  return {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    leagueName: context.league.name,
    seasonName: context.season.name,
    challengeTitle: challenge.title,
    description: challenge.description,
    date: previous?.date || Timestamp.now(),
  };
}

function realWinnerIds(winners, context) {
  return [...new Set((winners || [])
    .map((winner) => winner?.uid)
    .filter((userId) =>
      typeof userId === 'string'
      && context.season.members?.[userId]
      && context.season.members[userId].isPlaceholder !== true))];
}

function updatedFeatInstances(snapshot, context, challenge, shouldWin) {
  const existing = snapshot.exists && Array.isArray(snapshot.data().instances)
    ? snapshot.data().instances
    : [];
  const previous = existing.find((instance) =>
    currentFeatInstance(instance, context));
  const retained = existing.filter((instance) =>
    !currentFeatInstance(instance, context));
  if (shouldWin) {
    retained.push(canonicalFeatInstance(context, challenge, previous));
  }
  return retained;
}

function writeFeatInstances(transaction, snapshot, instances) {
  if (instances.length === 0) {
    if (snapshot.exists) transaction.delete(snapshot.ref);
    return;
  }
  transaction.set(snapshot.ref, { instances });
}

async function saveSeasonChallengeHandler(request, firestore = db) {
  const uid = requireDocumentId(request?.uid, 'uid');
  const refs = refsForSeason(firestore, request?.data);
  const suppliedId = request?.data?.challengeId;
  const isEdit = suppliedId != null;
  const challengeId = isEdit
    ? requireDocumentId(suppliedId, 'challengeId')
    : refs.seasonRef.collection('challenges').doc().id;
  const challengeRef = refs.seasonRef
    .collection('challenges')
    .doc(challengeId);

  return firestore.runTransaction(async (transaction) => {
    const context = await readContext(transaction, refs);
    requireSeasonAdmin(uid, context);
    const challenge = validateChallenge(request?.data?.challenge, context);
    const challengeSnapshot = await transaction.get(challengeRef);
    if (isEdit && !challengeSnapshot.exists) {
      throw new HttpsError('not-found', 'El reto no existe.');
    }
    if (!isEdit && challengeSnapshot.exists) {
      throw new HttpsError('already-exists', 'El reto ya existe.');
    }

    const winnerIds = isEdit
      ? realWinnerIds(challengeSnapshot.data().winners, context)
      : [];
    const featSnapshots = await Promise.all(winnerIds.map((winnerId) =>
      transaction.get(firestore.doc(
        `users/${winnerId}/feats/${challengeId}`,
      ))));
    assertWriteLimit(1 + featSnapshots.length);

    if (isEdit) {
      transaction.update(challengeRef, challenge);
      featSnapshots.forEach((snapshot) => {
        const instances = updatedFeatInstances(
          snapshot,
          context,
          challenge,
          true,
        );
        writeFeatInstances(transaction, snapshot, instances);
      });
    } else {
      transaction.set(challengeRef, {
        ...challenge,
        status: 'active',
        winners: [],
        createdAt: Timestamp.now(),
      });
    }

    return { challengeId, created: !isEdit, updated: isEdit };
  });
}

function validateWinners(value, context, challenge) {
  const winners = requireBoundedArray(
    value,
    MAX_WINNERS,
    'La lista de ganadores no es válida.',
  );
  const seen = new Set();
  return winners.map((winner) => {
    const userId = requireDocumentId(winner?.uid, 'winner.uid');
    const member = context.season.members?.[userId];
    const isTargeted = challenge.targetType === 'all'
      || challenge.targetUsers?.includes(userId);
    if (!member || seen.has(userId) || !isTargeted) {
      throw new HttpsError(
        'invalid-argument',
        'Un ganador no pertenece a los destinatarios del reto.',
      );
    }
    seen.add(userId);
    return {
      uid: userId,
      teamName: cleanText(member.teamName, 120, 'El equipo ganador'),
    };
  });
}

async function setChallengeWinnersHandler(request, firestore = db) {
  const uid = requireDocumentId(request?.uid, 'uid');
  const refs = refsForSeason(firestore, request?.data);
  const challengeId = requireDocumentId(
    request?.data?.challengeId,
    'challengeId',
  );
  requireBoundedArray(
    request?.data?.winners,
    MAX_WINNERS,
    'La lista de ganadores no es válida.',
  );
  const challengeRef = refs.seasonRef
    .collection('challenges')
    .doc(challengeId);

  return firestore.runTransaction(async (transaction) => {
    const context = await readContext(transaction, refs);
    requireSeasonAdmin(uid, context);
    const challengeSnapshot = await transaction.get(challengeRef);
    if (!challengeSnapshot.exists) {
      throw new HttpsError('not-found', 'El reto no existe.');
    }
    const challenge = challengeSnapshot.data();
    const winners = validateWinners(request.data.winners, context, challenge);
    const desiredIds = new Set(winners.map((winner) => winner.uid));
    const affectedIds = [...new Set([
      ...realWinnerIds(challenge.winners, context),
      ...realWinnerIds(winners, context),
    ])];
    const featSnapshots = await Promise.all(affectedIds.map((winnerId) =>
      transaction.get(firestore.doc(
        `users/${winnerId}/feats/${challengeId}`,
      ))));
    assertWriteLimit(1 + featSnapshots.length);

    transaction.update(challengeRef, {
      status: winners.length > 0 ? 'completed' : 'active',
      winners,
    });
    featSnapshots.forEach((snapshot, index) => {
      const instances = updatedFeatInstances(
        snapshot,
        context,
        challenge,
        desiredIds.has(affectedIds[index]),
      );
      writeFeatInstances(transaction, snapshot, instances);
    });

    return { challengeId, winners };
  });
}

async function deleteSeasonChallengeHandler(request, firestore = db) {
  const uid = requireDocumentId(request?.uid, 'uid');
  const refs = refsForSeason(firestore, request?.data);
  const challengeId = requireDocumentId(
    request?.data?.challengeId,
    'challengeId',
  );
  const challengeRef = refs.seasonRef
    .collection('challenges')
    .doc(challengeId);

  return firestore.runTransaction(async (transaction) => {
    const context = await readContext(transaction, refs);
    requireSeasonAdmin(uid, context);
    const challengeSnapshot = await transaction.get(challengeRef);
    if (!challengeSnapshot.exists) {
      return { challengeId, deleted: false, alreadyDeleted: true };
    }
    const affectedIds = realWinnerIds(
      challengeSnapshot.data().winners,
      context,
    );
    const featSnapshots = await Promise.all(affectedIds.map((winnerId) =>
      transaction.get(firestore.doc(
        `users/${winnerId}/feats/${challengeId}`,
      ))));
    assertWriteLimit(1 + featSnapshots.length);

    transaction.delete(challengeRef);
    featSnapshots.forEach((snapshot) => {
      const instances = updatedFeatInstances(
        snapshot,
        context,
        challengeSnapshot.data(),
        false,
      );
      writeFeatInstances(transaction, snapshot, instances);
    });
    return { challengeId, deleted: true, alreadyDeleted: false };
  });
}

async function refreshCareerAchievementsHandler(request, firestore = db) {
  const uid = requireDocumentId(request?.uid, 'uid');
  const [seasonSnapshots, achievementSnapshots, postSnapshots] =
    await Promise.all([
      firestore.collectionGroup('seasons').get(),
      firestore.collection(`users/${uid}/achievements`).get(),
      firestore.collection('posts').where('authorId', '==', uid).get(),
    ]);
  const memberSeasons = seasonSnapshots.docs.filter((snapshot) =>
    snapshot.data().members?.[uid]);
  if (memberSeasons.length > MAX_CAREER_SEASONS) {
    throw new HttpsError(
      'resource-exhausted',
      'Hay demasiadas temporadas para recalcular de una sola vez.',
    );
  }

  const seasonStats = await Promise.all(memberSeasons.map(async (season) => {
    const [rounds, transfers] = await Promise.all([
      season.ref.collection('rounds').get(),
      season.ref.collection('transfers').where('buyerId', '==', uid).get(),
    ]);
    const points = rounds.docs.reduce((total, round) => {
      const score = round.data().scores?.[uid];
      return Number.isFinite(score) ? total + score : total;
    }, 0);
    return { points, transfers: transfers.size };
  }));

  const championshipsWon = achievementSnapshots.docs.filter((snapshot) =>
    Array.isArray(snapshot.data().trophies)
    && snapshot.data().trophies.some((trophy) =>
      trophy?.trophyId === 'CHAMPION')).length;
  const totals = seasonStats.reduce((result, stats) => ({
    points: result.points + stats.points,
    transfers: result.transfers + stats.transfers,
  }), { points: 0, transfers: 0 });
  const likesReceived = postSnapshots.docs.reduce((total, snapshot) => {
    const likes = snapshot.data().likes;
    return total + (Array.isArray(likes) ? likes.length : 0);
  }, 0);
  const progress = {
    SEASONS_PLAYED_3: { current: memberSeasons.length },
    CHAMPIONSHIPS_WON_3: { current: championshipsWon },
    TOTAL_POINTS_50000: { current: totals.points },
    TOTAL_TRANSFERS_100: { current: totals.transfers },
    POSTS_CREATED_50: { current: postSnapshots.size },
    LIKES_RECEIVED_500: { current: likesReceived },
  };

  await firestore.doc('career_achievements/' + uid).set(progress);
  return progress;
}

module.exports = {
  deleteSeasonChallengeHandler,
  refreshCareerAchievementsHandler,
  replaceSeasonTrophiesHandler,
  saveSeasonChallengeHandler,
  setChallengeWinnersHandler,
};
