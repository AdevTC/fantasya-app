const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
// CORRECCIÓN: Se importa con la configuración de región y CORS
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

initializeApp();
const db = getFirestore();

/**
 * Se activa cuando un usuario reclama un equipo fantasma.
 * Esta función ahora es robusta y consistente.
 */
exports.onSeasonJoin = onDocumentUpdated("leagues/{leagueId}/seasons/{seasonId}", async (event) => {
    const afterData = event.data.after.data();
    const beforeData = event.data.before.data();
    const { leagueId, seasonId } = event.params;

    for (const userId in afterData.members) {
        if (!beforeData.members[userId] && afterData.members[userId].claimedPlaceholderId) {
            const memberAfter = afterData.members[userId];
            const placeholderId = memberAfter.claimedPlaceholderId;
            logger.info(`MIGRATION START: User ${userId} claiming placeholder ${placeholderId}.`);

            const batch = db.batch();
            const seasonRef = db.doc(`leagues/${leagueId}/seasons/${seasonId}`);
            const newUserTeamName = memberAfter.teamName;

            if (!newUserTeamName) {
                logger.error(`Migration FAILED for ${userId}: New team name is missing.`);
                return;
            }

            // 1. Migrar Logros
            const placeholderAchievementRef = seasonRef.collection("achievements").doc(placeholderId);
            const userAchievementRef = db.doc(`users/${userId}/achievements/${seasonId}`);
            const placeholderAchievementDoc = await placeholderAchievementRef.get();
            if (placeholderAchievementDoc.exists) {
                batch.set(userAchievementRef, placeholderAchievementDoc.data());
                batch.delete(placeholderAchievementRef);
            }

            // 2. Migrar Fichajes (Lógica a prueba de fallos)
            const transfersRef = seasonRef.collection("transfers");
            const buyerQuery = transfersRef.where('buyerId', '==', placeholderId);
            const sellerQuery = transfersRef.where('sellerId', '==', placeholderId);
            const [buyerSnapshot, sellerSnapshot] = await Promise.all([buyerQuery.get(), sellerQuery.get()]);

            buyerSnapshot.forEach(doc => {
                batch.update(doc.ref, { buyerId: userId, buyerName: newUserTeamName });
            });
            sellerSnapshot.forEach(doc => {
                batch.update(doc.ref, { sellerId: userId, sellerName: newUserTeamName });
            });

            // 3. Migrar Puntuaciones
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
            
            // 4. Migrar Alineaciones
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

            // 5. Limpieza Final
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

/**
 * Desvincula a un usuario y lo convierte en fantasma.
 * CORRECCIÓN FINAL: Se arregla el bug de fichajes y el error de CORS.
 */
exports.unlinkUserFromTeam = onCall(
    // Se especifica la región y la política de CORS para permitir llamadas desde tu app
    { region: "us-central1", cors: ["https://fantasya-app.vercel.app", "http://localhost:5173"] },
    async (request) => {
        const adminUid = request.auth?.uid;
        if (!adminUid) {
            throw new HttpsError("unauthenticated", "La función debe ser llamada por un usuario autenticado.");
        }

        const { leagueId, seasonId, userIdToUnlink } = request.data;
        if (!leagueId || !seasonId || !userIdToUnlink) {
            throw new HttpsError("invalid-argument", "Faltan parámetros (leagueId, seasonId, userIdToUnlink).");
        }

        const seasonRef = db.doc(`leagues/${leagueId}/seasons/${seasonId}`);
        
        try {
            const seasonDoc = await seasonRef.get();
            if (!seasonDoc.exists) {
                throw new HttpsError("not-found", "La temporada no existe.");
            }

            const seasonData = seasonDoc.data();
            const adminUser = seasonData.members[adminUid];
            const leagueOwnerId = seasonData.ownerId;

            if (!adminUser || (adminUser.role !== 'admin' && adminUid !== leagueOwnerId)) {
                throw new HttpsError("permission-denied", "Debes ser administrador o propietario para realizar esta acción.");
            }
            
            if (userIdToUnlink === leagueOwnerId) {
                throw new HttpsError("permission-denied", "No se puede desvincular al propietario de la liga.");
            }

            const userToUnlink = seasonData.members[userIdToUnlink];
            if (!userToUnlink) {
                throw new HttpsError("not-found", "El usuario a desvincular no se encuentra en esta liga.");
            }

            logger.info(`UNLINK START: Admin ${adminUid} is unlinking user ${userIdToUnlink}.`);
            
            const batch = db.batch();
            const placeholderId = `placeholder_${userIdToUnlink}`;
            const teamNameToPreserve = userToUnlink.teamName;

            const placeholderData = { ...userToUnlink, isPlaceholder: true };
            delete placeholderData.role;
            delete placeholderData.isAdmin;

            // 1. Migrar Logros
            const userAchievementRef = db.doc(`users/${userIdToUnlink}/achievements/${seasonId}`);
            const placeholderAchievementRef = seasonRef.collection("achievements").doc(placeholderId);
            const userAchievementDoc = await userAchievementRef.get();
            if (userAchievementDoc.exists) {
                batch.set(placeholderAchievementRef, userAchievementDoc.data());
                batch.delete(userAchievementRef);
            }
            
            // 2. Migrar Fichajes (BUG CORREGIDO)
            const transfersRef = seasonRef.collection("transfers");
            const buyerQuery = transfersRef.where('buyerId', '==', userIdToUnlink);
            const sellerQuery = transfersRef.where('sellerId', '==', userIdToUnlink);
            const [buyerSnapshot, sellerSnapshot] = await Promise.all([buyerQuery.get(), sellerQuery.get()]);
            
            // AHORA SÍ: Se actualiza tanto el ID como el NOMBRE para mantener la consistencia
            buyerSnapshot.forEach(doc => batch.update(doc.ref, { buyerId: placeholderId, buyerName: teamNameToPreserve }));
            sellerSnapshot.forEach(doc => batch.update(doc.ref, { sellerId: placeholderId, sellerName: teamNameToPreserve }));

            // 3. Migrar Puntuaciones
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

            // 4. Migrar Alineaciones
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

            // 5. Actualizar mapa de miembros
            batch.update(seasonRef, {
                [`members.${placeholderId}`]: placeholderData,
                [`members.${userIdToUnlink}`]: FieldValue.delete()
            });

            await batch.commit();
            logger.info(`UNLINK SUCCESS: User ${userIdToUnlink} is now placeholder ${placeholderId}.`);
            
            return { success: true, message: "Usuario desvinculado correctamente." };

        } catch (error) {
            logger.error("Error in unlinkUserFromTeam:", error);
            if (error instanceof HttpsError) {
                throw error;
            }
            throw new HttpsError("internal", "Ha ocurrido un error interno al desvincular al usuario.");
        }
    }
);
