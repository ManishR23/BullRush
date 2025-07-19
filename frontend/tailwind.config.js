/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // ✅ MUST include .ts/.tsx
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
