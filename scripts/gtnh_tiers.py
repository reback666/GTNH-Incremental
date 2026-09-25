"""GTNH 的 14 级电压配色，以及给机壳上色的工具。

GT 的机壳贴图（`iconsets/MACHINE_<电压>_SIDE.png`）本身是**灰度**的，
游戏里由 GT 在运行时按电压染色。
本项目的图标是离线合成的，必须自己补上这一步，否则各等级只差亮度、分不清。

注意力度：GTNH 里的机器本体其实是**深蓝灰金属**（wiki 上真实机器渲染图的主色是
48,48,64 / 64,64,80 / 80,80,96），鲜艳的等级色主要出现在电缆、电路上。
所以这里不是整块乘成饱和色，而是「金属底 + 等级色调」的淡染：
每个通道至少保留 FLOOR 的原始亮度，剩下部分才按等级色偏移。

配色取自 GTNH 中文 wiki「电力」页面里按等级上色的表（与 GT 自己的能量仓口贴图一致：
MV 橙、HV 金），MAX 是彩虹。
"""

from __future__ import annotations

from PIL import Image

# 淡染力度：0 = 完全保留金属灰，1 = 完全按等级色乘。
# 取 0.45 是照着「机器是金属，等级色只是偏向」的实机观感定的。
TINT_STRENGTH = 0.45

# tier（1 = ULV）→ 电压主色
TIER_COLORS: dict[int, tuple[int, int, int]] = {
    1: (0xFF, 0x55, 0x55),  # ULV 红
    2: (0x77, 0x88, 0x99),  # LV 石板灰
    3: (0xFF, 0x8C, 0x00),  # MV 橙
    4: (0xFF, 0xD7, 0x00),  # HV 金
    5: (0x69, 0x69, 0x69),  # EV 暗灰
    6: (0x41, 0x69, 0xE1),  # IV 宝蓝
    7: (0xFF, 0x00, 0xFF),  # LuV 品红
    8: (0x00, 0xCE, 0xD1),  # ZPM 青
    9: (0x00, 0x80, 0x00),  # UV 绿
    10: (0x8B, 0x00, 0x00),  # UHV 深红
    11: (0x8B, 0x00, 0x8B),  # UEV 深品红
    12: (0x00, 0x00, 0xCD),  # UIV 中蓝
    13: (0xAA, 0x00, 0x00),  # UXV 暗红
}

# MAX 没有单一主色，GT 里是彩虹，这里按横向彩虹上色
MAX_RAINBOW = [
    (0xFF, 0x55, 0x55),
    (0xFF, 0xAA, 0x00),
    (0xFF, 0xFF, 0x55),
    (0x55, 0xFF, 0x55),
    (0x55, 0xFF, 0xFF),
    (0x55, 0x55, 0xFF),
    (0xAA, 0x00, 0xAA),
    (0xFF, 0x55, 0xFF),
]


def tier_color(tier: int) -> tuple[int, int, int] | None:
    """返回该等级的染色；MAX（14）返回 None，表示用彩虹。"""
    if tier == 14:
        return None
    return TIER_COLORS[tier]


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
