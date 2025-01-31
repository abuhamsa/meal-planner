/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        secondary: '#64748b',
      }
    },
  },
  plugins: [],
}
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        downy: {
          50: '#f2fbfa',
          100: '#d4f3ef',
          200: '#aae5e0',
          300: '#68ccc7',
          400: '#4bb6b4',
          500: '#319b9a',
          600: '#257b7c',
          700: '#216364',
          800: '#1f4e50',
          900: '#1e4143',
          950: '#0c2427',
        },
      }
    }
  }
}