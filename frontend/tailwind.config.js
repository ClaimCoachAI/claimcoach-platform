/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Outfit', 'system-ui', 'sans-serif'],
        body: ['Manrope', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: {
          DEFAULT: '#1E3A5F',
          light: '#2A4A70',
          dark: '#15304D',
        },
        teal: {
          DEFAULT: '#3BA090',
          light: '#52B5A5',
          dark: '#2A8B7C',
        },
        slate: {
          DEFAULT: '#7C8FA5',
          light: '#A5B8CC',
          dark: '#5F728A',
        },
      },
    },
  },
  plugins: [],
}
