/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f0f10",
        surface: "#18181b",
        "surface-2": "#1f1f23",
        muted: "#52525b",
        subtle: "#71717a",
        accent: "#8b5cf6",
        "accent-hover": "#7c3aed",
        green: "#10b981",
        red: "#ef4444",
      },
    },
  },
};
