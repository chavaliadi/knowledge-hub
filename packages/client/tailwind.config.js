/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sleek and modern dark mode slate palette
        brand: {
          dark: '#0f172a',      // main background
          card: '#1e293b',      // card background
          accent: '#4f46e5',    // primary action (indigo)
          accentLight: '#6366f1',
          border: '#334155',    // border color
          textMain: '#f8fafc',  // main text
          textMuted: '#94a3b8', // muted text
        },
        // Entry type specific accents
        entry: {
          note: '#3b82f6',      // Blue
          bookmark: '#10b981',  // Emerald
          snippet: '#f59e0b',   // Amber
          idea: '#8b5cf6',      // Violet
          resource: '#ec4899',  // Pink
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
