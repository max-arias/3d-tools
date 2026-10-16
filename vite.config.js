import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        gridfinity: resolve(import.meta.dirname, "gridfinity/index.html"),
        tapas: resolve(import.meta.dirname, "tapas/index.html"),
      },
    },
  },
  worker: { format: "es" },
  fmt: { ignorePatterns: ["src/tools/gridfinity/geom/inter-bold.json", "dist", "reference"] },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
  },
});
