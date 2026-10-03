# /// script
"""生成「贴图总览」单文件 HTML：按类展示游戏里的全部贴图，动画直接播放。

用法：python scripts/build-texture-gallery.py
产物：docs/贴图总览.html（贴图全部 base64 内联，双击即开，不依赖服务器）

分类：矿脉（含特殊光晕）→ 镐子三条升级线 → 机器图标（按类别分组）→ 特效贴图。
动画条带用与游戏相同的机制播放（竖排帧条带 + steps() 逐帧 + translateY 循环）。
"""

from __future__ import annotations

import base64
import colorsys
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
VEINS = ROOT / "src" / "assets" / "veins"
PICKAXE = ROOT / "src" / "assets" / "pickaxe"
MACHINES = ROOT / "src" / "assets" / "machines"
FX = VEINS / "fx"

TILE = 64  # 展示尺寸（px）

# 矿脉：等级 →（材料名，帧数，帧长 ms，特殊渲染标注）
VEIN_LIST: list[tuple[int, str, int, int, str]] = [
    (0, "锻铁", 1, 0, ""),
    (1, "铜", 1, 0, ""),
    (2, "铝", 1, 0, ""),
    (3, "不锈钢", 1, 0, ""),
    (4, "钛", 1, 0, ""),
    (5, "钨钢", 1, 0, ""),
    (6, "钯", 1, 0, ""),
    (7, "硅岩", 1, 0, ""),
    (8, "中子素", 1, 0, ""),
    (9, "宇宙中子素", 3, 150, "毛边白雾"),
    (10, "无尽", 31, 150, "方形暗晕 + 脉动重影"),
    (11, "龙芯", 18, 200, ""),
    (12, "海珀珍", 119, 50, "能量流"),
    (13, "时空", 113, 150, ""),
]

# 镐子：线 →（显示名，帧数，帧长 ms，静态等级集合）
PICKAXE_LINES: list[tuple[str, str, int, int]] = [
    ("vajra", "金刚杵", 33, 50),
    ("drill", "连锁采集", 0, 150),  # 帧数按等级查文件高度
    ("blast", "连锁爆破", 31, 150),
]
PICKAXE_STATIC_DRILL = {t for t in range(1, 11)} | {t for t in range(0, 10)}

# 机器图标分组：前缀 → 显示名
MACHINE_GROUPS: list[tuple[str, str]] = [
    ("m", "采矿机"),
    ("c", "制造机"),
    ("b", "发电机"),
    ("n", "灵气节点"),
    ("s", "腐蚀抑制器"),
    ("p", "净化器"),
    ("x", "计算机"),
    ("r", "研究站"),
    ("mm", "魔法采矿机"),
    ("mg", "魔法发电机"),
    ("mc", "魔法制造机"),
    ("g", "多方块发电机"),
]


def data_url(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def data_url_image(image) -> str:
    import io
    buf = io.BytesIO()
    image.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _load_icon_module():
    # build-pickaxe-icons.py 文件名带连字符，不能直接 import，按路径加载
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "build_pickaxe_icons", ROOT / "scripts" / "build-pickaxe-icons.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def mineral_variants():
    # 矿物材质试验版：金刚杵曲线 / 爆破药体改染对应矿脉的材质色，
    # 与连锁采集钻头同一套色系（等级 n = T(n-1) 矿脉斑点的平均色）。
    # 只生成预览图，不写 src/assets/pickaxe/——游戏图标不受影响。
    import io
    import zipfile
    from pathlib import Path as _Path

    module = _load_icon_module()
    veins = ROOT / "src" / "assets" / "veins"

    def mineral(tier):
        # 灰白黑的矿脉斑点没有色相（锻铁/不锈钢/钯/硅岩/中子素），
        # 直接平涂会看起来「没颜色」：给它们统一的钢蓝色相（s=0.35），
        # 明度保留各自材质的深浅——银/钢材质的惯例表现
        def boost(rgb):
            hue, sat, val = colorsys.rgb_to_hsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
            if sat < 0.15:
                hue, sat = 0.58, 0.35
            sat = max(sat, 0.35)
            return tuple(round(c * 255) for c in colorsys.hsv_to_rgb(hue, sat, val))

        vein = Image.open(veins / ("t" + str(tier - 1) + ".png")).convert("RGBA")
        return boost(module.dominant_ore_color(vein))

    minerals = {tier: mineral(tier) for tier in range(1, 15)}

    # 金刚杵：曲线染矿脉材质色（本体动画保留）。tint_vajra_strip 从模块全局取
    # tier_color，临时替换成矿物色表，生成完还原
    original = module.tier_color
    module.tier_color = lambda tier: minerals[tier]
    infinity_strip = Image.open(ROOT / "src" / "assets" / "veins" / "t10.png").convert("RGBA")
    ore_frames = [
        infinity_strip.crop((0, i * 32, 32, (i + 1) * 32))
        for i in range(infinity_strip.height // 32)
    ]
    vajra = {tier: module.tint_vajra_strip(tier, ore_frames) for tier in range(1, 15)}
    module.tier_color = original

    # 连锁爆破：药体（饱和像素）染矿脉材质色，保留像素明度
    ic2_glob = str(
        _Path.home()
        / ".gradle/caches/modules-2/files-2.1/curse.maven/ic2-*/*/*/ic2-*.jar"
    )
    ic2 = sorted(zipfile.ZipFile(p2) for p2 in __import__("glob").glob(ic2_glob))[-1]
    blast_src = Image.open(io.BytesIO(ic2.read("assets/ic2/textures/items/itemDynamite.png"))).convert("RGBA")
    blast = {}
    for tier in range(1, 15):
        mineral = minerals[tier]
        mh, ms, mv = colorsys.rgb_to_hsv(mineral[0] / 255, mineral[1] / 255, mineral[2] / 255)
        # 矿物自身的明度也参与：硅岩黑就深、不锈钢白就浅，几支银灰色系才分得开
        value_scale = 0.25 + 0.75 * mv
        image = blast_src.copy()
        for y in range(image.height):
            for x in range(image.width):
                pixel = image.getpixel((x, y))
                if pixel[3] == 0:
                    continue
                _h, sat, val = colorsys.rgb_to_hsv(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255)
                if sat >= 0.35:
                    red, green, blue = (
                        round(c * 255)
                        for c in colorsys.hsv_to_rgb(mh, ms, max(val * value_scale, 0.12))
                    )
                    image.putpixel((x, y), (red, green, blue, pixel[3]))
        blast[tier] = image
    return vajra, blast


def tile(url: str, frames: int, frame_ms: int, label: str, note: str = "") -> str:
    """一个贴图格子：frames > 1 时按游戏的帧动画机制播放。"""
    dur = frames * frame_ms if frame_ms else 0
    if frames > 1:
        body = (
            f'<span class="clip"><span class="frames" style="background-image:url({url});'
            f'height:{TILE * frames}px;animation-duration:{dur}ms;animation-timing-function:'
            f'steps({frames},end)"></span></span>'
        )
    else:
        body = f'<span class="clip"><img class="still" src="{url}" alt=""></span>'
    note_html = f'<span class="note">{note}</span>' if note else ""
    return f'<figure class="tile">{body}<figcaption>{label}{note_html}</figcaption></figure>'


def section(title: str, items: list[str]) -> str:
    if not items:
        return ""
    return f'<h2>{title}<span class="count">{len(items)}</span></h2><div class="row">{"".join(items)}</div>'


def main() -> None:
    import colorsys

    parts: list[str] = []

    # ── 矿脉 ─────────────────────────────────────────────
    items = []
    for tier, name, frames, frame_ms, note in VEIN_LIST:
        url = data_url(VEINS / f"t{tier}.png")
        items.append(tile(url, frames, frame_ms, f"T{tier} {name}", note))
    parts.append(section("矿脉贴图（T0 ~ T13）", items))

    # ── 镐子 ─────────────────────────────────────────────
    items = []
    for line, cname, frames, frame_ms in PICKAXE_LINES:
        for tier in range(1, 15):
            path = PICKAXE / f"{line}-{tier}.png"
            image = _png_size(path)
            file_frames = image[1] // image[0]
            url = data_url(path)
            items.append(tile(url, file_frames, frame_ms, f"{cname} {tier}"))
    parts.append(section("镐子三条升级线", items))

    # ── 机器图标 ─────────────────────────────────────────
    def sort_key(path: Path):
        # 前缀字母序 + 数字后缀按数值排（避免 m-10 排在 m-2 前面）
        import re
        match = re.match(r"([a-z-]+)-(\d+)$", path.stem)
        if match:
            return (match.group(1), int(match.group(2)), "")
        return (path.stem, 0, "")

    all_files = sorted(MACHINES.glob("*.png"), key=sort_key)
    for prefix, cname in MACHINE_GROUPS:
        files = [f for f in all_files if f.name.startswith(prefix + "-") or (prefix == "g" and f.name.startswith("g-"))]
        if not files:
            continue
        items = []
        for f in files:
            url = data_url(f)
            items.append(tile(url, 1, 0, f.stem))
        parts.append(section(f"机器图标 · {cname}（{prefix}-*）", items))

    # ── 试验预览：矿物材质版（未启用） ────────────────────
    vajra_variants, blast_variants = mineral_variants()
    items = []
    for tier in range(1, 15):
        items.append(tile(data_url_image(vajra_variants[tier]), 33, 50, f"金刚杵 {tier}"))
    for tier in range(1, 15):
        items.append(tile(data_url_image(blast_variants[tier]), 1, 0, f"连锁爆破 {tier}"))
    parts.append(section("试验预览 · 矿物材质版（未启用，对比用）", items))

    # ── 特效贴图 ─────────────────────────────────────────
    items = []
    fx_names = {"halo": "无尽光晕（方形暗晕）", "haloFuzzy": "宇宙中子素白雾（8 帧）", "destroy": "挖矿裂纹（10 帧）"}
    for name, cname in fx_names.items():
        path = FX / f"{name}.png"
        image = _png_size(path)
        frames = max(1, image[1] // image[0])
        items.append(tile(data_url(path), frames, 150, cname))
    coil = ROOT / "scripts" / "textures" / "hypogen-coil.png"
    if coil.exists():
        image = _png_size(coil)
        frames = image[1] // image[0]
        items.append(tile(data_url(coil), frames, 50, "海珀珍能量流源图（UXV 线圈）"))
    parts.append(section("特效贴图", items))

    html = HTML_HEAD + "".join(parts) + "</body></html>"
    out = ROOT / "docs" / "贴图总览.html"
    out.write_text(html, encoding="utf-8")
    print(f"已生成 {out}（{out.stat().st_size // 1024} KB）")


def _png_size(path: Path) -> tuple[int, int]:
    import struct

    data = path.read_bytes()
    return struct.unpack(">II", data[16:24])


HTML_HEAD = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>GTNH 增量 · 贴图总览</title>
<style>
  body { margin: 0; padding: 20px; background: #12161c; color: #d7dee8;
         font: 14px/1.5 system-ui, 'Microsoft YaHei', sans-serif; }
  h1 { font-size: 20px; letter-spacing: 0.04em; }
  h2 { margin: 28px 0 12px; font-size: 15px; color: #58c4a3;
       border-bottom: 1px solid #2f3946; padding-bottom: 6px; }
  h2 .count { margin-left: 8px; font-size: 12px; color: #8b97a7; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; }
  .tile { margin: 0; width: 96px; text-align: center; }
  .clip { display: block; width: 64px; height: 64px; margin: 0 auto; overflow: hidden;
          background: #1b2129; border: 1px solid #2f3946; border-radius: 8px; }
  .still { width: 64px; height: 64px; image-rendering: pixelated; display: block; }
  .frames { display: block; width: 64px; background-size: 100% 100%;
            background-repeat: no-repeat; image-rendering: pixelated;
            animation-name: gallery-scroll; animation-iteration-count: infinite; }
  @keyframes gallery-scroll { to { transform: translateY(-100%); } }
  figcaption { margin-top: 5px; font-size: 11px; color: #8b97a7; word-break: break-all; }
  .note { display: block; color: #e0a33e; }
</style>
</head>
<body>
<h1>GTNH 增量 · 贴图总览（测试用，全部内联，双击即开）</h1>
"""


if __name__ == "__main__":
    main()
