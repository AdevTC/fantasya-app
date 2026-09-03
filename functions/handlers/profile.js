const { HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('../lib/firebase');
const { requireAuth } = require('../lib/authz');

function normalizeUsername(value) {
  const username = String(value ?? '').trim().toLowerCase();

  if (username.length < 3 || username.length > 16) {
    throw new HttpsError(
      'invalid-argument',
      'El nombre debe tener entre 3 y 16 caracteres.',
    );
  }
  if (!/^[a-z0-9_.]+$/.test(username)) {
    throw new HttpsError(
      'invalid-argument',
      "El nombre sólo admite letras minúsculas, números, '_' y '.'.",
    );
  }
  if (username.startsWith('.') || username.endsWith('.')) {
    throw new HttpsError(
      'invalid-argument',
      'El nombre no puede empezar o acabar con un punto.',
    );
  }
  if (/^\d/.test(username)) {
    throw new HttpsError(
      'invalid-argument',
      'El nombre no puede empezar con un número.',
    );
  }

  return username;
}

async function createProfileDocumentsHandler(request) {
  const uid = requireAuth(request);
  const email = request.auth?.token?.email;
  if (!email) {
    throw new HttpsError('failed-precondition', 'La cuenta no tiene email.');
  }

  const username = normalizeUsername(request.data?.username);
  const profileRef = db.doc('users/' + uid);
  const usernameRef = db.doc('usernames/' + username);

  await db.runTransaction(async (transaction) => {
    const [profile, usernameDoc] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(usernameRef),
    ]);

    if (profile.exists) {
      if (profile.data().username !== username) {
        throw new HttpsError(
          'failed-precondition',
          'La cuenta ya tiene un perfil con otro nombre.',
        );
      }
      if (usernameDoc.exists && usernameDoc.data().userId !== uid) {
        throw new HttpsError(
          'data-loss',
          'El índice de nombre no coincide con el perfil.',
        );
      }
      if (!usernameDoc.exists) {
        transaction.set(usernameRef, { userId: uid });
      }
      return;
    }

    if (usernameDoc.exists && usernameDoc.data().userId !== uid) {
      throw new HttpsError('already-exists', 'Ese nombre ya está ocupado.');
    }

    transaction.set(profileRef, {
      username,
      email,
      appRole: 'user',
      createdAt: FieldValue.serverTimestamp(),
      photoURL: '',
      bio: '',
      xp: 0,
      followers: [],
      following: [],
      pinnedTrophies: [],
      savedPosts: [],
    });
    transaction.set(usernameRef, { userId: uid });
  });

  return { success: true, username };
}

module.exports = {
  createProfileDocumentsHandler,
  normalizeUsername,
};
