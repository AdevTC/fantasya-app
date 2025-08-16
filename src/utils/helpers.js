// src/utils/helpers.js
export const formatHolderNames = (names) => {
    if (!names || names.length === 0) return 'N/A';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names.join(' y ');
    const last = names.pop();
    return `${names.join(', ')}, y ${last}`;
};

export const formatCurrency = (value) => {
    const number = Number(value) || 0;
    return new Intl.NumberFormat('es-ES', { 
        style: 'currency', 
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(number);
};

export const calculateStandardDeviation = (array) => {
    const n = array.length;
    if (n < 2) return 0;
    const mean = array.reduce((a, b) => a + b) / n;
    return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / (n - 1));
};

/**
 * Devuelve la clase de Tailwind CSS para el COLOR DE TEXTO
 * basado en la puntuación de un jugador.
 * @param {number|undefined} points La puntuación del jugador.
 * @returns {string} La clase de Tailwind CSS correspondiente.
 */
export const getPlayerScoreTextColor = (points) => {
  // Si no es un número, devolvemos un color por defecto.
  if (typeof points !== 'number') {
    return 'text-gray-800';
  }

  // Asignamos colores de TEXTO según los rangos.
  if (points < 0) {
    return 'text-red-500'; // Rojo
  }
  if (points >= 0 && points <= 5) {
    return 'text-yellow-600'; // Amarillo
  }
  if (points >= 6 && points <= 9) {
    return 'text-green-600'; // Verde
  }
  if (points >= 10 && points <= 15) {
    return 'text-blue-600'; // Azul
  }
  if (points >= 16 && points <= 19) {
    return 'text-purple-600'; // Morado
  }
  if (points >= 20) {
    return 'text-fuchsia-500'; // Rosa Fucsia
  }

  // Color por defecto si ninguna condición se cumple.
  return 'text-gray-800';
};

/**
 * Analiza la eficacia en la elección del capitán para todos los usuarios de la liga.
 * @param {object} teamsByUser Objeto con los equipos de cada usuario por jornada.
 * @param {Array} users Array de objetos de usuario de la liga.
 * @returns {Array} Un array con las estadísticas de capitanía para cada usuario.
 */
export const analyzeCaptainChoices = (teamsByUser, users) => {
  if (!teamsByUser || !users) return [];

  const stats = users.map(user => {
    const userTeams = teamsByUser[user.uid] || {};
    const roundIds = Object.keys(userTeams);
    
    let totalRoundsWithCaptain = 0;
    let successfulPicks = 0;
    let totalPointsLost = 0;
    const pointsLostHistory = [];

    roundIds.forEach(roundId => {
      const lineup = userTeams[roundId]?.lineup;
      if (!lineup || lineup.length === 0) return;

      const playersWithPoints = lineup.filter(p => typeof p.points === 'number');
      if (playersWithPoints.length === 0) return;

      const captain = playersWithPoints.find(p => p.isCaptain);
      const maxScore = Math.max(...playersWithPoints.map(p => p.points));

      if (captain) {
        totalRoundsWithCaptain++;
        const captainScore = captain.points;
        
        if (captainScore === maxScore) {
          successfulPicks++;
        }
        
        const pointsDifference = maxScore - captainScore;
        // Los puntos perdidos son el doble de la diferencia, porque el capitán puntúa doble.
        const roundPointsLost = pointsDifference > 0 ? pointsDifference : 0;
        totalPointsLost += roundPointsLost;
        pointsLostHistory.push(roundPointsLost);
      }
    });

    const successRate = totalRoundsWithCaptain > 0 ? (successfulPicks / totalRoundsWithCaptain) * 100 : 0;
    const averagePointsLost = totalRoundsWithCaptain > 0 ? totalPointsLost / totalRoundsWithCaptain : 0;

    // Calculamos la desviación estándar de los puntos perdidos para medir la consistencia
    const mean = averagePointsLost;
    const stdDev = totalRoundsWithCaptain > 0 
      ? Math.sqrt(pointsLostHistory.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / totalRoundsWithCaptain)
      : 0;

    return {
      userId: user.uid,
      userName: user.username,
      successRate: successRate.toFixed(1),
      totalPointsLost,
      averagePointsLost: averagePointsLost.toFixed(2),
      stdDev: stdDev.toFixed(2),
    };
  });

  return stats.sort((a, b) => b.successRate - a.successRate);
};