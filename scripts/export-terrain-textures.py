import argparse
import json
import math
import zipfile
from io import BytesIO
from pathlib import Path

from PIL import Image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pack', type=Path, required=True)
    args = parser.parse_args()
    target = Path(__file__).resolve().parents[1] / 'src' / 'assets' / 'factory3d'
    prefix = 'assets/minecraft/textures/blocks/'
    cell, tile = 18, 16
    with zipfile.ZipFile(args.pack) as archive:
        names = sorted(name for name in archive.namelist() if name.startswith(prefix) and name.endswith('.png'))
        columns = math.ceil(math.sqrt(len(names)))
        rows = math.ceil(len(names) / columns)
        atlas = Image.new('RGBA', (columns * cell, rows * cell))
        textures = {}
        for index, name in enumerate(names):
            image = Image.open(BytesIO(archive.read(name))).convert('RGBA')
            size = image.size
            image = image.crop((0, 0, image.width, image.width)).resize((tile, tile), Image.Resampling.NEAREST)
            x, y = index % columns * cell + 1, index // columns * cell + 1
            atlas.paste(image, (x, y))
            for left, top, right, bottom, destination in [
                (0, 0, tile, 1, (x, y - 1)), (0, tile - 1, tile, tile, (x, y + tile)),
                (0, 0, 1, tile, (x - 1, y)), (tile - 1, 0, tile, tile, (x + tile, y)),
            ]:
                atlas.paste(image.crop((left, top, right, bottom)), destination)
            for dx, dy, sx, sy in [(-1, -1, 0, 0), (tile, -1, tile - 1, 0), (-1, tile, 0, tile - 1), (tile, tile, tile - 1, tile - 1)]:
                atlas.putpixel((x + dx, y + dy), image.getpixel((sx, sy)))
            textures[name[len(prefix):-4]] = {'x': x, 'y': y, 'sourceSize': list(size)}
        atlas.save(target / 'terrain-atlas.png', optimize=True)
        manifest = {'sourceArchive': args.pack.name, 'sourcePrefix': prefix, 'tileSize': tile,
                    'width': atlas.width, 'height': atlas.height, 'textures': textures}
        (target / 'terrain-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        print(f'Terrain atlas: {len(textures)} textures, {atlas.width}x{atlas.height}')


if __name__ == '__main__':
    main()
