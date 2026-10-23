# /// script
"""生成「贴图总览」单文件 HTML：按类展示游戏里的全部贴图，动画直接播放。

用法：python scripts/build-texture-gallery.py
产物：docs/贴图总览.html（贴图全部 base64 内联，双击即开，不依赖服务器）

分类：矿脉（含特殊光晕）→ 镐子三条升级线 → 机器图标（按类别分组）→ 特效贴图。
动画条带用与游戏相同的机制播放（竖排帧条带 + steps() 逐帧 + translateY 循环）。
"""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gtnh_tiers import MAX_TIER, VOLTAGE_DEFINITIONS, load_models, texture_key

ROOT = Path(__file__).resolve().parent.parent
VEINS = ROOT / "src" / "assets" / "veins"
PICKAXE = ROOT / "src" / "assets" / "pickaxe"
MACHINES = ROOT / "src" / "assets" / "machines"
FX = VEINS / "fx"

TILE = 64  # 展示尺寸（px）

VEIN_META = json.loads((VEINS / "meta.json").read_text(encoding="utf-8"))

# 镐子：线 →（显示名，帧数，帧长 ms，静态等级集合）
PICKAXE_LINES: list[tuple[str, str, int, int]] = [
    ("vajra", "金刚杵", 33, 50),
    ("drill", "连锁采集", 0, 150),  # 帧数按等级查文件高度
    ("blast", "连锁爆破", 31, 150),
]


def data_url(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


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
    for tier, voltage in enumerate(VOLTAGE_DEFINITIONS):
        ore = voltage["ore"]
        meta = VEIN_META["tiers"].get(ore["texture"], {"frames": 1, "frameDurationsMs": [0]})
        url = data_url(VEINS / f"{ore['texture']}.png")
        items.append(tile(url, meta["frames"], meta["frameDurationsMs"][0], f"T{tier} {ore['material']}", ore["fx"]))
    parts.append(section(f"矿脉贴图（T0 ~ T{MAX_TIER - 1}）", items))

    # ── 镐子 ─────────────────────────────────────────────
    items = []
    for line, cname, frames, frame_ms in PICKAXE_LINES:
        for tier in range(1, MAX_TIER + 1):
            path = PICKAXE / f"{line}-{texture_key(tier)}.png"
            image = _png_size(path)
            file_frames = image[1] // image[0]
            url = data_url(path)
            items.append(tile(url, file_frames, frame_ms, f"{cname} {tier}"))
    parts.append(section("镐子三条升级线", items))

    # ── 机器图标 ─────────────────────────────────────────
    groups = {}
    for model in load_models():
        groups.setdefault(model["category"], []).append(model)
    for category, models in groups.items():
        items = [tile(data_url(MACHINES / f"{model['icon']}.png"), 1, 0, model["name"]) for model in models]
        parts.append(section(f"机器图标 · {category}", items))

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
