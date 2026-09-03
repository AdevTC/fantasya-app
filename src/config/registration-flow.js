export async function finishRegistration({
  createProfile,
  sendVerification,
  user,
  username,
}) {
  try {
    await createProfile(username);
  } catch (error) {
    return { error, status: 'profile-incomplete', user };
  }

  try {
    await sendVerification(user);
  } catch (error) {
    return { error, status: 'verification-pending', user };
  }

  return { status: 'complete', user };
}
