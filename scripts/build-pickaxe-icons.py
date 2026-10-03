"""生成镐子三条升级线的图标。

三条线各自的满级前的配色规则不同，但产物统一收在 src/assets/pickaxe/：

    金刚杵 vajra   用户材质包（Modernity-GTNH）的金刚杵本体贴图，
                   **全部 14 级都是动画条带**——本体按材质包 mcmeta 的序列流动（33 拍、
                   50ms/拍），发光曲线随等级换电压色（用户拍板）；
                   满级曲线改用无尽矿石的流动色（毕业 = 无尽材质）
    连锁采集 drill assets/ic2/textures/items/itemToolDrill.png（32×32，电动钻头）
    连锁爆破 blast assets/ic2/textures/items/itemDynamite.png（16×16，炸药）

drill / blast：1~13 级底图按感知亮度转明暗再乘电压色（静态 32×32）；
满级（14）输出**竖排 31 帧动画条带**（32×992，150ms/帧），颜色只取无尽矿石贴图
（src/assets/veins/t10.png，与矿脉面板同一份）里矿石斑点自己的颜色——灰白石底不参与。

用法：python scripts/build-pickaxe-icons.py
产物：32×32 或竖排动画条带（界面用矿脉动画同一套结构播放，元数据见 pickaxe-icons.ts）
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

# 无尽矿脉贴图（竖排帧条带）：drill / blast 满级的材质与节奏来源
INFINITY_STRIP = ROOT / "src" / "assets" / "veins" / "t10.png"

# 用户材质包（Modernity-GTNH）的金刚杵本体动画条带（16×256，16 帧）。
# 注意：材质包里另有 itemVajraCore.png，那是 Gravisuite 版金刚杵的电量指示层
# （100% 蓝芯 / 0% 红芯），与电压等级无关，不要合到图标上（2026-10-03 用户指正）。
VAJRA_BASE = ROOT / "scripts" / "textures" / "vajra-base.png"
# 材质包 mcmeta 里的播放序列：停 4 拍 → 1..15 → 14..1 往复；frametime 1 = 50ms
VAJRA_SEQUENCE: list[int] = [
    0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
]
VAJRA_FRAME_MS = 50

JAR_GLOB = str(
    Path.home()
    / ".gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/*/*/GT5-Unofficial-*-dev.jar"
)

MAX_TIER = 14

# 线 id →（来源 jar，贴图路径）；vajra 不走 jar，用材质包贴图单独处理
LINES: dict[str, tuple[str, str]] = {
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
    """静态电压色图标（drill / blast 的 1~13 级）。"""
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


def tint_vajra_strip(tier: int, ore_frames: list[Image.Image]) -> Image.Image:
    """金刚杵（材质包贴图）：本体动画保留、发光曲线按等级染色，输出竖排条带。

    只用本体条带（`vajra-base.png`）——材质包里的 `itemVajraCore.png` 是 Gravisuite
    版金刚杵的**电量指示层**（100% 蓝芯 / 0% 红芯），与电压等级无关，不往上合（用户指正）。
    本体里那条红色曲线是随帧呼吸的（明度逐帧变化），染色时只换色相/饱和度、保留每帧
    明度（下限 0.35 防糊黑），动画的呼吸感原样保留；满级曲线改用无尽矿石的流动色。
    """
    # 用户要求水平翻转：把手朝右、曲线从右上扫到左下（原版朝向反过来）
    base_strip = Image.open(VAJRA_BASE).convert("RGBA").transpose(Image.FLIP_LEFT_RIGHT)
    target = tier_color(tier)
    target_hsv = (
        colorsys.rgb_to_hsv(target[0] / 255, target[1] / 255, target[2] / 255) if target else None
    )

    out = Image.new("RGBA", (OUT_SIZE, OUT_SIZE * len(VAJRA_SEQUENCE)), (0, 0, 0, 0))
    for index, frame_id in enumerate(VAJRA_SEQUENCE):
        base = base_strip.crop((0, frame_id * 16, 16, (frame_id + 1) * 16)).copy()
        ore_frame = ore_frames[index * len(ore_frames) // len(VAJRA_SEQUENCE)]
        ore_map = nearest_ore_map(ore_frame)
        for y in range(16):
            for x in range(16):
                pixel = base.getpixel((x, y))
                if pixel[3] == 0:
                    continue
                hue, sat, val = colorsys.rgb_to_hsv(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255)
                if sat >= 0.35:  # 发光曲线：本体里唯一的彩色区域
                    if tier < MAX_TIER:
                        # 目标色的色相/饱和度/明度全部参与（有些等级色只差明度），
                        # 像素本帧的明度保留呼吸感
                        value = max(val * target_hsv[2], 0.35)
                        red, green, blue = (
                            round(c * 255)
                            for c in colorsys.hsv_to_rgb(target_hsv[0], target_hsv[1], value)
                        )
                        base.putpixel((x, y), (red, green, blue, pixel[3]))
                    else:  # 满级：曲线跟无尽矿石的流动色一起走
                        red, green, blue, _ = ore_map[(x % ore_frame.size[0], y % ore_frame.size[0])]
                        base.putpixel((x, y), (red, green, blue, pixel[3]))
        composed = base.resize((OUT_SIZE, OUT_SIZE), Image.NEAREST)
        out.paste(composed, (0, index * OUT_SIZE))
    return out


def dominant_ore_color(vein: Image.Image) -> tuple[int, int, int]:
    """矿脉贴图里「跟石头底色明显不同」的像素平均色 = 这一级矿物材质的钻头颜色。

    不能用饱和度筛：锻铁是白斑、硅岩是黑斑、中子素是银斑，全是低饱和的。
    石头底色取出现最多的像素色，与之色距超过阈值（噪声筛掉）的算矿石斑点。
    """
    frame = vein.crop((0, 0, vein.width, vein.width))
    counts: dict[tuple[int, int, int, int], int] = {}
    for y in range(frame.height):
        for x in range(frame.width):
            pixel = frame.getpixel((x, y))
            counts[pixel] = counts.get(pixel, 0) + 1
    background = max(counts, key=counts.get)
    picked = [
        pixel[:3]
        for pixel, count in counts.items()
        if sum((a - b) ** 2 for a, b in zip(pixel[:3], background[:3])) > 3600
    ]
    if not picked:
        return (150, 150, 150)
    return tuple(round(sum(c[i] for c in picked) / len(picked)) for i in range(3))


def tint_drill(source: Image.Image, mineral: tuple[int, int, int]) -> Image.Image:
    """连锁采集：机体保持 IC2 原版，右上角的金属钻头（低饱和且亮）染成矿物材质色。

    钻头上的深色纹路（饱和度低但偏暗）保持原样——金属沟槽的层次留得住。
    """
    image = source.convert("RGBA")
    tinted = image.copy()
    for y in range(image.height):
        for x in range(image.width):
            pixel = image.getpixel((x, y))
            if pixel[3] == 0:
                continue
            _, sat, val = colorsys.rgb_to_hsv(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255)
            if sat < 0.25 and val >= 0.45:
                shade = SHADE_FLOOR + (1 - SHADE_FLOOR) * luma(pixel)
                tinted.putpixel(
                    (x, y),
                    (round(mineral[0] * shade), round(mineral[1] * shade), round(mineral[2] * shade), pixel[3]),
                )
    return tinted


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
        "ic2": zipfile.ZipFile(find_jar(IC2_GLOB)),
    }
    infinity_strip = Image.open(INFINITY_STRIP).convert("RGBA")
    infinity_frames = [
        infinity_strip.crop((0, i * 32, 32, (i + 1) * 32))
        for i in range(infinity_strip.height // 32)
    ]

    # 金刚杵：材质包贴图，14 级全部是动画条带
    for tier in range(1, MAX_TIER + 1):
        strip = tint_vajra_strip(tier, infinity_frames)
        strip.save(OUT_DIR / f"vajra-{tier}.png")
    print(f"vajra: 材质包贴图 → {MAX_TIER} 条动画条带（{len(VAJRA_SEQUENCE)} 拍 × {VAJRA_FRAME_MS}ms）")

    # 连锁采集：机体保持 IC2 原版不上色，只有右上角的金属钻头随等级换成对应矿脉的材质色
    # （等级 n 开采 T(n-1) 矿脉，钻头就是那一级矿脉的材料）
    veins = Path(ROOT / "src" / "assets" / "veins")
    drill = Image.open(io.BytesIO(jars["ic2"].read(LINES["drill"][1])))
    for tier in range(1, MAX_TIER + 1):
        vein = Image.open(veins / f"t{tier - 1}.png").convert("RGBA")
        mineral = dominant_ore_color(vein)
        tint_drill(drill, mineral).save(OUT_DIR / f"drill-{tier}.png")
    print(f"drill: IC2 原版机体 + 矿脉材质色钻头 → {MAX_TIER} 张静态")

    # 连锁爆破：1~13 级电压色，满级无尽矿石流动
    blast = Image.open(io.BytesIO(jars["ic2"].read(LINES["blast"][1])))
    for tier in range(1, MAX_TIER):
        tint_tool(blast, tier).save(OUT_DIR / f"blast-{tier}.png")
    strip = tint_max_strip(blast, infinity_strip)
    strip.save(OUT_DIR / f"blast-{MAX_TIER}.png")
    print(f"blast: → {MAX_TIER - 1} 张静态 + 满级动画条带 {strip.size}")


if __name__ == "__main__":
    main()
