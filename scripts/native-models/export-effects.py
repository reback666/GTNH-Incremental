"""Export the native GTNH 2.8.4 Eye of Harmony and large-turbine effect assets."""
from __future__ import annotations

import argparse
import io
import json
import math
import random
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ICONS = ROOT / "scripts/native-icons/manifest.json"
OUTPUT = ROOT / "src/assets/factory3d"
EFFECTS = OUTPUT / "effects"
MANIFEST = OUTPUT / "effects-manifest.json"

DEFAULT_MINECRAFT = Path(
    "D:/Prism/PrismLauncher/instances/"
    "GT_New_Horizons_2.8.4_Java_17-25/.minecraft"
)
GT_JAR = "gregtech-5.09.51.482.jar"
MODEL_PATHS = {
    "star": "assets/tectech/models/Star.obj",
    "space": "assets/tectech/models/Space.obj",
}
STAR_PATHS = [
    "assets/tectech/models/StarLayer0.png",
    "assets/tectech/models/StarLayer1.png",
    "assets/tectech/models/StarLayer2.png",
]
SPACE_PATH = "assets/tectech/models/spaceLayer.png"
ORBIT_PREFIXES = [
    "Ow", "Ne", "TF", "ED", "EA", "Mo", "De", "Ma", "Ph", "As", "Ca",
    "Ce", "Eu", "Ga", "Rb", "Io", "Me", "Ve", "En", "Mi", "Ob", "Ti",
    "Ra", "Pr", "Tr", "Ha", "KB", "MM", "Pl", "BC", "BE", "BF", "CB",
    "TE", "VB", "An", "Ho", "Mh", "MB", "Np", "Se", "DD",
]
ORBIT_FACES = ["front", "back", "left", "right", "top", "bottom"]
TURBINE_ROOT = "assets/gregtech/textures/blocks/iconsets/"
TURBINE_NAMES = {
    "idle": "LARGETURBINE_NEW{index}.png",
    "active": "LARGETURBINE_NEW_ACTIVE{index}.png",
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def png_size(data: bytes) -> tuple[int, int]:
    with Image.open(io.BytesIO(data)) as image:
        return image.size


class ResourceLayers:
    """Resolve resources in game load order, with the last pack taking precedence."""

    def __init__(self, minecraft: Path):
        packs = read_json(ICONS)["resourcePacks"]
        self.layers = [("mods/" + GT_JAR, zipfile.ZipFile(minecraft / "mods" / GT_JAR))]
        self.layers.extend(
            (f"resourcepacks/{name}", zipfile.ZipFile(minecraft / "resourcepacks" / name))
            for name in packs
        )
        self.lookup = {}
        for label, archive in self.layers:
            for name in archive.namelist():
                if name.endswith((".png", ".mcmeta", ".obj")):
                    self.lookup[name] = (label, archive)

    def close(self):
        for _, archive in self.layers:
            archive.close()

    def source(self, name: str):
        try:
            return self.lookup[name]
        except KeyError as error:
            raise ValueError(f"Original resource is missing: {name}") from error

    def read(self, name: str):
        _, archive = self.source(name)
        return archive.read(name)


def animation(data: bytes, metadata: dict | None, width: int, height: int):
    animation_meta = (metadata or {}).get("animation")
    if animation_meta is None:
        return [{"index": 0, "ticks": 1}]
    if height % width:
        raise ValueError(f"Texture strip height is not divisible by width: {width}x{height}")
    count = height // width
    frames = animation_meta.get("frames", range(count))
    default_ticks = animation_meta.get("frametime", 1)
    result = []
    for frame in frames:
        if isinstance(frame, int):
            result.append({"index": frame, "ticks": default_ticks})
        else:
            result.append({
                "index": frame["index"],
                "ticks": frame.get("time", default_ticks),
            })
    return result


def copy_texture(
    resources: ResourceLayers,
    name: str,
    key: str,
    textures: dict,
    max_width: int | None = None,
    generated: set[str] | None = None,
):
    data = resources.read(name)
    source_width, source_height = png_size(data)
    if max_width is not None and source_width > max_width:
        with Image.open(io.BytesIO(data)) as image:
            width = max_width
            height = round(source_height * max_width / source_width)
            resized = image.resize((width, height), Image.Resampling.NEAREST)
            output = io.BytesIO()
            resized.save(output, format="PNG")
            data = output.getvalue()
    else:
        width, height = source_width, source_height
    metadata_path = name + ".mcmeta"
    metadata = (
        json.loads(resources.read(metadata_path).decode("utf-8-sig"))
        if metadata_path in resources.lookup
        else None
    )
    relative = f"effects/{key}.png"
    (OUTPUT / relative).write_bytes(data)
    if generated is not None:
        generated.add(relative)
    textures[key] = {
        "file": relative,
        "width": width,
        "height": height,
        "frames": animation(data, metadata, width, height),
        "sources": [{
            "path": name,
            "archive": resources.source(name)[0],
        }],
    }
    if max_width is not None:
        textures[key]["sourceWidth"] = source_width
        textures[key]["sourceHeight"] = source_height
        textures[key]["resize"] = (
            {
                "method": "nearest",
                "width": width,
                "height": height,
                "limitWidth": max_width,
            }
            if (width, height) != (source_width, source_height)
            else None
        )


def copy_turbine_textures(resources: ResourceLayers, textures: dict, generated: set[str]):
    result = {"active": [], "idle": []}
    for state, pattern in TURBINE_NAMES.items():
        for index in range(9):
            source_name = TURBINE_ROOT + pattern.format(index=index + 1)
            key = f"turbine-{state}-{index}"
            copy_texture(resources, source_name, key, textures, generated=generated)
            result[state].append(key)
    return result


def generated_orbits(resources: ResourceLayers, textures: dict, generated: set[str]):
    rng = random.Random(0x454F48)
    prefixes = rng.sample(ORBIT_PREFIXES, 10)
    entries = []
    for index, prefix in enumerate(prefixes):
        keys = []
        for face in ORBIT_FACES:
            path = f"assets/gtneioreplugin/textures/blocks/{prefix}_{face}.png"
            key = f"orbit-{prefix.lower()}-{face}"
            copy_texture(resources, path, key, textures, generated=generated)
            keys.append(key)
        entries.append({
            "texture": index,
            "distance": 2.2 + (index + 1) + rng.uniform(-0.2, 0.2),
            "scale": rng.uniform(0.5, 1.5),
            "zAngle": rng.uniform(-30.0, 30.0) * 3.141592653589793 / 180.0,
            "xAngle": rng.uniform(-30.0, 30.0) * 3.141592653589793 / 180.0,
            "speed": rng.uniform(0.5, 1.5) * math.pi / 9.0,
            "spin": rng.uniform(0.2, 0.9) * math.pi / 9.0,
            "_textures": keys,
        })
    return entries


def write_manifest(minecraft: Path):
    generated = set()
    resources = ResourceLayers(minecraft)
    try:
        textures = {}
        for layer, path in enumerate(STAR_PATHS):
            copy_texture(resources, path, f"star-layer-{layer}", textures, 1024, generated)
        copy_texture(resources, SPACE_PATH, "space-shell", textures, 2048, generated)
        turbines = copy_turbine_textures(resources, textures, generated)

        orbits = generated_orbits(resources, textures, generated)
        for orbit in orbits:
            orbit["textures"] = orbit.pop("_textures")

        models = {}
        for key, path in MODEL_PATHS.items():
            relative = f"effects/{key}.obj"
            (OUTPUT / relative).write_bytes(resources.read(path))
            generated.add(relative)
            models[key] = {
                "file": relative,
                "source": {"path": path, "archive": resources.source(path)[0]},
            }

        manifest = {
            "textures": textures,
            "models": models,
            "eye": {
                "starLayers": [f"star-layer-{index}" for index in range(3)],
                "spaceTexture": "space-shell",
                "orbitTextures": [orbit["textures"] for orbit in orbits],
                "parameters": {
                    "spaceInward": True,
                    "spaceScale": 0.175,
                    "starBaseScale": 0.01,
                    "layerAlphas": [1.0, 0.4, 0.2],
                    "layerGrowth": 1.04,
                    "baseAngles": [130.0, -49.0, 67.0],
                    "rotationDegreesPerSecond": 15.625,
                    "orbitSeed": 0x454F48,
                    "orbitTier": 9,
                    "orbitSize": 10,
                    "orbitDistanceBase": 2.2,
                    "orbitAngleDegreesPerTick": 10,
                    "orbits": orbits,
                },
            },
            "turbine": turbines,
        }
        MANIFEST.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        for path in EFFECTS.iterdir():
            relative = path.relative_to(OUTPUT).as_posix()
            if path.is_file() and relative not in generated:
                path.unlink()
        return len(textures)
    finally:
        resources.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--minecraft", type=Path, default=DEFAULT_MINECRAFT)
    args = parser.parse_args()

    EFFECTS.mkdir(parents=True, exist_ok=True)
    count = write_manifest(args.minecraft)
    print(f"Exported {count} textures and 2 models to {EFFECTS}")


if __name__ == "__main__":
    main()
