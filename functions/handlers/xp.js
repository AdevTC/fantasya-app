const { requireSuperAdmin } = require('../lib/authz');
const {
  XP_VALUES,
  awardXpOnce,
  recalculateAllXp,
} = require('../lib/xp');

async function onPostCreatedAwardXpHandler(event) {
  const post = event.data?.data();
  if (!post?.authorId || !event.params?.postId) return false;
  return awardXpOnce({
    userId: post.authorId,
    eventId: 'post:' + event.params.postId,
    amount: post.imageURL ? XP_VALUES.POST_WITH_IMAGE : XP_VALUES.POST,
    source: 'post',
  });
}

async function onTransferCreatedAwardXpHandler(event) {
  const transfer = event.data?.data();
  if (
    !transfer?.buyerId
    || transfer.buyerId === 'market'
    || !event.params?.leagueId
    || !event.params?.seasonId
    || !event.params?.transferId
  ) {
    return false;
  }
  return awardXpOnce({
    userId: transfer.buyerId,
    eventId: [
      'transfer',
      event.params.leagueId,
      event.params.seasonId,
      event.params.transferId,
    ].join(':'),
    amount: XP_VALUES.TRANSFER,
    source: 'transfer',
  });
}

async function recalculateXpHandler(request) {
  await requireSuperAdmin(request);
  return recalculateAllXp();
}

module.exports = {
  onPostCreatedAwardXpHandler,
  onTransferCreatedAwardXpHandler,
  recalculateXpHandler,
};
