"""Report per-layer material composition of the decoded blueprint grid."""
import json
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "gtnh3d" / "assets" / "floor.bin"
PAL = ROOT / "gtnh3d" / "assets" / "floor-palette.json"

raw = BIN.read_bytes()
size = int.from_bytes(raw[:4], "little")
plen = int.from_bytes(raw[4:8], "little")
cells = raw[8 : 8 + size * size]
palette = json.loads(PAL.read_text(encoding="utf-8"))
print(f"size={size} paletteLen={plen} cells={len(cells)}")

# floor.bin stores only the top-most non-air material per column (1 layer).
per = collections.Counter(palette[i] if isinstance(palette, list) else str(i) for i in cells)
print("floor.bin composition:", dict(per))

# Re-decode the original blueprint to inspect real layers.
bp = json.loads((ROOT / ".tmp-blueprint" / "bp13476.bin").read_text(encoding="utf-8"))
nbt = bp["statePosArrayList"]
print("blueprint keys:", list(bp.keys()))
print("nbt starts:", nbt[:80])
