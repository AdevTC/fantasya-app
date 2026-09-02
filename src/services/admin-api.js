import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const call = (name) => httpsCallable(functions, name);

export async function createProfile(username) {
  const result = await call('createProfileDocuments')({ username });
  return result.data;
}
