/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        // Deep academic blue scale (primary)
        brand: {
          50: "#eff5fb",
          100: "#d9e7f5",
          200: "#b3cfea",
          300: "#84b0da",
          400: "#5389c4",
          500: "#316aa8",
          600: "#22528b",
          700: "#1f4e79", // DEFAULT
          800: "#183c5e",
          900: "#132f49",
          DEFAULT: "#1f4e79",
          light: "#316aa8",
          accent: "#14a098",
        },
        teal: {
          accent: "#14a098",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.08)",
        cardhover: "0 4px 12px -2px rgb(16 24 40 / 0.12)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #1f4e79 0%, #132f49 100%)",
        "hero-gradient": "linear-gradient(135deg, #1f4e79 0%, #14a098 130%)",
      },
    },
  },
  plugins: [],
};
