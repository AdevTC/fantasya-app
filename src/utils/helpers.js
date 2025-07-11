// src/utils/helpers.js
export const formatHolderNames = (names) => {
    if (!names || names.length === 0) return 'N/A';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names.join(' y ');
    const last = names.pop();
    return `${names.join(', ')}, y ${last}`;
};

// --- FUNCIÓN ACTUALIZADA ---
export const formatCurrency = (value) => {
    const number = Number(value) || 0;
    // Usamos el formato español para los separadores y la coma decimal
    return new Intl.NumberFormat('es-ES', { 
        style: 'currency', 
        currency: 'EUR',
        minimumFractionDigits: 2, // Siempre mostrar 2 decimales
        maximumFractionDigits: 2,
    }).format(number);
};