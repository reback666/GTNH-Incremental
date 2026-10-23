"""GTNH 的电压配色，以及给机壳上色的工具。

GT 的机壳贴图（`iconsets/MACHINE_<电压>_SIDE.png`）本身是**灰度**的，
游戏里由 GT 在运行时按电压染色。
旧等距场景机壳素材使用离线染色；机器物品图标则由游戏原生导出，不经过这里。

注意力度：用户从游戏里截的图显示，GTNH 这些机器**本体几乎是黑色/深灰**
（有效像素多为 32,32,32 / 20,20,20），等级颜色只出现在很小的部位上
（LuV 有粉色 200,188,188、ZPM 有亮灰 140,140,140）。
所以机身只做很轻的染色（TINT_STRENGTH），保留 GT 的深色金属观感 ——
不再往图标上叠任何标记，等级靠面板里的等级名与机器名区分。

配色取自 GTNH 中文 wiki「电力」页面里按等级上色的表（与 GT 自己的能量仓口贴图一致：
MV 橙、HV 金），MAX 是彩虹。
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
VOLTAGE_DEFINITIONS = json.loads((ROOT / "src/content/voltages.json").read_text(encoding="utf-8"))
RULES = json.loads((ROOT / "src/content/rules.json").read_text(encoding="utf-8"))
VOLTAGES = [voltage["id"] for voltage in VOLTAGE_DEFINITIONS]
MAX_TIER = len(VOLTAGES)


def rgb(color: str) -> tuple[int, int, int]:
    return tuple(int(color[index:index + 2], 16) for index in (1, 3, 5))


def texture_key(tier: int) -> str:
    return VOLTAGE_DEFINITIONS[tier - 1]["textureKey"]


def casing_voltage(tier: int) -> str:
    voltage = VOLTAGE_DEFINITIONS[tier - 1]
    return voltage.get("casingVoltage", voltage["id"])


def load_models() -> list[dict]:
    import subprocess
    result = subprocess.run(
        ["node", "--import", "tsx", "--input-type=module", "-e",
         "import { CONTENT } from './src/content/index.ts'; process.stdout.write(JSON.stringify(CONTENT.models));"],
        cwd=ROOT, check=True, capture_output=True, encoding="utf-8",
    )
    return json.loads(result.stdout)


# 淡染力度：0 = 完全保留金属灰，1 = 完全按等级色乘。
# 取 0.2 是照着实机那种「黑机身、只透出一点色相」的观感定的。
TINT_STRENGTH = 0.2

TIER_COLORS = {
    index + 1: rgb(voltage["color"])
    for index, voltage in enumerate(VOLTAGE_DEFINITIONS) if voltage["color"] is not None
}
MAX_RAINBOW = [rgb(color) for color in RULES["rainbow"]]


def tier_color(tier: int) -> tuple[int, int, int] | None:
    """返回该等级的染色；MAX 返回 None，表示用彩虹。"""
    return TIER_COLORS.get(tier)


def _tint(pixel: tuple[int, int, int, int], color: tuple[int, int, int]):
    floor = 1 - TINT_STRENGTH
    return (
        round(pixel[0] * (floor + TINT_STRENGTH * color[0] / 255)),
        round(pixel[1] * (floor + TINT_STRENGTH * color[1] / 255)),
        round(pixel[2] * (floor + TINT_STRENGTH * color[2] / 255)),
        pixel[3],
    )


def tint_casing(casing: Image.Image, tier: int) -> Image.Image:
    """把灰度机壳按等级染色，返回新图（不改原图）。"""
    source = casing.convert("RGBA")
    width, height = source.size
    tinted = Image.new("RGBA", (width, height), (0, 0, 0, 0))

    color = tier_color(tier)
    for y in range(height):
        for x in range(width):
            pixel = source.getpixel((x, y))
            if pixel[3] == 0:
                continue
            if color is None:
                # MAX：按横坐标在彩虹里取色
                index = min(len(MAX_RAINBOW) - 1, x * len(MAX_RAINBOW) // max(1, width))
                tinted.putpixel((x, y), _tint(pixel, MAX_RAINBOW[index]))
            else:
                tinted.putpixel((x, y), _tint(pixel, color))
    return tinted
