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

export const replaceSeasonTrophies = (input) =>
  call('replaceSeasonTrophies', input);

export const saveSeasonChallenge = (input) =>
  call('saveSeasonChallenge', input);

export const deleteSeasonChallenge = (input) =>
  call('deleteSeasonChallenge', input);

export const setChallengeWinners = (input) =>
  call('setChallengeWinners', input);

export const refreshCareerAchievements = () =>
  call('refreshCareerAchievements', {});
