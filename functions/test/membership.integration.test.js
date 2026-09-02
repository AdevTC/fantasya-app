const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../lib/firebase');
const {
  joinSeasonByInviteCodeHandler,
  reviewJoinRequestHandler,
  submitJoinRequestHandler,
} = require('../handlers/membership');
const { seedEmulators } = require('../scripts/seed-emulators');
const {
  resetTestEmulators,
} = require('./support/emulator-test-env');

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

async function eventually(assertion, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await assertion();
    } catch (error) {
      if (!(error instanceof assert.AssertionError)) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError || new Error('Timed out waiting for assertion.');
}

function requestInput(overrides = {}) {
  return {
    leagueId: 'dev-league-active',
    seasonId: 'season-1',
    adminId: 'dev-league-admin',
    teamName: 'Request FC',
    message: 'Hola',
    ...overrides,
  };
}

test.beforeEach(async () => {
  await resetTestEmulators();
  await seedEmulators();
});

test('invite join creates a safe member and is idempotent', async () => {
  const first = await joinSeasonByInviteCodeHandler({
    uid: 'dev-superadmin',
    data: {
      leagueId: 'dev-league-active',
      seasonId: 'season-1',
      inviteCode: 'local1',
      mode: 'create',
      teamName: 'Outsiders FC',
    },
  });
  assert.equal(first.joined, true);

  const second = await joinSeasonByInviteCodeHandler({
    uid: 'dev-superadmin',
    data: {
      leagueId: 'dev-league-active',
      seasonId: 'season-1',
      inviteCode: 'LOCAL1',
      mode: 'create',
      teamName: 'Outsiders FC',
    },
  });
  assert.equal(second.alreadyMember, true);

  const season = await db.doc(
    'leagues/dev-league-active/seasons/season-1',
  ).get();
  assert.deepEqual(season.data().members['dev-superadmin'], {
    username: 'superadmin',
    teamName: 'Outsiders FC',
    photoURL: '',
    role: 'member',
    isPlaceholder: false,
    totalPoints: 0,
    finances: { budget: 200, teamValue: 0 },
  });
});

test('invite join rejects a wrong code, duplicate name and changed retry', async () => {
  const base = {
    leagueId: 'dev-league-active',
    seasonId: 'season-1',
    mode: 'create',
  };
  await rejectsCode(joinSeasonByInviteCodeHandler({
    uid: 'dev-superadmin',
    data: { ...base, inviteCode: 'WRONG1', teamName: 'Libre FC' },
  }), 'permission-denied');
  await rejectsCode(joinSeasonByInviteCodeHandler({
    uid: 'dev-superadmin',
    data: { ...base, inviteCode: 'LOCAL1', teamName: ' usuarios fc ' },
  }), 'already-exists');

  await joinSeasonByInviteCodeHandler({
    uid: 'dev-superadmin',
    data: { ...base, inviteCode: 'LOCAL1', teamName: 'Original FC' },
  });
  await rejectsCode(joinSeasonByInviteCodeHandler({
    uid: 'dev-superadmin',
    data: { ...base, inviteCode: 'LOCAL1', teamName: 'Changed FC' },
  }), 'already-exists');
});

test('placeholder claim preserves history and completes migration', async () => {
  const result = await joinSeasonByInviteCodeHandler({
    uid: 'dev-superadmin',
    data: {
      leagueId: 'dev-league-active',
      seasonId: 'season-1',
      inviteCode: 'LOCAL1',
      mode: 'claim',
      placeholderId: 'placeholder-rival',
    },
  });
  assert.equal(result.claimedPlaceholderId, 'placeholder-rival');

  await eventually(async () => {
    const season = await db.doc(
      'leagues/dev-league-active/seasons/season-1',
    ).get();
    const member = season.data().members['dev-superadmin'];
    assert.equal(member.totalPoints, 10);
    assert.equal(member.teamName, 'Equipo Fantasma');
    assert.equal(member.role, 'member');
    assert.equal(member.isPlaceholder, false);
    assert.equal(member.claimedPlaceholderId, undefined);
    assert.equal(season.data().members['placeholder-rival'], undefined);
  });
});

test('a claimed or missing placeholder cannot be stolen', async () => {
  await db.doc('leagues/dev-league-active/seasons/season-1').update({
    'members.placeholder-rival.isPlaceholder': false,
  });
  await rejectsCode(joinSeasonByInviteCodeHandler({
    uid: 'dev-superadmin',
    data: {
      leagueId: 'dev-league-active',
      seasonId: 'season-1',
      inviteCode: 'LOCAL1',
      mode: 'claim',
      placeholderId: 'placeholder-rival',
    },
  }), 'failed-precondition');
});

test('archived seasons reject new invite joins and join requests', async () => {
  await db.doc('leagues/dev-league-active/seasons/season-1').update({
    archived: true,
    status: 'Finalizada',
  });
  await rejectsCode(joinSeasonByInviteCodeHandler({
    uid: 'dev-superadmin',
    data: {
      leagueId: 'dev-league-active',
      seasonId: 'season-1',
      inviteCode: 'LOCAL1',
      mode: 'create',
      teamName: 'Too Late FC',
    },
  }), 'failed-precondition');
  await rejectsCode(submitJoinRequestHandler({
    uid: 'dev-superadmin',
    data: requestInput({ teamName: 'Too Late FC' }),
  }), 'failed-precondition');
});

test('join request is atomic, deterministic and idempotent', async () => {
  const first = await submitJoinRequestHandler({
    uid: 'dev-superadmin',
    data: requestInput(),
  });
  const second = await submitJoinRequestHandler({
    uid: 'dev-superadmin',
    data: requestInput(),
  });
  assert.equal(second.alreadyPending, true);
  assert.equal(second.requestId, first.requestId);
  assert.equal(second.chatId, first.chatId);
  assert.equal(second.messageId, first.messageId);

  const [request, chat, message] = await Promise.all([
    db.doc(
      'leagues/dev-league-active/seasons/season-1/' +
      `joinRequests/${first.requestId}`,
    ).get(),
    db.doc(`chats/${first.chatId}`).get(),
    db.doc(`chats/${first.chatId}/messages/${first.messageId}`).get(),
  ]);
  assert.equal(request.data().status, 'pending');
  assert.equal(request.data().messageId, first.messageId);
  assert.deepEqual(chat.data().participants, [
    'dev-league-admin',
    'dev-superadmin',
  ]);
  assert.equal(message.data().requestStatus, 'pending');
  assert.equal(message.data().requestId, first.requestId);

  await rejectsCode(submitJoinRequestHandler({
    uid: 'dev-superadmin',
    data: requestInput({ message: 'Otro mensaje' }),
  }), 'already-exists');
});

test('a rejected request may be replaced but an existing member cannot request', async () => {
  const first = await submitJoinRequestHandler({
    uid: 'dev-superadmin',
    data: requestInput(),
  });
  await db.doc(
    'leagues/dev-league-active/seasons/season-1/' +
    `joinRequests/${first.requestId}`,
  ).update({ status: 'rejected' });

  const replacement = await submitJoinRequestHandler({
    uid: 'dev-superadmin',
    data: requestInput({ message: 'Segundo intento' }),
  });
  assert.equal(replacement.requestId, first.requestId);
  assert.notEqual(replacement.messageId, first.messageId);

  await rejectsCode(submitJoinRequestHandler({
    uid: 'dev-user',
    data: requestInput({ teamName: 'Already Member FC' }),
  }), 'failed-precondition');
});

test('request review atomically changes request, membership and chat message', async () => {
  const submitted = await submitJoinRequestHandler({
    uid: 'dev-superadmin',
    data: requestInput(),
  });
  const reviewed = await reviewJoinRequestHandler({
    uid: 'dev-league-admin',
    data: {
      leagueId: 'dev-league-active',
      seasonId: 'season-1',
      requestId: submitted.requestId,
      action: 'approve',
      messageId: submitted.messageId,
    },
  });
  assert.equal(reviewed.status, 'approved');

  const [request, season, message, notification] = await Promise.all([
    db.doc(
      'leagues/dev-league-active/seasons/season-1/' +
      `joinRequests/${submitted.requestId}`,
    ).get(),
    db.doc('leagues/dev-league-active/seasons/season-1').get(),
    db.doc(
      `chats/${submitted.chatId}/messages/${submitted.messageId}`,
    ).get(),
    db.doc(
      `chats/${submitted.chatId}/messages/${reviewed.notificationMessageId}`,
    ).get(),
  ]);
  assert.equal(request.data().status, 'approved');
  assert.equal(season.data().members['dev-superadmin'].role, 'member');
  assert.equal(season.data().members['dev-superadmin'].teamName, 'Request FC');
  assert.equal(message.data().requestStatus, 'approved');
  assert.equal(notification.data().isSystemMessage, true);

  await rejectsCode(reviewJoinRequestHandler({
    uid: 'dev-league-admin',
    data: {
      leagueId: 'dev-league-active',
      seasonId: 'season-1',
      requestId: submitted.requestId,
      action: 'approve',
    },
  }), 'failed-precondition');
});

test('review rejects invalid action, wrong message and non-admin actor', async () => {
  const submitted = await submitJoinRequestHandler({
    uid: 'dev-superadmin',
    data: requestInput(),
  });
  const base = {
    leagueId: 'dev-league-active',
    seasonId: 'season-1',
    requestId: submitted.requestId,
  };
  await rejectsCode(reviewJoinRequestHandler({
    uid: 'dev-league-admin',
    data: { ...base, action: 'maybe' },
  }), 'invalid-argument');
  await rejectsCode(reviewJoinRequestHandler({
    uid: 'dev-league-admin',
    data: { ...base, action: 'reject', messageId: 'wrong-message' },
  }), 'invalid-argument');
  await rejectsCode(reviewJoinRequestHandler({
    uid: 'dev-user',
    data: { ...base, action: 'reject' },
  }), 'permission-denied');

  const request = await db.doc(
    'leagues/dev-league-active/seasons/season-1/' +
    `joinRequests/${submitted.requestId}`,
  ).get();
  assert.equal(request.data().status, 'pending');
});

test('approval rechecks duplicate team names without partial writes', async () => {
  const submitted = await submitJoinRequestHandler({
    uid: 'dev-superadmin',
    data: requestInput({ teamName: 'Race FC' }),
  });
  await db.doc('leagues/dev-league-active/seasons/season-1').update({
    'members.dev-user.teamName': 'race fc',
  });

  await rejectsCode(reviewJoinRequestHandler({
    uid: 'dev-league-admin',
    data: {
      leagueId: 'dev-league-active',
      seasonId: 'season-1',
      requestId: submitted.requestId,
      action: 'approve',
    },
  }), 'already-exists');

  const [request, season, message] = await Promise.all([
    db.doc(
      'leagues/dev-league-active/seasons/season-1/' +
      `joinRequests/${submitted.requestId}`,
    ).get(),
    db.doc('leagues/dev-league-active/seasons/season-1').get(),
    db.doc(
      `chats/${submitted.chatId}/messages/${submitted.messageId}`,
    ).get(),
  ]);
  assert.equal(request.data().status, 'pending');
  assert.equal(season.data().members['dev-superadmin'], undefined);
  assert.equal(message.data().requestStatus, 'pending');
});
