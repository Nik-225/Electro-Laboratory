/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        blueprint: '#f0f4f8',
        'term-red': '#ef4444',
        'term-blue': '#3b82f6',
        'term-green': '#22c55e',
        'term-yellow': '#eab308',
      }
    },
  },
  plugins: [],
}