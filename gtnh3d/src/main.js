// Entry point: builds the atlas, assembles the scene, renders it, and wires up
// interaction (click a machine to read its GTNH data, click again to toggle the
// running texture set).

import * as THREE from "three";

import { buildAtlas } from "./atlas.js";
import * as RP from "./blocks.js";
import { FreeCamera } from "./controls.js";
import { FLOOR_SPECS, buildScene, paletteNameAt } from "./layout.js";
import { createHud } from "./hud.js";
import { meshWorld } from "./mesher.js";
import { raycastVoxel } from "./raycast.js";
import { createSky } from "./sky.js";
import * as T from "./textures.js";
import { LV_MACHINES } from "./machines.js";

const TEX_SOURCES = {
  "machine-ulv-side": T.machineUlvSide,
  "machine-ulv-top": T.machineUlvTop,
  "machine-ulv-bottom": T.machineUlvBottom,
  "machine-lv-side": T.machineLvSide,
  "machine-lv-top": T.machineLvTop,
  "machine-lv-bottom": T.machineLvBottom,
  "casing-ulv": T.casingUlv,
  "casing-lv": T.casingLv,
  "casing-mv": T.casingMv,
  "casing-hv": T.casingHv,
  "casing-ev": T.casingEv,
  "casing-iv": T.casingIv,
  "casing-luv": T.casingLuv,
  "casing-zpm": T.casingZpm,
  "casing-uv": T.casingUv,
  "hull-ulv-side": T.hullUlvSide,
  "hull-ulv-top": T.hullUlvTop,
  "hull-ulv-bottom": T.hullUlvBottom,
  "overlay-energy-in": T.overlayEnergyIn,
  "overlay-energy-out": T.overlayEnergyOut,
  "overlay-heat": T.overlayHeat,
  "overlay-void": T.overlayVoid,
  "overlay-contamination": T.overlayContamination,
  "water-still": T.waterStill,
  "casing-heatproof": T.heatproofCasing,
  "casing-bricked-blast-furnace": T.brickedFurnaceCasing,
  "casing-bricked-blast-furnace-active": T.brickedFurnaceActive,
  "controller-coke-oven": T.cokeOvenController,
  "controller-primitive-blast-furnace": T.primitiveBlastFurnaceController,

  "overlay-macerator-front": T.maceratorFront,
  "overlay-macerator-front-active": T.maceratorFrontActive,
  "overlay-macerator-top": T.maceratorTop,
  "overlay-macerator-top-active": T.maceratorTopActive,
  "overlay-alloy-smelter-front": T.alloySmelterFront,
  "overlay-alloy-smelter-front-active": T.alloySmelterFrontActive,
  "overlay-alloy-smelter-side": T.alloySmelterSide,
  "overlay-alloy-smelter-side-active": T.alloySmelterSideActive,
  "overlay-alloy-smelter-top": T.alloySmelterTop,
  "overlay-alloy-smelter-top-active": T.alloySmelterTopActive,
  "overlay-alloy-smelter-bottom": T.alloySmelterBottom,
  "overlay-alloy-smelter-bottom-active": T.alloySmelterBottomActive,
  "overlay-compressor-front": T.compressorFront,
  "overlay-compressor-front-active": T.compressorFrontActive,
  "overlay-compressor-side": T.compressorSide,
  "overlay-compressor-side-active": T.compressorSideActive,
  "overlay-compressor-top": T.compressorTop,
  "overlay-compressor-top-active": T.compressorTopActive,
  "overlay-extractor-front": T.extractorFront,
  "overlay-extractor-front-active": T.extractorFrontActive,
  "overlay-extractor-side": T.extractorSide,
  "overlay-extractor-side-active": T.extractorSideActive,
  "overlay-extractor-top": T.extractorTop,
  "overlay-extractor-top-active": T.extractorTopActive,
  "overlay-wiremill-front": T.wiremillFront,
  "overlay-wiremill-front-active": T.wiremillFrontActive,
  "overlay-wiremill-side": T.wiremillSide,
  "overlay-wiremill-side-active": T.wiremillSideActive,
  "overlay-wiremill-top": T.wiremillTop,
  "overlay-wiremill-top-active": T.wiremillTopActive,
  "overlay-fluid-heater-front": T.fluidHeaterFront,
  "overlay-fluid-heater-front-active": T.fluidHeaterFrontActive,
  "overlay-fluid-heater-side": T.fluidHeaterSide,
  "overlay-fluid-heater-side-active": T.fluidHeaterSideActive,
  "overlay-fluid-heater-top": T.fluidHeaterTop,
  "overlay-fluid-heater-top-active": T.fluidHeaterTopActive,
  "overlay-ore-washer-front": T.oreWasherFront,
  "overlay-ore-washer-front-active": T.oreWasherFrontActive,
  "overlay-ore-washer-side": T.oreWasherSide,
  "overlay-ore-washer-side-active": T.oreWasherSideActive,
  "overlay-electric-furnace-front": T.electricFurnaceFront,
  "overlay-electric-furnace-front-active": T.electricFurnaceFrontActive,
  "overlay-hammer-front": T.hammerFront,
  "overlay-hammer-front-active": T.hammerFrontActive,
  "overlay-fluid-solidifier-front": T.fluidSolidifierFront,
  "overlay-fluid-solidifier-front-active": T.fluidSolidifierFrontActive,

  "floor-white-concrete": T.floorWhiteConcrete,
  "floor-gray-concrete": T.floorGrayConcrete,
  "floor-black-concrete": T.floorBlackConcrete,
  "floor-cyan-terracotta": T.floorCyanTerracotta,
  "floor-yellow-terracotta": T.floorYellowTerracotta,
  "floor-moss-block": T.floorMoss,
  "floor-grass-block": T.floorGrass,
  "floor-bricks": T.floorBricks,
  "floor-iron-trapdoor": T.floorIronTrapdoor,
  "floor-verdant-froglight": T.floorFroglight,
  "floor-pearlescent-froglight": T.floorFroglightWarm,
  "floor-polished-diorite": T.floorPolishedDiorite,
  "floor-polished-granite": T.floorPolishedGranite,
  "floor-polished-andesite-slab": T.floorAndesiteSlab,
  "floor-smooth-quartz-slab": T.floorQuartzSlab,
  "floor-polished-diorite-stairs": T.floorDioriteStairs,
};

async function boot() {
  const canvas = document.getElementById("view");
  if (!canvas) {
    throw new Error(
      `canvas #view not found (document.readyState=${document.readyState}, ` +
        `url=${location.href.slice(0, 80)}, bodyChildren=${document.body ? document.body.children.length : "no-body"})`
    );
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
  const { dome } = createSky(scene);

  const FOG_ON = 0.0026;
  const FOG_OFF = 0.0006;
  scene.fog = new THREE.FogExp2(0xc7d7e8, FOG_ON);

  const atlas = await buildAtlas(TEX_SOURCES);
  const world3d = buildScene();
  const { world } = world3d;
  const built = meshWorld(world, atlas, { hidden: isDynamicVoxel });

  const baseMat = new THREE.MeshBasicMaterial({
    map: atlas.texture,
    vertexColors: true,
    transparent: true,
    alphaTest: 0.02,
    side: THREE.FrontSide,
    fog: true,
  });
  // The plaza + ULV yard + multiblock are static; the stateful LV machines are
  // meshed separately so toggling one never touches the 320x320 ground.
  const staticGroup = new THREE.Group();
  for (const g of built.meshes) staticGroup.add(new THREE.Mesh(g.geo, baseMat));
  scene.add(staticGroup);
  const dynamicGroup = new THREE.Group();
  scene.add(dynamicGroup);

  // ---- interaction -------------------------------------------------------
  let overview = false;
  let fogOn = true;

  const hud = createHud({
    onMode: (m) => {
      camera3d.setMode(m);
      hud.setMode(m);
    },
    onOverview: (btn) => {
      overview = !overview;
      hud.toggleButton(btn, overview);
      if (overview) focusOnMultiblock();
    },
    onFog: (btn) => {
      fogOn = !fogOn;
      scene.fog.density = fogOn ? FOG_ON : FOG_OFF;
      hud.toggleButton(btn, fogOn);
    },
    onFollow: () => {},
    onReset: () => {
      overview = false;
      hud.toggleButton(hud.overviewBtn, false);
      camera3d.reset();
    },
  });

  function focusOnMultiblock() {
    const mb = world3d.multiblocks[0];
    if (!mb) return;
    camera3d.setMode("orbit");
    hud.setMode("orbit");
    camera3d.orbitTarget.set(mb.center.x, mb.center.y, mb.center.z);
    camera3d.orbitDistance = 22;
    camera3d.orbitPitch = 0.42;
    camera3d.orbitYaw = Math.PI * 0.78;
  }

  // Frame the blueprint plaza plus the machine yard from the south-west.
  const start = world3d.center;
  const view = { x: start.x - 36, y: 36, z: start.z + 36 };
  const target = { x: start.x, y: 2, z: start.z };
  camera.position.set(view.x, view.y, view.z);
  const camera3d = new FreeCamera(camera, canvas, { onMode: (m) => hud.setMode(m) });
  camera3d.onClick = (e) => pick(e);
  const span = Math.hypot(target.x - view.x, target.y - view.y, target.z - view.z);
  camera3d.yaw = Math.atan2(-(target.x - view.x), -(target.z - view.z));
  camera3d.pitch = Math.asin((target.y - view.y) / span);
  camera3d.sync();
  hud.setMode("fly");
  hud.toggleButton(hud.fogBtn, true);

  function pick(e) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hit = raycastVoxel(world, ray.ray.origin, ray.ray.direction, 240);
    if (!hit) {
      hud.setHint("没有点到方块 / no block hit");
      return;
    }
    hud.setHint("");
    const { entry } = hit;
    const { x, y, z } = hit.voxel;

    if (entry.machineId) {
      const inst = world3d.hallInstances.find((h) => h.machine.id === entry.machineId);
      if (inst) {
        const nowRunning = inst.slot.spec === inst.machine.run;
        inst.slot.spec = nowRunning ? inst.machine.idle : inst.machine.run;
        rebuildDynamic();
        showMachinePanel(inst.machine, !nowRunning);
      }
      return;
    }
    for (const mb of world3d.multiblocks) {
      const dx = x - mb.origin.x;
      const dy = y - mb.origin.y;
      const dz = z - mb.origin.z;
      const s = mb.def.size;
      if (dx >= 0 && dx < s.x && dy >= 0 && dy < s.y && dz >= 0 && dz < s.z) {
        const ch = mb.def.layers[dy][dz][dx];
        showMultiblockPanel(mb, ch, { x: dx, y: dy, z: dz });
        return;
      }
    }
    showBlockPanel(entry, { x, y, z });
  }

  // Re-mesh only the dynamic (interactive) layer; the plaza stays untouched.
  let rebuildHandle = null;
  function rebuildDynamic() {
    if (rebuildHandle) cancelAnimationFrame(rebuildHandle);
    rebuildHandle = requestAnimationFrame(() => {
      rebuildHandle = null;
      const next = meshWorld(world, atlas, { hidden: (x, y, z) => !isDynamicVoxel(x, y, z) });
      for (const m of dynamicGroup.children.slice()) {
        dynamicGroup.remove(m);
        m.geometry.dispose();
      }
      for (const g of next.meshes) dynamicGroup.add(new THREE.Mesh(g.geo, baseMat));
      built.dynFaces = next.faces;
      built.dynGroups = next.groups;
    });
  }

  // The only stateful voxels: the LV machines (they swap idle <-> running).
  function isDynamicVoxel(x, y, z) {
    return world.tag(x, y, z) === "machine";
  }

  function showMachinePanel(machine, running) {
    const m = machine.meta;
    hud.showPanel({
      title: `${machine.name}（${machine.nameEn}）`,
      titleEn: `GT5U basicmachine.${machine.id}.tier.01 · ${m.voltage}`,
      rows: [
        ["机器 ID", `basicmachine.${machine.id}`],
        ["等级", `LV · tier 01`],
        ["电压", m.voltage],
        ["支持等级", m.tiers || "LV–UV"],
        ["用途", m.role || "-"],
        ["配方示例", m.recipe || "-"],
        ["状态", running ? "运行中（ACTIVE 贴图 + 自发光）" : "待机（IDLE 贴图）"],
      ],
      sections: [
        {
          title: "贴图来源",
          lines: [
            `底材 assets/gregtech/textures/blocks/iconsets/MACHINE_LV_{SIDE,TOP,BOTTOM}.png`,
            `正面 basicmachines/${machine.id}/OVERLAY_FRONT${running ? "_ACTIVE" : ""}.png`,
            m.note ? `注意：${m.note}` : "侧面/顶面覆盖层按包内实际存在的面片使用",
          ],
        },
      ],
    });
  }

  function showMultiblockPanel(mb, ch, local) {
    const v = mb.validation;
    hud.showPanel({
      title: `${mb.def.name}（${mb.def.nameEn}）`,
      titleEn: "GT5U multiblock · 结构已按数据校验",
      rows: [
        ["结构校验", v.ok ? `✅ PASS（${v.checked} 格全部匹配）` : `❌ FAIL（${v.problems.length} 处不符）`],
        ["尺寸", `${mb.def.size.x}×${mb.def.size.z}×${mb.def.size.y}（长×宽×高，中空）`],
        ["点击位置", `局部 (${local.x},${local.y},${local.z}) → ${mb.def.legend[ch] || "空气"}`],
        ["控制器", "正面中央（第二层靠外一格）"],
        ["来源", mb.def.source],
      ],
      sections: [
        { title: "结构数据", lines: mb.def.facts },
        { title: "材料清单", lines: [`耐火砖 Firebricks ×32`, `砖高炉控制器 ×1`, `内部 + 顶层中心必须留空`] },
        ...(v.problems.length ? [{ title: "校验差异", lines: v.problems.slice(0, 6) }] : []),
      ],
    });
  }

  function showBlockPanel(entry, pos) {
    const spec = entry.spec;
    const { x, y, z } = pos;
    hud.showPanel({
      title: `${spec.name || "方块"}（${spec.nameEn || "Block"}）`,
      titleEn: `(${x}, ${y}, ${z})`,
      rows: [
        ["方块", spec.name || spec.nameEn || "-"],
        ["坐标", `${x} / ${y} / ${z}`],
        ["蓝图调色板", paletteNameAt(x % RP.FLOOR_SIZE, z % RP.FLOOR_SIZE, y)],
        ...(spec.meta ? Object.entries(spec.meta).map(([k, val]) => [k, String(val)]) : []),
      ],
      sections: [
        {
          title: "关于",
          lines:
            entry.tag === "floor"
              ? [
                  "该方块来自蓝图 bp-13476「7×7大型地块-混凝土地基」的原始层数据（三层全部保留）。",
                  "地板按 2×2 拼接为 320×320，四周另铺一圈灰色混凝土使其向四周延伸。",
                  "蓝图里留空的格子在本 demo 里同样留空，不做填充。",
                ]
              : ["该方块不属于机器，仅为结构或地坪方块。"],
        },
      ],
    });
  }

  // ---- resize / loop -----------------------------------------------------
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "escape") hud.hidePanel();
    if (k === "g") {
      overview = !overview;
      hud.toggleButton(hud.overviewBtn, overview);
      if (overview) focusOnMultiblock();
    }
    if (k === "p") {
      fogOn = !fogOn;
      scene.fog.density = fogOn ? FOG_ON : FOG_OFF;
      hud.toggleButton(hud.fogBtn, fogOn);
    }
  });

  // ---- stats + render loop ----------------------------------------------
  rebuildDynamic(); // first pass for the stateful machine layer
  let fps = 60;
  let last = performance.now();
  let acc = 0;
  let frames = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    camera3d.update(dt);
    dome.position.copy(camera.position);
    renderer.render(scene, camera);

    acc += dt;
    frames++;
    if (acc >= 0.5) {
      fps = frames / acc;
      frames = 0;
      acc = 0;
      hud.setStats({
        fps,
        faces: built.faces + (built.dynFaces || 0),
        pos: camera.position,
        cubes: world.blocks.size,
        meshes: built.groups + (built.dynGroups || 0),
      });
    }
    requestAnimationFrame(frame);
  }

  hud.setStats({ fps: 60, faces: built.faces, pos: camera.position, cubes: world.blocks.size, meshes: built.groups });
  requestAnimationFrame(frame);

  // expose for debugging in the console
  window.__gtnh3d = {
    scene,
    camera,
    world,
    built,
    world3d,
    atlas,
    camera3d,
    rebuildDynamic,
    renderer,
    hud,
    material: baseMat,
    THREE,
    blocks: RP,
  };
  window.__gtnh3dReady = true;
}

function start() {
  boot().catch((err) => {
    const el = document.createElement("pre");
    el.style.cssText =
      "position:fixed;inset:0;margin:0;padding:24px;color:#f66;background:#111;font:13px/1.5 monospace;white-space:pre-wrap;z-index:9";
    el.textContent = `启动失败 / Failed to boot:\n\n${err && err.stack ? err.stack : err}`;
    document.body.append(el);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
