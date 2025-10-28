/**
 * Calcula el ganador de la porra basado en las predicciones y los resultados de la jornada.
 * @param {Object} predictions - Objeto con las predicciones, ej: { userId: { ranking: [uid1, uid2], submittedAt: ... } }
 * @param {Object} results - Objeto de puntuaciones de la jornada, ej: { uid1: 100, uid2: 90 }
 * @param {Object} members - Objeto de miembros de la temporada, para buscar usernames
 * @returns {Object|null} - El objeto del ganador o null si no hay.
 */
export const calculatePorraWinner = (predictions, results, members) => {
    if (!results || Object.keys(results).length === 0 || !predictions || Object.keys(predictions).length === 0) {
        return null; // No hay resultados o predicciones aún
    }

    // Convertir resultados de jornada a un array ordenado por puntos
    const sortedResults = Object.entries(results)
        .filter(([uid, score]) => typeof score === 'number' && members[uid])
        .map(([uid, score]) => ({ uid, score }))
        .sort((a, b) => b.score - a.score);

    // Asignar posición real basada en los resultados ordenados
    const realPositions = {};
    let currentRank = 0;
    let lastScore = -Infinity;
    sortedResults.forEach((player, index) => {
        if (player.score !== lastScore) {
            currentRank = index + 1;
            lastScore = player.score;
        }
        realPositions[player.uid] = currentRank;
    });

    let winner = null;
    let maxScore = -1;

    Object.entries(predictions).forEach(([userId, prediction]) => {
        if (!prediction || !prediction.ranking || !prediction.submittedAt) return; // Saltar si no hay ranking o timestamp

        let score = 0;
        let highestPositionMatched = Infinity; // Para desempate

        prediction.ranking.forEach((predictedUid, index) => {
            const predictedPosition = index + 1;
            const actualPosition = realPositions[predictedUid];
            if (actualPosition === predictedPosition) {
                score++;
                if (actualPosition < highestPositionMatched) {
                    highestPositionMatched = actualPosition;
                }
            }
        });

        // Aplicar reglas
        if (score >= 2) {
            if (score > maxScore) {
                maxScore = score;
                winner = { userId, score, highestPositionMatched, submittedAt: prediction.submittedAt, username: members[userId]?.username || 'Desconocido' };
            } else if (score === maxScore) {
                // Desempate por posición más alta
                if (highestPositionMatched < winner.highestPositionMatched) {
                    winner = { userId, score, highestPositionMatched, submittedAt: prediction.submittedAt, username: members[userId]?.username || 'Desconocido' };
                } else if (highestPositionMatched === winner.highestPositionMatched) {
                    // Desempate por tiempo de envío
                    if (prediction.submittedAt.toDate() < winner.submittedAt.toDate()) {
                        winner = { userId, score, highestPositionMatched, submittedAt: prediction.submittedAt, username: members[userId]?.username || 'Desconocido' };
                    }
                }
            }
        }
    });

    return winner;
};