import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const call = (name, input) =>
  httpsCallable(functions, name)(input).then(({ data }) => data);

export const createPost = (input) => call('createPostV2', input);
export const createTransfer = (input) => call('createTransferV2', input);
