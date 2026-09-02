import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('membership mutations use only the shared callable API', () => {
  const join = read('src/components/JoinLeagueModal.jsx');
  const request = read('src/components/RequestJoinModal.jsx');
  const admin = read('src/components/AdminTab.jsx');
  const chat = read('src/pages/ChatPage.jsx');
  const api = read('src/services/league-api.js');

  assert.match(join, /joinSeasonByInviteCode/);
  assert.doesNotMatch(join, /runTransaction|members\.\$\{/);
  assert.match(request, /submitJoinRequest/);
  assert.doesNotMatch(request, /joinRequests.*addDoc|setDoc\(chatRef/);
  assert.match(admin, /reviewJoinRequest/);
  assert.match(chat, /reviewJoinRequest/);
  assert.doesNotMatch(admin, /status:\s*['"](?:approved|rejected)['"]/);
  assert.doesNotMatch(chat, /requestStatus:\s*action/);
  assert.match(api, /call\('joinSeasonByInviteCode'/);
  assert.match(api, /call\('submitJoinRequest'/);
  assert.match(api, /call\('reviewJoinRequest'/);
});

test('Functions exports authenticated membership callables', () => {
  const index = read('functions/index.js');

  assert.match(index, /exports\.joinSeasonByInviteCode\s*=\s*onCall/);
  assert.match(index, /exports\.submitJoinRequest\s*=\s*onCall/);
  assert.match(index, /exports\.reviewJoinRequest\s*=\s*onCall/);
  assert.match(index, /requireAuth\(request\)/);
});
