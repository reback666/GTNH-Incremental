"""生成矿脉贴图：把原版 GT 的矿石动画逐帧套到已验收的矿脉图标上。

原版矿石方块是两层贴图加一个动画叠加层：
  石头底（<材料>/ore.png 或通用外形 ore.png）+ 染料色染过的矿石斑点 + ore_OVERLAY.png 动画帧。
本项目沿用 src/assets/veins/base/*.png 作为石头与斑点形状（已验收的观感），
只把「动画」这一层补上：按原版 mcmeta 的帧顺序与 frametime，逐帧重绘矿石斑点。

用法：
  python scripts/build-veins.py [--jar <GT5-Unofficial jar>]

产物：
  src/assets/veins/tN.png    贴图条带（宽 32，高 32×帧数），Minecraft 同款逐帧动画格式
  src/game/vein-meta.ts      每级的帧数与帧长（毫秒），界面按它播放
  src/assets/veins/fx/*.png  原版特殊渲染用的光晕贴图（无尽、宇宙中子素）
"""

from __future__ import annotations

import argparse
import glob
import io
import json
import os
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
VEIN_DIR = ROOT / "src" / "assets" / "veins"
BASE_DIR = VEIN_DIR / "base"
FX_DIR = VEIN_DIR / "fx"
TILE = 16
SCALE = 2

JAR_GLOB = str(
    Path.home()
    / ".gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/*/*/GT5-Unofficial-*-dev.jar"
)

# 只有这几级在原版里带动画，贴图路径来自 GT5-Unofficial jar。
# 其余等级原版就是静态贴图，直接用 base 图。
ANIMATED = {
    9: "assets/gregtech/textures/blocks/materialicons/CUSTOM/cosmicneutronium/ore_OVERLAY.png",
    10: "assets/gregtech/textures/blocks/materialicons/CUSTOM/infinity/block1.png",
    13: "assets/gregtech/textures/blocks/materialicons/CUSTOM/draconium/ore_OVERLAY.png",
}

# 特殊渲染的光晕贴图：原版 InfinityRenderer 用 HALO，CosmicNeutroniumRenderer 用 HALO_FUZZY
HALO_TEXTURES = {
    "halo": "assets/gregtech/textures/items/iconsets/HALO.png",
    "haloFuzzy": "assets/gregtech/textures/items/iconsets/HALO_FUZZY.png",
}

TICKS_PER_SECOND = 20


@dataclass
class Animation:
    path: str
    order: list[int]
    frametime: int

    @property
    def durations_ms(self) -> list[int]:
        return [self.frametime * 1000 // TICKS_PER_SECOND] * len(self.order)


def read_animation(archive: zipfile.ZipFile, path: str) -> Animation:
    """读贴图自带的 mcmeta：帧顺序（ping-pong 等）与每帧多少 tick。"""
    raw = archive.read(path + ".mcmeta").decode("utf-8")
    # mcmeta 里带注释风格的空白，去掉 C 系注释后按 JSON 解析
    data = json.loads(re.sub(r"/\*.*?\*/", "", raw, flags=re.S))
    animation = data["animation"]
    frametime = int(animation.get("frametime", 1))
    frames = animation.get("frames")
    image = Image.open(io.BytesIO(archive.read(path)))
    if frames is None:
        # Minecraft 的动画贴图是竖排的方形帧，帧高等于贴图宽度
        order = list(range(image.height // image.width))
    else:
        order = [int(f if isinstance(f, int) else f["index"]) for f in frames]
    return Animation(path, order, frametime)


def is_ore_pixel(pixel: tuple[int, int, int, int]) -> bool:
    """区分矿石斑点与石头底：斑点要么够亮/够暗，要么带颜色。"""
    r, g, b, a = pixel
    if a < 16:
        return False
    brightest, darkest = max(r, g, b), min(r, g, b)
    saturation = 0 if brightest == 0 else (brightest - darkest) / brightest
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return saturation > 0.15 or luminance > 0.62 or luminance < 0.30


def read_frame(
    texture: Image.Image, frame: int
) -> tuple[list[tuple[int, int, int, int]], dict[tuple[int, int], tuple[int, int, int, int]]]:
    """取一帧，返回（按顺序排列的不透明像素颜色，补满透明格的整图）。

    补齐的做法是每个透明格取最近的不透明格颜色（多层扩散），
    这样整块贴图型的素材能按位置取色。
    """
    opaque = {
        (x, y): texture.getpixel((x, frame * TILE + y))
        for y in range(TILE)
        for x in range(TILE)
        if texture.getpixel((x, frame * TILE + y))[3] >= 16
    }
    ordered = [opaque[key] for key in sorted(opaque)]
    filled = dict(opaque)
    frontier = list(opaque)
    while frontier:
        x, y = frontier.pop(0)
        color = filled[(x, y)]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < TILE and 0 <= ny < TILE and (nx, ny) not in filled:
                filled[(nx, ny)] = color
                frontier.append((nx, ny))
    return ordered, filled


def build_tier(index: int, base: Image.Image, animation: Animation, texture: Image.Image) -> Image.Image:
    width, height = base.size
    spots = [(x, y) for y in range(height) for x in range(width) if is_ore_pixel(base.getpixel((x, y)))]
    source = {frame: read_frame(texture, frame) for frame in set(animation.order)}
    strip = Image.new("RGBA", (width, height * len(animation.order)))
    for slot, frame in enumerate(animation.order):
        tile = base.copy()
        pixels = tile.load()
        opaque, filled = source[frame]
        if len(opaque) >= TILE * TILE:
            # 整块贴图（如无尽）：直接按位置取色，得到原版那种跨整个图标铺开的图案
            for x, y in spots:
                pixels[x, y] = filled[(x // SCALE, y // SCALE)]
        else:
            # 斑点遮罩型叠加层：把这一帧的不透明像素按顺序铺到斑点上，
            # 保留底色与斑点形状，同时让原版动画的疏密和颜色逐帧滚动
            for index_in_spots, (x, y) in enumerate(spots):
                pixels[x, y] = opaque[index_in_spots % len(opaque)]
        strip.paste(tile, (0, slot * height))
    return strip


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jar", default="", help="GT5-Unofficial jar 路径，默认从 gradle 缓存里找")
    args = parser.parse_args()

    jar = args.jar or (glob.glob(JAR_GLOB) or [""])[0]
    if not jar or not os.path.exists(jar):
        raise SystemExit("找不到 GT5-Unofficial jar，请用 --jar 指定")

    tiers = []
    with zipfile.ZipFile(jar) as archive:
        for index in range(14):
            base = Image.open(BASE_DIR / f"t{index}.png").convert("RGBA")
            path = ANIMATED.get(index)
            if path is None:
                strip, frames, durations, source = base, 1, [0], "静态"
            else:
                animation = read_animation(archive, path)
                texture = Image.open(io.BytesIO(archive.read(path))).convert("RGBA")
                strip = build_tier(index, base, animation, texture)
                frames = len(animation.order)
                durations = animation.durations_ms
                source = path.split("materialicons/")[-1]
            strip.save(VEIN_DIR / f"t{index}.png")
            tiers.append(
                {
                    "tier": index,
                    "frames": frames,
                    "frameDurationsMs": durations,
                    "source": source,
                }
            )
            print(f"t{index}: {frames} 帧，每帧 {durations[0]}ms，来源 {source}")

        fx = {}
        FX_DIR.mkdir(parents=True, exist_ok=True)
        for name, path in HALO_TEXTURES.items():
            animation = read_animation(archive, path) if _has_mcmeta(archive, path) else Animation(path, [0], 1)
            texture = Image.open(io.BytesIO(archive.read(path))).convert("RGBA")
            texture.save(FX_DIR / f"{name}.png")
            fx[name] = {
                "frames": len(animation.order),
                "frameDurationsMs": animation.durations_ms,
                "source": path.split("iconsets/")[-1],
            }
            print(
                f"{name}: {len(animation.order)} 帧，每帧 {fx[name]['frameDurationsMs'][0]}ms，来源 {fx[name]['source']}"
            )

    write_meta_module(tiers, fx)


def _has_mcmeta(archive: zipfile.ZipFile, path: str) -> bool:
    return path + ".mcmeta" in archive.namelist()


def write_meta_module(tiers: list[dict], fx: dict) -> None:
    def rows(items, key_name):
        out = []
        for key, value in items:
            durations = ", ".join(str(ms) for ms in value["frameDurationsMs"])
            out.append(
                f"  {key_name(key)}: {{ frames: {value['frames']}, "
                f"frameDurationsMs: [{durations}], source: '{value['source']}' }},"
            )
        return "\n".join(out)

    body = "\n".join(
        f"  {{ tier: {tier['tier']}, frames: {tier['frames']}, "
        f"frameDurationsMs: [{', '.join(str(ms) for ms in tier['frameDurationsMs'])}], "
        f"source: '{tier['source']}' }},"
        for tier in tiers
    )
    text = f"""// 由 scripts/build-veins.py 生成，不要手改。
// 数据来自 GTNH 的 GT5-Unofficial jar：帧数与每帧时长取自贴图自带的 mcmeta。

export interface VeinTierMeta {{
  tier: number;
  frames: number;
  frameDurationsMs: number[];
  source: string;
}}

export interface VeinFxMeta {{
  frames: number;
  frameDurationsMs: number[];
  source: string;
}}

export const VEIN_META: VeinTierMeta[] = [
{body}
];

export const VEIN_FX_META: Record<string, VeinFxMeta> = {{
{rows(fx.items(), lambda key: key)}
}};
"""
    (ROOT / "src" / "game" / "vein-meta.ts").write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
