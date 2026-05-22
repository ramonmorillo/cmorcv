/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        med: {
          50: '#f5f8ff',
          100: '#e8efff',
          600: '#2d5ce6',
          700: '#1f47b8',
          900: '#162445',
        },
      },
      boxShadow: {
        card: '0 8px 24px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
};
