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