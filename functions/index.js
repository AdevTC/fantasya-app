const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

// Inicializa la app de administración de Firebase
initializeApp();

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
      logger.info(`Found new member ${userId} who claimed placeholder ${placeholderId}.`);

      const db = getFirestore();
      const batch = db.batch();

      // Definimos las rutas a los documentos
      const seasonRef = db.doc(`leagues/${leagueId}/seasons/${seasonId}`);
      const placeholderAchievementRef = seasonRef.collection("achievements").doc(placeholderId);
      const userAchievementRef = db.doc(`users/${userId}/achievements/${seasonId}`);

      // 1. Leemos los logros del equipo fantasma
      const placeholderAchievementDoc = await placeholderAchievementRef.get();
      if (placeholderAchievementDoc.exists) {
        logger.info(`Migrating achievements from ${placeholderId} to ${userId}.`);
        // 2. Los copiamos al perfil del nuevo usuario
        batch.set(userAchievementRef, placeholderAchievementDoc.data());
        // 3. Borramos el documento de logros del fantasma
        batch.delete(placeholderAchievementRef);
      }

      // 4. Borramos el equipo fantasma del mapa de miembros y la bandera temporal
      batch.update(seasonRef, {
        [`members.${placeholderId}`]: FieldValue.delete(),
        [`members.${userId}.claimedPlaceholderId`]: FieldValue.delete(),
      });
      
      // Ejecutamos todas las operaciones
      await batch.commit();
      logger.info(`User ${userId} successfully claimed placeholder ${placeholderId}. Transaction complete.`);
      return; // Salimos de la función una vez procesado el usuario
    }
  }
});