import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // O PGlite (Postgres em WASM) leva alguns segundos para subir.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
