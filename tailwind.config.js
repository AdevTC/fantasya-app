/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'emerald': {
          '50': '#ecfdf5',
          '100': '#d1fae5',
          '200': '#a7f3d0',
          '300': '#6ee7b7',
          '400': '#34d399',
          '500': '#10b981',
          '600': '#059669',
          '700': '#047857',
          '800': '#065f46',
          '900': '#064e3b',
        },
        'deep-blue': '#1E40AF',
        'vibrant-purple': '#7C3AED',
        'energetic-orange': '#F59E0B',
        // --- NUEVOS COLORES PARA EL PODIO ---
        'podium-gold': '#FFFBEB',   // Un amarillo muy pálido
        'podium-silver': '#F9FAFB', // Un gris muy claro
        'podium-bronze': '#FFF7ED', // Un naranja muy pálido
      }
    },
  },
  plugins: [],
}
