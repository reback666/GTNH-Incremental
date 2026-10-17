// Fast syntax / import-graph check: bundles the entry point without writing
// anything. PNG imports are stubbed, so this runs before the textures exist.
//
//   node gtnh3d/tools/check-bundle.mjs

import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Stub every .png with a tiny inline data URL so this check runs even before
// (or without) the extracted textures. Answering in onLoad keeps the default
// file loader from ever touching disk.
const stubPng = {
  name: "stub-png",
  setup(b) {
    b.onResolve({ filter: /\.png$/ }, (a) => ({ path: a.path, namespace: "png-stub" }));
    b.onLoad({ filter: /.*/, namespace: "png-stub" }, () => ({
      contents: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
      loader: "text",
    }));
  },
};

try {
  const out = await build({
    entryPoints: [join(ROOT, "src", "main.js")],
    bundle: true,
    format: "iife",
    target: ["es2020"],
    minify: true,
    write: false,
    loader: { ".png": "dataurl" },
    plugins: [stubPng],
    logLevel: "warning",
  });
  const bytes = out.outputFiles[0].contents.length;
  console.log(`✓ bundle OK — ${(bytes / 1024).toFixed(0)} KB (with stub textures)`);
} catch (err) {
  console.error("✗ bundle failed");
  console.error(err.message || err);
  process.exit(1);
}
