import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const call = (name, data) =>
  httpsCallable(functions, name)(data).then(({ data: result }) => result);

export const joinSeasonByInviteCode = (input) =>
  call('joinSeasonByInviteCode', input);

export const submitJoinRequest = (input) =>
  call('submitJoinRequest', input);

export const reviewJoinRequest = (input) =>
  call('reviewJoinRequest', input);
