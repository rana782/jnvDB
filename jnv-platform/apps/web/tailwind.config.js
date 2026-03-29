/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F8FAFC",
        card: "#FFFFFF",
        ink: "#0F172A",
        muted: "#64748B",
        line: "#E2E8F0",
        accent: { DEFAULT: "#2563EB", hover: "#1D4ED8" },
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        navy: { DEFAULT: "#0F172A", light: "#1E293B" },
        teal: { DEFAULT: "#0d9488", light: "#2dd4bf" },
        emerald: { DEFAULT: "#059669", light: "#34d399" },
        amber: { DEFAULT: "#d97706", light: "#fbbf24" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      transitionDuration: {
        100: "100ms",
        150: "150ms",
        200: "200ms",
        300: "300ms",
      },
    },
  },
  plugins: [],
};
