const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('./firebase');
const { requireAuth } = require('./authz');

function requireDocumentId(value, name) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 128 || id.includes('/') || id === '.' || id === '..') {
    throw new HttpsError('invalid-argument', `${name} no es válido.`);
  }
  return id;
}

async function getSeasonContext(data, firestore = db) {
  const leagueId = requireDocumentId(data?.leagueId, 'leagueId');
  const seasonId = requireDocumentId(data?.seasonId, 'seasonId');
  const leagueRef = firestore.doc('leagues/' + leagueId);
  const seasonRef = leagueRef.collection('seasons').doc(seasonId);
  const [league, season] = await Promise.all([
    leagueRef.get(),
    seasonRef.get(),
  ]);

  if (!league.exists) {
    throw new HttpsError('not-found', 'La liga no existe.');
  }
  if (!season.exists) {
    throw new HttpsError('not-found', 'La temporada no existe.');
  }

  return {
    league: league.data(),
    leagueId,
    leagueRef,
    season: season.data(),
    seasonId,
    seasonRef,
  };
}

function actorUid(actor) {
  return typeof actor === 'string'
    ? requireDocumentId(actor, 'uid')
    : requireAuth(actor);
}

function requireLeagueOwner(actor, context) {
  const uid = actorUid(actor);
  if (uid !== context.league.ownerId) {
    throw new HttpsError(
      'permission-denied',
      'Debes ser propietario de la liga.',
    );
  }
  return uid;
}

function requireSeasonAdmin(actor, context) {
  const uid = actorUid(actor);
  const member = context.season.members?.[uid];
  if (uid !== context.league.ownerId && member?.role !== 'admin') {
    throw new HttpsError(
      'permission-denied',
      'Debes ser administrador o propietario de la liga.',
    );
  }
  return uid;
}

module.exports = {
  getSeasonContext,
  requireDocumentId,
  requireLeagueOwner,
  requireSeasonAdmin,
};
