"""生成设施（存电装置、净化器、计算机、研究站）的图标。

和机器图标同一套做法：底层是 GT 的 MACHINE_<电压>_SIDE 机壳，上面叠一个自画的图案。
图案是本项目自己画的像素画（GT 的储电箱、净化器贴图不在开发包里），
画好在 16×16 上再以最近邻放大到 32×32，保持像素硬边。

计算机与研究站用的是 GT 自己的面片（EM_COMPUTER、OVERLAY_FRONT_RESEARCH_COMPLETER），
只有一个型号所以直接取第一帧。

多方块机器的图标不在这里生成：它们是整套结构，用的是 wiki 上的整机图，
见 scripts/build-multiblock-icons.py。

用法：python scripts/build-facility-icons.py
产物：src/assets/machines/b-<等级>.png（存电装置）、p-<等级>.png（净化器）、
      x-<等级>.png（计算机）、r-<等级>.png（研究站）
"""

from __future__ import annotations

import glob
import io
import zipfile
from pathlib import Path

from PIL import Image

from gtnh_tiers import tint_casing

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
# 净化器从 LV（tier 2）开始，和 src/game/models.ts 的 PURIFIER_FROM_TIER 对齐
PURIFIER_FROM_TIER = 2
# 计算机与研究站从 LuV（tier 7）开始，和 numeric/research.ts 的 RESEARCH_FROM_TIER 对齐
RESEARCH_FROM_TIER = 7

# 这两张是 GT 自带的面片，直接贴在机壳上
COMPUTER_FACE = "assets/gregtech/textures/blocks/iconsets/EM_COMPUTER.png"
LAB_FACE = "assets/gregtech/textures/blocks/iconsets/OVERLAY_FRONT_RESEARCH_COMPLETER.png"

OUTLINE = (24, 27, 34, 255)
BODY = (168, 176, 190, 255)
BODY_DARK = (96, 104, 118, 255)
FULL = (250, 205, 90, 255)
CHARGE = (120, 224, 160, 255)
EMPTY = (58, 64, 74, 255)
AURA = (150, 110, 210, 255)
AURA_LIGHT = (216, 190, 255, 255)


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


def node_face() -> Image.Image:
    """16×16 的灵气节点图案：底座 + 悬浮的灵气结晶。"""
    face = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = face.load()
    # 底座
    for x in range(4, 12):
        px[x, 12] = OUTLINE
        px[x, 11] = BODY_DARK
    # 悬浮结晶（上窄下宽的菱形）
    rows = [(7, 9), (6, 10), (6, 10), (6, 10), (7, 9)]
    for index, (left, right) in enumerate(rows):
        for x in range(left, right):
            px[x, 3 + index] = AURA
    for x, y in ((7, 4), (7, 5), (8, 3)):
        px[x, y] = AURA_LIGHT
    return face


def suppressor_face() -> Image.Image:
    """16×16 的腐蚀抑制器图案：带铆钉的抗腐蚀护盾板。"""
    face = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = face.load()
    # 板身
    for y in range(4, 13):
        for x in range(3, 13):
            edge = x in (3, 12) or y in (4, 12)
            px[x, y] = OUTLINE if edge else BODY_DARK
    # 中间的护盾标记（抗腐蚀）
    for y in range(6, 11):
        for x in range(6, 10):
            px[x, y] = CHARGE
    for x, y in ((5, 5), (10, 5), (5, 10), (10, 10)):
        px[x, y] = BODY
    return face


def main() -> None:
    jar = (glob.glob(JAR_GLOB) or [""])[0]
    if not jar:
        raise SystemExit("找不到 GT5-Unofficial jar")
    faces = {"b": battery_face(), "p": purifier_face()}
    nodes = node_face()
    suppressors = suppressor_face()
    with zipfile.ZipFile(jar) as archive:
        # 计算机的贴图是 5 帧的竖排条带，取最上面一格
        computer = Image.open(io.BytesIO(archive.read(COMPUTER_FACE))).convert("RGBA").crop(
            (0, 0, 16, 16)
        )
        lab = Image.open(io.BytesIO(archive.read(LAB_FACE))).convert("RGBA")
        research_faces = {"x": computer, "r": lab}
        for tier in range(PURIFIER_FROM_TIER, len(VOLTAGES) + 1):
            voltage = VOLTAGES[tier - 1]
            casing = Image.open(
                io.BytesIO(
                    archive.read(f"assets/gregtech/textures/blocks/iconsets/MACHINE_{voltage}_SIDE.png")
                )
            ).convert("RGBA")
            casing = tint_casing(casing, tier)
            made: list[str] = []
            if tier >= STORAGE_FROM_TIER:
                icon = casing.copy()
                icon.alpha_composite(faces["b"])
                icon = icon.resize((32, 32), Image.NEAREST)
                icon.save(OUT_DIR / f"b-{tier}.png")
                made.append(f"b-{tier} 存电装置")
            if tier >= PURIFIER_FROM_TIER:
                icon = casing.copy()
                icon.alpha_composite(faces["p"])
                icon = icon.resize((32, 32), Image.NEAREST)
                icon.save(OUT_DIR / f"p-{tier}.png")
                made.append(f"p-{tier} 净化器")
            if tier >= RESEARCH_FROM_TIER:
                for prefix, face in research_faces.items():
                    icon = casing.copy()
                    icon.alpha_composite(face)
                    icon = icon.resize((32, 32), Image.NEAREST)
                    icon.save(OUT_DIR / f"{prefix}-{tier}.png")
                made.append(f"x-{tier} 计算机 / r-{tier} 研究站")
            print(f"{voltage}: {' / '.join(made)} ← 机壳 MACHINE_{voltage}_SIDE")

        # 灵气节点：每一级都有（奥术宇宙专属），面片是自己画的灵气结晶
        for tier in range(1, len(VOLTAGES) + 1):
            voltage = VOLTAGES[tier - 1]
            casing = Image.open(
                io.BytesIO(
                    archive.read(f"assets/gregtech/textures/blocks/iconsets/MACHINE_{voltage}_SIDE.png")
                )
            ).convert("RGBA")
            node = tint_casing(casing, tier)
            node.alpha_composite(nodes)
            node.resize((32, 32), Image.NEAREST).save(OUT_DIR / f"n-{tier}.png")
        print(f"{len(VOLTAGES)} 个灵气节点图标 ← 机壳 + 灵气结晶")

        # 腐蚀抑制器：每一级都有（深渊宇宙专属），面片是自己画的护盾板
        for tier in range(1, len(VOLTAGES) + 1):
            voltage = VOLTAGES[tier - 1]
            casing = Image.open(
                io.BytesIO(
                    archive.read(f"assets/gregtech/textures/blocks/iconsets/MACHINE_{voltage}_SIDE.png")
                )
            ).convert("RGBA")
            suppressor = tint_casing(casing, tier)
            suppressor.alpha_composite(suppressors)
            suppressor.resize((32, 32), Image.NEAREST).save(OUT_DIR / f"s-{tier}.png")
        print(f"{len(VOLTAGES)} 个腐蚀抑制器图标 ← 机壳 + 护盾板")



if __name__ == "__main__":
    main()
