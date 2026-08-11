/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        bg: "#ffffff",
        surface: "#f8fafc",
        "surface-2": "#f1f5f9",
        border: "#e2e8f0",
        "border-light": "#f1f5f9",
        primary: "#0f172a",
        secondary: "#475569",
        muted: "#94a3b8",
        subtle: "#64748b",
        blue: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        green: "#16a34a",
        "green-light": "#dcfce7",
        red: "#dc2626",
        "red-light": "#fee2e2",
      },
      boxShadow: {
        soft: "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        card: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 2px 8px -2px rgb(0 0 0 / 0.06)",
        elevated: "0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 6px -2px rgb(0 0 0 / 0.04)",
      },
    },
  },
};
