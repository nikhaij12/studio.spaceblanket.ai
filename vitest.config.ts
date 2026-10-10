import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

// fileURLToPath, not URL#pathname: this folder can live under a path with
// spaces, and pathname would hand back %20s that resolve to nothing.
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
