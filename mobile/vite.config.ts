import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O app reaproveita a leitura do CSV e as regras da fila de ../lib, usadas também pela versão web.
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("..", import.meta.url)),
      "libphonenumber-js": fileURLToPath(new URL("./node_modules/libphonenumber-js", import.meta.url)),
    },
  },
  server: { fs: { allow: [".."] } },
});
