const { requireSuperAdmin } = require('../lib/authz');
const {
  recalculateAllXp,
} = require('../lib/xp');

async function recalculateXpHandler(request) {
  await requireSuperAdmin(request);
  return recalculateAllXp();
}

module.exports = {
  recalculateXpHandler,
};
