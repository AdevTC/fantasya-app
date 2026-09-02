import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const call = (name, options) => httpsCallable(functions, name, options);

export async function createProfile(username) {
  const result = await call('createProfileDocuments')({ username });
  return result.data;
}

export async function setUserAppRole(userId, appRole) {
  const result = await call('setUserAppRole')({ userId, appRole });
  return result.data;
}

export async function recalculateXp() {
  const result = await call('recalculateXp')();
  return result.data;
}

export async function syncLaLigaPlayers() {
  const result = await call('syncLaLigaPlayersV2', { timeout: 540000 })();
  return result.data;
}

export async function getLaLigaSyncStatus() {
  const result = await call('getLaLigaSyncStatusV2')();
  return result.data;
}
