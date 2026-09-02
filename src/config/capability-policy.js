export const resolveCapabilities = ({ isDev, isUsingEmulators }) =>
  Object.freeze({
    playerSync: isDev === true && isUsingEmulators === true,
  });

export function assertPlayerSyncEnabled(enabled) {
  if (enabled !== true) {
    const error = new Error('La sincronización sólo está disponible en local.');
    error.code = 'failed-precondition';
    throw error;
  }
}
