import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f0f10",
        surface: "#18181b",
        "surface-2": "#1f1f23",
        "text-primary": "#e4e4e7",
        "text-secondary": "#71717a",
        "text-muted": "#52525b",
        accent: "#8b5cf6",
        "accent-hover": "#7c3aed",
        green: "#10b981",
        red: "#ef4444",
        yellow: "#f59e0b",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
