const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('./firebase');

function requireAuth(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  return uid;
}

async function requireSuperAdmin(request, firestore = db) {
  const uid = requireAuth(request);
  const profile = await firestore.doc('users/' + uid).get();
  if (!profile.exists || profile.data().appRole !== 'superadmin') {
    throw new HttpsError(
      'permission-denied',
      'Esta operación requiere superadministración.',
    );
  }
  return uid;
}

module.exports = {
  requireAuth,
  requireSuperAdmin,
};
