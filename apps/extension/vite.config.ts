import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import manifest from "./manifest.json";

export default defineConfig(({ mode }) => ({
  // Relative base — extension pages load assets from chrome-extension://,
  // absolute "/assets/..." paths cause cross-world preload mismatches.
  base: "./",
  plugins: [crx({ manifest })],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  build: {
    minify: mode === "production",
    sourcemap: mode === "development",
    // Extension pages load from chrome-extension://, and Chromium reports every
    // <link rel="modulepreload"> there as an unused "cross-world resource
    // mismatch" — six console warnings for preloads that buy nothing in a popup
    // this small.
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: "src/popup/index.html",
        options: "src/options/index.html",
      },
    },
  },
}));
