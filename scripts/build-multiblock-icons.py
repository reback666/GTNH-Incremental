"""生成多方块机器的图标。

多方块机器在 GTNH 里是整套结构，不是单方块，所以图标不再用「机壳 + 面片」合成，
而是直接裁用 GTNH 中文 wiki 上这台机器的整机渲染图：

    素材：src/assets/multiblocks/<机型 id>.png（256×256，wiki 原图，带透明背景）
    产物：src/assets/machines/<机型 id>.png（32×32，裁掉透明边后按比例缩放）

原图的出处记在 scripts/texture-sources.md，换图时把新图放进 multiblocks/ 再跑本脚本。

用法：python scripts/build-multiblock-icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "src" / "assets" / "multiblocks"
OUT_DIR = ROOT / "src" / "assets" / "machines"

# 图标边长：和别的机型图标一致
ICON_SIZE = 32
# 结构四周留一点空隙，别贴着图标边
MARGIN = 1


def build(source: Path, target: Path) -> tuple[int, int]:
    image = Image.open(source).convert("RGBA")
    bbox = image.getbbox()
    if bbox is None:
        raise SystemExit(f"{source.name} 整张图都是透明的，拿不到结构范围")
    cropped = image.crop(bbox)

    # 按比例缩放到图标里，保持长宽比，居中摆放
    limit = ICON_SIZE - MARGIN * 2
    scale = min(limit / cropped.width, limit / cropped.height)
    size = (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale)))
    resized = cropped.resize(size, Image.LANCZOS)

    icon = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    icon.alpha_composite(resized, ((ICON_SIZE - size[0]) // 2, (ICON_SIZE - size[1]) // 2))
    icon.save(target)
    return cropped.size, size


def main() -> None:
    sources = sorted(SRC_DIR.glob("*.png"))
    if not sources:
        raise SystemExit(f"{SRC_DIR} 里没有素材图")
    for source in sources:
        cropped, size = build(source, OUT_DIR / source.name)
        print(f"{source.stem}: 原图裁到 {cropped[0]}×{cropped[1]} → 图标里 {size[0]}×{size[1]}")
    print(f"共 {len(sources)} 个多方块机器图标")


if __name__ == "__main__":
    main()
