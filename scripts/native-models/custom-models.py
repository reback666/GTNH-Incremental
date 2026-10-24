"""Export the four non-GT native models used by the arcane factory machines.

The Java model exporter runs the original mod classes against small Minecraft
stubs. ModelRenderer calls are captured at render time so the result includes
the exact box geometry, UVs, pivots, and per-call rotations.
"""
from __future__ import annotations

import argparse
import io
import json
import math
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUTPUT = ROOT / "src/assets/factory3d/custom"
MANIFEST = HERE / "custom-models.json"
RUNTIME_MANIFEST = ROOT / "src/assets/factory3d/custom-manifest.json"
ANALYSIS = ROOT / ".tmp-blueprint/native-models/custom-analysis"
MODEL_IDS = [*(f"mm-{index}" for index in range(2, 8)), *(f"mc-{index}" for index in range(2, 8)),
             *(f"n-{index}" for index in range(1, 16)), *(f"s-{index}" for index in range(1, 16))]
MODEL_FAMILY = {
    **{model_id: "arcane-bore" for model_id in MODEL_IDS if model_id.startswith("mm-")},
    **{model_id: "arcane-assembler" for model_id in MODEL_IDS if model_id.startswith("mc-")},
    **{model_id: "aura-node" for model_id in MODEL_IDS if model_id.startswith("n-")},
    **{model_id: "flux-scrubber" for model_id in MODEL_IDS if model_id.startswith("s-")},
}
TEXTURES = {
    "bore": ("assets/thaumcraft/textures/models/Bore.png", "bore.png"),
    "jar": ("assets/thaumcraft/textures/models/jar.png", "jar.png"),
    "flux": ("assets/thaumcraft/textures/models/fluxscrubber.png", "fluxscrubber.png"),
    "nodes": ("assets/thaumcraft/textures/misc/nodes.png", "nodes.png"),
    "vortex": ("assets/thaumcraft/textures/misc/vortex.png", "vortex.png"),
    "assembler": ("assets/thaumicenergistics/textures/models/arcane.assembler.png", "arcane.assembler.png"),
}

JAVA_SOURCE = r'''
package gtnh.custommodels;

import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public final class Exporter {
    static Object current;

    public static void main(String[] args) throws Exception {
        String[] names = {
            "thaumcraft.client.renderers.models.ModelBore",
            "thaumcraft.client.renderers.models.ModelBoreEmit",
            "thaumcraft.client.renderers.models.ModelJar",
            "thaumicenergistics.client.render.model.ModelArcaneAssembler"
        };
        List<Object> result = new ArrayList<>();
        for (String name : names) {
            current = Class.forName(name).getConstructor().newInstance();
            ExporterBridge.current = current;
            ExporterBridge.calls = new ArrayList<>();
            Map<String, Object> methods = new LinkedHashMap<>();
            if (name.endsWith("ModelBore")) {
                captureMethod(methods, "base", "renderBase");
                captureMethod(methods, "nozzle", "renderNozzle");
            } else if (name.endsWith("ModelBoreEmit")) captureMethod(methods, "emit", "render", true);
            else if (name.endsWith("ModelJar")) {
                Object core = field(current, "Core");
                captureRenderer(methods, "core", core, 0.0625f);
            } else captureMethod(methods, "assembler", "func_78088_a", null, 0f, 0f, -0.1f, 0f, 0f, 0.625f);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("class", name);
            item.put("methods", methods);
            item.put("renderers", inspectRenderers(current));
            result.add(item);
        }
        Object gson = Class.forName("com.google.gson.GsonBuilder").getConstructor().newInstance();
        gson = call(gson, "setPrettyPrinting");
        gson = call(gson, "create");
        Files.writeString(Path.of(args[0]), (String) call(gson, "toJson", result), StandardCharsets.UTF_8);
    }

    static void captureMethod(Map<String, Object> methods, String key, String name, Object... args) throws Exception {
        ExporterBridge.rendering = true;
        ExporterBridge.calls.clear();
        invoke(current, name, args);
        ExporterBridge.rendering = false;
        methods.put(key, new ArrayList<>(ExporterBridge.calls));
    }

    static void captureRenderer(Map<String, Object> methods, String key, Object renderer, float scale) throws Exception {
        ExporterBridge.rendering = true;
        ExporterBridge.calls.clear();
        invoke(renderer, "a", scale);
        ExporterBridge.rendering = false;
        methods.put(key, new ArrayList<>(ExporterBridge.calls));
    }

    static void invoke(Object owner, String name, Object... args) throws Exception {
        for (Method method : owner.getClass().getDeclaredMethods()) {
            if (!method.getName().equals(name) || method.getParameterCount() != args.length) continue;
            method.setAccessible(true);
            method.invoke(owner, args);
            return;
        }
        throw new NoSuchMethodException(owner.getClass().getName() + "." + name);
    }

    static Object call(Object owner, String name, Object... args) throws Exception {
        for (Method method : owner.getClass().getMethods()) {
            if (!method.getName().equals(name) || method.getParameterCount() != args.length) continue;
            Class<?>[] params = method.getParameterTypes();
            boolean matches = true;
            for (int i = 0; i < params.length; i++) {
                if (args[i] != null && !params[i].isAssignableFrom(args[i].getClass())) matches = false;
            }
            if (!matches) continue;
            method.setAccessible(true);
            return method.invoke(owner, args);
        }
        throw new NoSuchMethodException(owner.getClass().getName() + "." + name);
    }

    static Map<String, Object> inspectRenderers(Object model) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Class<?> type = model.getClass(); type != null; type = type.getSuperclass()) {
            for (Field field : type.getDeclaredFields()) {
                if (field.getType().getName().equals("net.minecraft.client.model.ModelRenderer")) {
                    field.setAccessible(true);
                    result.put(field.getName(), renderer(field.get(model)));
                }
            }
        }
        return result;
    }

    static Map<String, Object> renderer(Object value) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        String[] floats = {"c", "d", "e", "f", "g", "h", "a", "b"};
        String[] aliases = {"rotationPointX", "rotationPointY", "rotationPointZ", "rotateAngleX",
                            "rotateAngleY", "rotateAngleZ", "textureWidth", "textureHeight"};
        for (int i = 0; i < floats.length; i++) result.put(aliases[i], field(value, floats[i]));
        result.put("mirror", field(value, "i"));
        List<Object> boxes = new ArrayList<>();
        Object source = field(value, "l");
        if (source instanceof Iterable<?> items) {
            for (Object box : items) {
                Map<String, Object> data = new LinkedHashMap<>();
                String[] names = {"a", "b", "c", "d", "e", "f", "g", "h",
                                  "textureWidth", "textureHeight", "inflate"};
                String[] values = {"x", "y", "z", "sizeX", "sizeY", "sizeZ", "u", "v",
                                   "textureWidth", "textureHeight", "inflate"};
                for (int i = 0; i < names.length; i++) data.put(values[i], field(box, names[i]));
                data.put("mirror", field(box, "mirror"));
                boxes.add(data);
            }
        }
        result.put("boxes", boxes);
        return result;
    }

    static Object field(Object owner, String name) throws Exception {
        for (Class<?> type = owner.getClass(); type != null; type = type.getSuperclass()) {
            try {
                Field field = type.getDeclaredField(name);
                field.setAccessible(true);
                return field.get(owner);
            } catch (NoSuchFieldException ignored) {}
        }
        throw new NoSuchFieldException(name);
    }

    public static String rendererName(Object model, Object renderer) throws Exception {
        for (Class<?> type = model.getClass(); type != null; type = type.getSuperclass()) {
            for (Field field : type.getDeclaredFields()) {
                if (field.getType().getName().equals("net.minecraft.client.model.ModelRenderer")) {
                    field.setAccessible(true);
                    if (field.get(model) == renderer) return field.getName();
                }
            }
        }
        throw new IllegalArgumentException("Unnamed ModelRenderer");
    }
}
'''

JAVA_STUBS = {
    "net/minecraft/entity/Entity.java": r'''
package net.minecraft.entity;
public class Entity {}
''',
    "net/minecraft/client/model/ModelBase.java": r'''
package net.minecraft.client.model;
public class ModelBase {
    public int field_78090_t = 64;
    public int field_78089_u = 32;
    public void func_78088_a(Object entity, float a, float b, float c, float d, float e, float f) {}
    public void func_78087_a(float a, float b, float c, float d, float e, float f, Object entity) {}
}
''',
    "net/minecraft/client/model/ModelRenderer.java": r'''
package net.minecraft.client.model;
import java.util.*;
import gtnh.custommodels.Exporter;
import gtnh.custommodels.ExporterBridge;
public class ModelRenderer {
    public final ModelBase model;
    public final List<ModelBox> l = new ArrayList<>();
    public float a = 64, b = 32;
    public float c, d, e, f, g, h;
    public float field_78795_f, field_78796_g, field_78808_h;
    public boolean i;
    public boolean field_78809_i;
    public int r, s;
    public ModelRenderer(ModelBase model) { this.model = model; }
    public ModelRenderer(ModelBase model, int u, int v) { this(model); a(u, v); }
    public ModelRenderer a(int u, int v) { r = u; s = v; return this; }
    public ModelRenderer func_78784_a(int u, int v) { return a(u, v); }
    public ModelRenderer a(float x, float y, float z, int sx, int sy, int sz) {
        l.add(new ModelBox(this, r, s, x, y, z, sx, sy, sz, 0, a, b, i));
        return this;
    }
    public ModelRenderer func_78789_a(float x, float y, float z, int sx, int sy, int sz) {
        return a(x, y, z, sx, sy, sz);
    }
    public ModelRenderer a(float x, float y, float z, int sx, int sy, int sz, float inflate) {
        l.add(new ModelBox(this, r, s, x, y, z, sx, sy, sz, inflate, a, b, i));
        return this;
    }
    public ModelRenderer func_78790_a(float x, float y, float z, int sx, int sy, int sz, float inflate) {
        return a(x, y, z, sx, sy, sz, inflate);
    }
    public ModelRenderer b(int width, int height) { a = width; b = height; return this; }
    public ModelRenderer func_78787_b(int width, int height) { return b(width, height); }
    public ModelRenderer a(float x, float y, float z) { c = x; d = y; e = z; return this; }
    public void func_78793_a(float x, float y, float z) { a(x, y, z); }
    public void a(float scale) {
        if (!ExporterBridge.rendering) return;
        try {
            ExporterBridge.calls.add(new ExporterBridge.RenderCall(
                Exporter.rendererName(ExporterBridge.current, this),
                new float[] {field_78795_f, field_78796_g, field_78808_h}, scale));
        } catch (Exception error) {
            throw new RuntimeException(error);
        }
    }
    public void func_78785_a(float scale) { a(scale); }
}
''',
    "net/minecraft/client/model/ModelBox.java": r'''
package net.minecraft.client.model;
public class ModelBox {
    public final ModelRenderer owner;
    public final float a, b, c, d, e, f;
    public final float inflate;
    public final float g, h;
    public final boolean mirror;
    public ModelBox(ModelRenderer owner, int u, int v, float x, float y, float z, int sx, int sy, int sz) {
        this(owner, u, v, x, y, z, sx, sy, sz, 0, owner.a, owner.b, owner.i);
    }
    public ModelBox(ModelRenderer owner, int u, int v, float x, float y, float z, int sx, int sy, int sz, float inflate) {
        this(owner, u, v, x, y, z, sx, sy, sz, inflate, owner.a, owner.b, owner.i);
    }
    public ModelBox(ModelRenderer owner, int u, int v, float x, float y, float z, int sx, int sy, int sz,
                    float inflate, float textureWidth, float textureHeight, boolean mirror) {
        this.owner = owner; a = x; b = y; c = z; d = sx; e = sy; f = sz; this.inflate = inflate;
        g = u; h = v; this.textureWidth = textureWidth; this.textureHeight = textureHeight; this.mirror = mirror;
    }
    public final float textureWidth, textureHeight;
}
''',
    "org/lwjgl/opengl/GL11.java": r'''
package org.lwjgl.opengl;
public final class GL11 {
    public static final int GL_BLEND = 3042, GL_SRC_ALPHA = 770, GL_ONE_MINUS_SRC_ALPHA = 771;
    public static void glEnable(int value) {}
    public static void glDisable(int value) {}
    public static void glBlendFunc(int source, int destination) {}
    public static void glTranslatef(float x, float y, float z) {}
    public static void glRotatef(float angle, float x, float y, float z) {}
    public static void glScalef(float x, float y, float z) {}
    public static void glPushMatrix() {}
    public static void glPopMatrix() {}
    public static void glDepthMask(boolean value) {}
    public static void glColor4f(float r, float g, float b, float a) {}
}
''',
    "gtnh/custommodels/ExporterBridge.java": r'''
package gtnh.custommodels;
import java.util.*;
public final class ExporterBridge {
    public static Object current;
    public static boolean rendering;
    public static List<Object> calls;
    public static final class RenderCall {
        public final String renderer;
        public final float[] rotation;
        public final float scale;
        public RenderCall(String renderer, float[] rotation, float scale) {
            this.renderer = renderer; this.rotation = rotation; this.scale = scale;
        }
    }
}
''',
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def schema() -> dict:
    return {
        "format": "gtnh-custom-models-v1",
        "coordinateSystem": "block-center; +X right, +Y up, +Z south; unit is one block",
        "triangles": "meshes[].vertices is flat XYZ triples, three vertices per triangle; uv and normals use the same order",
        "textures": "textures entries are atlas-compatible {file,width,height,frames,frameTime}; file is relative to src/assets/factory3d",
        "deviceMapping": "models[id].meshes names shared entries in meshes",
        "modelKinds": "solid devices use kind=custom; the aura node uses kind=effect",
        "billboards": "billboard meshes use camera-facing vertices; uv origin is top-left and atlas frame/layer are runtime inputs",
        "bounds": "real model bounds are retained when source geometry exceeds the nominal one-block box",
    }


def run_java(minecraft: Path, work: Path) -> list[dict]:
    source = work / "src"
    classes = work / "classes"
    for relative, text in JAVA_STUBS.items():
        path = source / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    exporter = source / "gtnh/custommodels/Exporter.java"
    exporter.parent.mkdir(parents=True, exist_ok=True)
    exporter.write_text(JAVA_SOURCE, encoding="utf-8")
    jars = [minecraft / "mods/Thaumcraft-1.7.10-4.2.3.5a.jar",
            minecraft / "mods/thaumicenergistics-1.7.14-GTNH.jar",
            Path("D:/Prism/PrismLauncher/libraries/com/google/code/gson/gson/2.2.4/gson-2.2.4.jar")]
    missing = [str(path) for path in jars if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing Java model dependency: " + ", ".join(missing))
    sources = sorted(str(path) for path in source.rglob("*.java"))
    classpath = ";".join(str(path) for path in jars)
    javac = Path("C:/Program Files/Java/jdk-17/bin/javac.exe")
    if not javac.exists():
        javac = Path(shutil.which("javac") or "javac")
    subprocess.run([str(javac), "-encoding", "UTF-8", "-cp", classpath, "-d", str(classes), *sources], check=True)
    output = work / "capture.json"
    java = javac.with_name("java.exe")
    subprocess.run([str(java), "-Dfile.encoding=UTF-8", "-cp", f"{classes};{classpath}", "gtnh.custommodels.Exporter", str(output)], check=True)
    return read_json(output)


def transform_point(point, translation=(0, 0, 0), rotation=(0, 0, 0), scale=1):
    x, y, z = point
    sx, sy, sz = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
    x, y, z = x * sx, y * sy, z * sz
    rx, ry, rz = rotation
    if rx:
        c, s = math.cos(rx), math.sin(rx)
        y, z = y * c - z * s, y * s + z * c
    if ry:
        c, s = math.cos(ry), math.sin(ry)
        x, z = x * c + z * s, -x * s + z * c
    if rz:
        c, s = math.cos(rz), math.sin(rz)
        x, y = x * c - y * s, x * s + y * c
    return (x + translation[0], y + translation[1], z + translation[2])


def apply_render_call(renderer, call):
    state = dict(renderer)
    state["rotateAngleX"] = call["rotation"][0]
    state["rotateAngleY"] = call["rotation"][1]
    state["rotateAngleZ"] = call["rotation"][2]
    return state


def model_mesh(renderers, calls, mesh_name, texture, material, alpha_mode="opaque", only=None):
    vertices, normals, uvs = [], [], []
    for call in calls:
        name = call["renderer"]
        if only is not None and name not in only:
            continue
        state = apply_render_call(renderers[name], call)
        pivot = (state["rotationPointX"], state["rotationPointY"], state["rotationPointZ"])
        angles = (state["rotateAngleX"], state["rotateAngleY"], state["rotateAngleZ"])
        for box in state["boxes"]:
            x, y, z, sx, sy, sz = (box[key] for key in ("x", "y", "z", "sizeX", "sizeY", "sizeZ"))
            inflate = box["inflate"]
            x -= inflate
            y -= inflate
            z -= inflate
            sx += inflate * 2
            sy += inflate * 2
            sz += inflate * 2
            points = [(x, y, z), (x + sx, y, z), (x + sx, y + sy, z), (x, y + sy, z),
                      (x, y, z + sz), (x + sx, y, z + sz), (x + sx, y + sy, z + sz), (x, y + sy, z + sz)]
            faces = [((0, 1, 2, 3), (0, 0, -1)), ((4, 7, 6, 5), (0, 0, 1)),
                     ((0, 4, 5, 1), (0, -1, 0)), ((3, 2, 6, 7), (0, 1, 0)),
                     ((0, 3, 7, 4), (-1, 0, 0)), ((1, 5, 6, 2), (1, 0, 0))]
            u, v = box["u"], box["v"]
            w, h, d = box["sizeX"], box["sizeY"], box["sizeZ"]
            texture_width, texture_height = box["textureWidth"], box["textureHeight"]
            face_uvs = [
                [(u + d + w, v + d), (u + d, v + d), (u + d, v), (u + d + w, v)],
                [(u + d, v + d), (u + d + w, v + d), (u + d + w, v), (u + d, v)],
                [(u + d, v), (u + d + w, v), (u + d + w, v + d), (u + d, v + d)],
                [(u + d + w, v), (u + d + w + w, v), (u + d + w + w, v + d), (u + d + w, v + d)],
                [(u, v + d), (u + d, v + d), (u + d, v + d + h), (u, v + d + h)],
                [(u + d + w, v + d), (u + d + w + d, v + d),
                 (u + d + w + d, v + d + h), (u + d + w, v + d + h)],
            ]
            for indices, normal in faces:
                transformed = [transform_point(points[index], pivot, angles, 1 / 16) for index in indices]
                transformed_normal = transform_point(normal, rotation=angles, scale=1)
                face_index = faces.index((indices, normal))
                face_uv = face_uvs[face_index]
                for index, uv in ((0, face_uv[0]), (1, face_uv[1]), (2, face_uv[2]),
                                  (0, face_uv[0]), (2, face_uv[2]), (3, face_uv[3])):
                    vertices.extend(transformed[index])
                    normals.extend(transformed_normal)
                    uvs.extend((uv[0] / texture_width, 1 - uv[1] / texture_height))
    return {"name": mesh_name, "vertices": vertices, "uv": uvs, "normals": normals,
            "texture": texture, "material": material, "alphaMode": alpha_mode}


def mesh_bounds(meshes):
    vertices = [value for mesh in meshes for value in mesh["vertices"]]
    if not vertices:
        return None
    return {"min": [min(vertices[i::3]) for i in range(3)], "max": [max(vertices[i::3]) for i in range(3)]}


def runtime_manifest(manifest):
    result = json.loads(json.dumps(manifest))
    for texture in result["textures"].values():
        texture["file"] = f"custom/{texture['file']}"
    for mesh in result["meshes"]:
        mesh["texture"] = f"custom/{mesh['texture']}"
    for model in result["models"].values():
        model["kind"] = "effect" if model["family"] == "aura-node" else "custom"
        minimum, maximum = model["bounds"]["min"], model["bounds"]["max"]
        model["size"] = [max(1, math.ceil(maximum[axis] - minimum[axis])) for axis in range(3)]
        model["center"] = [(minimum[axis] + maximum[axis]) / 2 for axis in range(3)]
    return result


def build_java_meshes(capture):
    meshes = []
    by_class = {entry["class"]: entry for entry in capture}
    bore = by_class["thaumcraft.client.renderers.models.ModelBore"]
    base = model_mesh(bore["renderers"], bore["methods"]["base"], "bore-base", "bore.png", "arcane-metal")
    for index in range(0, len(base["vertices"]), 3):
        x, y, z = base["vertices"][index:index + 3]
        base["vertices"][index:index + 3] = [x, y - 0.5, z]
    meshes.append(base)
    nozzle = model_mesh(bore["renderers"], bore["methods"]["nozzle"], "bore-nozzle", "bore.png", "arcane-metal")
    for index in range(0, len(nozzle["vertices"]), 3):
        x, y, z = nozzle["vertices"][index:index + 3]
        nozzle["vertices"][index:index + 3] = [z, y - 0.5, -x - 0.5]
    for index in range(0, len(nozzle["normals"]), 3):
        x, y, z = nozzle["normals"][index:index + 3]
        nozzle["normals"][index:index + 3] = [z, y, -x]
    meshes.append(nozzle)
    emit = by_class["thaumcraft.client.renderers.models.ModelBoreEmit"]
    emitter = model_mesh(emit["renderers"], emit["methods"]["emit"], "bore-emitter", "bore.png", "arcane-metal")
    for index in range(0, len(emitter["vertices"]), 3):
        x, y, z = emitter["vertices"][index:index + 3]
        emitter["vertices"][index:index + 3] = [x, y + 0.5, z]
    meshes.append(emitter)
    jar = by_class["thaumcraft.client.renderers.models.ModelJar"]
    jar_mesh = model_mesh(jar["renderers"], jar["methods"]["core"], "bore-jar", "jar.png", "arcane-glass", "blend")
    for index in range(0, len(jar_mesh["vertices"]), 3):
        x, y, z = jar_mesh["vertices"][index:index + 3]
        jar_mesh["vertices"][index:index + 3] = [-x * 0.6, y * 0.6 + 0.3, -z * 0.6]
    for index in range(0, len(jar_mesh["normals"]), 3):
        x, y, z = jar_mesh["normals"][index:index + 3]
        jar_mesh["normals"][index:index + 3] = [-x, y, -z]
    meshes.append(jar_mesh)
    assembler = by_class["thaumicenergistics.client.render.model.ModelArcaneAssembler"]
    meshes.append(model_mesh(assembler["renderers"], assembler["methods"]["assembler"],
                             "assembler-frame", "arcane.assembler.png", "arcane-metal",
                             only={"OuterFrameTop", "OuterFrameBottom", "OuterFrameLeft", "OuterFrameRight",
                                   "InnerFrameTop", "InnerFrameBottom", "InnerFrameLeft", "InnerFrameRight"}))
    meshes.append(model_mesh(assembler["renderers"], assembler["methods"]["assembler"],
                             "assembler-glass", "arcane.assembler.png", "arcane-glass", "blend",
                             only={"Glass"}))
    return meshes


def parse_obj(text: str):
    vertices, uvs, normals, groups = [], [], [], {}
    current = None
    for line in text.splitlines():
        parts = line.strip().split()
        if not parts or parts[0].startswith("#"):
            continue
        if parts[0] == "v":
            vertices.append(tuple(float(value) for value in parts[1:4]))
        elif parts[0] == "vt":
            uvs.append(tuple(float(value) for value in parts[1:3]))
        elif parts[0] == "vn":
            normals.append(tuple(float(value) for value in parts[1:4]))
        elif parts[0] == "g":
            current = parts[1]
            groups[current] = []
        elif parts[0] == "f" and current:
            face = []
            for token in parts[1:]:
                fields = token.split("/")
                face.append((int(fields[0]) - 1, int(fields[1]) - 1, int(fields[2]) - 1))
            groups[current].append(face)
    return vertices, uvs, normals, groups


def obj_mesh(vertices, uvs, normals, groups, name, texture):
    out = {"name": name, "vertices": [], "uv": [], "normals": [], "texture": texture,
           "material": "flux-crystal", "alphaMode": "opaque"}
    selected = groups.get("Tip" if name == "scrubber-tip" else "Cap", [])
    for group in [selected]:
        for face in group:
            for offset in range(1, len(face) - 1):
                for vi, ti, ni in (face[0], face[offset], face[offset + 1]):
                    out["vertices"].extend(vertices[vi])
                    out["uv"].extend(uvs[ti])
                    out["normals"].extend(normals[ni])
    return out


def billboard_mesh():
    half = 0.5
    return {
        "name": "node-billboard",
        "vertices": [-half, -half, 0, half, -half, 0, half, half, 0, -half, -half, 0, half, half, 0, -half, half, 0],
        "uv": [0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0],
        "normals": [0, 0, 1] * 6,
        "texture": "nodes.png",
        "material": "node-light",
        "alphaMode": "add",
        "billboard": {"enabled": True, "axis": "camera", "uvOrigin": "top-left", "frameCount": 32,
                      "layerCount": 32, "frameIntervalSeconds": 0.04, "layer": 1, "halfSize": 0.5},
        "effect": {"type": "aura-node", "aspectLayers": [], "core": {"layer": 1, "color": [255, 255, 255],
                    "baseHalfSize": 0.1, "averageAmountDivisor": 150, "blend": "add"}},
    }


def build_manifest(capture, minecraft: Path):
    with zipfile.ZipFile(minecraft / "mods/Thaumcraft-1.7.10-4.2.3.5a.jar") as archive:
        vertices, uvs, normals, groups = parse_obj(
            archive.read("assets/thaumcraft/textures/models/obelisk_cap.obj").decode("utf-8"))
    meshes = build_java_meshes(capture)
    cap = obj_mesh(vertices, uvs, normals, groups, "scrubber-cap", "fluxscrubber.png")
    cap["uv"] = [value for index in range(0, len(cap["uv"]), 2) for value in (cap["uv"][index], 1 - cap["uv"][index + 1])]
    meshes.append(cap)
    tip = obj_mesh(vertices, uvs, normals, groups, "scrubber-tip", "fluxscrubber.png")
    tip["uv"] = [value for index in range(0, len(tip["uv"]), 2) for value in (tip["uv"][index], 1 - tip["uv"][index + 1])]
    for index in range(0, len(tip["vertices"]), 3):
        x, y, z = tip["vertices"][index:index + 3]
        tip["vertices"][index:index + 3] = [x, z - 0.5 - 0.075, -y]
    for index in range(0, len(tip["normals"]), 3):
        x, y, z = tip["normals"][index:index + 3]
        tip["normals"][index:index + 3] = [x, z, -y]
    meshes.append(tip)
    meshes.append(billboard_mesh())
    by_name = {mesh["name"]: mesh for mesh in meshes}
    models = {}
    for model_id in MODEL_IDS:
        family = MODEL_FAMILY[model_id]
        names = {
            "arcane-bore": ["bore-base", "bore-emitter", "bore-jar"],
            "arcane-assembler": ["assembler-frame"],
            "aura-node": ["node-billboard"],
            "flux-scrubber": ["scrubber-cap", "scrubber-tip"],
        }[family]
        models[model_id] = {"family": family, "meshes": names, "bounds": mesh_bounds([by_name[name] for name in names])}
    return {
        "schema": schema(),
        "source": {
            "minecraft": str(minecraft),
            "mods": ["Thaumcraft-1.7.10-4.2.3.5a.jar", "thaumicenergistics-1.7.14-GTNH.jar"],
            "modelPose": "static default: bore base/nozzle and emitter, assembler render at -0.1 angle, scrubber tip at -0.075",
        },
        "textures": {},
        "meshes": meshes,
        "models": models,
    }


def copy_textures(minecraft: Path):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    result = {}
    for name, (path, filename) in TEXTURES.items():
        domain = path.split("/")[1]
        jar_name = "Thaumcraft-1.7.10-4.2.3.5a.jar" if domain == "thaumcraft" else "thaumicenergistics-1.7.14-GTNH.jar"
        with zipfile.ZipFile(minecraft / "mods" / jar_name) as archive:
            data = archive.read(path)
            (OUTPUT / filename).write_bytes(data)
            image = Image.open(io.BytesIO(data)).convert("RGBA")
            meta_path = path + ".mcmeta"
            meta = json.loads(archive.read(meta_path)).get("animation", {}) if meta_path in archive.namelist() else {}
        width, height = image.size
        count = height // width if meta else 1
        frames = meta.get("frames", list(range(count)))
        timeline = [(frame if isinstance(frame, int) else frame["index"],
                     meta.get("frametime", 1) if isinstance(frame, int)
                     else frame.get("time", meta.get("frametime", 1))) for frame in frames]
        result[name] = {"file": filename, "width": width, "height": height,
                        "frames": timeline, "frameTime": 1,
                        "independentUv": height != width or count > 1,
                        "uvSpace": "normalized"}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--minecraft", type=Path,
                        default=Path("D:/Prism/PrismLauncher/instances/GT_New_Horizons_2.8.4_Java_17-25/.minecraft"))
    parser.add_argument("--schema-only", action="store_true")
    parser.add_argument("--validate", action="store_true")
    parser.add_argument("--keep-temp", action="store_true")
    args = parser.parse_args()
    if args.validate:
        manifest = read_json(MANIFEST)
        runtime = read_json(RUNTIME_MANIFEST)
        meshes = {mesh["name"]: mesh for mesh in manifest["meshes"]}
        assert len(manifest["models"]) == 42
        assert all(len(mesh["vertices"]) % 9 == 0
                   and len(mesh["vertices"]) // 3 * 2 == len(mesh["uv"])
                   and len(mesh["vertices"]) == len(mesh["normals"]) for mesh in meshes.values())
        assert all(set(model["meshes"]) <= meshes.keys() for model in manifest["models"].values())
        assert set(manifest["textures"]) == set(TEXTURES)
        assert all((OUTPUT / texture["file"]).exists() for texture in manifest["textures"].values())
        assert len(runtime["models"]) == 42
        assert all(model["kind"] in {"custom", "effect"} and all(value >= 1 for value in model["size"])
                   for model in runtime["models"].values())
        assert all(path.startswith("custom/") for path in
                   [*(mesh["texture"] for mesh in runtime["meshes"]),
                    *(texture["file"] for texture in runtime["textures"].values())])
        assert all((ROOT / "src/assets/factory3d" / path).exists() for path in
                   [*(mesh["texture"] for mesh in runtime["meshes"]),
                    *(texture["file"] for texture in runtime["textures"].values())])
        print("Validated 42 runtime mappings, 9 meshes, atlas metadata and relative asset paths")
        return
    if args.schema_only:
        write_json(MANIFEST, {"schema": schema()})
        print("Schema written to scripts/native-models/custom-models.json")
        return
    ANALYSIS.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix="custom-models-", dir=ANALYSIS))
    try:
        capture = run_java(args.minecraft, temp)
        manifest = build_manifest(capture, args.minecraft)
        manifest["textures"] = copy_textures(args.minecraft)
        write_json(MANIFEST, manifest)
        write_json(RUNTIME_MANIFEST, runtime_manifest(manifest))
        print(f"Exported {len(manifest['models'])} device mappings and {len(manifest['meshes'])} meshes")
    finally:
        if not args.keep_temp:
            shutil.rmtree(temp, ignore_errors=True)


if __name__ == "__main__":
    main()
