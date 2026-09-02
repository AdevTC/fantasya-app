const {
  assertEmulatorEnvironment,
} = require('../../lib/emulator-guard');

async function assertResetSucceeded(response, service) {
  if (response.ok) return;
  const details = await response.text();
  throw new Error(
    `${service} emulator reset failed (${response.status}): ${details}`,
  );
}

async function resetTestEmulators(env = process.env, fetchImpl = fetch) {
  const { projectId } = assertEmulatorEnvironment(env);
  const authUrl =
    `http://${env.FIREBASE_AUTH_EMULATOR_HOST}` +
    `/emulator/v1/projects/${projectId}/accounts`;
  const firestoreUrl =
    `http://${env.FIRESTORE_EMULATOR_HOST}` +
    `/emulator/v1/projects/${projectId}/databases/(default)/documents`;

  const [authResponse, firestoreResponse] = await Promise.all([
    fetchImpl(authUrl, { method: 'DELETE' }),
    fetchImpl(firestoreUrl, { method: 'DELETE' }),
  ]);
  await Promise.all([
    assertResetSucceeded(authResponse, 'Auth'),
    assertResetSucceeded(firestoreResponse, 'Firestore'),
  ]);
}

module.exports = {
  resetTestEmulators,
};
