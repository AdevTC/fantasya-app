import { isUsingEmulators } from './firebase';
import { resolveCapabilities } from './capability-policy';

const capabilities = resolveCapabilities({
  isDev: import.meta.env.DEV,
  isUsingEmulators,
});

export const playerSyncEnabled = capabilities.playerSync;
