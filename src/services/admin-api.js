import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const call = (name, data, options) =>
  httpsCallable(functions, name, options)(data)
    .then(({ data: result }) => result);

export const createProfile = (username) =>
  call('createProfileDocumentsV2', { username });

export const unlinkUserFromTeam = (input) =>
  call('unlinkUserFromTeamV2', input);

export const createOrGetChat = (otherUserUid) =>
  call('createOrGetChatV2', { otherUserUid });

export const setUserAppRole = (userId, appRole) =>
  call('setUserAppRole', { userId, appRole });

export const recalculateXp = () => call('recalculateXp');

export const syncLaLigaPlayers = () =>
  call('syncLaLigaPlayersV2', undefined, { timeout: 540000 });

export const getLaLigaSyncStatus = () =>
  call('getLaLigaSyncStatusV2');
