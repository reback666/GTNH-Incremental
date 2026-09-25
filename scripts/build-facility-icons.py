"""生成设施（存电装置、净化器）的图标。

和机器图标同一套做法：底层是 GT 的 MACHINE_<电压>_SIDE 机壳，上面叠一个自画的图案。
图案是本项目自己画的像素画（GT 的储电箱、净化器贴图不在开发包里），
画好在 16×16 上再以最近邻放大到 32×32，保持像素硬边。

用法：python scripts/build-facility-icons.py
产物：src/assets/machines/b-<等级>.png（存电装置）、p-<等级>.png（净化器）
"""

from __future__ import annotations

import glob
import io
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "src" / "assets" / "machines"

JAR_GLOB = str(
    Path.home()
    / ".gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/*/*/GT5-Unofficial-*-dev.jar"
)

# 与 src/numeric/voltage.ts 的顺序一致，tier 1..14
VOLTAGES = [
    "ULV",
    "LV",
    "MV",
    "HV",
    "EV",
    "IV",
    "LuV",
    "ZPM",
    "UV",
    "UHV",
    "UEV",
    "UIV",
    "UXV",
    "MAX",
]

# 存电装置从 MV（tier 3）开始，和 src/game/models.ts 的 STORAGE_FROM_TIER 对齐
STORAGE_FROM_TIER = 3

OUTLINE = (24, 27, 34, 255)
BODY = (168, 176, 190, 255)
BODY_DARK = (96, 104, 118, 255)
FULL = (250, 205, 90, 255)
CHARGE = (120, 224, 160, 255)
EMPTY = (58, 64, 74, 255)


def battery_face() -> Image.Image:
    """16×16 的电池图案：外壳、接线柱、三格电量条。"""
    face = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = face.load()
    # 接线柱
    for x in range(6, 10):
        px[x, 3] = OUTLINE
    # 外壳
    for y in range(4, 13):
        for x in range(4, 12):
            edge = x in (4, 11) or y in (4, 12)
            px[x, y] = OUTLINE if edge else BODY_DARK
    # 内胆
    for y in range(6, 11):
        for x in range(6, 10):
            px[x, y] = EMPTY
    # 三格电量：满一格、充一格、空一格
    for x in range(6, 10):
        px[x, 10] = CHARGE
        px[x, 9] = BODY
    for x in range(6, 10):
        px[x, 7] = FULL
    return face


def purifier_face() -> Image.Image:
    """16×16 的净化器图案：过滤塔 + 排风口。"""
    face = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = face.load()
    # 排风口
    for x in range(6, 10):
        px[x, 2] = OUTLINE
        px[x, 3] = BODY
    # 塔身
    for y in range(4, 13):
        for x in range(4, 12):
            edge = x in (4, 11) or y in (4, 12)
            px[x, y] = OUTLINE if edge else BODY_DARK
    # 出风：干净气团
    for x in range(5, 11):
        px[x, 1] = CHARGE
    # 过滤层
    for x in range(6, 10):
        px[x, 6] = BODY
        px[x, 9] = BODY
        px[x, 11] = EMPTY
    return face


def main() -> None:
    jar = (glob.glob(JAR_GLOB) or [""])[0]
    if not jar:
        raise SystemExit("找不到 GT5-Unofficial jar")
    faces = {"b": battery_face(), "p": purifier_face()}
    with zipfile.ZipFile(jar) as archive:
        for tier in range(STORAGE_FROM_TIER, len(VOLTAGES) + 1):
            voltage = VOLTAGES[tier - 1]
            casing = Image.open(
                io.BytesIO(
                    archive.read(f"assets/gregtech/textures/blocks/iconsets/MACHINE_{voltage}_SIDE.png")
                )
            ).convert("RGBA")
            for prefix, face in faces.items():
                icon = casing.copy()
                icon.alpha_composite(face)
                icon = icon.resize((32, 32), Image.NEAREST)
                icon.save(OUT_DIR / f"{prefix}-{tier}.png")
            print(f"{voltage}: b-{tier} 存电装置 / p-{tier} 净化器 ← 机壳 MACHINE_{voltage}_SIDE")


if __name__ == "__main__":
    main()
