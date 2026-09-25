"""生成镐子三条升级线的 14 级图标：GT / IC2 的工具贴图按电压配色上色。

三条线各一张底图：

    金刚杵 vajra   assets/gregtech/textures/items/gt.Tool_Vajra.png（16×16，金头红柄）
    连锁采集 drill assets/ic2/textures/items/itemToolDrill.png（32×32，电动钻头）
    连锁爆破 blast assets/ic2/textures/items/itemDynamite.png（16×16，炸药）

底图本身是彩色的，直接淡染（机器那套 tint_casing）几乎看不出等级差别，
所以这里先按感知亮度转成明暗，再乘上该等级的电压色 —— 形状与层次保留，色相换成电压色。

配色表复用 scripts/gtnh_tiers.py（与机器图标同一套），MAX 用横向彩虹。

用法：python scripts/build-pickaxe-icons.py
产物：src/assets/pickaxe/<线>-<等级>.png（32×32，与机器图标同规格）
"""

from __future__ import annotations

import glob
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gtnh_tiers import MAX_RAINBOW, tier_color  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "src" / "assets" / "pickaxe"

JAR_GLOB = str(
    Path.home()
    / ".gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/*/*/GT5-Unofficial-*-dev.jar"
)

MAX_TIER = 14

# 线 id →（来源 jar，贴图路径）
LINES: dict[str, tuple[str, str]] = {
    "vajra": ("gt", "assets/gregtech/textures/items/gt.Tool_Vajra.png"),
    "drill": ("ic2", "assets/ic2/textures/items/itemToolDrill.png"),
    "blast": ("ic2", "assets/ic2/textures/items/itemDynamite.png"),
}

OUT_SIZE = 32

# 明暗下限：原图的暗红柄亮度只有 0.19，直接用会把柄压成黑色，看不出形状。
SHADE_FLOOR = 0.45


def luma(pixel: tuple[int, int, int, int]) -> float:
    return (0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2]) / 255


def tint_tool(source: Image.Image, tier: int) -> Image.Image:
    image = source.convert("RGBA")
    width, height = image.size
    scale = max(1, OUT_SIZE // max(width, height))
    tinted = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    color = tier_color(tier)

    for y in range(height):
        for x in range(width):
            pixel = image.getpixel((x, y))
            if pixel[3] == 0:
                continue
            shade = SHADE_FLOOR + (1 - SHADE_FLOOR) * luma(pixel)
            if color is None:
                index = min(len(MAX_RAINBOW) - 1, x * len(MAX_RAINBOW) // max(1, width))
                base = MAX_RAINBOW[index]
            else:
                base = color
            tinted.putpixel(
                (x, y),
                (round(base[0] * shade), round(base[1] * shade), round(base[2] * shade), pixel[3]),
            )
    return tinted.resize((width * scale, height * scale), Image.NEAREST)


def find_jar(pattern: str) -> Path:
    matches = sorted(glob.glob(pattern))
    if not matches:
        raise SystemExit(f"没找到开发包：{pattern}")
    return Path(matches[-1])


IC2_GLOB = str(
    Path.home()
    / ".gradle/caches/modules-2/files-2.1/curse.maven/ic2-*/*/*/ic2-*.jar"
)


def main() -> None:
    import io
    import zipfile

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    jars = {
        "gt": zipfile.ZipFile(find_jar(JAR_GLOB)),
        "ic2": zipfile.ZipFile(find_jar(IC2_GLOB)),
    }

    try:
        for line, (jar_id, path) in LINES.items():
            source = Image.open(io.BytesIO(jars[jar_id].read(path)))
            for tier in range(1, MAX_TIER + 1):
                tint_tool(source, tier).save(OUT_DIR / f"{line}-{tier}.png")
            print(f"{line}: {path} → {MAX_TIER} 张")
    finally:
        for archive in jars.values():
            archive.close()

    print(f"共写入 {len(LINES) * MAX_TIER} 张工具图标到 {OUT_DIR}")


if __name__ == "__main__":
    main()
