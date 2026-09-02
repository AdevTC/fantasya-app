const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('../lib/firebase');
const { requireAuth } = require('../lib/authz');
const { requireDocumentId } = require('../lib/league-authz');

const ROLES = new Set(['user', 'superadmin']);

async function setUserAppRoleHandler(request) {
  const requesterId = requireAuth(request);
  const userId = requireDocumentId(request.data?.userId, 'userId');
  const appRole = String(request.data?.appRole ?? '');
  if (!ROLES.has(appRole)) {
    throw new HttpsError('invalid-argument', 'El rol no es válido.');
  }

  const requesterRef = db.doc('users/' + requesterId);
  const targetRef = db.doc('users/' + userId);
  const adminsQuery = db.collection('users')
    .where('appRole', '==', 'superadmin');

  await db.runTransaction(async (transaction) => {
    const [requester, target, admins] = await Promise.all([
      transaction.get(requesterRef),
      transaction.get(targetRef),
      transaction.get(adminsQuery),
    ]);

    if (!requester.exists || requester.data().appRole !== 'superadmin') {
      throw new HttpsError(
        'permission-denied',
        'Esta operación requiere superadministración.',
      );
    }
    if (!target.exists) {
      throw new HttpsError('not-found', 'Usuario no encontrado.');
    }
    if (
      target.data().appRole === 'superadmin'
      && appRole === 'user'
      && admins.size <= 1
    ) {
      throw new HttpsError(
        'failed-precondition',
        'No se puede revocar el último superadministrador.',
      );
    }

    if (target.data().appRole !== appRole) {
      transaction.update(targetRef, { appRole });
    }
  });

  return { success: true, userId, appRole };
}

module.exports = { setUserAppRoleHandler };
