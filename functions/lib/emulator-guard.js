const DEMO_PROJECT_ID = 'demo-fantasya';
const REQUIRED_HOSTS = Object.freeze({
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
});

function assertEmulatorEnvironment(env = process.env) {
  const projectId = env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT;
  if (projectId !== DEMO_PROJECT_ID) {
    throw new Error(
      'Seed refused project "' +
        (projectId || 'missing') +
        '"; expected "' +
        DEMO_PROJECT_ID +
        '".',
    );
  }

  for (const [name, expected] of Object.entries(REQUIRED_HOSTS)) {
    if (env[name] !== expected) {
      throw new Error(
        'Seed requires ' + name + '=' + expected + '.',
      );
    }
  }

  return { projectId };
}

module.exports = {
  DEMO_PROJECT_ID,
  assertEmulatorEnvironment,
};
