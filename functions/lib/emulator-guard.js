const DEMO_PROJECT_ID = 'demo-fantasya';
const REQUIRED_HOSTS = [
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
];

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

  for (const name of REQUIRED_HOSTS) {
    if (!env[name]) throw new Error('Seed requires ' + name + '.');
  }

  return { projectId };
}

module.exports = {
  DEMO_PROJECT_ID,
  assertEmulatorEnvironment,
};
