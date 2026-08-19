/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./node_modules/streamdown/dist/**/*.{js,mjs,cjs}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        paper: "#FFFFFF",
        canvas: "#F6F7F8",
        ink: "#14171A",
        line: "#E3E6E9",
        muted: "#6B7280",
        accent: {
          DEFAULT: "#2952E3",
          soft: "#EAEEFD",
        },
        danger: "#D33F3F",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
