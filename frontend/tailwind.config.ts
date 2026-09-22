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
          50:  '#eef5ed',
          100: '#dfecdc',
          200: '#bed8b9',
          300: '#9dc99a',
          400: '#75a983',
          500: '#488760',
          600: '#286449',
          700: '#20523c',
          800: '#1b4333',
          900: '#153729',
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
