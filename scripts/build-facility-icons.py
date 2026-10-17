"""按内容目录的 texture.draw 配方生成电池、净化器、节点与抑制器图标。

图案在 16×16 机壳上合成，再以最近邻放大到 32×32。
面片型配方（包括计算机与研究站）由 build-machine-icons.py 生成。

用法：python -B scripts/build-facility-icons.py [--jar <GregTech jar>]
产物：src/assets/machines/<icon>.png，机型与电压范围取自内容注册器。
"""

from __future__ import annotations

import argparse
import glob
import io
import zipfile
from pathlib import Path

from PIL import Image

from gtnh_tiers import tint_casing, load_models, casing_voltage

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "src" / "assets" / "machines"

JAR_GLOB = str(
    Path.home()
    / ".gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/*/*/GT5-Unofficial-*-dev.jar"
)

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
    parser = argparse.ArgumentParser()
    parser.add_argument("--jar", type=Path, help="GregTech jar，默认从 Gradle 缓存查找")
    args = parser.parse_args()
    jar = args.jar or (glob.glob(JAR_GLOB) or [""])[0]
    if not jar:
        raise SystemExit("找不到 GT5-Unofficial jar")
    faces = {"battery": battery_face(), "purifier": purifier_face(), "node": node_face(), "suppressor": suppressor_face()}
    made = set()
    with zipfile.ZipFile(jar) as archive:
        for model in load_models():
            recipe = model.get("texture", {})
            if "draw" not in recipe or model["icon"] in made:
                continue
            tier = model["tier"]
            voltage = casing_voltage(tier)
            casing = Image.open(io.BytesIO(archive.read(
                f"assets/gregtech/textures/blocks/iconsets/MACHINE_{voltage}_SIDE.png"
            ))).convert("RGBA").crop((0, 0, 16, 16))
            icon = tint_casing(casing, tier)
            icon.alpha_composite(faces[recipe["draw"]])
            icon.resize((32, 32), Image.NEAREST).save(OUT_DIR / f"{model['icon']}.png")
            made.add(model["icon"])
    print(f"Generated {len(made)} facility icons")



if __name__ == "__main__":
    main()
