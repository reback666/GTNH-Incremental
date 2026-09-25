"""生成单方块机型的图标：机壳（按电压染色）+ 该机器的功能面片。

配方是从既有图标反推出来的，逐像素对得上：

    图标 = iconsets/MACHINE_<电压>_SIDE.png（灰度机壳，先按等级染色）
         + 该机器的面片（见下表），16×16 合成后最近邻放大到 32×32

GT 自己在运行时给机壳染色，之前这里漏了这步，导致各等级的机器图标只差亮度、分不清。
染色表见 scripts/gtnh_tiers.py。

多方块机器不在这里生成（它们是整套结构，用 wiki 整机图，见 build-multiblock-icons.py）；
存电装置 / 净化器 / 计算机 / 研究站在 build-facility-icons.py 里生成（同样是机壳 + 面片）。

用法：python scripts/build-machine-icons.py
产物：src/assets/machines/m-<等级>.png、c-<等级>.png、以及单方块发电机
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
ASSETS = "assets/gregtech/textures/blocks"

JAR_GLOB = str(
    Path.home()
    / ".gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/*/*/GT5-Unofficial-*-dev.jar"
)

VOLTAGES = [
    "ULV", "LV", "MV", "HV", "EV", "IV", "LuV", "ZPM",
    "UV", "UHV", "UEV", "UIV", "UXV", "MAX",
]
MAX_TIER = len(VOLTAGES)

# 魔法机器：LV~LuV，机壳在电压色的基础上再往「奥术紫」偏，一眼能和电力版区分
ARCANE_FROM_TIER = 2
ARCANE_TO_TIER = 7
ARCANE_TINT = (0xB0, 0x60, 0xFF)
ARCANE_TINT_STRENGTH = 0.55

MINER_FACE = f"{ASSETS}/basicmachines/miner/OVERLAY_FRONT.png"
MACHINE_FACE = f"{ASSETS}/basicmachines/macerator/OVERLAY_FRONT.png"
PLASMA_FACE = f"{ASSETS}/basicmachines/chemical_reactor/OVERLAY_FRONT.png"

# 单方块发电机：机型 id →（等级，面片）
SINGLE_GENERATORS: dict[str, tuple[int, str]] = {
    "g-ulv": (1, f"{ASSETS}/iconsets/STEAM_TURBINE_SIDE.png"),
    "g-lv-steam": (2, f"{ASSETS}/iconsets/STEAM_TURBINE_SIDE.png"),
    "g-lv-comb": (2, f"{ASSETS}/iconsets/DIESEL_GENERATOR_TOP.png"),
    "g-lv-gas": (2, f"{ASSETS}/iconsets/GAS_TURBINE_SIDE.png"),
    "g-mv-steam": (3, f"{ASSETS}/iconsets/STEAM_TURBINE_SIDE.png"),
    "g-mv-comb": (3, f"{ASSETS}/iconsets/DIESEL_GENERATOR_TOP.png"),
    "g-mv-gas": (3, f"{ASSETS}/iconsets/GAS_TURBINE_SIDE.png"),
    "g-hv-steam": (4, f"{ASSETS}/iconsets/STEAM_TURBINE_SIDE.png"),
    "g-hv-comb": (4, f"{ASSETS}/iconsets/DIESEL_GENERATOR_TOP.png"),
    "g-hv-gas": (4, f"{ASSETS}/iconsets/GAS_TURBINE_SIDE.png"),
    "g-ev-comb": (5, f"{ASSETS}/iconsets/DIESEL_GENERATOR_TOP.png"),
    "g-ev-gas": (5, f"{ASSETS}/iconsets/GAS_TURBINE_SIDE.png"),
    "g-ev-plasma": (5, PLASMA_FACE),
    "g-iv-comb": (6, f"{ASSETS}/iconsets/DIESEL_GENERATOR_TOP.png"),
    "g-iv-gas": (6, f"{ASSETS}/iconsets/GAS_TURBINE_SIDE.png"),
    "g-iv-plasma": (6, PLASMA_FACE),
}


def build(archive: zipfile.ZipFile, model_id: str, tier: int, face_path: str) -> None:
    casing = Image.open(
        io.BytesIO(archive.read(f"{ASSETS}/iconsets/MACHINE_{VOLTAGES[tier - 1]}_SIDE.png"))
    ).convert("RGBA")
    face = (
        Image.open(io.BytesIO(archive.read(face_path))).convert("RGBA").crop((0, 0, 16, 16))
    )
    icon = tint_casing(casing, tier)
    if model_id.startswith(("mm-", "mg-", "mc-")):
        icon = tint_arcane(icon)
    icon.alpha_composite(face)
    icon.resize((32, 32), Image.NEAREST).save(OUT_DIR / f"{model_id}.png")


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
    jar = (glob.glob(JAR_GLOB) or [""])[0]
    if not jar:
        raise SystemExit("找不到 GT5-Unofficial jar")

    count = 0
    with zipfile.ZipFile(jar) as archive:
        for tier in range(1, MAX_TIER + 1):
            build(archive, f"m-{tier}", tier, MINER_FACE)
            build(archive, f"c-{tier}", tier, MACHINE_FACE)
            count += 2
        for model_id, (tier, face_path) in SINGLE_GENERATORS.items():
            build(archive, model_id, tier, face_path)
            count += 1
        # 奥术宇宙的魔法机器：和同级电力机器同一套面片，只是机壳偏紫
        for tier in range(ARCANE_FROM_TIER, ARCANE_TO_TIER + 1):
            build(archive, f"mm-{tier}", tier, MINER_FACE)
            build(archive, f"mg-{tier}", tier, f"{ASSETS}/iconsets/STEAM_TURBINE_SIDE.png")
            build(archive, f"mc-{tier}", tier, MACHINE_FACE)
            count += 3
    print(f"共 {count} 个单方块机型图标（机壳按电压染色 + 面片）")


if __name__ == "__main__":
    main()
