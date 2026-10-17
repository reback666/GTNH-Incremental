// Builds the self-contained single-file demo:
//   gtnh3d/src/main.js + src/hud.css + assets/tex/*.png
//     -> gtnh3d/dist/GTNH-3D-ULV-LV.html
//
// Everything (JS, CSS, and every 16x16 texture) is inlined, so the HTML runs
// from file:// with no server and no network access.

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, "src");
const TEX = join(ROOT, "assets", "tex");
const DIST = join(ROOT, "dist");

async function main() {
  await import("./tools/gen-floor-data.mjs");
  // ---- preflight: every texture referenced by src/textures.js must exist ---
  const missing = await missingTextures();
  if (missing.length) {
    console.error(`\n✗ ${missing.length} texture(s) missing from assets/tex:`);
    for (const m of missing.slice(0, 60)) console.error(`   - ${m}.png`);
    if (missing.length > 60) console.error(`   ... and ${missing.length - 60} more`);
    console.error("\nRun the texture extractor first (see gtnh3d/ASSETS.md).\n");
    process.exit(1);
  }

  await mkdir(DIST, { recursive: true });

  const result = await build({
    entryPoints: [join(SRC, "main.js")],
    bundle: true,
    format: "iife",
    target: ["es2020"],
    minify: true,
    legalComments: "none",
    write: false,
    outfile: join(DIST, "main.js"),
    loader: { ".png": "dataurl" },
    assetNames: "tex/[name]",
    logLevel: "warning",
  });
  const js = result.outputFiles[0].text;

  const template = await readFile(join(ROOT, "index.html"), "utf8");
  const css = await readFile(join(SRC, "hud.css"), "utf8");
  const html = template
    .replace("/*__CSS__*/", () => css)
    .replace("/*__JS__*/", () => js);

  const outFile = join(DIST, "GTNH-3D-ULV-LV.html");
  await writeFile(outFile, html, "utf8");

  // drop the intermediate bundle if an earlier build left one behind
  await rm(join(DIST, "main.js"), { force: true });

  const kb = (html.length / 1024).toFixed(0);
  const hash = createHash("sha256").update(html).digest("hex").slice(0, 12);
  const nTex = (await readdir(TEX)).filter((f) => f.endsWith(".png")).length;
  console.log(`✓ ${outFile.replace(ROOT + "\\", "")}`);
  console.log(`  ${kb} KB · ${nTex} textures inlined · sha256:${hash}`);
}

async function missingTextures() {
  const sources = await readFile(join(SRC, "textures.js"), "utf8");
  const keys = [...sources.matchAll(/assets\/tex\/([a-z0-9-]+)\.png/g)].map((m) => m[1]);
  const uniq = [...new Set(keys)].sort();
  if (!existsSync(TEX)) return uniq;
  const have = new Set((await readdir(TEX)).map((f) => f.replace(/\.png$/, "")));
  return uniq.filter((k) => !have.has(k));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
