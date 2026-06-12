import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./manifest.json";

export default defineConfig(({ mode }) => ({
  plugins: [crx({ manifest })],
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
