import { Buffer } from "node:buffer";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "dist-standalone");
const releaseDir = "/opt/cursor/artifacts/releases";
const releaseName = "ambux-v0.9.0-alpha.2.html";

await build({
  root,
  configFile: false,
  plugins: [react(), tailwindcss()],
  build: {
    outDir,
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
});

let html = readFileSync(join(outDir, "index.html"), "utf8");

html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  const css = readFileSync(join(outDir, href.replace(/^\//, "")), "utf8");
  return `<style>${css}</style>`;
});

html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*>\s*<\/script>/g, (_, src) => {
  const js = readFileSync(join(outDir, src.replace(/^\//, "")), "utf8");
  return `<script type="module">${js}</script>`;
});

const icon = readFileSync(join(root, "public/favicon.svg"), "utf8");
html = html.replace(/href="\/favicon\.svg"/, `href="data:image/svg+xml,${encodeURIComponent(icon)}"`);

if (html.includes('src="/') || html.includes("src='/") || html.includes('href="/assets/')) {
  throw new Error("Le HTML autonome référence encore un fichier externe.");
}
if (!html.includes("woff2")) {
  throw new Error("La police Inter n'est pas incluse dans le HTML autonome.");
}

mkdirSync(releaseDir, { recursive: true });
const target = join(releaseDir, releaseName);
writeFileSync(target, html);
const kilo = Math.round(Buffer.byteLength(html) / 1024);
process.stdout.write(`${target} (${kilo} Ko)\n`);
