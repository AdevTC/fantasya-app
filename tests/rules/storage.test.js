import test, { after, before, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import {
  createRulesEnvironment,
  IDS,
  seedLeagueFixture,
} from './test-env.js';

const SMALL_IMAGE = new Uint8Array([137, 80, 78, 71]);
const TOO_LARGE_IMAGE = new Uint8Array((5 * 1024 * 1024) + 1);

let env;

function objectRef(context, path) {
  return context.storage().ref(path);
}

function uploadImage(context, path, {
  bytes = SMALL_IMAGE,
  contentType = 'image/png',
} = {}) {
  return objectRef(context, path).put(bytes, { contentType });
}

before(async () => {
  env = await createRulesEnvironment();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seedLeagueFixture(env);
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'chats', IDS.chat), {
      participants: [IDS.admin, IDS.member],
    });
  });
});

after(async () => env.cleanup());

test('post images are public but only their owner can write them', async () => {
  const path = `posts/${IDS.member}/owner.png`;
  const owner = env.authenticatedContext(IDS.member);
  const outsider = env.authenticatedContext(IDS.outsider);
  const anonymous = env.unauthenticatedContext();

  await assertSucceeds(uploadImage(owner, path));
  await assertSucceeds(objectRef(anonymous, path).getMetadata());
  await assertFails(uploadImage(
    outsider,
    `posts/${IDS.member}/cross-user.png`,
  ));
  await assertFails(objectRef(outsider, path).delete());
  await assertSucceeds(objectRef(owner, path).delete());
});

test('a superadmin can remove a moderated post image but cannot replace it', async () => {
  const path = `posts/${IDS.member}/moderated.png`;
  const owner = env.authenticatedContext(IDS.member);
  const superadmin = env.authenticatedContext(IDS.superadmin);

  await assertSucceeds(uploadImage(owner, path));
  await assertFails(uploadImage(superadmin, path));
  await assertSucceeds(objectRef(superadmin, path).delete());
});

test('profile pictures use the client path and stay owner-write/public-read', async () => {
  const path = `profile-pictures/${IDS.member}`;
  const owner = env.authenticatedContext(IDS.member);
  const outsider = env.authenticatedContext(IDS.outsider);
  const anonymous = env.unauthenticatedContext();

  await assertSucceeds(uploadImage(owner, path, { contentType: 'image/webp' }));
  await assertSucceeds(objectRef(anonymous, path).getMetadata());
  await assertFails(uploadImage(outsider, path));
  await assertFails(objectRef(outsider, path).delete());
  await assertSucceeds(objectRef(owner, path).delete());
});

test('chat images are available only to participants', async () => {
  const path = `chats/${IDS.chat}/participant.jpg`;
  const member = env.authenticatedContext(IDS.member);
  const admin = env.authenticatedContext(IDS.admin);
  const outsider = env.authenticatedContext(IDS.outsider);

  await assertSucceeds(uploadImage(member, path, {
    contentType: 'image/jpeg',
  }));
  await assertSucceeds(objectRef(admin, path).getMetadata());
  await assertFails(objectRef(outsider, path).getMetadata());
  await assertFails(uploadImage(
    outsider,
    `chats/${IDS.chat}/outsider.png`,
  ));
  await assertSucceeds(objectRef(admin, path).delete());
});

test('season images are authenticated-read and season-admin-write', async () => {
  const path = `season-pictures/${IDS.league}/${IDS.season}`;
  const admin = env.authenticatedContext(IDS.admin);
  const member = env.authenticatedContext(IDS.member);
  const outsider = env.authenticatedContext(IDS.outsider);
  const anonymous = env.unauthenticatedContext();

  await assertSucceeds(uploadImage(admin, path, { contentType: 'image/gif' }));
  await assertSucceeds(objectRef(member, path).getMetadata());
  await assertSucceeds(objectRef(outsider, path).getMetadata());
  await assertFails(objectRef(anonymous, path).getMetadata());
  await assertFails(uploadImage(member, path));
  await assertFails(objectRef(member, path).delete());
  await assertSucceeds(objectRef(admin, path).delete());
});

test('uploads reject unsupported MIME types and files above five MiB', async () => {
  const owner = env.authenticatedContext(IDS.member);

  await assertFails(uploadImage(owner, `posts/${IDS.member}/plain.txt`, {
    contentType: 'text/plain',
  }));
  await assertFails(uploadImage(owner, `posts/${IDS.member}/vector.svg`, {
    contentType: 'image/svg+xml',
  }));
  await assertFails(uploadImage(owner, `posts/${IDS.member}/oversized.png`, {
    bytes: TOO_LARGE_IMAGE,
  }));
});

test('unknown storage paths remain denied', async () => {
  const member = env.authenticatedContext(IDS.member);
  const path = `unknown/${IDS.member}/image.png`;

  await assertFails(uploadImage(member, path));
  await assertFails(objectRef(member, path).getMetadata());
});
