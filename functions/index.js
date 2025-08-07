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
                
                // Obtenemos el nombre del equipo del nuevo usuario para usarlo en los fichajes
                const newUserTeamName = memberAfter.teamName;

                // --- 1. Migrar Logros (Achievements) ---
                const placeholderAchievementRef = seasonRef.collection("achievements").doc(placeholderId);
                const userAchievementRef = db.doc(`users/${userId}/achievements/${seasonId}`);
                const placeholderAchievementDoc = await placeholderAchievementRef.get();
                if (placeholderAchievementDoc.exists) {
                    logger.info(`Migrando logros de ${placeholderId} a ${userId}.`);
                    batch.set(userAchievementRef, placeholderAchievementDoc.data());
                    batch.delete(placeholderAchievementRef);
                }

                // --- 2. Migrar Fichajes (Transfers) - CORREGIDO ---
                const transfersRef = seasonRef.collection("transfers");
                const buyerQuery = transfersRef.where('buyerId', '==', placeholderId);
                const sellerQuery = transfersRef.where('sellerId', '==', placeholderId);
                
                const [buyerSnapshot, sellerSnapshot] = await Promise.all([buyerQuery.get(), sellerQuery.get()]);

                buyerSnapshot.forEach(doc => {
                    logger.info(`Actualizando fichaje (compra) ${doc.id} de ${placeholderId} a ${userId}.`);
                    // CAMBIO: Ahora también actualizamos el nombre del comprador.
                    batch.update(doc.ref, { buyerId: userId, buyerName: newUserTeamName });
                });
                sellerSnapshot.forEach(doc => {
                    logger.info(`Actualizando fichaje (venta) ${doc.id} de ${placeholderId} a ${userId}.`);
                    // CAMBIO: Ahora también actualizamos el nombre del vendedor.
                    batch.update(doc.ref, { sellerId: userId, sellerName: newUserTeamName });
                });

                // --- 3. Migrar Puntuaciones de Jornadas (Rounds) - CORREGIDO ---
                const roundsRef = seasonRef.collection("rounds");
                const roundsSnapshot = await roundsRef.get();
                roundsSnapshot.forEach(roundDoc => {
                    const roundData = roundDoc.data();
                    if (roundData.scores && roundData.scores[placeholderId] !== undefined) {
                        logger.info(`Migrando puntuación en jornada ${roundDoc.id} de ${placeholderId} a ${userId}.`);
                        // CAMBIO: Usamos una actualización atómica con notación de puntos.
                        // Esto es más seguro y eficiente que reescribir todo el objeto de puntuaciones.
                        batch.update(roundDoc.ref, {
                            [`scores.${userId}`]: roundData.scores[placeholderId],
                            [`scores.${placeholderId}`]: admin.firestore.FieldValue.delete()
                        });
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
                        
                        batch.set(newLineupRef, lineupDoc.data());
                        batch.delete(lineupDoc.ref);
                    }
                }

                // --- 5. Limpieza Final ---
                batch.update(seasonRef, {
                    [`members.${placeholderId}`]: admin.firestore.FieldValue.delete(),
                    [`members.${userId}.claimedPlaceholderId`]: admin.firestore.FieldValue.delete(),
                });
                
                await batch.commit();
                logger.info(`Migración completada para el usuario ${userId}.`);
                return;
            }
        }
    });