"""生成镐子三条升级线的图标：1~13 级按电压配色，满级（14）是无尽矿石材质的流动动画。

三条线各一张底图：

    金刚杵 vajra   assets/gregtech/textures/items/gt.Tool_Vajra.png（16×16，金头红柄）
    连锁采集 drill assets/ic2/textures/items/itemToolDrill.png（32×32，电动钻头）
    连锁爆破 blast assets/ic2/textures/items/itemDynamite.png（16×16，炸药）

1~13 级：底图按感知亮度转成明暗，再乘上该等级的电压色（形状与层次保留，色相换成电压色）。
满级（MAX）：输出**竖排 31 帧的动画条带**（32×992），颜色只取无尽矿石贴图
（src/assets/veins/t10.png，与矿脉面板同一张、同一套 150ms/帧节奏）里**矿石斑点自己的颜色**
——灰白石底不参与（用户拍板），采不到斑点的格子取同一帧里最近的斑点色，
播放起来就是整把工具裹着一层流动的矿石材质。

用法：python scripts/build-pickaxe-icons.py
产物：src/assets/pickaxe/<线>-<等级>.png（32×32；满级为 32×(32×31) 的动画条带）
"""

from __future__ import annotations

import colorsys
import glob
import sys
from collections import deque
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gtnh_tiers import tier_color  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "src" / "assets" / "pickaxe"

# 满级动画的材质与节奏来源：无尽矿脉贴图（竖排帧条带，与矿脉面板共用同一份文件）
INFINITY_STRIP = ROOT / "src" / "assets" / "veins" / "t10.png"

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

# 「矿石斑点」的判定：饱和度 ≥ 0.2 即为矿石色（灰白石底饱和度接近 0，实测 0.36 封顶）
ORE_SATURATION_FLOOR = 0.2
ORE_VALUE_FLOOR = 0.3


def luma(pixel: tuple[int, int, int, int]) -> float:
    return (0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2]) / 255


def is_ore(pixel: tuple[int, int, int, int]) -> bool:
    if pixel[3] < 128:
        return False
    _, sat, val = colorsys.rgb_to_hsv(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255)
    return sat >= ORE_SATURATION_FLOOR and val >= ORE_VALUE_FLOOR


def nearest_ore_map(frame: Image.Image) -> dict[tuple[int, int], tuple[int, int, int, int]]:
    """帧内每一格 → 最近的矿石斑点颜色（灰石底与透明格子也被映射成斑点色）。

    从全部斑点格同时做 BFS 外扩，保证每个格子拿到的是「最近的那颗斑点」，
    斑点随帧移动时整张映射图跟着流动，不会出现灰底残块。
    """
    width, height = frame.size
    queue: deque[tuple[int, int]] = deque()
    result: dict[tuple[int, int], tuple[int, int, int, int]] = {}
    for y in range(height):
        for x in range(width):
            if is_ore(frame.getpixel((x, y))):
                queue.append((x, y))
                result[(x, y)] = frame.getpixel((x, y))
    while queue:
        x, y = queue.popleft()
        color = result[(x, y)]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in result:
                result[(nx, ny)] = color
                queue.append((nx, ny))
    return result


def tint_tool(source: Image.Image, tier: int) -> Image.Image:
    """1~13 级：明暗 × 电压色的静态图标。"""
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
            tinted.putpixel(
                (x, y),
                (round(color[0] * shade), round(color[1] * shade), round(color[2] * shade), pixel[3]),
            )
    return tinted.resize((width * scale, height * scale), Image.NEAREST)


def tint_max_strip(source: Image.Image, infinity_strip: Image.Image) -> Image.Image:
    """满级：无尽矿石材质的流动动画，输出竖排帧条带（帧大小 OUT_SIZE×OUT_SIZE）。"""
    image = source.convert("RGBA").resize((OUT_SIZE, OUT_SIZE), Image.NEAREST)
    frames = infinity_strip.height // infinity_strip.width
    frame_size = infinity_strip.width
    out = Image.new("RGBA", (OUT_SIZE, OUT_SIZE * frames), (0, 0, 0, 0))
    for index in range(frames):
        frame = infinity_strip.crop((0, index * frame_size, frame_size, (index + 1) * frame_size))
        ore_map = nearest_ore_map(frame)
        for y in range(OUT_SIZE):
            for x in range(OUT_SIZE):
                pixel = image.getpixel((x, y))
                if pixel[3] == 0:
                    continue
                color = ore_map[(x % frame_size, y % frame_size)]
                out.putpixel((x, index * OUT_SIZE + y), color)
    return out


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
    infinity_strip = Image.open(INFINITY_STRIP).convert("RGBA")
    frames = infinity_strip.height // infinity_strip.width

    try:
        for line, (jar_id, path) in LINES.items():
            source = Image.open(io.BytesIO(jars[jar_id].read(path)))
            for tier in range(1, MAX_TIER):
                tint_tool(source, tier).save(OUT_DIR / f"{line}-{tier}.png")
            strip = tint_max_strip(source, infinity_strip)
            strip.save(OUT_DIR / f"{line}-{MAX_TIER}.png")
            print(f"{line}: {path} → {MAX_TIER - 1} 张静态 + 满级动画条带 {strip.size}")
    finally:
        for archive in jars.values():
            archive.close()

    print(f"满级动画 {frames} 帧 × 150ms（与无尽矿脉贴图同节奏），共写入 {len(LINES) * MAX_TIER} 个文件")


if __name__ == "__main__":
    main()
