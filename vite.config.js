import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        gridfinity: resolve(import.meta.dirname, "gridfinity/index.html"),
        tapas: resolve(import.meta.dirname, "tapas/index.html"),
        frames: resolve(import.meta.dirname, "frames/index.html"),
        lamps: resolve(import.meta.dirname, "lamps/index.html"),
        letters: resolve(import.meta.dirname, "letters/index.html"),
        boxes: resolve(import.meta.dirname, "boxes/index.html"),
        clocks: resolve(import.meta.dirname, "clocks/index.html"),
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
