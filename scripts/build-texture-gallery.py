# /// script
"""生成「贴图总览」单文件 HTML：按类展示游戏里的全部贴图，动画直接播放。

用法：python scripts/build-texture-gallery.py
产物：docs/贴图总览.html（贴图全部 base64 内联，双击即开，不依赖服务器）

分类：矿脉（含特殊光晕）→ 镐子三条升级线 → 机器图标（按类别分组）→ 特效贴图。
动画条带用与游戏相同的机制播放（竖排帧条带 + steps() 逐帧 + translateY 循环）。
"""

from __future__ import annotations

import base64
import sys
from pathlib import Path

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
