/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        warwick: {
          navy: '#1e3a5f',
          gold: '#c9a961',
        },
      },
    },
  },
  plugins: [],
};
