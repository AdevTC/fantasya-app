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

// --- FUNCIÓN AÑADIDA Y EXPORTADA ---
export const calculateStandardDeviation = (array) => {
    const n = array.length;
    if (n < 2) return 0;
    const mean = array.reduce((a, b) => a + b) / n;
    return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / (n - 1));
};

/**
 * Devuelve la clase de Tailwind CSS para el color de fondo
 * basado en la puntuación de un jugador.
 * @param {number|undefined} points La puntuación del jugador.
 * @returns {string} La clase de Tailwind CSS correspondiente.
 */
export const getPlayerScoreBackgroundColor = (points) => {
  // Si no es un número, devolvemos un color neutro.
  if (typeof points !== 'number') {
    return 'bg-white/90 dark:bg-gray-700/90';
  }

  // Asignamos colores según los rangos que especificaste.
  if (points < 0) {
    return 'bg-red-500/80 text-white'; // Rojo
  }
  if (points >= 0 && points <= 5) {
    return 'bg-yellow-400/80'; // Amarillo
  }
  if (points >= 6 && points <= 9) {
    return 'bg-green-400/80'; // Verde
  }
  if (points >= 10 && points <= 15) {
    return 'bg-blue-400/80'; // Azul
  }
  if (points >= 16 && points <= 19) {
    return 'bg-purple-500/80 text-white'; // Morado
  }
  if (points >= 20) {
    return 'bg-fuchsia-500/80 text-white'; // Rosa Fucsia
  }

  // Color por defecto si ninguna condición se cumple.
  return 'bg-white/90 dark:bg-gray-700/90';
};