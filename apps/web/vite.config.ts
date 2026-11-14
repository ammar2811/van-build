import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Files from public/ that the app needs offline. */
const PUBLIC_FILES = [
  "/favicon.svg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

/**
 * Writes sw.js into the build with the exact list of files the build produced, so the app
 * works offline and every release gets a fresh cache. No service worker in development.
 */
function serviceWorker(): Plugin {
  return {
    name: "vanbuild-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((name) => !name.endsWith(".map") && name !== "index.html")
        .map((name) => `/${name}`)
        .sort();
      const precache = ["/", ...built, ...PUBLIC_FILES];
      const version = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);
      const source = readFileSync(join(import.meta.dirname, "sw/service-worker.js"), "utf8")
        .replace("__VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify(precache, null, 2));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
