import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // L'avvio di PGlite (Postgres in WebAssembly) può superare i 10 s di default su macchine lente.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
