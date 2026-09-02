export function resolvePlayerSyncRuntime(isUsingEmulators) {
  if (isUsingEmulators) {
    return {
      legacyRemoteEnabled: false,
      mode: 'local-isolated',
    };
  }

  return {
    legacyRemoteEnabled: true,
    mode: 'legacy-remote',
  };
}
