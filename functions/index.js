const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

// Inicializa la app de administración de Firebase
initializeApp();
const db = getFirestore();

/**
 * Se activa cuando un usuario reclama un equipo fantasma.
 */
exports.onSeasonJoin = onDocumentUpdated("leagues/{leagueId}/seasons/{seasonId}", async (event) => {
    const afterData = event.data.after.data();
    const beforeData = event.data.before.data();
    const { leagueId, seasonId } = event.params;

    for (const userId in afterData.members) {
        if (!beforeData.members[userId] && afterData.members[userId].claimedPlaceholderId) {
            const memberAfter = afterData.members[userId];
            const placeholderId = memberAfter.claimedPlaceholderId;
            logger.info(`Starting migration for user ${userId} claiming placeholder ${placeholderId}.`);

            const batch = db.batch();
            const seasonRef = db.doc(`leagues/${leagueId}/seasons/${seasonId}`);
            const newUserTeamName = memberAfter.teamName;

            // 1. Migrar Logros
            const placeholderAchievementRef = seasonRef.collection("achievements").doc(placeholderId);
            const userAchievementRef = db.doc(`users/${userId}/achievements/${seasonId}`);
            const placeholderAchievementDoc = await placeholderAchievementRef.get();
            if (placeholderAchievementDoc.exists) {
                batch.set(userAchievementRef, placeholderAchievementDoc.data());
                batch.delete(placeholderAchievementRef);
            }

            // 2. Migrar Fichajes (CORREGIDO)
            const transfersRef = seasonRef.collection("transfers");
            const buyerQuery = transfersRef.where('buyerId', '==', placeholderId);
            const sellerQuery = transfersRef.where('sellerId', '==', placeholderId);
            const [buyerSnapshot, sellerSnapshot] = await Promise.all([buyerQuery.get(), sellerQuery.get()]);

            // Se actualiza tanto el ID como el Nombre para asegurar consistencia
            buyerSnapshot.forEach(doc => {
                logger.info(`Updating BUYER in transfer ${doc.id} from ${placeholderId} to ${userId}`);
                batch.update(doc.ref, { buyerId: userId, buyerName: newUserTeamName });
            });
            sellerSnapshot.forEach(doc => {
                logger.info(`Updating SELLER in transfer ${doc.id} from ${placeholderId} to ${userId}`);
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
            logger.info(`Migration complete for user ${userId}.`);
            return;
        }
    }
});

/**
 * Desvincula a un usuario y lo convierte en fantasma.
 * CORRECCIÓN: Añadida configuración de CORS.
 */
exports.unlinkUserFromTeam = onCall({ cors: true }, async (request) => {
    const adminUid = request.auth?.uid;
    if (!adminUid) {
        throw new HttpsError("unauthenticated", "La función debe ser llamada por un usuario autenticado.");
    }

    const { leagueId, seasonId, userIdToUnlink } = request.data;
    if (!leagueId || !seasonId || !userIdToUnlink) {
        throw new HttpsError("invalid-argument", "Faltan parámetros (leagueId, seasonId, userIdToUnlink).");
    }

    const seasonRef = db.doc(`leagues/${leagueId}/seasons/${seasonId}`);
    const seasonDoc = await seasonRef.get();

    if (!seasonDoc.exists) {
        throw new HttpsError("not-found", "La temporada no existe.");
    }
    const seasonData = seasonDoc.data();
    const adminUser = seasonData.members[adminUid];

    if (!adminUser || (adminUser.role !== 'admin' && seasonData.ownerId !== adminUid)) {
        throw new HttpsError("permission-denied", "Debes ser administrador o propietario para realizar esta acción.");
    }
    
    const userToUnlink = seasonData.members[userIdToUnlink];
    if (!userToUnlink) {
        throw new HttpsError("not-found", "El usuario a desvincular no se encuentra en esta liga.");
    }

    logger.info(`Admin ${adminUid} is unlinking user ${userIdToUnlink} in league ${leagueId}.`);
    
    const batch = db.batch();
    const placeholderId = `placeholder_${userIdToUnlink}`;
    const teamName = userToUnlink.teamName; // Guardamos el nombre antes de modificar

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
    
    // 2. Migrar Fichajes (CORREGIDO)
    const transfersRef = seasonRef.collection("transfers");
    const buyerQuery = transfersRef.where('buyerId', '==', userIdToUnlink);
    const sellerQuery = transfersRef.where('sellerId', '==', userIdToUnlink);
    const [buyerSnapshot, sellerSnapshot] = await Promise.all([buyerQuery.get(), sellerQuery.get()]);
    
    // Se actualiza tanto el ID como el Nombre para asegurar consistencia
    buyerSnapshot.forEach(doc => {
        logger.info(`Unlinking BUYER in transfer ${doc.id} from ${userIdToUnlink} to ${placeholderId}`);
        batch.update(doc.ref, { buyerId: placeholderId, buyerName: teamName });
    });
    sellerSnapshot.forEach(doc => {
        logger.info(`Unlinking SELLER in transfer ${doc.id} from ${userIdToUnlink} to ${placeholderId}`);
        batch.update(doc.ref, { sellerId: placeholderId, sellerName: teamName });
    });

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
    logger.info(`User ${userIdToUnlink} successfully unlinked and converted to placeholder ${placeholderId}.`);
    
    return { success: true, message: "Usuario desvinculado correctamente." };
});
