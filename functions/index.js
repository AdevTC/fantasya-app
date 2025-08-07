const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

// Inicializa la app de administración de Firebase
initializeApp();
const db = getFirestore();

// Esta es la nueva sintaxis para una función que se activa al actualizar un documento
exports.onSeasonJoin = onDocumentUpdated("leagues/{leagueId}/seasons/{seasonId}", async (event) => {
    // Obtenemos los datos de antes y después del cambio
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    
    // Obtenemos los IDs de los parámetros de la ruta
    const {leagueId, seasonId} = event.params;

    logger.info(`Checking season ${seasonId} in league ${leagueId} for new claimed teams.`);

    // Buscamos si se ha añadido un nuevo miembro que haya reclamado un equipo
    for (const userId in afterData.members) {
        const memberAfter = afterData.members[userId];
        const memberBefore = beforeData.members[userId];

        // La condición clave: es un miembro nuevo Y tiene la bandera "claimedPlaceholderId"
        if (!memberBefore && memberAfter.claimedPlaceholderId) {
            const placeholderId = memberAfter.claimedPlaceholderId;
            logger.info(`Starting migration for user ${userId} claiming placeholder ${placeholderId}.`);

            const batch = db.batch();
            const seasonRef = db.doc(`leagues/${leagueId}/seasons/${seasonId}`);
            
            // Obtenemos el nombre del equipo del nuevo usuario para usarlo en los fichajes
            const newUserTeamName = memberAfter.teamName;

            // --- 1. Migrar Logros (Achievements) ---
            const placeholderAchievementRef = seasonRef.collection("achievements").doc(placeholderId);
            const userAchievementRef = db.doc(`users/${userId}/achievements/${seasonId}`);
            const placeholderAchievementDoc = await placeholderAchievementRef.get();
            if (placeholderAchievementDoc.exists) {
                logger.info(`Migrating achievements from ${placeholderId} to ${userId}.`);
                batch.set(userAchievementRef, placeholderAchievementDoc.data());
                batch.delete(placeholderAchievementRef);
            }

            // --- 2. Migrar Fichajes (Transfers) - CORREGIDO ---
            const transfersRef = seasonRef.collection("transfers");
            const buyerQuery = transfersRef.where('buyerId', '==', placeholderId);
            const sellerQuery = transfersRef.where('sellerId', '==', placeholderId);
            
            const [buyerSnapshot, sellerSnapshot] = await Promise.all([buyerQuery.get(), sellerQuery.get()]);

            buyerSnapshot.forEach(doc => {
                logger.info(`Updating transfer (buy) ${doc.id} from ${placeholderId} to ${userId}.`);
                batch.update(doc.ref, { buyerId: userId, buyerName: newUserTeamName });
            });
            sellerSnapshot.forEach(doc => {
                logger.info(`Updating transfer (sell) ${doc.id} from ${placeholderId} to ${userId}.`);
                batch.update(doc.ref, { sellerId: userId, sellerName: newUserTeamName });
            });

            // --- 3. Migrar Puntuaciones de Jornadas (Rounds) ---
            const roundsRef = seasonRef.collection("rounds");
            const roundsSnapshot = await roundsRef.get();
            roundsSnapshot.forEach(roundDoc => {
                const roundData = roundDoc.data();
                if (roundData.scores && roundData.scores[placeholderId] !== undefined) {
                    logger.info(`Migrating score in round ${roundDoc.id} from ${placeholderId} to ${userId}.`);
                    batch.update(roundDoc.ref, {
                        [`scores.${userId}`]: roundData.scores[placeholderId],
                        [`scores.${placeholderId}`]: FieldValue.delete()
                    });
                }
            });
            
            // --- 4. Migrar Alineaciones (Lineups) - CORREGIDO ---
            const lineupsRef = seasonRef.collection("lineups");
            // No podemos hacer una consulta por sufijo de ID, así que obtenemos todas y filtramos
            const allLineupsSnapshot = await lineupsRef.get(); 
            allLineupsSnapshot.forEach(lineupDoc => {
                const docId = lineupDoc.id;
                // El ID del documento de alineación es "roundId-userId"
                if (docId.endsWith(`-${placeholderId}`)) {
                    const roundId = docId.substring(0, docId.lastIndexOf('-'));
                    const newLineupId = `${roundId}-${userId}`;
                    const newLineupRef = lineupsRef.doc(newLineupId);
                    
                    logger.info(`Migrating lineup from ${docId} to ${newLineupId}.`);
                    
                    // Creamos el nuevo documento con los datos del antiguo y borramos el antiguo
                    batch.set(newLineupRef, lineupDoc.data());
                    batch.delete(lineupDoc.ref);
                }
            });

            // --- 5. Limpieza Final ---
            batch.update(seasonRef, {
                [`members.${placeholderId}`]: FieldValue.delete(),
                [`members.${userId}.claimedPlaceholderId`]: FieldValue.delete(),
            });
            
            await batch.commit();
            logger.info(`Migration complete for user ${userId}. Transaction finished.`);
            return;
        }
    }
});
