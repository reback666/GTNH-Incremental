"""Extract GT casing faces for perspective rendering; share tier tinting with machine icons."""
from __future__ import annotations
import glob
import io
import zipfile
from pathlib import Path
from PIL import Image
from gtnh_tiers import tint_casing

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'assets' / 'casings'
JAR = str(Path.home() / '.gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/*/*/GT5-Unofficial-*-dev.jar')
VOLTAGES = ['ULV', 'LV', 'MV', 'HV', 'EV', 'IV', 'LuV', 'ZPM', 'UV', 'UHV', 'UEV', 'UIV', 'UXV', 'MAX']
PREFIX = 'assets/gregtech/textures/blocks/iconsets/'

def main():
    files = glob.glob(JAR)
    if not files:
        raise SystemExit('GT5-Unofficial dev jar not found')
    OUT.mkdir(exist_ok=True)
    with zipfile.ZipFile(files[0]) as archive:
        names = set(archive.namelist())
        for tier, voltage in enumerate(VOLTAGES, 1):
            for face in ['side', 'top']:
                path = f'{PREFIX}MACHINE_{voltage}_{face.upper()}.png'
                if path not in names:
                    path = f'{PREFIX}MACHINE_{voltage}_SIDE.png'
                image = Image.open(io.BytesIO(archive.read(path))).convert('RGBA')
                tint_casing(image, tier).save(OUT / f'{tier}-{face}.png')
    print('Generated 28 casing faces')

if __name__ == '__main__':
    main()
