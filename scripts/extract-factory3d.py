"""Extract the configured factory machines from Modernity, preserving animation strips."""
from __future__ import annotations

import argparse
import io
import json
import zipfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GT = 'assets/gregtech/textures/blocks/'
MU = 'assets/miscutils/textures/blocks/'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack', type=Path, required=True)
    args = parser.parse_args()
    config = json.loads((ROOT / 'src/content/scene-machines.json').read_text(encoding='utf-8'))
    output = ROOT / 'src/assets/factory3d'
    output.mkdir(parents=True, exist_ok=True)
    textures = {}
    profiles = {}
    with zipfile.ZipFile(args.pack) as archive:
        names = set(archive.namelist())

        def texture(path, required=True):
            if path not in names:
                if required:
                    raise ValueError(f'Modernity texture missing: {path}')
                return None
            key = path.removeprefix('assets/').removesuffix('.png').replace('/', '--')
            if key not in textures:
                data = archive.read(path)
                image = Image.open(io.BytesIO(data))
                width, height = image.size
                assert height % width == 0, path
                metadata = json.loads(archive.read(path + '.mcmeta')) if path + '.mcmeta' in names else {}
                animation = metadata.get('animation', {})
                frames = animation.get('frames', list(range(height // width)))
                textures[key] = {
                    'path': path, 'width': width, 'height': height,
                    'frameTime': animation.get('frametime', 1), 'frames': frames,
                }
                (output / (key + '.png')).write_bytes(data)
            return key

        def layers(path, glow=True):
            result = [texture(path)]
            if glow:
                glow_path = path[:-4] + ('_glow.png' if '/miscutils/' in path else '_GLOW.png')
                key = texture(glow_path, required=False)
                if key:
                    result.append(key)
            return result

        base = {face: texture(GT + f'iconsets/MACHINE_{config["voltage"]}_{face.upper()}.png')
                for face in ('side', 'top', 'bottom')}
        for machine in config['machines']:
            faces = {}
            for face in ('front', 'back', 'side', 'top', 'bottom'):
                states = {}
                for state in ('idle', 'active'):
                    suffix = '_ACTIVE' if state == 'active' else ''
                    kind = machine['textureType']
                    if kind == 'generator':
                        path = GT + f'iconsets/{machine["texturePrefix"]}_{face.upper()}{suffix}.png'
                        overlays = layers(path)
                        if face == 'front':
                            overlays.append(texture(GT + f'iconsets/OVERLAY_ENERGY_OUT_{config["voltage"]}.png'))
                    elif kind == 'basic':
                        source_face = 'side' if face == 'back' else face
                        overlays = layers(GT + f'basicmachines/{machine["texturePrefix"]}/OVERLAY_{source_face.upper()}{suffix}.png') if source_face in machine['faces'] else []
                    else:
                        if face == 'front':
                            path = MU + 'TileEntities/adv_machine_matterfab' + ('_active' if state == 'active' else '') + '.png'
                            overlays = layers(path)
                        elif face == 'top':
                            path = MU + 'TileEntities/machine_top_vent_rotating' + ('_fast' if state == 'active' else '') + '.png'
                            overlays = layers(path, glow=False)
                        else:
                            part = 'BOTTOM' if face == 'bottom' else 'SIDE'
                            overlays = layers(GT + f'iconsets/OVERLAY_{part}_MASSFAB{suffix}.png')
                    states[state] = [base[face if face in ('top', 'bottom') else 'side'], *overlays]
                faces[face] = states
            profiles[machine['modelId']] = faces
    manifest = {'pack': args.pack.name, 'version': config['sourceVersion'], 'textures': textures, 'profiles': profiles}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Extracted {len(textures)} original Modernity textures for {len(profiles)} machines.')


if __name__ == '__main__':
    main()
