"""Build native block models from a local Minecraft capture and enabled resource packs."""
from __future__ import annotations

import argparse
import io
import json
import math
import zipfile
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


class Resources:
    def __init__(self, minecraft, packs):
        self.archives = [zipfile.ZipFile(path) for path in sorted((minecraft / 'mods').glob('*.jar'))]
        client = minecraft.parents[2] / 'libraries/com/mojang/minecraft/1.7.10/minecraft-1.7.10-client.jar'
        if client.exists():
            self.archives.insert(0, zipfile.ZipFile(client))
        self.archives.extend(zipfile.ZipFile(minecraft / 'resourcepacks' / name) for name in packs)
        self.files = {}
        for archive in self.archives:
            for name in archive.namelist():
                if name.startswith('assets/') and (name.endswith('.png') or name.endswith('.mcmeta')):
                    self.files[name] = archive
        self.cache = {}

    def texture(self, icon):
        if icon in self.cache:
            return self.cache[icon]
        domain, name = icon.split(':', 1) if ':' in icon else ('minecraft', icon)
        path = f'assets/{domain.lower()}/textures/blocks/{name}.png'
        if path not in self.files:
            raise ValueError(f'Original texture missing: {path}')
        archive = self.files[path]
        image = Image.open(io.BytesIO(archive.read(path))).convert('RGBA')
        meta_path = path + '.mcmeta'
        meta = json.loads(self.files[meta_path].read(meta_path)).get('animation', {}) if meta_path in self.files else {}
        width, height = image.size
        # An image without animation metadata is a single texture, even when rectangular.
        count = height // width if meta else 1
        frames = meta.get('frames', list(range(count)))
        timeline = [(frame if isinstance(frame, int) else frame['index'],
                     meta.get('frametime', 1) if isinstance(frame, int) else frame.get('time', meta.get('frametime', 1)))
                    for frame in frames]
        result = (image, timeline, path, archive.filename)
        self.cache[icon] = result
        return result


class Builder:
    def __init__(self, source, resources, output):
        self.source, self.resources, self.output = source, resources, output
        self.textures, self.types, self.models = {}, {}, {}
        self.faces = {}
        (output / 'native').mkdir(exist_ok=True)

    def face(self, layers):
        signature = json.dumps(layers, sort_keys=True)
        if signature in self.faces:
            return self.faces[signature]
        key = f'face-{len(self.faces):04d}'
        sources = [self.resources.texture(layer['icon']) for layer in layers]
        size = max(item[0].width for item in sources)
        periods = [sum(t for _, t in item[1]) for item in sources]
        period = math.lcm(*periods)
        step = math.gcd(*(t for item in sources for _, t in item[1]))
        frames, painted, distinct = [], [], {}
        previous = None
        for tick in range(0, period, step):
            indices = []
            for _, timeline, _, _ in sources:
                remaining = tick % sum(t for _, t in timeline)
                for index, duration in timeline:
                    if remaining < duration:
                        indices.append(index)
                        break
                    remaining -= duration
            signature_frame = tuple(indices)
            if signature_frame not in distinct:
                result = Image.new('RGBA', (size, size))
                for layer, (image, timeline, _, _), index in zip(layers, sources, indices):
                    width = image.width
                    tile = image.crop((0, index * width, width, (index + 1) * width)).resize((size, size), Image.Resampling.NEAREST)
                    color = layer.get('color', [255, 255, 255])[:3]
                    if color != [255, 255, 255]:
                        tile = ImageChops.multiply(tile, Image.new('RGBA', tile.size, (*color, 255)))
                    result.alpha_composite(tile)
                distinct[signature_frame] = len(painted)
                painted.append(result)
            frame = distinct[signature_frame]
            if previous == frame:
                frames[-1]['time'] += step
            else:
                frames.append({'index': frame, 'time': step})
            previous = frame
        strip = Image.new('RGBA', (size, size * len(painted)))
        for index, tile in enumerate(painted):
            strip.paste(tile, (0, size * index))
        file = f'native/{key}.png'
        strip.save(self.output / file)
        self.textures[key] = {'file': file, 'width': size, 'height': strip.height, 'frames': frames, 'frameTime': 1,
                              'opaque': all(tile.getchannel('A').getextrema()[0] == 255 for tile in painted),
                              'sources': [{'path': path, 'archive': Path(archive).name} for _, _, path, archive in sources]}
        self.faces[signature] = key
        return key

    def block_type(self, key, faces):
        if key not in self.types:
            resolved = [self.face(face) for face in faces]
            self.types[key] = {'idle': resolved[:6], 'active': resolved[6:] if len(resolved) == 12 else resolved[:6],
                               'opaque': all(self.textures[face]['opaque'] for face in resolved)}
        return key

    def machine(self, meta):
        return self.block_type(f'machine-{meta}', self.source[str(meta)]['faces'])

    def element(self, value, machine_meta):
        if 'elem' in value:
            return self.element(value['elem'], machine_meta)
        if 'val$aFrameMaterial' in value:
            material = value['val$aFrameMaterial']
            layers = [{'icon': material['frame']['icon'], 'color': material['mRGBa']}]
            if material['frame'].get('overlay'):
                layers.append({'icon': material['frame']['overlay']})
            return self.block_type('frame-' + material['mName'], [layers] * 6)
        for block_name, meta_name in [('val$block', 'val$meta'), ('left', 'right')]:
            if block_name in value and isinstance(value[block_name], dict) and 'block' in value[block_name]:
                registry, meta = value[block_name]['block'], value[meta_name]
                key = f'{registry}|{meta}'
                return self.block_type(key, self.source['blockFaces'][key])
        if 'val$hints' in value:
            return self.element(value['val$hints'][0], machine_meta)
        if 'val$backing' in value:
            return self.element(value['val$backing'], machine_meta)
        if isinstance(value.get('arg$1'), list):
            for child in reversed(value['arg$1']):
                try:
                    return self.element(child, machine_meta)
                except ValueError:
                    pass
        hint = value.get('mHint', '')
        if hint in ('of class MTEHatchTurbine', 'of type Dynamo', 'of type Muffler') \
                or hint == 'of type INSTANCE' and machine_meta == 15331:
            # Required ports have no casing fallback in StructureLib; use their surrounding casing for display.
            casing = 'A' if machine_meta == 15331 else 'c'
            return self.element(self.source[str(machine_meta)]['elements'][casing], machine_meta)
        raise ValueError(f'Unresolved structure element in {machine_meta}: {value}')

    def shape(self, entry, name):
        a = b = c = 0
        for letter in entry['shapes'][name]:
            element = entry['elements'][letter]
            if 'step' in element:
                if element['reset'][0]: a = 0
                if element['reset'][1]: b = 0
                if element['reset'][2]: c = 0
                a += element['step'][0]
                b += element['step'][1]
                c += element['step'][2]
            else:
                if letter not in '- ': yield (a, b, c), letter, element
                a += 1

    def model(self, model_id, meta, structure):
        controller = self.machine(meta)
        if not structure:
            self.models[model_id] = {'size': [1, 1, 1], 'blocks': [[0, 0, 0, controller]], 'kind': 'single'}
            return
        entry = self.source[str(meta)]
        blocks = {(0, 0, 0): (controller, 0, 'SOUTH')}
        for piece in structure['pieces']:
            offset = piece['offset']
            for (a, b, c), letter, element in self.shape(entry, piece['shape']):
                position = (a - offset[0], offset[1] - b, offset[2] - c)
                kind = self.element(element, meta)
                if position == (0, 0, 0):
                    raise ValueError(f'Structure overlaps controller: {meta}, {piece}, {letter}')
                if position in blocks:
                    raise ValueError(f'Overlapping pieces: {meta}, {position}')
                blocks[position] = (kind, 0, 'SOUTH')
        minimum = [min(position[axis] for position in blocks) for axis in range(3)]
        size = [max(position[axis] for position in blocks) - minimum[axis] + 1 for axis in range(3)]
        self.models[model_id] = {'size': size, 'kind': 'multiblock',
                               'blocks': [[*(position[axis] - minimum[axis] for axis in range(3)), kind, rotation, facing]
                                          for position, (kind, rotation, facing) in sorted(blocks.items())],
                               'controller': [-item for item in minimum]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--minecraft', type=Path, required=True)
    parser.add_argument('--capture', type=Path, default=HERE / 'capture.json')
    args = parser.parse_args()
    icons = read_json(ROOT / 'scripts/native-icons/manifest.json')
    source = read_json(args.capture)
    structures = read_json(HERE / 'structures.json')
    resources = Resources(args.minecraft, icons['resourcePacks'])
    output = ROOT / 'src/assets/factory3d'
    builder = Builder(source, resources, output)
    for model_id, item in icons['models'].items():
        if item['registry'] == 'gregtech:gt.blockmachines':
            meta = item['meta']
            builder.model(model_id, meta, structures.get(str(meta)))
    custom = read_json(ROOT / 'src/assets/factory3d/custom-manifest.json')
    for model_id, model in custom['models'].items():
        kind, size = model.get('kind'), model.get('size')
        if kind not in ('custom', 'effect') or not isinstance(size, list) or len(size) != 3 \
                or any(not isinstance(value, int) or value < 1 for value in size):
            raise ValueError(f'Invalid custom model metadata: {model_id}')
        if model_id in builder.models:
            raise ValueError(f'Custom model collides with GT model: {model_id}')
        center = model.get('center', [0, 0, 0])
        if not isinstance(center, list) or len(center) != 3 or any(not isinstance(value, (int, float)) for value in center):
            raise ValueError(f'Invalid custom model center: {model_id}')
        builder.models[model_id] = {'kind': kind, 'size': size, 'center': center}
    result = {'version': icons['gregtech'], 'textures': builder.textures, 'types': builder.types, 'models': builder.models}
    (output / 'native-manifest.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{len(builder.models)} native models, {len(builder.types)} block types, {len(builder.textures)} face textures')


if __name__ == '__main__':
    main()
