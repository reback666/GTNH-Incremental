#!/usr/bin/env python3
"""Extract every block texture the 3D demo needs into gtnh3d/assets/tex/.

Sources (read-only):
  * Modernity-GTNH resource pack (Prism instance)
  * vanilla 1.7.10 client.jar (gradle cache)

Every output is normalised to 16x16 RGBA (nearest-neighbour, first animation
frame only) so the runtime atlas is uniform. The key -> source table below is
the contract the renderer depends on (see src/textures.js).

  python gtnh3d/tools/extract-textures.py [--check] [--list]
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent  # gtnh3d/
OUT = ROOT / "assets" / "tex"

PACK = Path(
    r"D:\Prism\PrismLauncher\instances\GT_New_Horizons_2.8.4_Java_17-25"
    r"\.minecraft\resourcepacks\Modernity-GTNH-9ebdeed-pre.zip"
)
VANILLA = Path(
    r"C:\Users\29797\.gradle\caches\retro_futura_gradle\mc-vanilla\1.7.10\client.jar"
)

GT = "assets/gregtech/textures/blocks/"
MC = "assets/minecraft/textures/blocks/"
MISC = "assets/miscutils/textures/blocks/iconsets/"

# --- machine bases ----------------------------------------------------------
for _t in ("ULV", "LV"):
    for _f in ("SIDE", "TOP", "BOTTOM"):
        pass

# key: (source_kind, path_inside_container)
TABLE: dict[str, tuple[str, str]] = {}


def add(key: str, path: str, kind: str = "mod") -> None:
    TABLE[key] = (kind, path)


# ---- tier bases + casings --------------------------------------------------
for tier in ("ulv", "lv"):
    T = tier.upper()
    add(f"machine-{tier}-side", f"{GT}iconsets/MACHINE_{T}_SIDE.png")
    add(f"machine-{tier}-top", f"{GT}iconsets/MACHINE_{T}_TOP.png")
    add(f"machine-{tier}-bottom", f"{GT}iconsets/MACHINE_{T}_BOTTOM.png")

for tier, name in [
    ("ulv", "ULV"), ("lv", "LV"), ("mv", "MV"), ("hv", "HV"), ("ev", "EV"),
    ("iv", "IV"), ("luv", "LuV"), ("zpm", "ZPM"), ("uv", "UV"),
]:
    add(f"casing-{tier}", f"{MISC}TieredHulls/CASING_{name}.png")

# GT5U has no HULL_* texture anywhere: the tier casing is the hull face.
for face, f in (("side", "SIDE"), ("top", "TOP"), ("bottom", "BOTTOM")):
    add(f"hull-ulv-{face}", f"{MISC}TieredHulls/CASING_ULV.png")

# ---- overlays --------------------------------------------------------------
add("overlay-energy-in", f"{GT}iconsets/OVERLAY_ENERGY_IN.png")
add("overlay-energy-out", f"{GT}iconsets/OVERLAY_ENERGY_OUT.png")
add("overlay-heat", f"{GT}iconsets/OVERLAY_FRONT_HEAT_EXCHANGER.png")
add("overlay-void", f"{GT}iconsets/VOID.png")
add("overlay-contamination", f"{GT}iconsets/POLLUTOR.png")
add("water-still", f"{MC}water_still.png")
add("casing-heatproof", f"{GT}iconsets/MACHINE_HEATPROOFCASING.png")
add("casing-bricked-blast-furnace", f"{GT}iconsets/MACHINE_CASING_BRICKEDBLASTFURNACE_INACTIVE.png")
add("casing-bricked-blast-furnace-active", f"{GT}iconsets/MACHINE_CASING_BRICKEDBLASTFURNACE_ACTIVE.png")

# ---- machine function overlays --------------------------------------------
# Only the faces that actually exist in the pack are listed; machines without a
# SIDE/TOP overlay keep the tier base there (exactly what GT5U does).
OVERLAYS: dict[str, list[str]] = {
    "macerator": ["FRONT", "TOP"],
    "alloy-smelter": ["FRONT", "SIDE", "TOP", "BOTTOM"],
    "compressor": ["FRONT", "SIDE", "TOP"],
    "extractor": ["FRONT", "SIDE", "TOP"],
    "electric-furnace": ["FRONT"],
    "wiremill": ["FRONT", "SIDE", "TOP"],
    "hammer": ["FRONT"],
    "fluid-heater": ["FRONT", "SIDE", "TOP"],
    "fluid-solidifier": ["FRONT"],
    "ore-washer": ["FRONT", "SIDE"],
}
for machine, faces in OVERLAYS.items():
    d = machine.replace("-", "_")
    for face in faces:
        f = face.lower()
        add(f"overlay-{machine}-{f}", f"{GT}basicmachines/{d}/OVERLAY_{face}.png")
        add(
            f"overlay-{machine}-{f}-active",
            f"{GT}basicmachines/{d}/OVERLAY_{face}_ACTIVE.png",
        )

# ---- floor (blueprint bp-13476 palette) -----------------------------------
FLOOR: dict[str, tuple[str, str]] = {
    "floor-gray-concrete": ("mod", f"{MC}gray_concrete.png"),
    "floor-white-concrete": ("mod", f"{MC}white_concrete.png"),
    "floor-black-concrete": ("mod", f"{MC}black_concrete.png"),
    "floor-cyan-terracotta": ("mod", f"{MC}hardened_clay_stained_cyan.png"),
    "floor-yellow-terracotta": ("mod", f"{MC}hardened_clay_stained_yellow.png"),
    "floor-moss-block": ("mod", f"{MC}moss_block.png"),
    "floor-grass-block": ("mod", f"{MC}grass_top.png"),
    "floor-bricks": ("mod", f"{MC}brick.png"),
    "floor-iron-trapdoor": ("mod", f"{MC}iron_trapdoor.png"),
    "floor-verdant-froglight": ("mod", f"{MC}sea_lantern.png"),
    "floor-pearlescent-froglight": ("mod", f"{MC}glowstone.png"),
    "floor-polished-diorite": ("mod", f"{MC}polished_diorite.png"),
    "floor-polished-granite": ("mod", f"{MC}polished_granite.png"),
    # no dedicated slab textures in 1.7.10-era packs: use the full block
    "floor-polished-andesite-slab": ("mod", f"{MC}polished_andesite.png"),
    "floor-smooth-quartz-slab": ("mod", f"{MC}quartz_block_side.png"),
    "floor-polished-diorite-stairs": ("mod", f"{MC}polished_diorite.png"),
}
for key, (_kind, path) in FLOOR.items():
    add(key, path)

# glowstone/sea_lantern live under a different path in some packs; resolve later
ALIASES = {
    "floor-pearlescent-froglight": [
        f"{MC}glowstone.png",
        "assets/minecraft/textures/blocks/glowstone.png",
    ],
    "floor-verdant-froglight": [
        f"{MC}sea_lantern.png",
        "assets/minecraft/textures/blocks/sea_lantern.png",
    ],
}


def load_frames(zf: zipfile.ZipFile, path: str) -> Image.Image | None:
    try:
        data = zf.read(path)
    except KeyError:
        return None
    img = Image.open(io.BytesIO(data))
    img.load()
    # animation strips are stacked vertically: keep the first frame
    if img.height > img.width and img.height % img.width == 0:
        img = img.crop((0, 0, img.width, img.width))
    return img.convert("RGBA")


def normalize(img: Image.Image, box: int = 16) -> Image.Image:
    if img.width != box or img.height != box:
        img = img.resize((box, box), Image.NEAREST)
    return img


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify without writing")
    ap.add_argument("--list", action="store_true", help="print the key table")
    args = ap.parse_args()

    if args.list:
        for k in sorted(TABLE):
            print(f"{k:44s} {TABLE[k][0]:8s} {TABLE[k][1]}")
        print(f"\n{len(TABLE)} keys")
        return 0

    if not PACK.exists():
        print(f"✗ resource pack not found: {PACK}", file=sys.stderr)
        return 2
    if not VANILLA.exists():
        print(f"✗ vanilla client.jar not found: {VANILLA}", file=sys.stderr)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    report: list[dict] = []
    missing: list[str] = []

    with zipfile.ZipFile(PACK) as pack, zipfile.ZipFile(VANILLA) as van:
        for key, (_kind, path) in sorted(TABLE.items()):
            candidates = [path, *ALIASES.get(key, [])]
            img = None
            used = None
            for cand in candidates:
                img = load_frames(pack, cand)
                if img is not None:
                    used = f"Modernity:{cand}"
                    break
            if img is None:
                for cand in candidates:
                    img = load_frames(van, cand)
                    if img is not None:
                        used = f"vanilla1.7.10:{cand}"
                        break
            if img is None:
                missing.append(key)
                report.append({"key": key, "status": "MISSING", "tried": candidates})
                continue

            before = img.size
            img = normalize(img)
            if not args.check:
                img.save(OUT / f"{key}.png", optimize=True)
            report.append(
                {
                    "key": key,
                    "status": "ok",
                    "source": used,
                    "from": f"{before[0]}x{before[1]}",
                    "to": f"{img.width}x{img.height}",
                    "bytes": (OUT / f"{key}.png").stat().st_size if not args.check else 0,
                }
            )

    if not args.check:
        (ROOT / "assets" / "tex" / "MANIFEST.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    ok = [r for r in report if r["status"] == "ok"]
    vanilla_used = [r for r in ok if r["source"].startswith("vanilla")]
    print(f"keys: {len(TABLE)}  written: {len(ok)}  missing: {len(missing)}  from vanilla jar: {len(vanilla_used)}")
    for r in vanilla_used:
        print(f"  ↳ vanilla fallback: {r['key']} <- {r['source']}")
    if missing:
        print("MISSING:")
        for k in missing:
            print(f"  ✗ {k}  tried {TABLE[k][1]}")
        return 1
    if args.check:
        print("✓ all keys resolvable")
    else:
        print(f"✓ wrote {len(ok)} textures to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
