import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function decodeFloorBlueprint(blueprint) {
  const payload = blueprint.statePosArrayList;
  const position = (key) => {
    const body = new RegExp(`${key}:\\{([^}]+)\\}`).exec(payload)?.[1];
    if (!body) throw new Error(`Missing ${key}`);
    return ["X", "Y", "Z"].map((axis) => {
      const value = new RegExp(`${axis}:(-?\\d+)`).exec(body)?.[1];
      if (value === undefined) throw new Error(`Missing ${key}.${axis}`);
      return Number(value);
    });
  };
  const start = position("startpos");
  const dimensions = position("endpos").map((end, i) => end - start[i] + 1);
  const [size, layers, depth] = dimensions;
  if (size !== depth || dimensions.some((n) => n <= 0)) {
    throw new Error(`Expected a square floor module, got ${dimensions}`);
  }
  const paletteText = /blockstatemap:\[([\s\S]*?)\],endpos:/.exec(payload)?.[1];
  const palette = [...(paletteText || "").matchAll(/Name:"minecraft:([^"]+)"/g)].map((m) => m[1]);
  const stateText = /statelist:\[I;([^\]]*)\]/.exec(payload)?.[1];
  const states = stateText?.split(",").map(Number);
  if (!palette.length || palette.length > 256 || states?.length !== size * layers * depth) {
    throw new Error("Invalid blueprint palette or cell count");
  }
  if (states.some((n) => !Number.isInteger(n) || n < 0 || n >= palette.length)) {
    throw new Error("Invalid blueprint palette index");
  }

  const cells = new Uint8Array(states.length);
  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < layers; y++) {
      for (let x = 0; x < size; x++) {
        // Building Gadgets advances X, then Y, then Z. Runtime layers use X/Z/Y.
        cells[x + z * size + y * size * depth] = states[x + y * size + z * size * layers];
      }
    }
  }
  return { size, layers, palette, cells };
}

export function writeFloorData() {
  const blueprint = JSON.parse(readFileSync(join(ROOT, "assets", "floor-blueprint.json"), "utf8"));
  const { size, layers, palette, cells } = decodeFloorBlueprint(blueprint);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(size, 0);
  header.writeUInt32LE(palette.length, 4);
  header.writeUInt32LE(layers, 8);
  writeFileSync(join(ROOT, "assets", "floor.bin"), Buffer.concat([header, cells, Buffer.from(palette.join("|"))]));
  writeFileSync(join(ROOT, "assets", "floor-palette.json"), JSON.stringify({ size, layers, palette }, null, 2) + "\n");
  console.log(`floor.bin: ${size}x${size}x${layers}, X/Y/Z source reordered into X/Z/Y layers`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) writeFloorData();
