"""Shared voltage definitions and palettes for local asset generators."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOLTAGE_DEFINITIONS = json.loads((ROOT / "src/content/voltages.json").read_text(encoding="utf-8"))
RULES = json.loads((ROOT / "src/content/rules.json").read_text(encoding="utf-8"))
VOLTAGES = [voltage["id"] for voltage in VOLTAGE_DEFINITIONS]
MAX_TIER = len(VOLTAGES)


def rgb(color: str) -> tuple[int, int, int]:
    return tuple(int(color[index:index + 2], 16) for index in (1, 3, 5))


def texture_key(tier: int) -> str:
    return VOLTAGE_DEFINITIONS[tier - 1]["textureKey"]


def load_models() -> list[dict]:
    import subprocess
    result = subprocess.run(
        ["node", "--import", "tsx", "--input-type=module", "-e",
         "import { CONTENT } from './src/content/index.ts'; process.stdout.write(JSON.stringify(CONTENT.models));"],
        cwd=ROOT, check=True, capture_output=True, encoding="utf-8",
    )
    return json.loads(result.stdout)


TIER_COLORS = {
    index + 1: rgb(voltage["color"])
    for index, voltage in enumerate(VOLTAGE_DEFINITIONS) if voltage["color"] is not None
}
MAX_RAINBOW = [rgb(color) for color in RULES["rainbow"]]


def tier_color(tier: int) -> tuple[int, int, int] | None:
    """返回该等级的染色；MAX 返回 None，表示用彩虹。"""
    return TIER_COLORS.get(tier)
