import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',          // ← toggled via document.documentElement.classList
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Manrope"', '"Noto Sans Thai"', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#edf9f6',
          100: '#d3f0e9',
          200: '#abe3d9',
          300: '#71d8cb',
          400: '#38b4a6',
          500: '#15988b',
          600: '#087f75',
          700: '#09655f',
          800: '#10514c',
          900: '#123f3b',
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.35s ease both',
        'fade-in': 'fadeIn 0.25s ease both',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
