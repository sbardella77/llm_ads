import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Stesso alias di tsconfig.json, per testare anche i moduli in src/app.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // L'avvio di PGlite (Postgres in WebAssembly) può superare i 10 s di default su macchine lente.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
