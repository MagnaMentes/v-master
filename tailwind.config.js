/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mac: {
          bg: {
            light: '#F6F6F6',
            dark: '#1E1E1E',
          },
          card: {
            light: '#FFFFFF',
            dark: '#252526',
          },
          border: {
            light: '#E5E5E5',
            dark: '#333333',
          },
          sidebar: {
            light: '#EFEFEF',
            dark: '#181818',
          }
        }
      }
    },
  },
  plugins: [],
}
