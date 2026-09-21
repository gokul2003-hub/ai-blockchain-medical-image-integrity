/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: "#0F172A",     // Slate-900
          card: "#1E293B",     // Slate-800
          border: "#334155",   // Slate-700
          blue: "#3B82F6",     // Medical Blue
          emerald: "#10B981",  // Verified Emerald
          rose: "#F43F5E"      // Tampered Rose
        }
      }
    },
  },
  plugins: [],
}
