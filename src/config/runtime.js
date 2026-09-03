export const DEMO_PROJECT_ID = 'demo-fantasya';

export function resolveFirebaseRuntime(env, isDev) {
  const projectId = String(env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const useEmulators = env.VITE_USE_FIREBASE_EMULATORS === 'true';

  if (!projectId) {
    throw new Error('VITE_FIREBASE_PROJECT_ID is required.');
  }

  if (isDev && projectId !== DEMO_PROJECT_ID) {
    throw new Error(
      'Refusing to start development with Firebase project "' +
        projectId +
        '". Expected "' +
        DEMO_PROJECT_ID +
        '".',
    );
  }

  if (isDev && !useEmulators) {
    throw new Error('Firebase emulators must be enabled in development.');
  }

  return {
    projectId,
    useEmulators: isDev && useEmulators,
  };
}
