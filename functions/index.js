const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const cors = require("cors")({ origin: true });
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

if (admin.apps.length === 0) {
    initializeApp();
}
const db = getFirestore();


// --- INICIO DE LA NUEVA FUNCIÓN PARA CREAR DOCUMENTOS DE PERFIL ---
/**
 * Se llama desde el cliente DESPUÉS de que el usuario se ha creado en Auth.
 * Se encarga de crear los documentos en Firestore de forma segura.
 */
exports.createProfileDocuments = onCall(
    { 
        region: "us-central1", 
        cors: ["https://fantasya-app.vercel.app", "http://localhost:5173"] 
    },
    async (request) => {
        const { username } = request.data;
        const userId = request.auth?.uid;
        const email = request.auth?.token.email;

        if (!userId || !email) {
            throw new HttpsError("unauthenticated", "El usuario debe estar autenticado para crear un perfil.");
        }
        if (!username) {
            throw new HttpsError("invalid-argument", "El nombre de usuario es obligatorio.");
        }

        const usernameDocRef = db.doc(`usernames/${username.toLowerCase()}`);
        const userDocRef = db.doc(`users/${userId}`);

        try {
            const usernameDoc = await usernameDocRef.get();
            if (usernameDoc.exists) {
                // Si el nombre de usuario ya existe, borramos el usuario de Auth para que pueda reintentar.
                await admin.auth().deleteUser(userId);
                throw new HttpsError("already-exists", "Este nombre de usuario ya está cogido. Por favor, elige otro.");
            }

            const batch = db.batch();
            
            batch.set(userDocRef, {
                username: username.toLowerCase(),
                email: email,
                createdAt: FieldValue.serverTimestamp(),
                photoURL: '',
                bio: '',
                xp: 0,
                followers: [],
                following: []
            });

            batch.set(usernameDocRef, { userId: userId });
            
            await batch.commit();

            return { success: true, message: "Perfil creado correctamente." };

        } catch (error) {
            logger.error(`Error creating profile for user ${userId}:`, error);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError("internal", "No se pudo crear el perfil en la base de datos.");
        }
    }
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

exports.unlinkUserFromTeam = onCall({ region: "us-central1", cors: ["https://fantasya-app.vercel.app", "http://localhost:5173"] }, async (request) => {
    const adminUid = request.auth?.uid;
    if (!adminUid) throw new HttpsError("unauthenticated", "La función debe ser llamada por un usuario autenticado.");
    const { leagueId, seasonId, userIdToUnlink } = request.data;
    if (!leagueId || !seasonId || !userIdToUnlink) throw new HttpsError("invalid-argument", "Faltan parámetros (leagueId, seasonId, userIdToUnlink).");
    const seasonRef = db.doc(`leagues/${leagueId}/seasons/${seasonId}`);
    try {
        const seasonDoc = await seasonRef.get();
        if (!seasonDoc.exists) throw new HttpsError("not-found", "La temporada no existe.");
        const seasonData = seasonDoc.data();
        const adminUser = seasonData.members[adminUid];
        const leagueOwnerId = seasonData.ownerId;
        if (!adminUser || (adminUser.role !== 'admin' && adminUid !== leagueOwnerId)) throw new HttpsError("permission-denied", "Debes ser administrador o propietario para realizar esta acción.");
        if (userIdToUnlink === leagueOwnerId) throw new HttpsError("permission-denied", "No se puede desvincular al propietario de la liga.");
        const userToUnlink = seasonData.members[userIdToUnlink];
        if (!userToUnlink) throw new HttpsError("not-found", "El usuario a desvincular no se encuentra en esta liga.");
        logger.info(`UNLINK START: Admin ${adminUid} is unlinking user ${userIdToUnlink}.`);
        const batch = db.batch();
        const placeholderId = `placeholder_${userIdToUnlink}`;
        const teamNameToPreserve = userToUnlink.teamName;
        const pointsToPreserve = userToUnlink.totalPoints || 0;
        const playersToPreserve = userToUnlink.players || [];
        const placeholderData = { teamName: teamNameToPreserve, totalPoints: pointsToPreserve, players: playersToPreserve, isPlaceholder: true };
        const userAchievementRef = db.doc(`users/${userIdToUnlink}/achievements/${seasonId}`);
        const placeholderAchievementRef = seasonRef.collection("achievements").doc(placeholderId);
        const userAchievementDoc = await userAchievementRef.get();
        if (userAchievementDoc.exists) {
            batch.set(placeholderAchievementRef, userAchievementDoc.data());
            batch.delete(userAchievementRef);
        }
        const transfersRef = seasonRef.collection("transfers");
        const buyerQuery = transfersRef.where('buyerId', '==', userIdToUnlink);
        const sellerQuery = transfersRef.where('sellerId', '==', userIdToUnlink);
        const [buyerSnapshot, sellerSnapshot] = await Promise.all([buyerQuery.get(), sellerQuery.get()]);
        buyerSnapshot.forEach(doc => batch.update(doc.ref, { buyerId: placeholderId, buyerName: teamNameToPreserve }));
        sellerSnapshot.forEach(doc => batch.update(doc.ref, { sellerId: placeholderId, sellerName: teamNameToPreserve }));
        const roundsRef = seasonRef.collection("rounds");
        const roundsSnapshot = await roundsRef.get();
        roundsSnapshot.forEach(roundDoc => {
            const roundData = roundDoc.data();
            if (roundData.scores && roundData.scores[userIdToUnlink] !== undefined) {
                batch.update(roundDoc.ref, {
                    [`scores.${placeholderId}`]: roundData.scores[userIdToUnlink],
                    [`scores.${userIdToUnlink}`]: FieldValue.delete()
                });
            }
        });
        const lineupsRef = seasonRef.collection("lineups");
        const allLineupsSnapshot = await lineupsRef.get();
        allLineupsSnapshot.forEach(lineupDoc => {
            if (lineupDoc.id.endsWith(`-${userIdToUnlink}`)) {
                const roundId = lineupDoc.id.substring(0, lineupDoc.id.lastIndexOf('-'));
                const newLineupId = `${roundId}-${placeholderId}`;
                const newLineupRef = lineupsRef.doc(newLineupId);
                batch.set(newLineupRef, lineupDoc.data());
                batch.delete(lineupDoc.ref);
            }
        });
        batch.update(seasonRef, {
            [`members.${placeholderId}`]: placeholderData,
            [`members.${userIdToUnlink}`]: FieldValue.delete()
        });
        await batch.commit();
        logger.info(`UNLINK SUCCESS: User ${userIdToUnlink} is now a clean placeholder: ${placeholderId}.`);
        return { success: true, message: "Usuario desvinculado y convertido en equipo fantasma correctamente." };
    } catch (error) {
        logger.error("Error in unlinkUserFromTeam:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", "Ha ocurrido un error interno al desvincular al usuario.");
    }
});

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
 */
const POSITION_MAP = {
    "Goalkeeper": "POR",
    "Defender": "DEF",
    "Midfielder": "MED",
    "Forward": "DEL"
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
    "Real Betis": "Real Betis",
    "Real Sociedad": "Real Sociedad",
    "Villarreal CF": "Villarreal",
    "Valencia CF": "Valencia",
    "RC Celta": "Celta",
    "CA Osasuna": "Osasuna",
    "Getafe CF": "Getafe",
    "CD Leganés": "Leganés",
    "Levante UD": "Levante",
    "Real Valladolid CF": "Valladolid",
    "SD Eibar": "Eibar",
    "RCD Espanyol": "Espanyol",
    "Deportivo Alavés": "Alavés",
    "Granada CF": "Granada",
    "Mallorca": "Mallorca"
};

/**
 * Sync La Liga players from football-data.org to Firestore
 * HTTP function with CORS support
 */
exports.syncLaLigaPlayers = onRequest(
    {
        region: "us-central1",
        cors: true
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
            const decoded = await admin.auth().verifyIdToken(token);
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

            // Step 1: Fetch La Liga teams
            logger.info("Fetching La Liga teams from football-data.org");
            const teamsResponse = await fetch(`${FOOTBALL_API_BASE}/competitions/${LA_LIGA_ID}/teams`, {
                headers: { "X-Auth-Token": API_KEY }
            });

            if (!teamsResponse.ok) {
                throw new Error(`API Error fetching teams: ${teamsResponse.status} ${teamsResponse.statusText}`);
            }

            const teamsData = await teamsResponse.json();
            const teams = teamsData.teams || [];
            logger.info(`Found ${teams.length} teams in La Liga`);

            // Step 2: Fetch players for each team
            const allPlayers = [];
            let totalPlayersFetched = 0;

            for (const team of teams) {
                logger.info(`Fetching players for ${team.name}`);
                const playersResponse = await fetch(`${FOOTBALL_API_BASE}/teams/${team.id}/players`, {
                    headers: { "X-Auth-Token": API_KEY }
                });

                if (!playersResponse.ok) {
                    logger.warn(`Failed to fetch players for ${team.name}: ${playersResponse.status}`);
                    continue;
                }

                const playersData = await playersResponse.json();
                const players = playersData.players || [];

                for (const player of players) {
                    const fantasyaTeam = TEAM_NAME_MAP[player.currentTeam?.name] || player.currentTeam?.name;
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
                        shirtNumber: player.shirtNumber || null,
                        lastUpdated: FieldValue.serverTimestamp(),
                        // History tracking
                        teamHistory: [{
                            team: fantasyaTeam,
                            since: new Date().toISOString()
                        }],
                        positionHistory: [{
                            position: fantasyaPosition,
                            since: new Date().toISOString()
                        }]
                    });

                    totalPlayersFetched++;
                }

                // Respect API rate limit (10 requests per minute)
                // Sleep 6.5 seconds between requests to stay under limit
                await new Promise(resolve => setTimeout(resolve, 6500));
            }

            logger.info(`Total players fetched: ${totalPlayersFetched}`);

            // Step 3: Batch write to Firestore
            const batchSize = 500;
            const batches = Math.ceil(allPlayers.length / batchSize);

            for (let i = 0; i < batches; i++) {
                const batch = db.batch();
                const start = i * batchSize;
                const end = Math.min(start + batchSize, allPlayers.length);

                for (let j = start; j < end; j++) {
                    const player = allPlayers[j];
                    const playerRef = db.doc(`laLigaPlayers/${player.id}`);

                    // Check if player exists to preserve history
                    const existingDoc = await playerRef.get();
                    if (existingDoc.exists) {
                        const existingData = existingDoc.data();
                        const currentTeam = player.team;
                        const currentPosition = player.position;

                        // Only update history if team or position changed
                        let newTeamHistory = existingData.teamHistory || [];
                        let newPositionHistory = existingData.positionHistory || [];

                        const lastTeamEntry = newTeamHistory[newTeamHistory.length - 1];
                        const lastPositionEntry = newPositionHistory[newPositionHistory.length - 1];

                        if (lastTeamEntry && lastTeamEntry.team !== currentTeam) {
                            newTeamHistory.push({
                                team: currentTeam,
                                since: new Date().toISOString()
                            });
                        }

                        if (lastPositionEntry && lastPositionEntry.position !== currentPosition) {
                            newPositionHistory.push({
                                position: currentPosition,
                                since: new Date().toISOString()
                            });
                        }

                        player.teamHistory = newTeamHistory;
                        player.positionHistory = newPositionHistory;
                    }

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
        cors: true
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
            const decoded = await admin.auth().verifyIdToken(token);
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