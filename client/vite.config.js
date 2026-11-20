import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/examples/": "http://127.0.0.1:8787",
      "/v1": "http://127.0.0.1:8787",
      "/llms.txt": "http://127.0.0.1:8787",
      "/openapi.json": "http://127.0.0.1:8787",
      "/developer-integration-guide.md": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
