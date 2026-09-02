const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { auth, db, FieldValue } = require('./lib/firebase');
const {
    createProfileDocumentsHandler,
} = require('./handlers/profile');
const { setUserAppRoleHandler } = require('./handlers/roles');
const { unlinkUserFromTeamHandler } = require('./handlers/teams');


// --- INICIO DE LA NUEVA FUNCIÓN PARA CREAR DOCUMENTOS DE PERFIL ---
/**
 * Se llama desde el cliente DESPUÉS de que el usuario se ha creado en Auth.
 * Se encarga de crear los documentos en Firestore de forma segura.
 */
exports.createProfileDocuments = onCall(
    { 
        region: "us-central1", 
        cors: ["https://fantasya-app.vercel.app", "http://127.0.0.1:5173"]
    },
    createProfileDocumentsHandler,
);
// --- FIN DE LA NUEVA FUNCIÓN ---


// MANTÉN TUS OTRAS FUNCIONES COMO ESTABAN
exports.onSeasonJoin = onDocumentUpdated("leagues/{leagueId}/seasons/{seasonId}", async (event) => {
    const afterData = event.data.after.data();
    const beforeData = event.data.before.data();
    const { leagueId, seasonId } = event.params;
    const seasonRef = db.doc(`leagues/${leagueId}/seasons/${seasonId}`);
    for (const userId in afterData.members) {
        if (!beforeData.members[userId] && afterData.members[userId].claimedPlaceholderId) {
            const memberAfter = afterData.members[userId];
            const placeholderId = memberAfter.claimedPlaceholderId;
            if (!beforeData.members[placeholderId] || !beforeData.members[placeholderId].isPlaceholder) {
                logger.error(`Migration FAILED for user ${userId}: Placeholder ${placeholderId} does not exist or is not a placeholder.`);
                await seasonRef.update({ [`members.${userId}.claimedPlaceholderId`]: FieldValue.delete() });
                return;
            }
            logger.info(`MIGRATION START: User ${userId} claiming placeholder ${placeholderId}.`);
            const batch = db.batch();
            const newUserTeamName = memberAfter.teamName;
            if (!newUserTeamName) {
                logger.error(`Migration FAILED for ${userId}: New team name is missing.`);
                return;
            }
            const placeholderAchievementRef = seasonRef.collection("achievements").doc(placeholderId);
            const userAchievementRef = db.doc(`users/${userId}/achievements/${seasonId}`);
            const placeholderAchievementDoc = await placeholderAchievementRef.get();
            if (placeholderAchievementDoc.exists) {
                batch.set(userAchievementRef, placeholderAchievementDoc.data());
                batch.delete(placeholderAchievementRef);
            }
            const transfersRef = seasonRef.collection("transfers");
            const buyerQuery = transfersRef.where('buyerId', '==', placeholderId);
            const sellerQuery = transfersRef.where('sellerId', '==', placeholderId);
            const [buyerSnapshot, sellerSnapshot] = await Promise.all([buyerQuery.get(), sellerQuery.get()]);
            buyerSnapshot.forEach(doc => batch.update(doc.ref, { buyerId: userId, buyerName: newUserTeamName }));
            sellerSnapshot.forEach(doc => batch.update(doc.ref, { sellerId: userId, sellerName: newUserTeamName }));
            const roundsRef = seasonRef.collection("rounds");
            const roundsSnapshot = await roundsRef.get();
            roundsSnapshot.forEach(roundDoc => {
                const roundData = roundDoc.data();
                if (roundData.scores && roundData.scores[placeholderId] !== undefined) {
                    batch.update(roundDoc.ref, {
                        [`scores.${userId}`]: roundData.scores[placeholderId],
                        [`scores.${placeholderId}`]: FieldValue.delete()
                    });
                }
            });
            const lineupsRef = seasonRef.collection("lineups");
            const allLineupsSnapshot = await lineupsRef.get(); 
            allLineupsSnapshot.forEach(lineupDoc => {
                if (lineupDoc.id.endsWith(`-${placeholderId}`)) {
                    const roundId = lineupDoc.id.substring(0, lineupDoc.id.lastIndexOf('-'));
                    const newLineupId = `${roundId}-${userId}`;
                    const newLineupRef = lineupsRef.doc(newLineupId);
                    batch.set(newLineupRef, lineupDoc.data());
                    batch.delete(lineupDoc.ref);
                }
            });
            batch.update(seasonRef, {
                [`members.${placeholderId}`]: FieldValue.delete(),
                [`members.${userId}.claimedPlaceholderId`]: FieldValue.delete(),
            });
            await batch.commit();
            logger.info(`MIGRATION SUCCESS for user ${userId}.`);
            return;
        }
    }
});

exports.unlinkUserFromTeam = onCall(
    {
        region: "us-central1",
        cors: ["https://fantasya-app.vercel.app", "http://127.0.0.1:5173"],
    },
    unlinkUserFromTeamHandler,
);

exports.setUserAppRole = onCall(
    { region: "us-central1" },
    setUserAppRoleHandler,
);

exports.createOrGetChat = onCall({ region: "us-central1", cors: ["https://fantasya-app.vercel.app", "http://localhost:5173"] }, async (request) => {
    const authUserUid = request.auth?.uid;
    const { otherUserUid } = request.data;
    if (!authUserUid) throw new HttpsError("unauthenticated", "Debes estar autenticado para iniciar un chat.");
    if (!otherUserUid) throw new HttpsError("invalid-argument", "Falta el ID del otro usuario.");
    if (authUserUid === otherUserUid) throw new HttpsError("invalid-argument", "No puedes crear un chat contigo mismo.");
    const participants = [authUserUid, otherUserUid].sort();
    const chatId = participants.join('_');
    const chatRef = db.doc(`chats/${chatId}`);
    try {
        const chatDoc = await chatRef.get();
        if (!chatDoc.exists) {
            logger.info(`Creating new chat (${chatId}) between ${authUserUid} and ${otherUserUid}`);
            await chatRef.set({
                participants: participants,
                createdAt: FieldValue.serverTimestamp(),
                lastMessage: ""
            });
        }
        return { chatId };
    } catch (error) {
        logger.error(`Failed to create/get chat for users ${authUserUid} and ${otherUserUid}`, error);
        throw new HttpsError("internal", "Ocurrió un error inesperado al iniciar el chat.");
    }
});

// ============================================================================
// LA LIGA PLAYER SYNC
// ============================================================================

const FOOTBALL_API_BASE = "https://api.football-data.org/v4";
const LA_LIGA_ID = "PD"; // La Liga competition ID in football-data.org
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

/**
 * Position mapping from football-data.org to Fantasya positions
 * API returns specific positions like "Centre-Back", "Central Midfield", etc.
 */
const POSITION_MAP = {
    // Porteros
    "Goalkeeper": "POR",
    // Defensas
    "Defence": "DEF",
    "Centre-Back": "DEF",
    "Left-Back": "DEF",
    "Right-Back": "DEF",
    "Defender": "DEF",
    // Centrocampistas
    "Midfield": "MED",
    "Central Midfield": "MED",
    "Attacking Midfield": "MED",
    "Defensive Midfield": "MED",
    "Midfielder": "MED",
    // Delanteros
    "Forward": "DEL",
    "Offence": "DEL",
    "Centre-Forward": "DEL",
    "Left Winger": "DEL",
    "Right Winger": "DEL",
    "Striker": "DEL"
};

/**
 * Normalize team names to match Fantasya's team IDs/names
 */
const TEAM_NAME_MAP = {
    "Real Madrid CF": "Real Madrid",
    "FC Barcelona": "Barcelona",
    "Atlético de Madrid": "Atlético de Madrid",
    "Athletic Club": "Athletic Club",
    "Sevilla FC": "Sevilla",
    "Real Betis Balompié": "Real Betis",
    "Real Betis": "Real Betis",
    "Real Sociedad de Fútbol": "Real Sociedad",
    "Real Sociedad": "Real Sociedad",
    "Villarreal CF": "Villarreal",
    "Valencia CF": "Valencia",
    "RC Celta": "Celta",
    "RC Celta de Vigo": "Celta",
    "CA Osasuna": "Osasuna",
    "Getafe CF": "Getafe",
    "CD Leganés": "Leganés",
    "Levante UD": "Levante",
    "Real Valladolid CF": "Valladolid",
    "SD Eibar": "Eibar",
    "RCD Espanyol": "Espanyol",
    "RCD Espanyol de Barcelona": "Espanyol",
    "Deportivo Alavés": "Alavés",
    "Granada CF": "Granada",
    "Rayo Vallecano de Madrid": "Rayo Vallecano",
    "Málaga CF": "Málaga CF",
    "Racing de Santander": "Racing de Santander",
    "Deportivo La Coruña": "Deportivo La Coruña",
    "UD Las Palmas": "Las Palmas",
    "Deportivo Alavés": "Alavés",
    "UD Almería": "Almería",
    "Cádiz CF": "Cádiz",
    "Elche CF": "Elche"
};

/**
 * Sync La Liga players from football-data.org to Firestore
 * HTTP function with CORS support
 */
exports.syncLaLigaPlayers = onRequest(
    {
        region: "us-central1",
        cors: ["https://fantasya-app.vercel.app", "http://localhost:5173"],
        timeoutSeconds: 540,
        memory: "1GiB"
    },
    async (req, res) => {
        if (req.method !== 'POST') {
            res.status(405).send('Method not allowed');
            return;
        }

        // Verify authentication from Authorization header
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace('Bearer ', '');

        let userId;
        try {
            const decoded = await auth.verifyIdToken(token);
            userId = decoded.uid;
        } catch (error) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        if (!API_KEY) {
            logger.error("FOOTBALL_DATA_API_KEY not configured");
            res.status(500).json({ error: "La API key no está configurada en el servidor." });
            return;
        }

        logger.info(`Starting La Liga player sync requested by user ${userId}`);

        try {
            // Update sync status to "in_progress"
            const statusRef = db.doc("config/laLigaSync");
            await statusRef.set({
                status: "in_progress",
                startedAt: FieldValue.serverTimestamp(),
                startedBy: userId
            }, { merge: true });

            // Step 1: Fetch La Liga teams with their squads
            logger.info("Fetching La Liga teams from football-data.org");
            const teamsResponse = await fetch(`${FOOTBALL_API_BASE}/competitions/${LA_LIGA_ID}/teams`, {
                headers: { "X-Auth-Token": API_KEY }
            });

            if (!teamsResponse.ok) {
                const errorText = await teamsResponse.text();
                logger.error(`API Error fetching teams: ${teamsResponse.status} - ${errorText}`);
                throw new Error(`API Error fetching teams: ${teamsResponse.status} ${teamsResponse.statusText}`);
            }

            const teamsData = await teamsResponse.json();
            const teams = teamsData.teams || [];
            logger.info(`Found ${teams.length} teams in La Liga`);

            // Step 2: Fetch team details sequentially to respect API rate limit (10 req/min)
            const allPlayers = [];
            const DELAY_BETWEEN_REQUESTS = 6500; // 6.5 seconds between requests

            for (let i = 0; i < teams.length; i++) {
                const team = teams[i];
                logger.info(`Fetching squad ${i + 1}/${teams.length}: ${team.name}`);

                try {
                    const teamResponse = await fetch(`${FOOTBALL_API_BASE}/teams/${team.id}`, {
                        headers: { "X-Auth-Token": API_KEY }
                    });

                    if (!teamResponse.ok) {
                        logger.warn(`Failed to fetch team ${team.name}: ${teamResponse.status}`);
                        // If rate limited, wait longer and retry once
                        if (teamResponse.status === 429) {
                            logger.info(`Rate limited, waiting 30 seconds...`);
                            await new Promise(resolve => setTimeout(resolve, 30000));
                            // Retry
                            const retryResponse = await fetch(`${FOOTBALL_API_BASE}/teams/${team.id}`, {
                                headers: { "X-Auth-Token": API_KEY }
                            });
                            if (!retryResponse.ok) {
                                logger.warn(`Retry failed for ${team.name}: ${retryResponse.status}`);
                                continue;
                            }
                            const retryData = await retryResponse.json();
                            const squad = retryData.squad || [];
                            const teamName = retryData.name;
                            logger.info(`Found ${squad.length} players for ${teamName} (after retry)`);

                            for (const player of squad) {
                                const fantasyaTeam = TEAM_NAME_MAP[teamName] || teamName;
                                const fantasyaPosition = POSITION_MAP[player.position] || "MED";
                                allPlayers.push({
                                    id: player.id,
                                    name: player.name,
                                    firstName: player.firstName || "",
                                    lastName: player.lastName || "",
                                    dateOfBirth: player.dateOfBirth || null,
                                    nationality: player.nationality || null,
                                    position: fantasyaPosition,
                                    team: fantasyaTeam,
                                    shirtNumber: null,
                                    lastUpdated: FieldValue.serverTimestamp(),
                                    teamHistory: [{ team: fantasyaTeam, since: new Date().toISOString() }],
                                    positionHistory: [{ position: fantasyaPosition, since: new Date().toISOString() }]
                                });
                            }
                        }
                        continue;
                    }

                    const teamData = await teamResponse.json();
                    const squad = teamData.squad || [];
                    const teamName = teamData.name;

                    logger.info(`Found ${squad.length} players for ${teamName}`);

                    for (const player of squad) {
                        const fantasyaTeam = TEAM_NAME_MAP[teamName] || teamName;
                        const fantasyaPosition = POSITION_MAP[player.position] || "MED";
                        allPlayers.push({
                            id: player.id,
                            name: player.name,
                            firstName: player.firstName || "",
                            lastName: player.lastName || "",
                            dateOfBirth: player.dateOfBirth || null,
                            nationality: player.nationality || null,
                            position: fantasyaPosition,
                            team: fantasyaTeam,
                            shirtNumber: null,
                            lastUpdated: FieldValue.serverTimestamp(),
                            teamHistory: [{ team: fantasyaTeam, since: new Date().toISOString() }],
                            positionHistory: [{ position: fantasyaPosition, since: new Date().toISOString() }]
                        });
                    }

                    // Wait between requests to respect rate limit (except for last team)
                    if (i < teams.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
                    }
                } catch (error) {
                    logger.error(`Error fetching team ${team.name}:`, error);
                }
            }

            logger.info(`Total players fetched: ${allPlayers.length}`);

            // Step 3: Batch write to Firestore (simplified - no individual reads)
            const batchSize = 500;
            const batches = Math.ceil(allPlayers.length / batchSize);

            for (let i = 0; i < batches; i++) {
                const batch = db.batch();
                const start = i * batchSize;
                const end = Math.min(start + batchSize, allPlayers.length);

                for (let j = start; j < end; j++) {
                    const player = allPlayers[j];
                    const playerRef = db.doc(`laLigaPlayers/${player.id}`);
                    batch.set(playerRef, player, { merge: true });
                }

                await batch.commit();
                logger.info(`Committed batch ${i + 1}/${batches}`);
            }

            // Update sync status to "completed"
            await statusRef.set({
                status: "completed",
                lastSync: FieldValue.serverTimestamp(),
                playersCount: allPlayers.length,
                syncedBy: userId
            }, { merge: true });

            logger.info(`La Liga player sync completed successfully. ${allPlayers.length} players synced.`);

            res.json({
                success: true,
                playersSynced: allPlayers.length,
                teamsProcessed: teams.length,
                message: `Sincronización completada: ${allPlayers.length} jugadores actualizados.`
            });

        } catch (error) {
            logger.error("Error syncing La Liga players:", error);

            // Update sync status to "error"
            const statusRef = db.doc("config/laLigaSync");
            await statusRef.set({
                status: "error",
                lastError: error.message,
                failedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            res.status(500).json({ error: `Error al sincronizar jugadores: ${error.message}` });
        }
    }
);

/**
 * Get the current sync status of La Liga players
 * HTTP function with CORS support
 */
exports.getLaLigaSyncStatus = onRequest(
    {
        region: "us-central1",
        cors: ["https://fantasya-app.vercel.app", "http://localhost:5173"]
    },
    async (req, res) => {
        // CORS is handled by the cors option
        if (req.method !== 'POST') {
            res.status(405).send('Method not allowed');
            return;
        }

        // Verify authentication from Authorization header
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace('Bearer ', '');

        let userId;
        try {
            const decoded = await auth.verifyIdToken(token);
            userId = decoded.uid;
        } catch (error) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        try {
            const statusDoc = await db.doc("config/laLigaSync").get();

            if (!statusDoc.exists) {
                res.json({
                    status: "never_synced",
                    lastSync: null,
                    playersCount: 0
                });
                return;
            }

            const data = statusDoc.data();
            res.json({
                status: data.status || "unknown",
                lastSync: data.lastSync || data.startedAt || null,
                playersCount: data.playersCount || 0,
                lastError: data.lastError || null
            });
        } catch (error) {
            logger.error("Error getting sync status:", error);
            res.status(500).json({ error: "Error al obtener el estado de sincronización." });
        }
    }
);
