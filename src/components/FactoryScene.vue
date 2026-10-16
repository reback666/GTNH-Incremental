<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useGameStore } from '../game/store';
import { useMotion } from '../composables/useMotion';
import { modelIconUrl } from '../game/icons';
import { casingUrl, oreUrl } from '../scene/textures';
import { onFx } from '../game/fx';
import { project, SCENE_HEIGHT, SCENE_WIDTH, SITES, viewportPoint, hitFacility, rackCount, MACHINES_PER_RACK, type Site } from '../scene/layout';
import { renderFactory } from '../scene/renderer';
import type { MachineKind } from '../game/core';

const props = defineProps<{ selectedKind: MachineKind | 'pickaxe' | null }>();
const emit = defineEmits<{ select: [kind: MachineKind]; manage: [kind: MachineKind] }>();
const store = useGameStore();
const canvas = ref<HTMLCanvasElement | null>(null);
const motion = useMotion();
const zoom = ref(1);
const selected = computed(() => props.selectedKind);
const selectedFacility = computed(() => factory.value.facilities.find(item => item.kind === selected.value));
const hovered = ref<MachineKind | null>(null);
const factory = computed(() => store.snap.factory);
const visibleSites = computed(() => SITES.filter(site => facility(site.kind) || site.kind === 'research'));
const images = new Map<string, HTMLImageElement>();
let ctx: CanvasRenderingContext2D | null = null;
let frame = 0;
let previous = 0;
let time = 0;
let pulse = 0;
let inView = true;
let observer: IntersectionObserver | null = null;
let resize: ResizeObserver | null = null;
let unsubscribe: (() => void) | null = null;

function facility(kind: MachineKind) { return factory.value.facilities.find(item => item.kind === kind); }
function status(kind: MachineKind): string {
  const item = facility(kind);
  if (!item) return 'LuV 解锁';
  if (!item.count) return '待建设';
  if (item.faulty) return `${item.faulty} 台待维护`;
  if (kind === 'storage') return `储能 ${(factory.value.batteryRatio * 100).toFixed(0)}%`;
  return item.activity > 0 ? `${item.running} 台运行中` : `${item.count} 台待机`;
}
function position(site: Site) {
  const point = viewportPoint(project(site.x, site.y, -40), zoom.value);
  return { left: `${point.x / SCENE_WIDTH * 100}%`, top: `${point.y / SCENE_HEIGHT * 100}%`, '--site-color': site.color };
}
function select(kind: MachineKind): void {
  if (!facility(kind)) return;
  emit('select', kind);
  paint();
}
function selectMachine(event: MouseEvent): void {
  if (!canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const kind = hitFacility({ x: (event.clientX - rect.left) / rect.width * SCENE_WIDTH,
    y: (event.clientY - rect.top) / rect.height * SCENE_HEIGHT }, factory.value.facilities, zoom.value);
  if (kind) select(kind);
}
function paint(): void {
  if (!ctx || !inView || document.hidden) return;
  renderFactory(ctx, { factory: factory.value, selected: hovered.value ?? selected.value ?? '',
    zoom: zoom.value, light: store.snap.uiTheme === 'light', time, minePulse: pulse, veinTier: store.snap.currentVein.tier, images });
}
function loadImage(key: string, url?: string): void {
  if (!url || images.has(key)) return;
  const image = new Image(); images.set(key, image); image.onload = paint; image.src = url;
}
function loadImages(): void {
  for (const item of factory.value.facilities) for (const machine of item.machines) {
    loadImage(machine.modelId, modelIconUrl(machine.modelId));
    loadImage(`side:${machine.tier}`, casingUrl(machine.tier, 'side'));
    loadImage(`top:${machine.tier}`, casingUrl(machine.tier, 'top'));
  }
  loadImage(`ore:${store.snap.currentVein.tier}`, oreUrl(store.snap.currentVein.tier));
}
function animate(stamp: number): void {
  frame = 0;
  if (!motion.active.value || !inView || document.hidden) return;
  if (stamp - previous >= 1000 / 30) {
    const dt = Math.min(0.1, (stamp - previous) / 1000);
    previous = stamp;
    time += dt;
    pulse = Math.max(0, pulse - dt * 1.6);
    paint();
  }
  frame = requestAnimationFrame(animate);
}
function syncAnimation(): void {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  previous = performance.now();
  paint();
  if (motion.active.value && inView && !document.hidden) frame = requestAnimationFrame(animate);
}
function resizeCanvas(): void {
  if (!canvas.value || !ctx) return;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.value.width = SCENE_WIDTH * ratio;
  canvas.value.height = SCENE_HEIGHT * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  paint();
}
watch([factory, () => store.snap.uiTheme], () => { loadImages(); paint(); });
watch([zoom, hovered, selected], paint);
watch(motion.active, syncAnimation);
onMounted(() => {
  ctx = canvas.value?.getContext('2d') ?? null;
  loadImages(); resizeCanvas();
  observer = new IntersectionObserver(entries => { inView = entries[0]?.isIntersecting ?? false; syncAnimation(); });
  if (canvas.value) observer.observe(canvas.value);
  resize = new ResizeObserver(resizeCanvas);
  if (canvas.value) resize.observe(canvas.value);
  document.addEventListener('visibilitychange', syncAnimation);
  unsubscribe = onFx(event => { if (event.kind === 'mine') { pulse = motion.active.value ? 1 : 0; paint(); } });
  syncAnimation();
});
onUnmounted(() => {
  if (frame) cancelAnimationFrame(frame);
  observer?.disconnect(); resize?.disconnect(); unsubscribe?.();
  document.removeEventListener('visibilitychange', syncAnimation);
  for (const image of images.values()) image.onload = null;
  images.clear();
});
</script>

<template>
  <section class="factory-scene" aria-labelledby="factory-scene-title">
    <div class="scene-heading">
      <div><span class="eyebrow">实时生产网络</span><h2 id="factory-scene-title">主厂区</h2></div>
      <div class="scene-controls">
        <button type="button" :aria-pressed="motion.active.value" :disabled="motion.reduced.value" @click="motion.toggle">
          {{ motion.reduced.value ? '系统已减少动态效果' : motion.active.value ? '动态画面：开' : '动态画面：关' }}
        </button>
        <div class="zoom-controls">
          <button type="button" aria-label="缩小厂区" :disabled="zoom <= 0.8" @click="zoom = Math.max(0.8, zoom - 0.1)">−</button>
          <button type="button" aria-label="恢复厂区视角" @click="zoom = 1">{{ (zoom * 100).toFixed(0) }}%</button>
          <button type="button" aria-label="放大厂区" :disabled="zoom >= 1.2" @click="zoom = Math.min(1.2, zoom + 0.1)">+</button>
        </div>
      </div>
    </div>
    <div class="scene-stage">
      <canvas ref="canvas" :width="SCENE_WIDTH" :height="SCENE_HEIGHT" aria-hidden="true" @click="selectMachine" />
      <div class="scene-map-overlay">
        <button v-for="site in visibleSites" :key="site.kind" type="button"
          class="scene-marker" :class="{ selected: selected === site.kind, operating: (facility(site.kind)?.activity ?? 0) > 0 }"
          :style="position(site)" :disabled="!facility(site.kind)" :aria-pressed="selected === site.kind"
          :aria-label="`${site.label}，${status(site.kind)}，查看设备`"
          @click="select(site.kind)" @mouseenter="hovered = site.kind" @mouseleave="hovered = null"
          @focus="hovered = site.kind" @blur="hovered = null">
          <span class="marker-name"><i />{{ site.label }}<b v-if="facility(site.kind)?.count">{{ facility(site.kind)?.count }}</b></span>
          <small>{{ status(site.kind) }}<template v-if="(facility(site.kind)?.count ?? 0) > MACHINES_PER_RACK"> · {{ rackCount(facility(site.kind)!.count) }} 组</template></small>
        </button>
      </div>
      <div class="scene-corner"><span class="live-dot" />{{ store.catchingUp ? '正在同步生产进度' : factory.runningCount ? '生产网络运行中' : '生产网络待机' }}</div>
      <div class="scene-legend"><span><i class="ore-line" />矿物流</span><span><i class="power-line" />电力流</span><span><i class="coin-line" />成品流</span></div>
    </div>
    <div class="scene-footer">
      <span v-if="selectedFacility">{{ selectedFacility.name }} · {{ selectedFacility.count }} 台 <button type="button" @click="emit('manage', selectedFacility.kind)">打开工作台</button></span><span v-else>点击厂区选择设备</span>
      <span class="scene-output">实际发电 {{ store.snap.power.generated.value }}</span><span><b>{{ factory.machineCount }}</b> 台设备 <i /> <b>{{ factory.runningCount }}</b> 台运行 <i />
        <span :class="{ danger: factory.faultyCount > 0 }">{{ factory.faultyCount }} 台故障</span></span>
    </div>
  </section>
</template>
