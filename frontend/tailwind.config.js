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
        },
        // MediSecure AI Med-Cyber Device Theme (dark navy foundation)
        surface: "#0a1122",
        "surface-dim": "#070d1a",
        "surface-bright": "#111c33",
        "surface-container-lowest": "#0d1526",
        "surface-container-low": "#101b31",
        "surface-container": "#14203a",
        "surface-container-high": "#1a2745",
        "surface-container-highest": "#223052",
        "surface-variant": "#1a2745",
        "surface-tint": "#38bdf8",
        "on-surface": "#e6edf7",
        "on-surface-variant": "#93a4bd",
        "inverse-surface": "#e6edf7",
        "inverse-on-surface": "#101a30",
        outline: "#7d8ba3",
        "outline-variant": "#243250",
        primary: "#4f8cff",
        "on-primary": "#ffffff",
        "primary-container": "#1d3a75",
        "on-primary-container": "#9cc4ff",
        "inverse-primary": "#4f8cff",
        "primary-fixed": "#16305c",
        "primary-fixed-dim": "#7dd3fc",
        "on-primary-fixed": "#dbeafe",
        "on-primary-fixed-variant": "#93c5fd",
        secondary: "#34d399",
        "on-secondary": "#052e1f",
        "secondary-container": "#0f3d2c",
        "on-secondary-container": "#6ee7b7",
        "secondary-fixed": "#123a2c",
        "secondary-fixed-dim": "#1d5c41",
        "on-secondary-fixed": "#6ee7b7",
        "on-secondary-fixed-variant": "#34d399",
        tertiary: "#a78bfa",
        "on-tertiary": "#1e1040",
        "tertiary-container": "#3b2a6e",
        "on-tertiary-container": "#d6c9ff",
        "tertiary-fixed": "#2a2148",
        "tertiary-fixed-dim": "#43307a",
        "on-tertiary-fixed": "#c4b5fd",
        "on-tertiary-fixed-variant": "#a78bfa",
        error: "#f87171",
        "on-error": "#450a0a",
        "error-container": "#451a22",
        "on-error-container": "#fca5a5",
        background: "#0a1122",
        "on-background": "#e6edf7",
      },
      spacing: {
        "space-2xs": "0.125rem",
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "1rem",
        "space-lg": "1.5rem",
        "space-xl": "2rem",
        "space-2xl": "3rem",
        "space-3xl": "4.5rem",
        "gutter-mobile": "0.75rem",
        gutter: "1.5rem",
        "gutter-desktop": "2rem",
        "margin-mobile": "1rem",
        margin: "1.5rem",
        "margin-desktop": "3rem",
      },
      fontFamily: {
        headline: ["Manrope", "sans-serif"],
        body: ["Public Sans", "sans-serif"],
        mono: ["Space Grotesk", "monospace"],
      }
    },
  },
  plugins: [],
}
