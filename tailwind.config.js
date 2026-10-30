/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0B0B0B', 900: '#141414', 800: '#1C1C1C', 700: '#2A2A2A', 600: '#4A4A4A', 400: '#8A8A8A', 300: '#B5B0A6' },
        line: '#E8E1D3',
        cream: { 50: '#FFFDF8', 100: '#FBF6EC', 200: '#F3EAD7' },
        gold: { 100: '#FBF0D2', 300: '#F2CF6B', 500: '#E0A82E', 600: '#C38D17', 700: '#9A6D0C' },
        success: '#2E7D4F',
        warning: '#B7791F',
        danger: '#C0392B',
        info: '#2B6CB0',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Sora', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '16px', field: '12px' },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.04)',
        lift: '0 2px 4px rgba(0,0,0,.06), 0 16px 40px rgba(0,0,0,.10)',
        gold: '0 8px 24px rgba(224,168,46,.35)',
      },
      screens: { xs: '380px' },
    },
  },
  plugins: [],
}
