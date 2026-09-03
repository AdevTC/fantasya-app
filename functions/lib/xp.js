const { HttpsError } = require('firebase-functions/v2/https');
const { db, FieldValue } = require('./firebase');
const { requireDocumentId } = require('./league-authz');

const XP_VALUES = Object.freeze({
  POINTS_PER_10: 1,
  TRANSFER: 5,
  POST: 10,
  POST_WITH_IMAGE: 15,
  TROPHY: 100,
});
const XP_EVENT_SOURCES = new Set(['post', 'transfer']);

function validateAward({ userId, eventId, amount, source }) {
  const safeUserId = requireDocumentId(userId, 'userId');
  const safeEventId = String(eventId ?? '').trim();
  if (
    !safeEventId
    || safeEventId.length > 512
    || safeEventId.includes('/')
    || safeEventId === '.'
    || safeEventId === '..'
  ) {
    throw new HttpsError('invalid-argument', 'eventId no es válido.');
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
    throw new HttpsError('invalid-argument', 'La cantidad de XP no es válida.');
  }
  if (!XP_EVENT_SOURCES.has(source)) {
    throw new HttpsError('invalid-argument', 'La fuente de XP no es válida.');
  }
  return { amount, eventId: safeEventId, source, userId: safeUserId };
}

function xpAwardRefs(firestore, award) {
  const safe = validateAward(award);
  const userRef = firestore.doc(`users/${safe.userId}`);
  return {
    award: safe,
    eventRef: userRef.collection('xpEvents').doc(safe.eventId),
    userRef,
  };
}

function applyXpAward(transaction, { user, event }, refs) {
  if (!user.exists) {
    throw new HttpsError('failed-precondition', 'El usuario no existe.');
  }
  if (event.exists) return false;

  transaction.create(refs.eventRef, {
    amount: refs.award.amount,
    source: refs.award.source,
    createdAt: FieldValue.serverTimestamp(),
  });
  transaction.update(refs.userRef, {
    xp: FieldValue.increment(refs.award.amount),
  });
  return true;
}

async function awardXpOnce(award) {
  const refs = xpAwardRefs(db, award);

  return db.runTransaction(async (transaction) => {
    const [user, event] = await Promise.all([
      transaction.get(refs.userRef),
      transaction.get(refs.eventRef),
    ]);
    if (!user.exists || event.exists) return false;
    return applyXpAward(transaction, { user, event }, refs);
  });
}

function addXp(totals, userId, amount) {
  if (Object.hasOwn(totals, userId)) totals[userId] += amount;
}

async function calculateXpByUser() {
  const [users, posts, leagues] = await Promise.all([
    db.collection('users').get(),
    db.collection('posts').get(),
    db.collection('leagues').get(),
  ]);
  const totals = Object.fromEntries(users.docs.map((item) => [item.id, 0]));

  posts.forEach((item) => {
    const post = item.data();
    addXp(
      totals,
      post.authorId,
      post.imageURL ? XP_VALUES.POST_WITH_IMAGE : XP_VALUES.POST,
    );
  });

  for (const league of leagues.docs) {
    const seasons = await league.ref.collection('seasons').get();
    for (const season of seasons.docs) {
      const [transfers, rounds, achievements] = await Promise.all([
        season.ref.collection('transfers').get(),
        season.ref.collection('rounds').get(),
        season.ref.collection('achievements').get(),
      ]);
      transfers.forEach((item) => {
        const buyerId = item.data().buyerId;
        if (buyerId && buyerId !== 'market') {
          addXp(totals, buyerId, XP_VALUES.TRANSFER);
        }
      });
      rounds.forEach((item) => {
        const scores = item.data().scores || {};
        for (const [userId, points] of Object.entries(scores)) {
          if (typeof points === 'number' && Number.isFinite(points)) {
            addXp(
              totals,
              userId,
              Math.floor(Math.max(0, points) / 10) * XP_VALUES.POINTS_PER_10,
            );
          }
        }
      });
      achievements.forEach((item) => {
        const data = item.data();
        if (!data.isPlaceholder && Array.isArray(data.trophies)) {
          addXp(totals, item.id, data.trophies.length * XP_VALUES.TROPHY);
        }
      });
    }
  }

  return totals;
}

async function recalculateAllXp() {
  const totals = await calculateXpByUser();
  const entries = Object.entries(totals);

  for (let offset = 0; offset < entries.length; offset += 450) {
    const batch = db.batch();
    for (const [userId, xp] of entries.slice(offset, offset + 450)) {
      batch.update(db.doc('users/' + userId), { xp });
    }
    await batch.commit();
  }

  return { usersUpdated: entries.length };
}

module.exports = {
  XP_VALUES,
  applyXpAward,
  awardXpOnce,
  calculateXpByUser,
  recalculateAllXp,
  xpAwardRefs,
};
