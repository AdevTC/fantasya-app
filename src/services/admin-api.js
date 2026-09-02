import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const call = (name) => httpsCallable(functions, name);

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
