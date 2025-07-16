/** @type {import('tailwindcss').Config} */
export default {
  // --- AÑADIDO: Habilitar modo oscuro por clase ---
  darkMode: 'class',
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
        'podium-gold': '#FFFBEB',
        'podium-silver': '#F9FAFB',
        'podium-bronze': '#FFF7ED',
      }
    },
  },
  plugins: [],
}