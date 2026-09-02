import test, { after, before, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  createRulesEnvironment,
  IDS,
  seedLeagueFixture,
} from './test-env.js';

const POST_ID = 'social-post';
const COMMENT_ID = 'social-comment';
const REPLY_ID = 'social-reply';

let env;

before(async () => {
  env = await createRulesEnvironment();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seedLeagueFixture(env);
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const now = new Date('2026-09-02T00:00:00.000Z');
    await Promise.all([
      setDoc(doc(db, 'users', IDS.member), {
        username: 'member',
        email: 'member@example.test',
        appRole: 'user',
        xp: 0,
        createdAt: now,
        bio: '',
        photoURL: '',
        followers: [],
        following: [],
        savedPosts: [],
        pinnedTrophies: [],
      }),
      setDoc(doc(db, 'chats', IDS.chat), {
        participants: [IDS.admin, IDS.member],
        createdAt: now,
        lastMessage: 'Solicitud',
        lastMessageTimestamp: now,
      }),
      setDoc(doc(db, 'chats', IDS.chat, 'messages', 'join-request'), {
        senderId: IDS.member,
        text: 'Quiero entrar',
        createdAt: now,
        read: false,
        isJoinRequest: true,
        requestId: IDS.member,
        leagueId: IDS.league,
        seasonId: IDS.season,
        requestStatus: 'pending',
      }),
      setDoc(doc(db, 'posts', POST_ID), {
        authorId: IDS.admin,
        authorUsername: 'leagueadmin',
        authorPhotoURL: null,
        content: 'Publicación',
        imageURL: null,
        tags: ['local'],
        likes: [],
        createdAt: now,
      }),
      setDoc(doc(db, 'posts', POST_ID, 'comments', COMMENT_ID), {
        authorId: IDS.member,
        authorUsername: 'member',
        authorPhotoURL: null,
        content: 'Comentario',
        likes: [],
        createdAt: now,
      }),
      setDoc(doc(
        db,
        'posts',
        POST_ID,
        'comments',
        COMMENT_ID,
        'replies',
        REPLY_ID,
      ), {
        authorId: IDS.admin,
        authorUsername: 'leagueadmin',
        authorPhotoURL: null,
        content: 'Respuesta',
        createdAt: now,
      }),
    ]);
  });
});

after(async () => env.cleanup());

test('only participants can read a chat and its messages', async () => {
  const memberDb = env.authenticatedContext(IDS.member).firestore();
  const outsiderDb = env.authenticatedContext(IDS.outsider).firestore();
  await assertSucceeds(getDoc(doc(memberDb, 'chats', IDS.chat)));
  await assertSucceeds(getDocs(collection(
    memberDb,
    'chats',
    IDS.chat,
    'messages',
  )));
  await assertFails(getDoc(doc(outsiderDb, 'chats', IDS.chat)));
  await assertFails(getDocs(collection(
    outsiderDb,
    'chats',
    IDS.chat,
    'messages',
  )));
});

test('participant can send ordinary messages but cannot forge server events', async () => {
  const memberDb = env.authenticatedContext(IDS.member).firestore();
  const messages = collection(memberDb, 'chats', IDS.chat, 'messages');
  const now = new Date();
  await assertSucceeds(addDoc(messages, {
    senderId: IDS.member,
    senderUsername: 'member',
    text: 'Hola',
    createdAt: now,
    read: false,
    imageUrl: '',
  }));
  await assertFails(addDoc(messages, {
    senderId: IDS.admin,
    text: 'Suplantación',
    createdAt: now,
    read: false,
  }));
  await assertFails(addDoc(messages, {
    senderId: IDS.member,
    senderUsername: 'leagueadmin',
    text: 'Nombre suplantado',
    createdAt: now,
    read: false,
  }));
  await assertFails(addDoc(messages, {
    senderId: IDS.member,
    text: 'Solicitud falsa',
    createdAt: now,
    read: false,
    isJoinRequest: true,
    requestStatus: 'pending',
  }));
  await assertFails(addDoc(messages, {
    senderId: IDS.member,
    text: 'Sistema falso',
    createdAt: now,
    read: false,
    isSystemMessage: true,
  }));
});

test('participants may update previews but not membership or request status', async () => {
  const memberDb = env.authenticatedContext(IDS.member).firestore();
  await assertSucceeds(updateDoc(doc(memberDb, 'chats', IDS.chat), {
    lastMessage: 'Hola',
    lastMessageTimestamp: new Date(),
  }));
  await assertFails(updateDoc(doc(memberDb, 'chats', IDS.chat), {
    participants: [IDS.member, IDS.outsider],
  }));
  await assertFails(updateDoc(doc(
    memberDb,
    'chats',
    IDS.chat,
    'messages',
    'join-request',
  ), { requestStatus: 'approved' }));
  await assertFails(setDoc(doc(memberDb, 'chats', 'client-created'), {
    participants: [IDS.member, IDS.outsider],
    createdAt: new Date(),
  }));
});

test('profile owner can edit only the explicit presentation fields', async () => {
  const memberDb = env.authenticatedContext(IDS.member).firestore();
  const profile = doc(memberDb, 'users', IDS.member);
  await assertSucceeds(updateDoc(profile, {
    bio: 'Bio segura',
    photoURL: 'https://example.test/photo.png',
    pinnedTrophies: ['CHAMPION'],
    savedPosts: [POST_ID],
    following: [IDS.admin],
  }));
  for (const protectedUpdate of [
    { appRole: 'superadmin' },
    { xp: 9999 },
    { username: 'forged' },
    { email: 'forged@example.test' },
    { createdAt: new Date(0) },
    { followers: [IDS.outsider] },
  ]) {
    await assertFails(updateDoc(profile, protectedUpdate));
  }
});

test('a follower can toggle only their own UID', async () => {
  const memberDb = env.authenticatedContext(IDS.member).firestore();
  const target = doc(memberDb, 'users', IDS.admin);
  await assertSucceeds(updateDoc(target, { followers: [IDS.member] }));
  await assertSucceeds(updateDoc(target, { followers: [] }));
  await assertFails(updateDoc(target, { followers: [IDS.outsider] }));
  await assertFails(updateDoc(target, {
    followers: [IDS.member, IDS.member],
  }));
});

test('achievement, feat and career mirrors are server-only', async () => {
  const memberDb = env.authenticatedContext(IDS.member).firestore();
  await assertFails(setDoc(doc(
    memberDb,
    'users',
    IDS.member,
    'achievements',
    IDS.season,
  ), { trophies: [] }));
  await assertFails(setDoc(doc(
    memberDb,
    'users',
    IDS.member,
    'feats',
    'forged',
  ), { instances: [] }));
  await assertFails(setDoc(doc(
    memberDb,
    'career_achievements',
    IDS.member,
  ), { POSTS_CREATED_50: { current: 999 } }));
});

test('post creation, author edits and reactions preserve ownership', async () => {
  const memberDb = env.authenticatedContext(IDS.member).firestore();
  await assertSucceeds(setDoc(doc(memberDb, 'posts', 'member-post'), {
    authorId: IDS.member,
    authorUsername: 'member',
    authorPhotoURL: null,
    content: 'Nuevo',
    imageURL: null,
    tags: [],
    likes: [],
    createdAt: new Date(),
  }));
  await assertFails(setDoc(doc(memberDb, 'posts', 'spoofed-post'), {
    authorId: IDS.admin,
    content: 'Suplantado',
    likes: [],
    createdAt: new Date(),
  }));
  await assertFails(setDoc(doc(memberDb, 'posts', 'preliked-post'), {
    authorId: IDS.member,
    content: 'Preliked',
    likes: [IDS.member],
    createdAt: new Date(),
  }));
  await assertFails(setDoc(doc(memberDb, 'posts', 'spoofed-name-post'), {
    authorId: IDS.member,
    authorUsername: 'leagueadmin',
    content: 'Nombre suplantado',
    likes: [],
    createdAt: new Date(),
  }));

  const seededPost = doc(memberDb, 'posts', POST_ID);
  await assertSucceeds(updateDoc(seededPost, { likes: [IDS.member] }));
  await assertSucceeds(updateDoc(seededPost, { likes: [] }));
  await assertFails(updateDoc(seededPost, { likes: [IDS.outsider] }));
  await assertFails(updateDoc(seededPost, {
    likes: [IDS.member],
    content: 'Cambio combinado',
  }));

  const adminDb = env.authenticatedContext(IDS.admin).firestore();
  await assertSucceeds(updateDoc(doc(adminDb, 'posts', POST_ID), {
    content: 'Editado por autor',
    imageURL: null,
    tags: ['editado'],
  }));
  await assertFails(updateDoc(doc(adminDb, 'posts', POST_ID), {
    authorId: IDS.member,
  }));
});

test('superadmin can moderate posts while a normal outsider cannot', async () => {
  const outsiderDb = env.authenticatedContext(IDS.outsider).firestore();
  await assertFails(deleteDoc(doc(outsiderDb, 'posts', POST_ID)));
  const superadminDb = env.authenticatedContext(IDS.superadmin).firestore();
  await assertSucceeds(deleteDoc(doc(superadminDb, 'posts', POST_ID)));
});

test('comment reactions and author edits are independently bounded', async () => {
  const adminDb = env.authenticatedContext(IDS.admin).firestore();
  const comment = doc(
    adminDb,
    'posts',
    POST_ID,
    'comments',
    COMMENT_ID,
  );
  await assertSucceeds(updateDoc(comment, { likes: [IDS.admin] }));
  await assertFails(updateDoc(comment, {
    likes: [],
    content: 'No soy el autor',
  }));

  const memberDb = env.authenticatedContext(IDS.member).firestore();
  await assertSucceeds(updateDoc(doc(
    memberDb,
    'posts',
    POST_ID,
    'comments',
    COMMENT_ID,
  ), { content: 'Editado por autor' }));
  await assertFails(updateDoc(doc(
    memberDb,
    'posts',
    POST_ID,
    'comments',
    COMMENT_ID,
  ), { authorId: IDS.admin }));
});

test('comment and reply moderation follows author or superadmin', async () => {
  const outsiderDb = env.authenticatedContext(IDS.outsider).firestore();
  await assertFails(deleteDoc(doc(
    outsiderDb,
    'posts',
    POST_ID,
    'comments',
    COMMENT_ID,
  )));
  await assertFails(updateDoc(doc(
    outsiderDb,
    'posts',
    POST_ID,
    'comments',
    COMMENT_ID,
    'replies',
    REPLY_ID,
  ), { content: 'Secuestrada' }));

  const adminDb = env.authenticatedContext(IDS.admin).firestore();
  await assertSucceeds(updateDoc(doc(
    adminDb,
    'posts',
    POST_ID,
    'comments',
    COMMENT_ID,
    'replies',
    REPLY_ID,
  ), { content: 'Editada por autor' }));

  const superadminDb = env.authenticatedContext(IDS.superadmin).firestore();
  await assertSucceeds(deleteDoc(doc(
    superadminDb,
    'posts',
    POST_ID,
    'comments',
    COMMENT_ID,
    'replies',
    REPLY_ID,
  )));
  await assertSucceeds(deleteDoc(doc(
    superadminDb,
    'posts',
    POST_ID,
    'comments',
    COMMENT_ID,
  )));
});
