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