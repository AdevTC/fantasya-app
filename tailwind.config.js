/** @type {import('tailwindcss').Config} */
export default {
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
      },
      animation: {
        floating: 'floating 4s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s infinite ease-in-out',
        'fade-in': 'fadeIn 1s ease-out forwards',
      },
      keyframes: {
        floating: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%': { transform: 'translateY(-15px) rotate(2deg)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 255, 136, 0.4)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 255, 136, 0.8), 0 0 60px rgba(0, 255, 136, 0.4)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(40px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}