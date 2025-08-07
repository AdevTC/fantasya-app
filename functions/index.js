const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const logger = functions.logger;

// Esta función se activa cada vez que se actualiza un documento de temporada
exports.onSeasonJoin = functions.firestore
    .document("leagues/{leagueId}/seasons/{seasonId}")
    .onUpdate(async (change, context) => {
        const beforeData = change.before.data();
        const afterData = change.after.data();
        const { leagueId, seasonId } = context.params;

        // Buscamos si se ha añadido un nuevo miembro que haya reclamado un equipo
        for (const userId in afterData.members) {
            const memberAfter = afterData.members[userId];
            const memberBefore = beforeData.members[userId];

            // La condición clave: es un miembro nuevo Y tiene la bandera "claimedPlaceholderId"
            if (!memberBefore && memberAfter.claimedPlaceholderId) {
                const placeholderId = memberAfter.claimedPlaceholderId;
                logger.info(`Iniciando migración para el usuario ${userId} que reclama el equipo fantasma ${placeholderId}.`);

                const batch = db.batch();
                const seasonRef = db.doc(`leagues/${leagueId}/seasons/${seasonId}`);

                // --- 1. Migrar Logros (Achievements) ---
                const placeholderAchievementRef = seasonRef.collection("achievements").doc(placeholderId);
                const userAchievementRef = db.doc(`users/${userId}/achievements/${seasonId}`);
                const placeholderAchievementDoc = await placeholderAchievementRef.get();
                if (placeholderAchievementDoc.exists) {
                    logger.info(`Migrando logros de ${placeholderId} a ${userId}.`);
                    batch.set(userAchievementRef, placeholderAchievementDoc.data());
                    batch.delete(placeholderAchievementRef);
                }

                // --- 2. Migrar Fichajes (Transfers) ---
                const transfersRef = seasonRef.collection("transfers");
                const buyerQuery = transfersRef.where('buyerId', '==', placeholderId);
                const sellerQuery = transfersRef.where('sellerId', '==', placeholderId);
                
                const [buyerSnapshot, sellerSnapshot] = await Promise.all([buyerQuery.get(), sellerQuery.get()]);

                buyerSnapshot.forEach(doc => {
                    logger.info(`Actualizando fichaje (compra) ${doc.id} de ${placeholderId} a ${userId}.`);
                    batch.update(doc.ref, { buyerId: userId });
                });
                sellerSnapshot.forEach(doc => {
                    logger.info(`Actualizando fichaje (venta) ${doc.id} de ${placeholderId} a ${userId}.`);
                    batch.update(doc.ref, { sellerId: userId });
                });

                // --- 3. Migrar Puntuaciones de Jornadas (Rounds) ---
                const roundsRef = seasonRef.collection("rounds");
                const roundsSnapshot = await roundsRef.get();
                roundsSnapshot.forEach(roundDoc => {
                    const roundData = roundDoc.data();
                    if (roundData.scores && roundData.scores[placeholderId] !== undefined) {
                        logger.info(`Migrando puntuación en jornada ${roundDoc.id} de ${placeholderId} a ${userId}.`);
                        const newScores = { ...roundData.scores, [userId]: roundData.scores[placeholderId] };
                        delete newScores[placeholderId];
                        batch.update(roundDoc.ref, { scores: newScores });
                    }
                });
                
                // --- 4. Migrar Alineaciones (Lineups) ---
                const lineupsRef = seasonRef.collection("lineups");
                const lineupSnapshot = await lineupsRef.get();
                 for (const lineupDoc of lineupSnapshot.docs) {
                    if (lineupDoc.id.endsWith(`-${placeholderId}`)) {
                        const roundNumber = lineupDoc.id.split('-')[0];
                        const newLineupId = `${roundNumber}-${userId}`;
                        const newLineupRef = lineupsRef.doc(newLineupId);
                        
                        logger.info(`Migrando alineación ${lineupDoc.id} a ${newLineupId}.`);
                        
                        // Copiamos el contenido al nuevo documento y borramos el antiguo
                        batch.set(newLineupRef, lineupDoc.data());
                        batch.delete(lineupDoc.ref);
                    }
                }

                // --- 5. Limpieza Final ---
                // Borramos el equipo fantasma del mapa de miembros y la bandera temporal
                batch.update(seasonRef, {
                    [`members.${placeholderId}`]: admin.firestore.FieldValue.delete(),
                    [`members.${userId}.claimedPlaceholderId`]: admin.firestore.FieldValue.delete(),
                });
                
                // Ejecutamos todas las operaciones en un solo lote
                await batch.commit();
                logger.info(`Migración completada para el usuario ${userId}.`);
                return;
            }
        }
    });