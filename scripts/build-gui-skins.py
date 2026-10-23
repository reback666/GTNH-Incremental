"""生成 GT 机器 GUI 风格的界面皮肤贴图（面板 / 插槽 / 按钮 / 页签 / 进度条）。

UI 重设计（2026-10-04 拍板「GT 机器 GUI 深度复刻 + 贴图+CSS 混合」）的素材管道：
GT 开发包里自带整套 GUI 贴图，本脚本把它们整理成界面可直接引用的形式——

· 面板 / 插槽 / 按钮 / 页签 / 文本框：原样抽出（GT 的立体语法就画在这些贴图里，
  浏览器里用 border-image / background 平铺，1px 像素直出）
· panel-dark：steel.png 的压暗派生（暗色样张用）——只压底色、保住高光语法，
  否则压暗后凸起感会糊掉
· arrow-empty / arrow-fill-t<等级>：GT 的箭头进度条是上下两帧的竖排条带
  （上空下满），切开后把「满」帧按电压色染色（研究条等进度显示用），
  染色方式与镐子爆破线同族：按感知亮度转灰阶再乘等级色，暗部有保底

用法：python scripts/build-gui-skins.py
产物：src/assets/gui/*.png，预览图 docs/gui-skins.png
"""

from __future__ import annotations

import glob
import io
import zipfile
from pathlib import Path

from PIL import Image

from gtnh_tiers import MAX_RAINBOW, MAX_TIER, TIER_COLORS, texture_key

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "src" / "assets" / "gui"
PREVIEW = ROOT / "docs" / "gui-skins.png"

JAR_GLOB = str(
    Path.home()
    / ".gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/*/*/GT5-Unofficial-*-dev.jar"
)

# jar 内路径 → 产物名（原样抽出的界面骨架贴图）
RAW_PIECES: dict[str, str] = {
    "assets/gregtech/textures/gui/background/singleblock_default.png": "panel-light.png",
    "assets/gregtech/textures/gui/background/steel.png": "panel-steel.png",
    "assets/gregtech/textures/gui/background/popup.png": "panel-popup.png",
    "assets/gregtech/textures/gui/background/text_field.png": "text-field.png",
    "assets/gregtech/textures/gui/slot/item_standard.png": "slot-item.png",
    "assets/gregtech/textures/gui/slot/dark_gray.png": "slot-dark.png",
    "assets/gregtech/textures/gui/button/standard.png": "btn.png",
    "assets/gregtech/textures/gui/button/standard_pressed.png": "btn-pressed.png",
    "assets/gregtech/textures/gui/button/standard_disabled.png": "btn-disabled.png",
    "assets/gregtech/textures/gui/tab/cover_normal.png": "tab-cover.png",
    "assets/gregtech/textures/gui/tab/cover_highlight.png": "tab-cover-hover.png",
    "assets/gregtech/textures/gui/tab/cover_disabled.png": "tab-cover-disabled.png",
    "assets/gregtech/textures/gui/tab/title_dark.png": "tab-title.png",
    "assets/tectech/textures/gui/background/blue_glow.png": "glow-blue.png",
    "assets/tectech/textures/gui/background/rainbow_glow.png": "glow-rainbow.png",
}

ARROW_SRC = "assets/gregtech/textures/gui/progressbar/arrow.png"
# 箭头条带是 20×36：上下两帧各 20×18（上空下满）
ARROW_FRAME_W, ARROW_FRAME_H = 20, 18

# 暗色面板的压暗系数：底色（暗像素）压到 0.36，高光（亮像素）只压到 0.62，
# 保住「顶左亮、底右暗」的立体语法。按像素亮度在两档间线性插值。
DARK_LOW, DARK_HIGH = 0.36, 0.72
DARK_LOW_AT, DARK_HIGH_AT = 60, 200  # 亮度低于/高于这两个值的像素用对应系数


def load(archive: zipfile.ZipFile, path: str) -> Image.Image:
    return Image.open(io.BytesIO(archive.read(path))).convert("RGBA")


def darken_steel(steel: Image.Image) -> Image.Image:
    """压暗 steel 面板给暗色主题用，保住高光语法。"""
    out = Image.new("RGBA", steel.size)
    src, dst = steel.load(), out.load()
    for y in range(steel.height):
        for x in range(steel.width):
            r, g, b, a = src[x, y]
            lum = max(r, g, b)
            if lum <= DARK_LOW_AT:
                factor = DARK_LOW
            elif lum >= DARK_HIGH_AT:
                factor = DARK_HIGH
            else:
                factor = DARK_LOW + (DARK_HIGH - DARK_LOW) * (lum - DARK_LOW_AT) / (
                    DARK_HIGH_AT - DARK_LOW_AT
                )
            dst[x, y] = (round(r * factor), round(g * factor), round(b * factor), a)
    return out


def tint_frame(frame: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """把箭头「满」帧按等级色染色：按感知亮度转灰阶再乘色，暗部有 0.3 保底。"""
    out = Image.new("RGBA", frame.size)
    src, dst = frame.load(), out.load()
    peak = max(
        max(src[x, y][0], src[x, y][1], src[x, y][2])
        for y in range(frame.height)
        for x in range(frame.width)
    ) or 255
    for y in range(frame.height):
        for x in range(frame.width):
            r, g, b, a = src[x, y]
            lum = max(r, g, b) / peak
            lum = 0.3 + 0.7 * lum
            dst[x, y] = (
                min(255, round(color[0] * lum)),
                min(255, round(color[1] * lum)),
                min(255, round(color[2] * lum)),
                a,
            )
    return out


def tint_frame_rainbow(frame: Image.Image) -> Image.Image:
    """MAX 的满帧按横向彩虹染色（与机壳 gtnh_tiers.MAX_RAINBOW 同源）。"""
    out = Image.new("RGBA", frame.size)
    src, dst = frame.load(), out.load()
    peak = max(
        max(src[x, y][0], src[x, y][1], src[x, y][2])
        for y in range(frame.height)
        for x in range(frame.width)
    ) or 255
    for y in range(frame.height):
        for x in range(frame.width):
            r, g, b, a = src[x, y]
            lum = max(r, g, b) / peak
            lum = 0.3 + 0.7 * lum
            pos = x / max(1, frame.width - 1) * (len(MAX_RAINBOW) - 1)
            lo, hi = int(pos), min(len(MAX_RAINBOW) - 1, int(pos) + 1)
            frac = pos - lo
            color = tuple(
                round(MAX_RAINBOW[lo][ch] * (1 - frac) + MAX_RAINBOW[hi][ch] * frac)
                for ch in range(3)
            )
            dst[x, y] = (
                min(255, round(color[0] * lum)),
                min(255, round(color[1] * lum)),
                min(255, round(color[2] * lum)),
                a,
            )
    return out


def build_preview(pieces: dict[str, Image.Image], arrows: dict[int, Image.Image]) -> None:
    """拼一张贴图总览：骨架件 2 倍 + 染色箭头 2 倍，给用户验收用。"""
    from PIL import ImageDraw, ImageFont

    zoom = 2
    entries: list[tuple[str, Image.Image]] = []
    # 面板取中间一块当样片（整张 176×166 太大，看底色和描边足够）
    for name in ("panel-light", "panel-steel", "panel-dark", "panel-popup"):
        img = pieces[name].crop((8, 8, 88, 68))
        entries.append((name, img))
    for name in (
        "slot-item",
        "slot-dark",
        "btn",
        "btn-dark",
        "btn-pressed",
        "btn-dark-pressed",
        "btn-disabled",
        "tab-cover",
        "tab-cover-hover",
        "tab-title",
        "text-field",
        "arrow-empty",
    ):
        entries.append((name, pieces[name]))
    for tier in range(1, MAX_TIER + 1):
        entries.append((f"fill-t{tier}", arrows[tier]))

    cells = [(label, img.resize((img.width * zoom, img.height * zoom), Image.NEAREST))
             for label, img in entries]
    pad, label_h = 8, 16
    total_w = 640
    x, y, row_h = pad, pad, 0
    placed: list[tuple[str, Image.Image, int, int]] = []
    for label, big in cells:
        cell_w = max(big.width, 96)
        if x + cell_w + pad > total_w:
            x = pad
            y += row_h + label_h + pad
            row_h = 0
        placed.append((label, big, x, y))
        x += cell_w + pad
        row_h = max(row_h, big.height)
    sheet = Image.new("RGBA", (total_w, y + row_h + pad), (16, 20, 26, 255))
    try:
        font = ImageFont.truetype("consola.ttf", 11)
    except OSError:
        font = ImageFont.load_default()
    for label, big, cx, cy in placed:
        sheet.alpha_composite(big, (cx, cy + label_h))
        ImageDraw.Draw(sheet).text((cx, cy), label, fill=(225, 228, 235, 255), font=font)
    sheet.save(PREVIEW)
    print(f"预览图 {PREVIEW.name}（{sheet.size[0]}×{sheet.size[1]}）")


def main() -> None:
    jar = (glob.glob(JAR_GLOB) or [""])[0]
    if not jar:
        raise SystemExit("找不到 GT5-Unofficial jar")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pieces: dict[str, Image.Image] = {}
    with zipfile.ZipFile(jar) as archive:
        for src_path, out_name in RAW_PIECES.items():
            img = load(archive, src_path)
            img.save(OUT_DIR / out_name)
            pieces[out_name.removesuffix(".png")] = img
        steel = pieces["panel-steel"]
        pieces["panel-dark"] = darken_steel(steel)
        pieces["panel-dark"].save(OUT_DIR / "panel-dark.png")
        # 暗肤按钮：GT 标准按钮本体是 MC 经典的亮灰，暗色主题里压暗派生
        for src_name, out_name in (
            ("btn", "btn-dark"),
            ("btn-pressed", "btn-dark-pressed"),
            ("btn-disabled", "btn-dark-disabled"),
        ):
            dark_btn = darken_steel(pieces[src_name])
            dark_btn.save(OUT_DIR / f"{out_name}.png")
            pieces[out_name] = dark_btn
        arrow = load(archive, ARROW_SRC)
        if arrow.size != (ARROW_FRAME_W, ARROW_FRAME_H * 2):
            raise SystemExit(f"箭头条带尺寸对不上：{arrow.size}")
        empty = arrow.crop((0, 0, ARROW_FRAME_W, ARROW_FRAME_H))
        filled = arrow.crop((0, ARROW_FRAME_H, ARROW_FRAME_W, ARROW_FRAME_H * 2))
        empty.save(OUT_DIR / "arrow-empty.png")
        pieces["arrow-empty"] = empty
        arrows: dict[int, Image.Image] = {}
        for tier in range(1, MAX_TIER):
            arrows[tier] = tint_frame(filled, TIER_COLORS[tier])
            arrows[tier].save(OUT_DIR / f"arrow-fill-t{texture_key(tier)}.png")
        arrows[MAX_TIER] = tint_frame_rainbow(filled)
        arrows[MAX_TIER].save(OUT_DIR / f"arrow-fill-t{texture_key(MAX_TIER)}.png")
    build_preview(pieces, arrows)
    made = sorted(p.name for p in OUT_DIR.glob("*.png"))
    print(f"共 {len(made)} 张 → src/assets/gui/")
    for name in made:
        print(f"  {name}")


if __name__ == "__main__":
    main()
