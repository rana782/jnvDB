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
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#F43F5E",
        navy: { DEFAULT: "#0F172A", light: "#1E293B" },
        teal: { DEFAULT: "#0ea5a4", light: "#34d399" },
        emerald: { DEFAULT: "#10b981", light: "#6ee7b7" },
        amber: { DEFAULT: "#f59e0b", light: "#fcd34d" },
        luxury: {
          50: "#EEF2FF",
          100: "#DCE5FF",
          200: "#C0D0FF",
          300: "#9BB2FF",
          400: "#7A99FF",
          500: "#5B7CFF",
          600: "#4B63E6",
          700: "#3D4EB8",
        },
        surface: {
          1: "#FFFFFF",
          2: "#F8FAFC",
          3: "#F1F5F9",
          4: "#E2E8F0",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        premium: "0 18px 45px rgba(15, 23, 42, 0.12)",
        glow: "0 0 0 1px rgba(37, 99, 235, 0.22), 0 10px 28px rgba(37, 99, 235, 0.16)",
        insetLux: "inset 0 1px 0 rgba(15, 23, 42, 0.05)",
      },
      backgroundImage: {
        "premium-radial":
          "radial-gradient(1200px 500px at 8% -20%, rgba(37,99,235,0.12), rgba(37,99,235,0) 58%), radial-gradient(1000px 380px at 98% -10%, rgba(14,165,164,0.10), rgba(14,165,164,0) 52%)",
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
