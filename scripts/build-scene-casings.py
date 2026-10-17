"""Extract GT casing faces for perspective rendering; share tier tinting with machine icons."""
from __future__ import annotations
import glob
import io
import zipfile
from pathlib import Path
from PIL import Image
from gtnh_tiers import VOLTAGES, tint_casing, texture_key, casing_voltage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'assets' / 'casings'
JAR = str(Path.home() / '.gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/*/*/GT5-Unofficial-*-dev.jar')
PREFIX = 'assets/gregtech/textures/blocks/iconsets/'

def main():
    files = glob.glob(JAR)
    if not files:
        raise SystemExit('GT5-Unofficial dev jar not found')
    OUT.mkdir(exist_ok=True)
    with zipfile.ZipFile(files[0]) as archive:
        names = set(archive.namelist())
        for tier in range(1, len(VOLTAGES) + 1):
            voltage = casing_voltage(tier)
            for face in ['side', 'top']:
                path = f'{PREFIX}MACHINE_{voltage}_{face.upper()}.png'
                if path not in names:
                    path = f'{PREFIX}MACHINE_{voltage}_SIDE.png'
                image = Image.open(io.BytesIO(archive.read(path))).convert('RGBA')
                tint_casing(image, tier).save(OUT / f'{texture_key(tier)}-{face}.png')
    print(f'Generated {len(VOLTAGES) * 2} casing faces')

if __name__ == '__main__':
    main()
