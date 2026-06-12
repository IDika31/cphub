import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import manifest from "./manifest.json";

export default defineConfig(({ mode }) => ({
  plugins: [crx({ manifest })],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  build: {
    minify: mode === "production",
    sourcemap: mode === "development",
    rollupOptions: {
      input: {
        popup: "src/popup/index.html",
        options: "src/options/index.html",
      },
    },
  },
}));
