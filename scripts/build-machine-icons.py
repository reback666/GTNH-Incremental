"""生成单方块机型的图标：机壳（按电压染色）+ 该机器的功能面片。

配方是从既有图标反推出来的，逐像素对得上：

    图标 = iconsets/MACHINE_<电压>_SIDE.png（灰度机壳，先按等级染色）
         + 该机器的面片（见下表），16×16 合成后最近邻放大到 32×32

GT 自己在运行时给机壳染色，之前这里漏了这步，导致各等级的机器图标只差亮度、分不清。
染色表见 scripts/gtnh_tiers.py。

多方块机器不在这里生成（它们是整套结构，用 wiki 整机图，见 build-multiblock-icons.py）；
绘制型设施在 build-facility-icons.py 里生成。面片与来源由 src/content/ 的 texture 配方指定。

用法：python scripts/build-machine-icons.py
产物：src/assets/machines/m-<等级>.png、c-<等级>.png、以及单方块发电机
"""

from __future__ import annotations

import glob
import io
import zipfile
import argparse
from contextlib import ExitStack
from pathlib import Path

from PIL import Image

from gtnh_tiers import tint_casing, load_models, casing_voltage

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "src" / "assets" / "machines"
ASSETS = "assets/gregtech/textures/blocks"

JAR_GLOB = str(
    Path.home()
    / ".gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/*/*/GT5-Unofficial-*-dev.jar"
)

ARCANE_TINT = (0xB0, 0x60, 0xFF)
ARCANE_TINT_STRENGTH = 0.55


def build(archive: zipfile.ZipFile, icon_key: str, tier: int, face_path: str, arcane: bool = False) -> None:
    casing = Image.open(
        io.BytesIO(archive.read(f"{ASSETS}/iconsets/MACHINE_{casing_voltage(tier)}_SIDE.png"))
    ).convert("RGBA").crop((0, 0, 16, 16))
    face = (
        Image.open(io.BytesIO(archive.read(face_path))).convert("RGBA").crop((0, 0, 16, 16))
    )
    icon = tint_casing(casing, tier)
    if arcane:
        icon = tint_arcane(icon)
    icon.alpha_composite(face)
    icon.resize((32, 32), Image.NEAREST).save(OUT_DIR / f"{icon_key}.png")


# 魔法机器的机壳：在电压色的基础上再混一层奥术紫，保留等级差别又能一眼认出是魔法版
def tint_arcane(casing: Image.Image) -> Image.Image:
    width, height = casing.size
    tinted = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    keep = 1 - ARCANE_TINT_STRENGTH
    for y in range(height):
        for x in range(width):
            pixel = casing.getpixel((x, y))
            if pixel[3] == 0:
                continue
            tinted.putpixel(
                (x, y),
                (
                    round(pixel[0] * keep + ARCANE_TINT[0] * ARCANE_TINT_STRENGTH),
                    round(pixel[1] * keep + ARCANE_TINT[1] * ARCANE_TINT_STRENGTH),
                    round(pixel[2] * keep + ARCANE_TINT[2] * ARCANE_TINT_STRENGTH),
                    pixel[3],
                ),
            )
    return tinted


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jar", type=Path, help="GregTech jar，默认从 Gradle 缓存查找")
    parser.add_argument("--resource-pack", type=Path, help="制造机采用的 Modernity-GTNH 材质包")
    args = parser.parse_args()
    jar = args.jar or (glob.glob(JAR_GLOB) or [""])[0]
    if not jar:
        raise SystemExit("找不到 GT5-Unofficial jar")

    count = 0
    with ExitStack() as stack:
        archive = stack.enter_context(zipfile.ZipFile(jar))
        assembler = stack.enter_context(zipfile.ZipFile(args.resource_pack)) if args.resource_pack else archive
        made = set()
        for model in load_models():
            recipe = model.get("texture", {})
            icon_key = model["icon"]
            if "face" not in recipe or icon_key in made:
                continue
            source = assembler if recipe.get("source") == "resourcePack" else archive
            build(source, icon_key, model["tier"], recipe["face"], recipe.get("arcane", False))
            made.add(icon_key)
            count += 1
    print(f"共 {count} 个单方块机型图标（机壳按电压染色 + 面片）")


if __name__ == "__main__":
    main()
