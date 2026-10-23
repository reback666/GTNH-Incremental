#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""extract-assets.py -- GTNH 3D demo 贴图抽取器（可重复执行 / 幂等）

从两个**只读**素材源按 key 抽取方块贴图，统一规范化为 16x16 RGBA PNG：

  1. Modernity 资源包 zip （优先）
     D:\\Prism\\PrismLauncher\\instances\\GT_New_Horizons_2.8.4_Java_17-25\\.minecraft\\resourcepacks\\Modernity-GTNH-9ebdeed-pre.zip
  2. 原版 1.7.10 客户端 jar （回退）
     C:\\Users\\29797\\.gradle\\caches\\retro_futura_gradle\\mc-vanilla\\1.7.10\\client.jar

产物：
  - gtnh3d/assets/tex/<key>.png     渲染器静态引用的贴图（key = 文件名）
  - gtnh3d/ASSETS.md                逐条清单（key / 源 / 包内路径 / 尺寸 / 字节 / sha256 / 备注）
  - gtnh3d/tools/extract-report.json 同数据的机器可读版本（无时间戳，保证重复执行字节一致）

用法：
  python gtnh3d/tools/extract-assets.py             # 抽取 + 生成报告
  python gtnh3d/tools/extract-assets.py --dry-run   # 只解析、不写任何文件
  python gtnh3d/tools/extract-assets.py --check     # 校验已有产物与 report 一致
  python gtnh3d/tools/extract-assets.py --prune     # 顺带删除 tex/ 中不属于 key 集合的 *.png

硬约束：
  - 只读源素材；绝不修改/删除资源包或 jar。
  - 所有 PNG 一律 16x16 RGBA，最近邻抽像素（Image.NEAREST），不做模糊插值，保留 alpha。
  - 动态贴图（竖直帧条）取第 0 帧。
  - key 名与渲染器引用必须完全一致（kebab-case）。
"""

import argparse
import hashlib
import io
import json
import os
import sys
import zipfile

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.stderr.write("需要 Pillow：python -m pip install Pillow\n")
    raise

# --------------------------------------------------------------------------
# 路径配置
# --------------------------------------------------------------------------
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # -> gtnh3d/
OUT_DIR = os.path.join(ROOT, "assets", "tex")
MD_PATH = os.path.join(ROOT, "ASSETS.md")
REPORT_PATH = os.path.join(ROOT, "tools", "extract-report.json")

MC_DIR = r"D:\Prism\PrismLauncher\instances\GT_New_Horizons_2.8.4_Java_17-25\.minecraft"
CONTAINERS = [
    ("modernity-zip", os.path.join(MC_DIR, "resourcepacks", "Modernity-GTNH-9ebdeed-pre.zip")),
    ("vanilla-jar", r"C:\Users\29797\.gradle\caches\retro_futura_gradle\mc-vanilla\1.7.10\client.jar"),
]

GT = "assets/gregtech/textures/blocks"
MU = "assets/miscutils/textures/blocks"
MCB = "assets/minecraft/textures/blocks"

TARGET = 16  # 输出边长


def gt_icon(name):
    return "%s/iconsets/%s.png" % (GT, name)


def gt_basic(machine_dir, face, active=False):
    suffix = "_ACTIVE" if active else ""
    return "%s/basicmachines/%s/OVERLAY_%s%s.png" % (GT, machine_dir, face.upper(), suffix)


def tier_hull(tier):
    """分级机壳：GT++/miscutils 的 TieredHulls 目录（包内无 MACHINE_CASING_<TIER>.png）。"""
    return "%s/iconsets/TieredHulls/CASING_%s.png" % (MU, tier)


# --------------------------------------------------------------------------
# key -> 候选源 映射表
# --------------------------------------------------------------------------
ENTRIES = []


def add(key, cands, section, note=""):
    """cands: [(相对路径, 回退说明或 "")]  按优先级排列。"""
    assert key not in [e["key"] for e in ENTRIES], "重复 key: %s" % key
    ENTRIES.append({"key": key, "cands": list(cands), "section": section, "note": note})


# ---------- A. 机器层 / 外壳 / 覆盖层 / 控制器 ----------
for face in ("side", "top", "bottom"):
    add("machine-ulv-%s" % face,
        [(gt_icon("MACHINE_ULV_%s" % face.upper()), "")], "A")
    add("machine-lv-%s" % face,
        [(gt_icon("MACHINE_LV_%s" % face.upper()), "")], "A")

for key_tier, tier in (("ulv", "ULV"), ("lv", "LV"), ("mv", "MV"), ("hv", "HV"),
                       ("ev", "EV"), ("iv", "IV"), ("luv", "LuV"),
                       ("zpm", "ZPM"), ("uv", "UV")):
    add("casing-%s" % key_tier, [(tier_hull(tier), "")], "A",
        "分级机壳（GT5U MACHINE_CASINGS）：miscutils iconsets/TieredHulls/CASING_<TIER>.png")

for face in ("side", "top", "bottom"):
    add("hull-ulv-%s" % face, [(tier_hull("ULV"),
        "Lead 确认：包内与 jar 内均无 HULL_ULV_*，用 TieredHulls/CASING_ULV.png 填这 3 个 key")],
        "A", "ULV 机壳块（HULL_* 不存在）")

add("overlay-energy-in", [(gt_icon("OVERLAY_ENERGY_IN"), "")], "A", "基础档（无分级后缀）")
add("overlay-energy-out", [(gt_icon("OVERLAY_ENERGY_OUT"), "")], "A", "基础档（无分级后缀）")
for amp in (2, 4, 16):
    for direction in ("IN", "OUT"):
        add("overlay-energy-%s-%da" % (direction.lower(), amp),
            [(gt_icon("OVERLAY_ENERGY_%s_MULTI_%dA" % (direction, amp)),
              "非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in|out>[-<A>A]）")], "A")

add("overlay-heat", [(gt_icon("OVERLAY_FRONT_HEAT_EXCHANGER"), "")], "A", "Lead 指定")
add("overlay-void", [(gt_icon("VOID"), "")], "A", "Lead 指定")
add("overlay-contamination", [(gt_icon("POLLUTOR"), "")], "A", "Lead 指定")

add("water-still", [(MCB + "/water_still.png", "动态贴图（竖直帧条），取第 0 帧")], "A",
    "流体方块（水）静帧")

add("casing-bricked-blast-furnace", [(gt_icon("MACHINE_CASING_BRICKEDBLASTFURNACE_INACTIVE"), "")], "A",
    "砖砌高炉外壳（INACTIVE = 未工作态）")
add("casing-bricked-blast-furnace-active", [(gt_icon("MACHINE_CASING_BRICKEDBLASTFURNACE_ACTIVE"), "")], "A",
    "砖砌高炉外壳（ACTIVE = 工作态）")
add("casing-heatproof", [
    (gt_icon("MACHINE_HEATPROOF"), ""),
    (gt_icon("MACHINE_HEATPROOFCASING"),
     "回退：包内无 MACHINE_HEATPROOF.png，改用 MACHINE_HEATPROOFCASING.png（Lead 已确认二选一）"),
], "A", "耐热外壳")
add("controller-coke-oven", [(MU + "/iconsets/controllerFaces/cokeOven.png", "")], "A",
    "焦炉控制器正面（miscutils controllerFaces）")
add("controller-coke-oven-active", [(MU + "/iconsets/controllerFaces/cokeOvenActive.png", "")], "A",
    "焦炉控制器正面（工作态）")
add("controller-primitive-blast-furnace", [
    (gt_icon("OVERLAY_FRONT_PRIMITIVEBLASTFURNACE"), ""),
    (gt_icon("OVERLAY_FRONT_PRIMITIVE_BLAST_FURNACE"), ""),
    (gt_icon("OVERLAY_FRONT_PRIMITIVEBLASTFURNACE_ACTIVE"), ""),
    (gt_icon("MACHINE_CASING_BRICKEDBLASTFURNACE_ACTIVE"),
     "回退（Lead 指定）：包内不存在任何 PRIMITIVEBLASTFURNACE 贴图，改用砖砌高炉砖外壳 ACTIVE 版"),
], "A", "原始高炉控制器")

# ---------- B1. 地板（blueprint bp-13476 方块 id -> key） ----------
FLOORS = [
    ("floor-white-concrete", "white_concrete.png", ""),
    ("floor-gray-concrete", "gray_concrete.png", ""),
    ("floor-black-concrete", "black_concrete.png", ""),
    ("floor-cyan-terracotta", "hardened_clay_stained_cyan.png",
     "1.7.10 无 cyan_terracotta，用同名色系染色硬化粘土"),
    ("floor-yellow-terracotta", "hardened_clay_stained_yellow.png",
     "1.7.10 无 yellow_terracotta，用同名色系染色硬化粘土"),
    ("floor-moss-block", "moss_block.png", "1.7.10 无 moss_block，取自 Modernity 包"),
    ("floor-grass-block", "grass_top.png", "1.7.10 grass_block 顶面 = grass_top"),
    ("floor-bricks", "brick.png", "1.7.10 bricks 方块贴图 = brick"),
    ("floor-iron-trapdoor", "iron_trapdoor.png", ""),
    ("floor-verdant-froglight", "sea_lantern.png",
     "现代 froglight 不存在；Lead 允许 sea_lantern / glowstone 任选"),
    ("floor-pearlescent-froglight", "glowstone.png",
     "现代 froglight 不存在；与 verdant 取不同源以便视觉可区分（Lead 允许二选一）"),
    ("floor-polished-diorite", "polished_diorite.png",
     "1.7.10 无 polished_diorite（包内自带现代贴图）"),
    ("floor-polished-granite", "polished_granite.png",
     "1.7.10 无 polished_granite（包内自带现代贴图）"),
    ("floor-polished-andesite-slab", "polished_andesite.png",
     "包内无 polished_andesite_slab；用同色磨制安山岩（备选 stone_slab_side.png）"),
    ("floor-smooth-quartz-slab", "quartz_block_side.png",
     "Lead 指定：包内无 quartz_slab / smooth_quartz_slab，用石英方块侧面（备选 quartz_block_bottom.png）"),
    ("floor-polished-diorite-stairs", "polished_diorite.png",
     "蓝图仅 56 格，阶梯细节可忽略；用同色磨制闪长岩"),
]
for key, rel, note in FLOORS:
    add(key, [(MCB + "/" + rel, "")], "B-floor", note)

# ---------- B2. 机器功能覆盖层 overlay-<machine>-<face>[-active] ----------
# 只产出包内**实际存在**的 face（Lead 确认：不要为凑数复制别的机器的贴图）
OVERLAY_MACHINES = {
    "macerator": ["front", "top"],
    "alloy_smelter": ["bottom", "front", "side", "top"],
    "compressor": ["front", "side", "top"],
    "extractor": ["front", "side", "top"],
    "electric_furnace": ["front"],
    "wiremill": ["front", "side", "top"],
    "hammer": ["front"],
    "fluid_heater": ["front", "side", "top"],
    "fluid_solidifier": ["front"],
    "ore_washer": ["front", "side"],
}
for machine_dir, faces in OVERLAY_MACHINES.items():
    key_machine = machine_dir.replace("_", "-")
    for face in faces:
        add("overlay-%s-%s" % (key_machine, face),
            [(gt_basic(machine_dir, face, False), "")], "B-overlay",
            "basicmachines/%s/OVERLAY_%s.png" % (machine_dir, face.upper()))
        add("overlay-%s-%s-active" % (key_machine, face),
            [(gt_basic(machine_dir, face, True), "")], "B-overlay",
            "basicmachines/%s/OVERLAY_%s_ACTIVE.png（动态贴图取第 0 帧）"
            % (machine_dir, face.upper()))

# ---------- C. 多方块 / 装饰（按名精确匹配，含注释说明的近似） ----------
MULTIBLOCKS = [
    ("multiblock-bronze-firebox", gt_icon("MACHINE_CASING_FIREBOX_BRONZE"), ""),
    ("multiblock-bronze-plated-brick", gt_icon("MACHINE_BRONZEPLATEDBRICKS"), ""),
    ("multiblock-coke-oven-brick", gt_icon("MACHINE_CASING_BRICKEDBLASTFURNACE_INACTIVE"),
     "近似：GT5U 无 COKEOVEN 外壳名，焦炉砖最接近砖砌高炉外壳 INACTIVE"),
    ("multiblock-heat-proof-casing", gt_icon("MACHINE_HEATPROOFCASING"), ""),
    ("multiblock-solid-steel-casing", gt_icon("MACHINE_CASING_SOLID_STEEL"), ""),
    ("multiblock-steel-firebox", gt_icon("MACHINE_CASING_FIREBOX_STEEL"), ""),
    ("multiblock-steel-plated", gt_icon("MACHINE_STEELBRICKS_SIDE"),
     "近似：包内无 STEELPLATED 名；用钢砖外壳族 MACHINE_STEELBRICKS_{SIDE,TOP,BOTTOM} 的 SIDE"),
    ("multiblock-blast-furnace-casing", gt_icon("MACHINE_BRONZEBLASTFURNACE"),
     "近似：用青铜高炉外壳（砖砌外壳已分配给 coke-oven-brick）"),
    ("multiblock-boiler-casing", gt_icon("BOILER_FRONT"),
     "近似：包内无 BOILER_CASING，用锅炉正面 BOILER_FRONT"),
]
for key, rel, note in MULTIBLOCKS:
    add(key, [(rel, "")], "C", note)

# ---------- D. 自动化 / 储能 / 杂项 ----------
AUTOMATION = ["chest-buffer", "filter", "item-distributor", "recipe-filter",
              "regulator", "super-buffer", "type-filter"]
AUTOMATION_SRC = {
    "chest-buffer": "AUTOMATION_CHESTBUFFER",
    "filter": "AUTOMATION_FILTER",
    "item-distributor": "AUTOMATION_ITEMDISTRIBUTOR",
    "recipe-filter": "AUTOMATION_RECIPEFILTER",
    "regulator": "AUTOMATION_REGULATOR",
    "super-buffer": "AUTOMATION_SUPERBUFFER",
    "type-filter": "AUTOMATION_TYPEFILTER",
}
for name in AUTOMATION:
    for tier in ("ulv", "lv"):
        add("automation-%s-%s" % (name, tier),
            [(gt_icon(AUTOMATION_SRC[name]), "")], "D",
            "GT5U 的 %s 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用"
            % AUTOMATION_SRC[name])

add("battery-buffer-1by1-ulv", [(tier_hull("ULV"),
     "MTEBuffer.class 只引用 MACHINE_CASINGS + OVERLAY_BUTTON_*/OVERLAY_PIPE_OUT，"
     "该机器无专属整机贴图；按真实渲染落盘为 ULV 机壳")], "D", "电池缓冲器 1x1")
add("battery-buffer-2by2-ulv", [(tier_hull("ULV"),
     "同上：无专属贴图，落盘为 ULV 机壳（BATTERY_BUFFER_2_BY_2_ULV 仅为注册 ID）")], "D",
    "电池缓冲器 2x2")
add("charger-4by4-ulv", [(tier_hull("ULV"),
     "MTECharger.class 无任何 iconsets 常量 -> 渲染 = 分级机壳；按真实渲染落盘为 ULV 机壳")], "D",
    "充电器 4x4")
add("turbo-charger-4by4-ulv", [(gt_icon("OVERLAY_ENERGY_OUT_MULTI_16A_ULV"),
     "MTETurboCharger.class 引用 MACHINE_CASINGS + OVERLAYS_ENERGY_OUT_MULTI_16A，"
     "故正面取 ULV 的 16A 输出覆盖层")], "D", "涡轮充电器 4x4")
add("energy-buffer-1by1-ulv", [(gt_icon("OVERLAY_ENERGY_OUT_MULTI_BUFFER_ULV"),
     "GT++ 储能缓冲（MTEHatchDynamoBuffer.class）引用 OVERLAYS_ENERGY_OUT_MULTI_BUFFER")], "D",
    "GT++ 储能缓冲器 1x1")
add("locker-ulv", [(gt_icon("OVERLAY_LOCKER"),
     "MTELocker.class 引用 BlockIcons.LOCKERS(OVERLAY_LOCKER_000..013) 与 OVERLAY_LOCKER")], "D",
    "储物柜")
add("em-machine-ulv", [], "D",
    "缺失：包内与 jar 内均无 EM_MACHINE_* 贴图，且无 class 引用 EM_MACHINE 常量")
add("super-tank-ulv", [(gt_icon("OVERLAY_STANK"),
     "BlockIcons.OVERLAY_STANK（super tank）；无整机贴图，取该机器覆盖层")], "D", "超级储罐")
add("gtfuidtank-ulv", [(gt_icon("OVERLAY_SIDE_FLUIDTANK"),
     "GT++ MTETieredTank.class 引用 MACHINE_CASINGS + OVERLAY_SIDE_FLUIDTANK/OVERLAY_TOP_FLUIDTANK")],
    "D", "GT++ 分级流体储罐")
add("simple-washer", [(gt_basic("simple_washer", "front", False),
     "GT5U 机器目录 basicmachines/simple_washer 的正面覆盖层（另有 OVERLAY_FRONT_STEAM_WASHER 蒸汽变体）")],
    "D", "简易洗矿机")

SECTION_TITLES = {
    "A": "A 段 · 机器层 / 机壳 / 覆盖层 / 控制器（渲染器静态 import，必需）",
    "B-floor": "B 段 · 地板贴图（floor-<材质>）",
    "B-overlay": "B 段 · 机器功能覆盖层（overlay-<machine>-<face>[-active]）",
    "C": "C 段 · 多方块 / 装饰",
    "D": "D 段 · 自动化 / 储能 / 杂项（可选）",
}

# --------------------------------------------------------------------------
# 抽取
# --------------------------------------------------------------------------
def load_container(path):
    if not os.path.isfile(path):
        return None
    try:
        zf = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        return None
    return {"path": path, "names": set(zf.namelist()), "zip": zf}


def normalize_png(raw):
    """-> (png_bytes, 源尺寸, 是否动态, 是否裁帧)"""
    im = Image.open(io.BytesIO(raw))
    src_size = im.size
    w, h = im.size
    # MC 动态贴图 = 竖直帧条（宽 x N*宽），PIL 不把它当多帧，这里按几何判定
    animated = bool(getattr(im, "n_frames", 1) > 1) or (w != h and w > 0 and h % w == 0)
    im = im.convert("RGBA")
    cropped = False
    if w != h:
        if w > 0 and h % w == 0:          # 竖直帧条 -> 第 0 帧
            im = im.crop((0, 0, w, w))
        else:                              # 其它非方形 -> 居中裁最大正方形
            side = min(w, h)
            left = (w - side) // 2
            top = (h - side) // 2
            im = im.crop((left, top, left + side, top + side))
        cropped = True
    if im.size != (TARGET, TARGET):
        im = im.resize((TARGET, TARGET), Image.NEAREST)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue(), src_size, animated, cropped


def resolve(entry, containers):
    """-> (container_name, rel_path, cand_note, bytes) 或 None"""
    for rel, cand_note in entry["cands"]:
        for c in containers:
            if rel in c["names"]:
                return c, rel, cand_note, c["zip"].read(rel)
    return None


def build():
    containers = []
    for name, path in CONTAINERS:
        c = load_container(path)
        if c:
            c["name"] = name
            containers.append(c)
        else:
            sys.stderr.write("[warn] 素材源不存在或不可读，跳过：%s (%s)\n" % (name, path))

    items, missing = [], []
    for e in ENTRIES:
        hit = resolve(e, containers)
        if hit is None:
            missing.append({"key": e["key"], "section": e["section"],
                            "tried": [p for p, _ in e["cands"]], "note": e["note"]})
            continue
        container, rel, cand_note, raw = hit
        png, src_size, animated, cropped = normalize_png(raw)
        items.append({
            "key": e["key"],
            "section": e["section"],
            "file": "assets/tex/%s.png" % e["key"],
            "source": container["name"],
            "path": rel,
            "src_size": list(src_size),
            "animated": animated,
            "frame_cropped": cropped,
            "out_size": [TARGET, TARGET],
            "bytes": len(png),
            "sha256": hashlib.sha256(png).hexdigest(),
            "candidate_note": cand_note,
            "note": e["note"],
            "_png": png,
        })
    return containers, items, missing


# --------------------------------------------------------------------------
# 落盘
# --------------------------------------------------------------------------
def write_outputs(items, missing, containers, prune=False):
    os.makedirs(OUT_DIR, exist_ok=True)
    written = unchanged = 0
    for it in items:
        out = os.path.join(OUT_DIR, "%s.png" % it["key"])
        old = None
        if os.path.isfile(out):
            with open(out, "rb") as fh:
                old = fh.read()
        if old == it["_png"]:
            unchanged += 1
        else:
            with open(out, "wb") as fh:
                fh.write(it["_png"])
            written += 1

    expected = {"%s.png" % it["key"] for it in items}
    extras = sorted(f for f in os.listdir(OUT_DIR)
                    if f.endswith(".png") and f not in expected)
    if prune and extras:
        for f in extras:
            os.remove(os.path.join(OUT_DIR, f))
    pruned = extras if prune else []

    report = {
        "generated_by": "gtnh3d/tools/extract-assets.py",
        "output_spec": {"size": [TARGET, TARGET], "mode": "RGBA",
                        "resample": "NEAREST", "animated": "frame 0"},
        "containers": [{"name": c["name"], "path": c["path"]} for c in containers],
        "stats": {"total": len(ENTRIES), "ok": len(items), "missing": len(missing)},
        "items": [{k: v for k, v in it.items() if k != "_png"} for it in items],
        "missing": missing,
        "extras_not_in_key_set": extras,
    }
    with open(REPORT_PATH, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2, sort_keys=False)
        fh.write("\n")
    with open(MD_PATH, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(render_md(report))
    return report, written, unchanged, pruned


# --------------------------------------------------------------------------
# ASSETS.md
# --------------------------------------------------------------------------
ASSEMBLY_SPEC = """\
| 机器 / 部件 | 是否有专属整机贴图 | 实际装配规则（证据） |
| --- | --- | --- |
| 机器外壳层 `machine-<tier>-<face>` | 有 | `gregtech iconsets/MACHINE_<TIER>_{SIDE,TOP,BOTTOM}.png`（ULV/LV 两档） |
| 分级机壳 `casing-<tier>` | 有 | `miscutils iconsets/TieredHulls/CASING_<TIER>.png`（ULV…UV 共 9 档 + MAX）。包内**没有** `MACHINE_CASING_<TIER>.png`，也**没有** `HULL_<TIER>_*` |
| 机器功能层 `overlay-<machine>-<face>[-active]` | 有 | `basicmachines/<machine>/OVERLAY_<FACE>.png` / `OVERLAY_<FACE>_ACTIVE.png`（仅少数机器有 SIDE/TOP/BOTTOM，缺的 face 由渲染器用机器外壳回退） |
| 电池缓冲器 `BATTERY_BUFFER_<n>_BY_<n>_<TIER>` | 无 | `MTEBuffer.class` 只引用 `MACHINE_CASINGS` + `OVERLAY_BUTTON_*` + `OVERLAY_PIPE_OUT` → 渲染 = 分级机壳 + 按钮覆盖层 |
| 充电器 `BATTERY_CHARGER_4_BY_4_<TIER>` | 无 | `MTECharger.class` 无任何 iconsets 常量 → 渲染 = 分级机壳 |
| 涡轮充电器 `MTETurboCharger` | 无 | `MTETurboCharger.class` 引用 `MACHINE_CASINGS` + `OVERLAYS_ENERGY_OUT_MULTI_16A` → 机壳 + `OVERLAY_ENERGY_OUT_MULTI_16A_<TIER>` |
| GT++ 储能缓冲 `Energy_Buffer_1by1_ULV` | 无 | `gtPlusPlus MTEHatchDynamoBuffer.class` 引用 `OVERLAYS_ENERGY_OUT_MULTI_BUFFER` |
| 储物柜 `LOCKER_<TIER>` | 有 | `MTELocker.class` 引用 `BlockIcons.LOCKERS`（`OVERLAY_LOCKER_000..013`）与 `OVERLAY_LOCKER` |
| GT++ 分级流体储罐 `GTFluidTank_<TIER>` | 无 | `gtPlusPlus MTETieredTank.class` 引用 `MACHINE_CASINGS` + `OVERLAY_SIDE_FLUIDTANK` / `OVERLAY_TOP_FLUIDTANK` |
| 超级储罐 | 覆盖层 | `BlockIcons.OVERLAY_STANK`（+`_GLOW`）；无整机贴图 |
| 量子储罐 / Yotta 流体罐 | 覆盖层 | `MTEDigitalTankBase` / `MTEYottaFluidTank` 引用 `OVERLAY_QTANK`（+`_GLOW`） |
| 简易洗矿机 `SimpleDustWasher_<TIER>` | 覆盖层 | GT5U 机器目录 `basicmachines/simple_washer/`（`OVERLAY_{FRONT,SIDE,TOP,BOTTOM}[_ACTIVE]`）；蒸汽变体为 `OVERLAY_FRONT_STEAM_WASHER` |
| 自动化机器（过滤器/调节器/超级缓冲…） | 有（tier 无关） | `MTERecipeFilter`→`AUTOMATION_RECIPEFILTER`、`MTERegulator`→`AUTOMATION_REGULATOR`、`MTESuperBuffer`→`AUTOMATION_SUPERBUFFER` 等；`ITEM_FILTER_<TIER>` / `CHEST_BUFFER_<TIER>` / `VOLTAGE_REGULATOR_<TIER>` / `ITEM_DISTRIBUTOR_<TIER>` / `TYPE_FILTER_<TIER>` **仅为注册 ID**，无专属贴图，均复用 `AUTOMATION_*` 单贴图 |
| 多方块 `multiblock-<name>` | 部分 | 见第 3 节 C 段备注；GT5U 多方块多为「外壳 + 控制器正面覆盖层」拼装，`multiblock-*` 取其实体外壳贴图 |
| `EM_MACHINE_ULV` | **不存在** | 包内与 jar 内均无 `EM_MACHINE_*`；`EM_*` 贴图族（`EM_CASING` / `EM_CONTROLLER` / `EM_FIELD_*` …）属于另一台多方块机器，不可映射 |
"""


def md_escape(s):
    return str(s).replace("|", "\\|")


def render_md(report):
    st = report["stats"]
    out = []
    out.append("# gtnh3d 素材清单（ASSETS.md）\n")
    out.append("> **本文件由 `gtnh3d/tools/extract-assets.py` 自动生成，请勿手工编辑。**\n")
    out.append("> 重新生成：`python gtnh3d/tools/extract-assets.py`　")
    out.append("校验：`python gtnh3d/tools/extract-assets.py --check`\n")
    out.append("\n## 1. 概述\n")
    out.append("- 用途：gtnh3d 渲染器按 key 静态引用 `gtnh3d/assets/tex/<key>.png`；**key 名即文件名**，必须与渲染器一致。")
    out.append("- 输出规格：`16x16` RGBA PNG；最近邻抽像素（`Image.NEAREST`），不做模糊插值；动态贴图取第 0 帧；保留 alpha。")
    out.append("- 源素材**只读**，运行期不修改/删除资源包与 jar。")
    out.append("- 源容器（按优先级从高到低，同一路径先命中者胜出）：")
    for i, c in enumerate(report["containers"], 1):
        out.append("  %d. `%s`：`%s`" % (i, c["name"], c["path"]))
    out.append("- 幂等：脚本可重复执行；产物内容不变时不会重写，且**无时间戳**，重复运行输出字节一致（sha256 见报告 JSON）。")
    out.append("- 机器可读副本：`gtnh3d/tools/extract-report.json`。\n")

    src_sizes = {}
    anim = 0
    for it in report["items"]:
        key = "x".join(str(v) for v in it["src_size"])
        src_sizes[key] = src_sizes.get(key, 0) + 1
        if it["animated"]:
            anim += 1
    out.append("## 2. 统计\n")
    out.append("| 项 | 值 |")
    out.append("| --- | --- |")
    out.append("| key 总数 | %d |" % st["total"])
    out.append("| 成功抽取 | **%d** |" % st["ok"])
    out.append("| 缺失 | %d |" % st["missing"])
    out.append("| 动态贴图（取第 0 帧） | %d |" % anim)
    out.append("| 源尺寸分布 | %s |" % "，".join(
        "%s × %d 个" % (k, v) for k, v in sorted(src_sizes.items(), key=lambda x: -x[1])))
    out.append("")

    out.append("## 3. key 清单\n")
    order = ["A", "B-floor", "B-overlay", "C", "D"]
    out.append("### 3.1 分段索引\n")
    out.append("| 段 | 说明 | key 数 |")
    out.append("| --- | --- | --- |")
    for sec in order:
        n = sum(1 for it in report["items"] if it["section"] == sec)
        m = sum(1 for it in report["missing"] if it["section"] == sec)
        out.append("| %s | %s | %d%s |" % (sec, SECTION_TITLES[sec], n,
                                           ("（+%d 缺失）" % m) if m else ""))
    out.append("")

    for sec in order:
        out.append("### 3.%d %s\n" % (order.index(sec) + 2, SECTION_TITLES[sec]))
        rows = [it for it in report["items"] if it["section"] == sec]
        if not rows:
            out.append("_本段无可产出的 key。_\n")
            continue
        out.append("| key | 输出文件 | 源容器 | 包内路径 | 源尺寸 | 输出 | 字节 | sha256(12) | 备注 |")
        out.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
        for it in rows:
            notes = []
            if it["note"]:
                notes.append(it["note"])
            if it["candidate_note"]:
                notes.append(it["candidate_note"])
            if it["animated"]:
                notes.append("动态贴图→第 0 帧")
            if it["frame_cropped"]:
                notes.append("已裁帧")
            out.append("| `%s` | `%s` | %s | `%s` | %s | %s | %d | `%s` | %s |" % (
                it["key"], it["file"], it["source"], it["path"],
                "x".join(str(v) for v in it["src_size"]),
                "x".join(str(v) for v in it["out_size"]),
                it["bytes"], it["sha256"][:12],
                md_escape("；".join(notes))))
        out.append("")

    out.append("## 4. 缺失 key（无法从任一源解析）\n")
    if not report["missing"]:
        out.append("_无。_\n")
    else:
        out.append("| key | 段 | 已尝试路径 | 说明 |")
        out.append("| --- | --- | --- | --- |")
        for m in report["missing"]:
            tried = "<br>".join("`%s`" % p for p in m["tried"]) or "（未给出候选路径）"
            out.append("| `%s` | %s | %s | %s |" % (m["key"], m["section"], tried, md_escape(m["note"])))
        out.append("")

    out.append("## 5. 回退与近似说明\n")
    out.append("以下 key 并非「同名精确命中」，已在清单备注中逐条标注，供 Lead 复核：\n")
    n = 0
    for it in report["items"]:
        if it["candidate_note"] or (it["note"] and ("近似" in it["note"] or "回退" in it["note"]
                                                    or "用" in it["note"] or "不存在" in it["note"])):
            n += 1
            reason = it["candidate_note"] or it["note"]
            out.append("%d. `%s` → `%s`：%s" % (n, it["key"], it["path"], reason))
    if n == 0:
        out.append("_无。_")
    out.append("")
    out.append("其它通用回退规则：")
    out.append("- 1.7.10 不存在的现代方块贴图，一律回退到**同色系 1.7.10 贴图**或包内自带现代贴图，逐条记录于上表。")
    out.append("- 非方形贴图（竖直帧条）裁第 0 帧后再最近邻降到 16x16。")
    out.append("- 源与输出同为 16x16 的贴图不重采样，直接落盘。\n")

    out.append("## 6. GT5U 机器贴图装配规格\n")
    out.append("下表用于说明「哪些机器有专属整机贴图、哪些是外壳+覆盖层拼装」，")
    out.append("以便渲染器在缺少某一 face 时按规则回退（结论均由 `javap` 级常量池扫描 + 包内文件清单实测得出）。\n")
    out.append(ASSEMBLY_SPEC)

    if report["extras_not_in_key_set"]:
        out.append("\n### 6.1 目录中的额外文件（不属于 key 集合，未自动删除）\n")
        for f in report["extras_not_in_key_set"]:
            out.append("- `assets/tex/%s`" % f)
        out.append("")

    out.append("## 7. 复现命令\n")
    out.append("```powershell")
    out.append("python gtnh3d/tools/extract-assets.py            # 抽取 + 生成 ASSETS.md / report.json")
    out.append("python gtnh3d/tools/extract-assets.py --dry-run  # 只解析不落盘")
    out.append("python gtnh3d/tools/extract-assets.py --check    # 校验产物（16x16 RGBA + sha256 一致）")
    out.append("```")
    out.append("")
    return "\n".join(out)


# --------------------------------------------------------------------------
# --check
# --------------------------------------------------------------------------
def do_check():
    if not os.path.isfile(REPORT_PATH):
        print("FAIL: 缺少 %s，请先运行不带参数的抽取" % REPORT_PATH)
        return 1
    with open(REPORT_PATH, encoding="utf-8") as fh:
        report = json.load(fh)
    bad = []
    for it in report["items"]:
        p = os.path.join(ROOT, it["file"].replace("/", os.sep))
        if not os.path.isfile(p):
            bad.append("%s: 文件缺失" % it["file"])
            continue
        with open(p, "rb") as fh:
            raw = fh.read()
        if hashlib.sha256(raw).hexdigest() != it["sha256"]:
            bad.append("%s: sha256 不一致" % it["file"])
            continue
        im = Image.open(io.BytesIO(raw))
        if im.size != (TARGET, TARGET):
            bad.append("%s: 尺寸 %s != %dx%d" % (it["file"], im.size, TARGET, TARGET))
        elif im.mode != "RGBA":
            bad.append("%s: 模式 %s != RGBA" % (it["file"], im.mode))
    print("check: %d/%d 通过，缺失 key %d" % (
        len(report["items"]) - len(bad), len(report["items"]), len(report["missing"])))
    for b in bad:
        print("  FAIL", b)
    return 1 if bad else 0


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="GTNH 3d-demo 贴图抽取器")
    ap.add_argument("--dry-run", action="store_true", help="只解析，不写任何文件")
    ap.add_argument("--check", action="store_true", help="校验已有产物与 report 一致")
    ap.add_argument("--prune", action="store_true", help="删除 tex/ 中不属于 key 集合的 *.png")
    args = ap.parse_args()

    if args.check:
        return do_check()

    containers, items, missing = build()
    if args.dry_run:
        print("[dry-run] 解析完成：成功 %d / 总 %d，缺失 %d"
              % (len(items), len(ENTRIES), len(missing)))
        for it in items:
            print("  OK   %-38s <- %-13s %s" % (it["key"], it["source"], it["path"]))
        for m in missing:
            print("  MISS %-38s (tried: %s)" % (m["key"], ", ".join(m["tried"]) or "-"))
        return 0

    report, written, unchanged, pruned = write_outputs(items, missing, containers, args.prune)
    print("key 总数 %d：成功 %d，缺失 %d；写出 %d，未变 %d"
          % (report["stats"]["total"], report["stats"]["ok"], report["stats"]["missing"],
             written, unchanged))
    print("输出目录 : %s" % OUT_DIR)
    print("清单     : %s" % MD_PATH)
    print("报告     : %s" % REPORT_PATH)
    if pruned:
        print("已删除多余文件: %s" % ", ".join(pruned))
    elif report["extras_not_in_key_set"]:
        print("注意：tex/ 中存在 %d 个不属于 key 集合的文件（未删除，可用 --prune 清理）"
              % len(report["extras_not_in_key_set"]))
    for m in missing:
        print("缺失 key : %s" % m["key"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
