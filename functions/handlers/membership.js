const { HttpsError } = require('firebase-functions/v2/https');
const { db, FieldPath, FieldValue } = require('../lib/firebase');
const {
  requireDocumentId,
  requireSeasonAdmin,
} = require('../lib/league-authz');

const TEAM_NAME_MAX = 24;
const MESSAGE_MAX = 500;

function cleanTeamName(value) {
  const teamName = typeof value === 'string' ? value.trim() : '';
  if (!teamName || teamName.length > TEAM_NAME_MAX) {
    throw new HttpsError(
      'invalid-argument',
      'El nombre del equipo debe tener entre 1 y 24 caracteres.',
    );
  }
  return teamName;
}

function cleanMessage(value) {
  const message = typeof value === 'string' ? value.trim() : '';
  if (message.length > MESSAGE_MAX) {
    throw new HttpsError(
      'invalid-argument',
      'El mensaje no puede superar los 500 caracteres.',
    );
  }
  return message;
}

function cleanInviteCode(value) {
  const inviteCode = typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
  if (!inviteCode || inviteCode.length > 64) {
    throw new HttpsError(
      'invalid-argument',
      'El código de invitación no es válido.',
    );
  }
  return inviteCode;
}

function memberFromProfile(profile, teamName, extra = {}) {
  const username = typeof profile?.username === 'string'
    ? profile.username.trim()
    : '';
  if (!username) {
    throw new HttpsError(
      'failed-precondition',
      'El perfil no tiene un nombre de usuario válido.',
    );
  }
  return {
    ...extra,
    username,
    teamName,
    photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : '',
    role: 'member',
    isPlaceholder: false,
  };
}

function normalizedTeamName(value) {
  return String(value ?? '').trim().normalize('NFKC').toLowerCase();
}

function hasDuplicateTeamName(members, teamName, ignoredIds = []) {
  const ignored = new Set(ignoredIds);
  const candidate = normalizedTeamName(teamName);
  return Object.entries(members || {}).some(([memberId, member]) =>
    !ignored.has(memberId)
      && normalizedTeamName(member?.teamName) === candidate);
}

function exactParticipants(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && new Set(value).size === expected.length
    && expected.every((uid) => value.includes(uid));
}

function seasonRefs(firestore, data) {
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

function contextFromSnapshots(refs, leagueSnapshot, seasonSnapshot) {
  if (!leagueSnapshot.exists) {
    throw new HttpsError('not-found', 'La liga no existe.');
  }
  if (!seasonSnapshot.exists) {
    throw new HttpsError('not-found', 'La temporada no existe.');
  }
  return {
    league: leagueSnapshot.data(),
    leagueId: refs.leagueId,
    leagueRef: refs.leagueRef,
    season: seasonSnapshot.data(),
    seasonId: refs.seasonId,
    seasonRef: refs.seasonRef,
  };
}

function requireJoinableSeason(context) {
  const status = String(context.season.status ?? '')
    .trim()
    .normalize('NFKC')
    .toLowerCase();
  if (
    context.season.archived === true
    || ['finalizada', 'finalizado', 'finished', 'closed'].includes(status)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'No se admiten nuevas altas en una temporada finalizada o archivada.',
    );
  }
}

async function joinSeasonByInviteCodeHandler(request, firestore = db) {
  const uid = requireDocumentId(request?.uid, 'uid');
  const refs = seasonRefs(firestore, request?.data);
  const inviteCode = cleanInviteCode(request?.data?.inviteCode);
  const mode = request?.data?.mode;
  if (mode !== 'create' && mode !== 'claim') {
    throw new HttpsError(
      'invalid-argument',
      'El modo de unión debe ser create o claim.',
    );
  }
  const teamName = mode === 'create'
    ? cleanTeamName(request?.data?.teamName)
    : null;
  const placeholderId = mode === 'claim'
    ? requireDocumentId(request?.data?.placeholderId, 'placeholderId')
    : null;
  const profileRef = firestore.doc('users/' + uid);

  return firestore.runTransaction(async (transaction) => {
    const [leagueSnapshot, seasonSnapshot, profileSnapshot] =
      await Promise.all([
        transaction.get(refs.leagueRef),
        transaction.get(refs.seasonRef),
        transaction.get(profileRef),
      ]);
    const context = contextFromSnapshots(
      refs,
      leagueSnapshot,
      seasonSnapshot,
    );
    requireJoinableSeason(context);
    if (!profileSnapshot.exists) {
      throw new HttpsError('failed-precondition', 'Tu perfil no existe.');
    }
    const storedInviteCode = String(
      context.season.inviteCode ?? '',
    ).trim().toUpperCase();
    if (!storedInviteCode || storedInviteCode !== inviteCode) {
      throw new HttpsError(
        'permission-denied',
        'El código de invitación no es correcto.',
      );
    }

    const existingMember = context.season.members?.[uid];
    if (existingMember) {
      if (
        mode === 'claim'
        || normalizedTeamName(existingMember.teamName)
          === normalizedTeamName(teamName)
      ) {
        return {
          joined: false,
          alreadyMember: true,
          leagueId: refs.leagueId,
          seasonId: refs.seasonId,
        };
      }
      throw new HttpsError(
        'already-exists',
        'Ya perteneces a esta temporada con otro equipo.',
      );
    }

    let newMember;
    let claimedPlaceholderId;
    if (mode === 'claim') {
      const placeholder = context.season.members?.[placeholderId];
      if (!placeholder?.isPlaceholder) {
        throw new HttpsError(
          'failed-precondition',
          'El equipo fantasma ya no está disponible.',
        );
      }
      if (hasDuplicateTeamName(
        context.season.members,
        placeholder.teamName,
        [placeholderId],
      )) {
        throw new HttpsError(
          'already-exists',
          'Ya existe otro equipo con ese nombre.',
        );
      }
      claimedPlaceholderId = placeholderId;
      newMember = memberFromProfile(
        profileSnapshot.data(),
        cleanTeamName(placeholder.teamName),
        { ...placeholder, claimedPlaceholderId: placeholderId },
      );
    } else {
      if (hasDuplicateTeamName(context.season.members, teamName)) {
        throw new HttpsError(
          'already-exists',
          'Ya existe un equipo con ese nombre.',
        );
      }
      newMember = memberFromProfile(profileSnapshot.data(), teamName, {
        totalPoints: 0,
        finances: { budget: 200, teamValue: 0 },
      });
    }

    transaction.update(
      refs.seasonRef,
      new FieldPath('members', uid),
      newMember,
    );
    return {
      joined: true,
      alreadyMember: false,
      leagueId: refs.leagueId,
      seasonId: refs.seasonId,
      ...(claimedPlaceholderId ? { claimedPlaceholderId } : {}),
    };
  });
}

async function submitJoinRequestHandler(request, firestore = db) {
  const uid = requireDocumentId(request?.uid, 'uid');
  const refs = seasonRefs(firestore, request?.data);
  const adminId = requireDocumentId(request?.data?.adminId, 'adminId');
  const teamName = cleanTeamName(request?.data?.teamName);
  const message = cleanMessage(request?.data?.message);
  const participants = [uid, adminId].sort();
  const chatId = participants.join('_');
  const profileRef = firestore.doc('users/' + uid);
  const requestRef = refs.seasonRef.collection('joinRequests').doc(uid);
  const chatRef = firestore.doc('chats/' + chatId);
  const messageRef = chatRef.collection('messages').doc();

  return firestore.runTransaction(async (transaction) => {
    const [
      leagueSnapshot,
      seasonSnapshot,
      profileSnapshot,
      requestSnapshot,
      chatSnapshot,
    ] = await Promise.all([
      transaction.get(refs.leagueRef),
      transaction.get(refs.seasonRef),
      transaction.get(profileRef),
      transaction.get(requestRef),
      transaction.get(chatRef),
    ]);
    const context = contextFromSnapshots(
      refs,
      leagueSnapshot,
      seasonSnapshot,
    );
    requireJoinableSeason(context);
    requireSeasonAdmin(adminId, context);
    if (!profileSnapshot.exists) {
      throw new HttpsError('failed-precondition', 'Tu perfil no existe.');
    }
    if (context.season.members?.[uid]) {
      throw new HttpsError(
        'failed-precondition',
        'Ya perteneces a esta temporada.',
      );
    }
    if (chatSnapshot.exists && !exactParticipants(
      chatSnapshot.data().participants,
      participants,
    )) {
      throw new HttpsError(
        'failed-precondition',
        'El chat de la solicitud no tiene participantes válidos.',
      );
    }

    if (requestSnapshot.exists) {
      const current = requestSnapshot.data();
      if (current.userId !== uid) {
        throw new HttpsError(
          'failed-precondition',
          'La solicitud existente no pertenece al usuario.',
        );
      }
      if (current.status === 'pending') {
        const identical = current.adminId === adminId
          && current.chatId === chatId
          && current.teamName === teamName
          && (current.message || '') === message
          && typeof current.messageId === 'string';
        if (!identical) {
          throw new HttpsError(
            'already-exists',
            'Ya existe una solicitud pendiente con otros datos.',
          );
        }
        return {
          requestId: requestRef.id,
          chatId,
          messageId: current.messageId,
          alreadyPending: true,
        };
      }
      if (current.status !== 'rejected') {
        throw new HttpsError(
          'failed-precondition',
          'La solicitud ya fue procesada.',
        );
      }
    }

    if (hasDuplicateTeamName(context.season.members, teamName)) {
      throw new HttpsError(
        'already-exists',
        'Ya existe un equipo con ese nombre.',
      );
    }
    const profile = profileSnapshot.data();
    const username = memberFromProfile(profile, teamName).username;
    const requestText =
      `¡Hola! Me gustaría unirme a la liga "${context.league.name}" ` +
      `con el equipo "${teamName}"` +
      (message ? `. Mensaje: ${message}` : '');
    const requestData = {
      userId: uid,
      username,
      photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : '',
      teamName,
      message,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      chatId,
      adminId,
      messageId: messageRef.id,
    };
    const requestMessage = {
      senderId: uid,
      text: requestText,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
      isJoinRequest: true,
      requestId: requestRef.id,
      leagueId: refs.leagueId,
      seasonId: refs.seasonId,
      requestStatus: 'pending',
    };

    transaction.set(requestRef, requestData);
    transaction.set(chatRef, {
      participants,
      createdAt: chatSnapshot.exists
        ? chatSnapshot.data().createdAt || FieldValue.serverTimestamp()
        : FieldValue.serverTimestamp(),
      lastMessage: requestText,
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessageTimestamp: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(messageRef, requestMessage);
    return {
      requestId: requestRef.id,
      chatId,
      messageId: messageRef.id,
      alreadyPending: false,
    };
  });
}

async function reviewJoinRequestHandler(request, firestore = db) {
  const uid = requireDocumentId(request?.uid, 'uid');
  const refs = seasonRefs(firestore, request?.data);
  const requestId = requireDocumentId(request?.data?.requestId, 'requestId');
  const action = request?.data?.action;
  if (action !== 'approve' && action !== 'reject') {
    throw new HttpsError(
      'invalid-argument',
      'La acción debe ser approve o reject.',
    );
  }
  const suppliedMessageId = request?.data?.messageId == null
    ? null
    : requireDocumentId(request.data.messageId, 'messageId');
  const requestRef = refs.seasonRef.collection('joinRequests').doc(requestId);
  const notificationMessageId = firestore.collection('chats').doc().id;

  return firestore.runTransaction(async (transaction) => {
    const [leagueSnapshot, seasonSnapshot, requestSnapshot] =
      await Promise.all([
        transaction.get(refs.leagueRef),
        transaction.get(refs.seasonRef),
        transaction.get(requestRef),
      ]);
    const context = contextFromSnapshots(
      refs,
      leagueSnapshot,
      seasonSnapshot,
    );
    requireSeasonAdmin(uid, context);
    if (!requestSnapshot.exists) {
      throw new HttpsError('not-found', 'La solicitud no existe.');
    }
    const joinRequest = requestSnapshot.data();
    if (joinRequest.status !== 'pending') {
      throw new HttpsError(
        'failed-precondition',
        'La solicitud ya fue procesada.',
      );
    }
    const requestedUserId = requireDocumentId(
      joinRequest.userId,
      'request.userId',
    );
    const adminId = requireDocumentId(joinRequest.adminId, 'request.adminId');
    const chatId = requireDocumentId(joinRequest.chatId, 'request.chatId');
    const chatRef = firestore.doc('chats/' + chatId);
    const expectedParticipants = [requestedUserId, adminId].sort();
    if (chatId !== expectedParticipants.join('_')) {
      throw new HttpsError(
        'failed-precondition',
        'La solicitud apunta a un chat no canónico.',
      );
    }

    let messageId = joinRequest.messageId
      ? requireDocumentId(joinRequest.messageId, 'request.messageId')
      : suppliedMessageId;
    if (joinRequest.messageId && suppliedMessageId
        && suppliedMessageId !== messageId) {
      throw new HttpsError(
        'invalid-argument',
        'El mensaje no corresponde a la solicitud.',
      );
    }

    const chatSnapshot = await transaction.get(chatRef);
    if (!chatSnapshot.exists || !exactParticipants(
      chatSnapshot.data().participants,
      expectedParticipants,
    )) {
      throw new HttpsError(
        'failed-precondition',
        'El chat de la solicitud no es válido.',
      );
    }

    let messageSnapshot;
    if (messageId) {
      messageSnapshot = await transaction.get(
        chatRef.collection('messages').doc(messageId),
      );
    } else {
      const legacyMessages = await transaction.get(
        chatRef.collection('messages')
          .where('requestId', '==', requestId)
          .limit(2),
      );
      if (legacyMessages.size !== 1) {
        throw new HttpsError(
          'failed-precondition',
          'No se pudo identificar el mensaje original de la solicitud.',
        );
      }
      messageSnapshot = legacyMessages.docs[0];
      messageId = messageSnapshot.id;
    }
    if (!messageSnapshot.exists) {
      throw new HttpsError(
        'failed-precondition',
        'El mensaje original de la solicitud no existe.',
      );
    }
    const originalMessage = messageSnapshot.data();
    if (
      originalMessage.requestId !== requestId
      || originalMessage.senderId !== requestedUserId
      || originalMessage.leagueId !== refs.leagueId
      || originalMessage.seasonId !== refs.seasonId
      || originalMessage.isJoinRequest !== true
    ) {
      throw new HttpsError(
        'failed-precondition',
        'El mensaje original no corresponde a la solicitud.',
      );
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    const teamName = cleanTeamName(joinRequest.teamName);
    if (action === 'approve') {
      requireJoinableSeason(context);
      if (context.season.members?.[requestedUserId]) {
        throw new HttpsError(
          'failed-precondition',
          'El usuario ya pertenece a esta temporada.',
        );
      }
      if (hasDuplicateTeamName(context.season.members, teamName)) {
        throw new HttpsError(
          'already-exists',
          'Ya existe un equipo con ese nombre.',
        );
      }
    }

    const notificationText = action === 'approve'
      ? '¡Felicidades! Tu solicitud para unirte a la liga ha sido ' +
        `aprobada. Bienvenido "${teamName}"!`
      : 'Lo sentimos, tu solicitud para unirte a la liga con el equipo ' +
        `"${teamName}" ha sido rechazada.`;
    const notificationRef = chatRef
      .collection('messages')
      .doc(notificationMessageId);

    transaction.update(requestRef, {
      status,
      messageId,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: uid,
    });
    if (action === 'approve') {
      transaction.update(
        refs.seasonRef,
        new FieldPath('members', requestedUserId),
        memberFromProfile({
          username: joinRequest.username,
          photoURL: joinRequest.photoURL,
        }, teamName, {
          totalPoints: 0,
          finances: { budget: 200, teamValue: 0 },
        }),
      );
    }
    transaction.update(messageSnapshot.ref, { requestStatus: status });
    transaction.set(notificationRef, {
      senderId: uid,
      text: notificationText,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
      isSystemMessage: true,
      relatedRequestId: requestId,
    });
    transaction.set(chatRef, {
      participants: expectedParticipants,
      lastMessage: notificationText,
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessageTimestamp: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      requestId,
      status,
      chatId,
      messageId,
      notificationMessageId,
    };
  });
}

module.exports = {
  cleanMessage,
  cleanTeamName,
  joinSeasonByInviteCodeHandler,
  memberFromProfile,
  reviewJoinRequestHandler,
  submitJoinRequestHandler,
};
