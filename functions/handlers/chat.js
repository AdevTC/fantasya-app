const { HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('../lib/firebase');
const { requireDocumentId } = require('../lib/league-authz');

function exactParticipants(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && new Set(value).size === expected.length
    && expected.every((uid) => value.includes(uid));
}

async function createOrGetChatHandler(request, firestore = db) {
  const uid = requireDocumentId(request?.uid, 'uid');
  const otherUserUid = requireDocumentId(
    request?.data?.otherUserUid,
    'otherUserUid',
  );
  if (uid === otherUserUid) {
    throw new HttpsError(
      'invalid-argument',
      'No puedes crear un chat contigo mismo.',
    );
  }
  const participants = [uid, otherUserUid].sort();
  const chatId = participants.join('_');
  const chatRef = firestore.doc('chats/' + chatId);
  const userRefs = participants.map((participant) =>
    firestore.doc('users/' + participant));

  return firestore.runTransaction(async (transaction) => {
    const [chatSnapshot, ...userSnapshots] = await Promise.all([
      transaction.get(chatRef),
      ...userRefs.map((userRef) => transaction.get(userRef)),
    ]);
    if (userSnapshots.some((snapshot) => !snapshot.exists)) {
      throw new HttpsError(
        'not-found',
        'Uno de los usuarios del chat no existe.',
      );
    }
    if (chatSnapshot.exists) {
      if (!exactParticipants(chatSnapshot.data().participants, participants)) {
        throw new HttpsError(
          'failed-precondition',
          'El chat existente tiene participantes incompatibles.',
        );
      }
      return { chatId, created: false };
    }

    transaction.create(chatRef, {
      participants,
      createdAt: FieldValue.serverTimestamp(),
      lastMessage: '',
    });
    return { chatId, created: true };
  });
}

module.exports = {
  createOrGetChatHandler,
  exactParticipants,
};
