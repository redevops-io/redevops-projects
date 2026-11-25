// Build of the portable dashboards page (portable.html): relative asset paths, so the folder works from any location on any
// static host, or from a local static server. See scripts/build-portable.mjs.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  worker: { format: "es" },
  build: { outDir: "dist-portable", emptyOutDir: true, rollupOptions: { input: "portable.html" } },
});
