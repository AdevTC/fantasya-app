const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
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