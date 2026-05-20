/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#1a2744',
          'navy-hover': '#2d3f6b',
          'navy-border': '#2a3a5c',
          amber: '#f59e0b',
          'amber-hover': '#fbbf24',
        },
        warwick: {
          navy: '#1a2744',
          gold: '#f59e0b',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 4px 24px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.12)',
        focus: '0 0 0 3px rgba(26, 39, 68, 0.15)',
        pill: '0 2px 8px rgba(245, 158, 11, 0.35)',
        'pill-hover': '0 4px 14px rgba(245, 158, 11, 0.45)',
      },
    },
  },
  plugins: [],
};
