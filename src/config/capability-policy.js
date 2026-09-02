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

export function resolveCatalogueViewState({ error, isLoading, playersCount }) {
  if (error) return 'error';
  if (isLoading) return 'loading';
  if (playersCount === 0) return 'empty';
  return 'ready';
}

export const resolveCatalogueLoadPlan = ({ playerSyncEnabled }) =>
  Object.freeze({
    fetchSyncStatus: playerSyncEnabled === true,
    activeRunId: null,
  });
