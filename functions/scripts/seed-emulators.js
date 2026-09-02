const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const {
  Timestamp,
  getFirestore,
} = require('firebase-admin/firestore');
const {
  DEMO_PROJECT_ID,
  assertEmulatorEnvironment,
} = require('../lib/emulator-guard');

const PASSWORD = 'FantasyaDev1!';
const USERS = [
  {
    uid: 'dev-superadmin',
    email: 'superadmin@fantasya.local',
    username: 'superadmin',
    appRole: 'superadmin',
  },
  {
    uid: 'dev-league-admin',
    email: 'league-admin@fantasya.local',
    username: 'leagueadmin',
    appRole: 'user',
  },
  {
    uid: 'dev-user',
    email: 'user@fantasya.local',
    username: 'user',
    appRole: 'user',
  },
];

function ensureAdminApp() {
  if (getApps().length === 0) {
    initializeApp({
      projectId: DEMO_PROJECT_ID,
      storageBucket: DEMO_PROJECT_ID + '.appspot.com',
    });
  }
}

async function upsertAuthUser(auth, user) {
  try {
    await auth.getUser(user.uid);
    await auth.updateUser(user.uid, {
      email: user.email,
      password: PASSWORD,
      emailVerified: true,
      displayName: user.username,
    });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      password: PASSWORD,
      emailVerified: true,
      displayName: user.username,
    });
  }
}

async function seedEmulators() {
  assertEmulatorEnvironment();
  ensureAdminApp();

  const auth = getAuth();
  const db = getFirestore();
  await Promise.all(USERS.map((user) => upsertAuthUser(auth, user)));

  const fixedDate = Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'));
  const batch = db.batch();
  for (const user of USERS) {
    batch.set(db.doc('users/' + user.uid), {
      username: user.username,
      email: user.email,
      appRole: user.appRole,
      createdAt: fixedDate,
      photoURL: '',
      bio: 'Perfil local ' + user.username,
      xp: user.uid === 'dev-league-admin' ? 10 : user.uid === 'dev-user' ? 100 : 0,
      followers: user.uid === 'dev-user' ? ['dev-league-admin'] : [],
      following: user.uid === 'dev-league-admin' ? ['dev-user'] : [],
      pinnedTrophies: [],
      savedPosts: user.uid === 'dev-user' ? ['dev-post'] : [],
    }, { merge: true });
    batch.set(db.doc('usernames/' + user.username), {
      userId: user.uid,
    });
  }

  batch.set(db.doc('leagues/dev-league-active'), {
    name: 'Liga Local Activa',
    ownerId: 'dev-league-admin',
    activeSeason: 'season-1',
    rules: 'Datos exclusivos del emulador.',
    createdAt: fixedDate,
  }, { merge: true });

  batch.set(db.doc('leagues/dev-league-active/seasons/season-1'), {
    name: 'Temporada Local',
    seasonNumber: 1,
    status: 'Activa',
    archived: false,
    currentRound: 1,
    inviteCode: 'LOCAL1',
    createdAt: fixedDate,
    members: {
      'dev-league-admin': {
        username: 'leagueadmin',
        teamName: 'Administradores FC',
        role: 'admin',
        isPlaceholder: false,
        totalPoints: 30,
        finances: { budget: 190, teamValue: 10 },
      },
      'dev-user': {
        username: 'user',
        teamName: 'Usuarios FC',
        role: 'member',
        isPlaceholder: false,
        totalPoints: 20,
        finances: { budget: 195, teamValue: 5 },
      },
      'placeholder-rival': {
        teamName: 'Equipo Fantasma',
        role: 'member',
        isPlaceholder: true,
        totalPoints: 10,
        finances: { budget: 200, teamValue: 0 },
      },
    },
  }, { merge: true });

  batch.set(db.doc('leagues/dev-league-archived'), {
    name: 'Liga Local Archivada',
    ownerId: 'dev-league-admin',
    activeSeason: 'season-1',
    createdAt: fixedDate,
  }, { merge: true });

  batch.set(db.doc('leagues/dev-league-archived/seasons/season-1'), {
    name: 'Temporada Archivada',
    seasonNumber: 1,
    status: 'Finalizada',
    archived: true,
    inviteCode: 'OLD001',
    members: {
      'dev-league-admin': {
        username: 'leagueadmin',
        teamName: 'Históricos FC',
        role: 'admin',
        totalPoints: 100,
        finances: { budget: 150, teamValue: 50 },
      },
    },
  }, { merge: true });

  batch.set(db.doc('players/dev-player'), {
    name: 'Jugador Local',
    teamHistory: [{ teamName: 'Real Madrid', startDate: fixedDate, endDate: null }],
    positionHistory: [{ position: 'Delantero', startDate: fixedDate, endDate: null }],
  }, { merge: true });

  batch.set(db.doc('posts/dev-post'), {
    authorId: 'dev-league-admin',
    authorUsername: 'leagueadmin',
    authorPhotoURL: null,
    content: 'Publicación local determinista',
    imageURL: null,
    tags: ['local'],
    likes: ['dev-user'],
    createdAt: fixedDate,
  }, { merge: true });

  batch.set(db.doc('posts/dev-post/comments/dev-comment'), {
    authorId: 'dev-user',
    authorUsername: 'user',
    authorPhotoURL: null,
    content: 'Comentario local',
    likes: [],
    createdAt: fixedDate,
  }, { merge: true });

  batch.set(db.doc('posts/dev-post/comments/dev-comment/replies/dev-reply'), {
    authorId: 'dev-league-admin',
    authorUsername: 'leagueadmin',
    authorPhotoURL: null,
    content: 'Respuesta local',
    createdAt: fixedDate,
  }, { merge: true });

  batch.set(db.doc('users/dev-league-admin/xpEvents/post:dev-post'), {
    amount: 10,
    source: 'post',
    createdAt: fixedDate,
  });

  const trophyData = {
    seasonName: 'Temporada Local',
    leagueName: 'Liga Local Activa',
    trophies: [{
      trophyId: 'CHAMPION',
      name: 'Campeón',
      description: 'Campeón de la temporada local.',
    }],
    isPlaceholder: false,
    teamName: 'Usuarios FC',
  };
  batch.set(
    db.doc('leagues/dev-league-active/seasons/season-1/achievements/dev-user'),
    trophyData,
  );
  batch.set(db.doc('users/dev-user/achievements/season-1'), trophyData);
  batch.set(db.doc('career_achievements/dev-user'), {
    SEASONS_PLAYED_3: { current: 1 },
    CHAMPIONSHIPS_WON_3: { current: 1 },
    TOTAL_POINTS_50000: { current: 0 },
    TOTAL_TRANSFERS_100: { current: 0 },
    POSTS_CREATED_50: { current: 0 },
    LIKES_RECEIVED_500: { current: 0 },
  });

  batch.set(db.doc('leagues/dev-league-active/seasons/season-1/challenges/dev-challenge'), {
    title: 'Reto local',
    description: 'Escenario determinista de hazaña.',
    targetType: 'single',
    targetUsers: ['dev-user'],
    status: 'completed',
    winners: [{ uid: 'dev-user', teamName: 'Usuarios FC' }],
  });
  batch.set(db.doc('users/dev-user/feats/dev-challenge'), {
    instances: [{
      leagueId: 'dev-league-active',
      seasonId: 'season-1',
      leagueName: 'Liga Local Activa',
      seasonName: 'Temporada Local',
      challengeTitle: 'Reto local',
      description: 'Escenario determinista de hazaña.',
      date: fixedDate,
    }],
  });

  batch.set(db.doc('chats/dev-league-admin_dev-user'), {
    participants: ['dev-league-admin', 'dev-user'],
    createdAt: fixedDate,
    lastMessage: 'Mensaje local',
    lastMessageTimestamp: fixedDate,
  });
  batch.set(db.doc('chats/dev-league-admin_dev-user/messages/dev-message'), {
    senderId: 'dev-league-admin',
    text: 'Mensaje local',
    createdAt: fixedDate,
    read: false,
  });

  batch.set(db.doc('config/laLigaSync'), {
    status: 'never_synced',
    playersCount: 0,
    seededAt: fixedDate,
  }, { merge: true });

  await batch.commit();
  return { users: USERS.length };
}

if (require.main === module) {
  seedEmulators()
    .then(({ users }) => console.log('Seeded demo-fantasya with ' + users + ' users.'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  PASSWORD,
  USERS,
  seedEmulators,
};
