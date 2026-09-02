const fixture = require('../fixtures/la-liga.json');
const { db, FieldValue } = require('./firebase');
const { requireDocumentId } = require('./league-authz');

const FOOTBALL_API_BASE = 'https://api.football-data.org/v4';

const POSITION_MAP = Object.freeze({
  Goalkeeper: 'POR',
  Defence: 'DEF',
  'Centre-Back': 'DEF',
  'Left-Back': 'DEF',
  'Right-Back': 'DEF',
  Defender: 'DEF',
  Midfield: 'MED',
  'Central Midfield': 'MED',
  'Attacking Midfield': 'MED',
  'Defensive Midfield': 'MED',
  Midfielder: 'MED',
  Forward: 'DEL',
  Offence: 'DEL',
  'Centre-Forward': 'DEL',
  'Left Winger': 'DEL',
  'Right Winger': 'DEL',
  Striker: 'DEL',
});

const TEAM_NAME_MAP = Object.freeze({
  'Real Madrid CF': 'Real Madrid',
  'FC Barcelona': 'Barcelona',
  'Atlético de Madrid': 'Atlético de Madrid',
  'Athletic Club': 'Athletic Club',
  'Sevilla FC': 'Sevilla',
  'Real Betis Balompié': 'Real Betis',
  'Real Betis': 'Real Betis',
  'Real Sociedad de Fútbol': 'Real Sociedad',
  'Real Sociedad': 'Real Sociedad',
  'Villarreal CF': 'Villarreal',
  'Valencia CF': 'Valencia',
  'RC Celta': 'Celta',
  'RC Celta de Vigo': 'Celta',
  'CA Osasuna': 'Osasuna',
  'Getafe CF': 'Getafe',
  'CD Leganés': 'Leganés',
  'Levante UD': 'Levante',
  'Real Valladolid CF': 'Valladolid',
  'SD Eibar': 'Eibar',
  'RCD Espanyol': 'Espanyol',
  'RCD Espanyol de Barcelona': 'Espanyol',
  'Deportivo Alavés': 'Alavés',
  'Granada CF': 'Granada',
  'Rayo Vallecano de Madrid': 'Rayo Vallecano',
  'Málaga CF': 'Málaga CF',
  'Racing de Santander': 'Racing de Santander',
  'Deportivo La Coruña': 'Deportivo La Coruña',
  'UD Las Palmas': 'Las Palmas',
  'UD Almería': 'Almería',
  'Cádiz CF': 'Cádiz',
  'Elche CF': 'Elche',
});

function appendHistory(existing, key, value, since) {
  const history = Array.isArray(existing) ? [...existing] : [];
  if (history.at(-1)?.[key] !== value) history.push({ [key]: value, since });
  return history;
}

function normalizePlayer(player, teamName, existing = {}, nowIso) {
  const id = String(player?.id ?? '').trim();
  const name = String(player?.name ?? '').trim();
  if (!id || id.includes('/') || !name) {
    throw new Error('Football API returned a player without a valid id or name.');
  }
  const team = TEAM_NAME_MAP[teamName] || String(teamName || '').trim();
  if (!team) throw new Error('Football API returned a player without a team.');
  const position = POSITION_MAP[player.position] || 'MED';
  const since = nowIso || new Date().toISOString();

  return {
    id: player.id,
    name,
    firstName: player.firstName || '',
    lastName: player.lastName || '',
    dateOfBirth: player.dateOfBirth || null,
    nationality: player.nationality || null,
    position,
    team,
    shirtNumber: player.shirtNumber || null,
    lastUpdated: FieldValue.serverTimestamp(),
    teamHistory: appendHistory(existing.teamHistory, 'team', team, since),
    positionHistory: appendHistory(
      existing.positionHistory,
      'position',
      position,
      since,
    ),
  };
}

async function loadLiveTeams({ apiKey, fetchImpl = fetch, sleep }) {
  if (!apiKey) throw new Error('FOOTBALL_DATA_API_KEY is not configured.');
  const wait = sleep || ((milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const competition = await fetchImpl(
    FOOTBALL_API_BASE + '/competitions/PD/teams',
    { headers: { 'X-Auth-Token': apiKey } },
  );
  if (!competition.ok) {
    throw new Error('Football API competition returned ' + competition.status + '.');
  }
  const summary = await competition.json();
  if (!Array.isArray(summary.teams) || summary.teams.length === 0) {
    throw new Error('Football API returned no La Liga teams.');
  }

  const teams = [];
  for (const [index, team] of summary.teams.entries()) {
    let response = await fetchImpl(FOOTBALL_API_BASE + '/teams/' + team.id, {
      headers: { 'X-Auth-Token': apiKey },
    });
    let retried = false;
    if (response.status === 429) {
      retried = true;
      await wait(30000);
      response = await fetchImpl(FOOTBALL_API_BASE + '/teams/' + team.id, {
        headers: { 'X-Auth-Token': apiKey },
      });
    }
    if (!response.ok) {
      throw new Error(
        'Football API team ' + team.id + ' returned ' + response.status +
          (retried ? ' after retry.' : '.'),
      );
    }
    const detail = await response.json();
    if (!Array.isArray(detail.squad) || detail.squad.length === 0) {
      throw new Error('Football API team ' + team.id + ' returned no squad.');
    }
    teams.push({
      id: detail.id || team.id,
      name: detail.name || team.name,
      squad: detail.squad,
    });
    if (index < summary.teams.length - 1) await wait(6500);
  }
  return teams;
}

async function buildNormalizedPlayers(teams, nowIso) {
  const existing = await db.collection('laLigaPlayers').get();
  const existingById = new Map(
    existing.docs.map((snapshot) => [snapshot.id, snapshot.data()]),
  );
  const ids = new Set();
  const players = [];

  for (const team of teams) {
    if (!Array.isArray(team.squad)) {
      throw new Error('Player sync received a team without a squad.');
    }
    for (const player of team.squad) {
      const id = String(player?.id ?? '').trim();
      if (ids.has(id)) throw new Error('Duplicate football player id: ' + id + '.');
      ids.add(id);
      players.push(normalizePlayer(
        player,
        team.name,
        existingById.get(id),
        nowIso,
      ));
    }
  }
  return players;
}

async function syncPlayers({
  requestedBy,
  source,
  apiKey,
  fetchImpl = fetch,
  sleep,
  now = () => new Date(),
}) {
  const safeRequestedBy = requireDocumentId(requestedBy, 'requestedBy');
  const statusRef = db.doc('config/laLigaSync');
  await statusRef.set({
    status: 'in_progress',
    startedBy: safeRequestedBy,
    startedAt: FieldValue.serverTimestamp(),
    source,
    lastError: FieldValue.delete(),
  }, { merge: true });

  try {
    if (source !== 'fixture' && source !== 'live') {
      throw new Error('Player sync source must be fixture or live.');
    }
    const teams = source === 'fixture'
      ? fixture.teams
      : await loadLiveTeams({ apiKey, fetchImpl, sleep });
    const nowValue = now();
    if (!(nowValue instanceof Date) || Number.isNaN(nowValue.getTime())) {
      throw new Error('Player sync clock returned an invalid date.');
    }
    const players = await buildNormalizedPlayers(teams, nowValue.toISOString());

    for (let offset = 0; offset < players.length; offset += 450) {
      const batch = db.batch();
      for (const player of players.slice(offset, offset + 450)) {
        batch.set(
          db.doc('laLigaPlayers/' + player.id),
          player,
          { merge: true },
        );
      }
      await batch.commit();
    }

    await statusRef.set({
      status: 'completed',
      lastSync: FieldValue.serverTimestamp(),
      playersCount: players.length,
      syncedBy: safeRequestedBy,
      source,
      lastError: FieldValue.delete(),
    }, { merge: true });
    return {
      success: true,
      playersSynced: players.length,
      teamsProcessed: teams.length,
      source,
    };
  } catch (error) {
    await statusRef.set({
      status: 'error',
      lastError: error.message || 'Unknown player sync error.',
      failedAt: FieldValue.serverTimestamp(),
      source,
    }, { merge: true });
    throw error;
  }
}

module.exports = {
  loadLiveTeams,
  normalizePlayer,
  syncPlayers,
};
