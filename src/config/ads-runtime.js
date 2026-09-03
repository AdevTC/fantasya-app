const ADSENSE_PUBLISHER_ID_PATTERN = /^ca-pub-\d+$/;

export function resolveAdSenseRuntime(env, isUsingEmulators) {
  const publisherId = String(env.VITE_ADSENSE_PUBLISHER_ID || '').trim();

  if (isUsingEmulators || !ADSENSE_PUBLISHER_ID_PATTERN.test(publisherId)) {
    return {
      enabled: false,
      publisherId: null,
    };
  }

  return {
    enabled: true,
    publisherId,
  };
}
