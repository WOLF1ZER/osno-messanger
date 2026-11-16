/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#000000",
          900: "#0a0a0a",
          850: "#0f0f10",
          800: "#141415",
          700: "#1c1c1e",
          600: "#2a2a2d",
          500: "#3a3a3d",
          400: "#6b6b70",
          300: "#9a9aa0",
          200: "#c8c8cc",
          100: "#e9e9ec",
        },
      },
      fontFamily: {
        sans: ['"Barlow"', "system-ui", "sans-serif"],
        display: ['"Barlow Condensed"', '"Barlow"', "sans-serif"],
      },
      letterSpacing: {
        wider2: "0.18em",
        widest2: "0.32em",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: 0, transform: "translateY(8px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        ring: {
          "0%": { transform: "scale(1)", opacity: 0.5 },
          "100%": { transform: "scale(2.2)", opacity: 0 },
        },
        bar: {
          "0%,100%": { transform: "scaleY(0.35)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up .35s ease-out both",
        ring: "ring 2.4s cubic-bezier(.2,.6,.4,1) infinite",
        bar: "bar 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
