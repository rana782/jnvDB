/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0f172a", light: "#1e293b" },
        teal: { DEFAULT: "#0d9488", light: "#2dd4bf" },
        emerald: { DEFAULT: "#059669", light: "#34d399" },
        amber: { DEFAULT: "#d97706", light: "#fbbf24" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
