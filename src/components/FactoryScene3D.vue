<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useGameStore } from '../game/store';
import { useMotion } from '../composables/useMotion';
import { COLUMN_META } from '../game/presentation/catalog';
import type { MachineKind } from '../game/core';
import { createFactoryView, type FactoryView, type SceneLabel } from '../scene/factory3d/renderer.js';
import { SCENE_MODELS, SCENE_VOLTAGE, sceneMachines } from '../scene/factory3d/state';
import config from '../content/scene-machines.json';

const props = defineProps<{ selectedKind: MachineKind | 'pickaxe' | null }>();
const emit = defineEmits<{ select: [kind: MachineKind]; manage: [kind: MachineKind] }>();
const store = useGameStore();
const motion = useMotion();
const root = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const demo = ref(true);
const demoRunning = ref(true);
const ready = ref(false);
const error = ref('');
const selectedId = ref<string | null>(null);
const labels = ref<SceneLabel[]>([]);
const machines = computed(() => sceneMachines(store.snap.factory, demo.value, demoRunning.value));
const selected = computed(() => machines.value.find(machine => machine.id === selectedId.value));
const displayed = computed(() => machines.value.reduce((sum, machine) => sum + Math.min(config.visiblePerModel, machine.count), 0));
const count = computed(() => machines.value.reduce((sum, machine) => sum + machine.count, 0));
const running = computed(() => machines.value.reduce((sum, machine) => sum + (machine.activity > 0 ? machine.running : 0), 0));
let view: FactoryView | null = null;
let observer: IntersectionObserver | null = null;
let disposed = false;

function select(id: string, focus = true): void {
  const machine = machines.value.find(machine => machine.id === id);
  if (!machine) return;
  selectedId.value = id;
  if (focus) view?.focus(id);
  else view?.select(id);
  emit('select', machine.category);
}
function indexOf(id: string): string { return String(SCENE_MODELS.findIndex(model => model.modelId === id) + 1).padStart(2, '0'); }
function status(id: string): string {
  const machine = machines.value.find(machine => machine.id === id);
  if (!machine?.count) return '待建设';
  return machine.running && machine.activity > 0 ? '运行中' : '待机';
}
function resetView(): void { view?.reset(); }
function overviewView(): void { view?.overview(); }
async function fullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await root.value?.requestFullscreen();
  } catch { /* 浏览器拒绝全屏时仍可在面板内操作。 */ }
}
watch([machines, motion.active], () => view?.update(machines.value, motion.active.value));
watch(() => props.selectedKind, kind => {
  if (selected.value?.category === kind) return;
  const model = SCENE_MODELS.find(machine => machine.category === kind);
  selectedId.value = model?.modelId ?? null;
  view?.select(selectedId.value);
});
onMounted(async () => {
  if (!canvas.value) return;
  try {
    const created = await createFactoryView(canvas.value, id => select(id, false), points => { labels.value = points; });
    if (disposed) { created.dispose(); return; }
    view = created;
    view.update(machines.value, motion.active.value);
    ready.value = true;
    canvas.value.dataset.sceneReady = 'true';
    observer = new IntersectionObserver(entries => view?.setVisible(entries[0]?.isIntersecting ?? false));
    observer.observe(canvas.value);
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : '浏览器无法创建 3D 画面';
  }
});
onUnmounted(() => {
  disposed = true;
  observer?.disconnect();
  view?.dispose();
  view = null;
});
</script>

<template>
  <section ref="root" class="factory-scene factory-scene-3d" aria-labelledby="factory-scene-title">
    <div class="scene-heading">
      <div class="factory-title"><span class="eyebrow">自由视角 · 方块工厂</span><h2 id="factory-scene-title">主厂区 <span class="factory-voltage">{{ SCENE_VOLTAGE }}</span></h2></div>
      <div class="factory-mode" role="group" aria-label="厂区显示内容">
        <button type="button" :aria-pressed="demo" @click="demo = true">LV 演示</button>
        <button type="button" :aria-pressed="!demo" @click="demo = false">实际厂区</button>
      </div>
    </div>
    <div class="factory-view-toolbar">
      <span><i class="factory-status-dot" :class="{ active: running > 0 }" />{{ demo ? `${machines.length} 种 LV 工业设备` : `${SCENE_VOLTAGE} 已建造 ${count} 台` }}</span>
      <div class="factory-view-actions">
        <button v-if="demo" type="button" :aria-pressed="demoRunning" @click="demoRunning = !demoRunning">{{ demoRunning ? '暂停演示' : '运行演示' }}</button>
        <button type="button" :aria-pressed="motion.active.value" :disabled="motion.reduced.value" @click="motion.toggle">{{ motion.active.value ? '动态：开' : '动态：关' }}</button>
        <button type="button" :disabled="!ready" @click="resetView">设备全景</button>
        <button type="button" :disabled="!ready" @click="overviewView">地板全景</button>
        <button type="button" @click="fullscreen">全屏</button>
      </div>
    </div>
    <div class="scene-stage factory-stage-3d" :aria-busy="!ready && !error">
      <canvas ref="canvas" tabindex="0" aria-label="3D 主厂区，拖动旋转，右键平移，滚轮缩放。聚焦后可用 WASD 移动，空格升高，Shift 降低，R 复位。" />
      <div v-if="!ready || error" class="factory-loading" role="status">
        <span class="factory-loading-cube" aria-hidden="true" />
        <strong>{{ error ? '3D 画面加载失败' : '正在铺设蓝图地板' }}</strong>
        <span>{{ error || '准备机器与现代化材质…' }}</span>
      </div>
      <div v-if="ready" class="factory-number-layer" aria-label="场景内设备">
        <template v-for="label in labels" :key="label.id">
          <button v-if="label.visible" type="button" class="factory-number" :class="{ selected: selectedId === label.id }"
            :style="{ left: `${label.x}%`, top: `${label.y}%` }"
            :aria-label="`查看${machines.find(machine => machine.id === label.id)?.name}`"
            @click="select(label.id)">{{ indexOf(label.id) }}</button>
        </template>
      </div>
      <div v-if="ready && !demo && !count" class="factory-empty">尚未建造 LV 工业设备 <button type="button" @click="demo = true">查看 LV 演示</button></div>
      <div v-if="ready" class="factory-view-note"><span>{{ demo ? '演示设备 · 不计入生产' : `已呈现 ${displayed} 台设备` }}</span><span>Modernity</span></div>
    </div>
    <div class="factory-navigation-help"><span>拖动旋转 · 右键平移 · 滚轮缩放</span><span>WASD 移动 · 空格 / Shift 升降 · R 复位</span></div>
    <div class="factory-machine-list" aria-label="LV 设备列表">
      <button v-for="(machine, index) in machines" :key="machine.id" type="button"
        :data-model-id="machine.id" :aria-pressed="selectedId === machine.id" :style="{ '--machine-accent': machine.accent }"
        @click="select(machine.id)">
        <span class="factory-machine-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="factory-machine-copy"><strong>{{ machine.name }}</strong><small>{{ COLUMN_META[machine.category].title }} <span>·</span> {{ demo ? '1 台展示' : `${machine.count} 台` }}</small></span>
        <span class="factory-machine-state" :class="{ active: status(machine.id) === '运行中' }"><i />{{ status(machine.id) }}</span>
      </button>
    </div>
    <div class="scene-footer factory-footer-3d">
      <span v-if="selected"><strong>{{ selected.name }}</strong> <span class="muted">· {{ SCENE_VOLTAGE }} · 单方块</span> <button type="button" @click="emit('manage', selected.category)">打开工作台</button></span>
      <span v-else>点击机器或下方设备卡片，靠近查看</span>
      <span v-if="demo">{{ running }} / {{ machines.length }} 台演示设备运行中</span>
      <span v-else>{{ running }} 台运行 <template v-if="count > displayed">· 大量同型设备合并展示</template></span>
    </div>
  </section>
</template>

<style scoped>
.factory-scene-3d { background: var(--panel); }
.factory-scene-3d .scene-heading { padding: 17px 18px 14px; }
.factory-title h2 { display: flex; align-items: center; gap: 10px; }
.factory-voltage { font: 11px var(--font-num); padding: 3px 8px; background: var(--track); border: 1px solid var(--line); color: var(--accent); }
.factory-mode { display: flex; border: 1px solid var(--line); padding: 3px; background: var(--track); }
.factory-mode button { min-height: 30px; padding: 0 12px; border: 0; border-image: none; background: transparent; color: var(--muted); font-size: 11px; box-shadow: none; }
.factory-mode button[aria-pressed="true"] { background: var(--panel-2); color: var(--text); box-shadow: inset 0 -2px var(--accent); }
.factory-view-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 9px 16px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--panel-2); }
.factory-view-toolbar > span { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 11px; }
.factory-status-dot, .factory-machine-state i { width: 5px; height: 5px; display: inline-block; background: var(--muted); }
.factory-status-dot.active, .factory-machine-state.active i { background: #91bf77; box-shadow: 0 0 5px #91bf7733; }
.factory-view-actions { display: flex; flex-wrap: wrap; gap: 5px; }
.factory-view-actions button { min-height: 28px; padding: 3px 8px; font-size: 10px; }
.factory-stage-3d { height: clamp(360px, 43vw, 520px); aspect-ratio: auto; background: #c9d9e5; }
.factory-stage-3d canvas { touch-action: none; cursor: grab; outline-offset: -3px; }
.factory-stage-3d canvas:active { cursor: grabbing; }
.factory-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 11px; color: #344959; background: #d1dce4; font-size: 12px; }
.factory-loading strong { font-size: 14px; }
.factory-loading-cube { width: 22px; height: 22px; background: #aeb7bd; border: 3px solid #667883; box-shadow: inset -6px -6px #82929d; }
.factory-number-layer { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.factory-number { position: absolute; transform: translate(-50%, -100%); pointer-events: auto; min-width: 25px; min-height: 24px; padding: 2px 5px; border: 1px solid #ffffff77; border-image: none; background: #24343cdd; color: #fff7e6; box-shadow: 0 2px 6px #10233133; font: 10px var(--font-num); }
.factory-number.selected { border-color: #f0ce82; color: #ffe5a9; background: #483c27eb; }
.factory-view-note { position: absolute; inset: auto 14px 12px; display: flex; justify-content: space-between; gap: 8px; pointer-events: none; color: #354a54; font-size: 10px; }
.factory-view-note span { padding: 4px 7px; background: #e5edf1d9; }
.factory-empty { position: absolute; top: 42%; left: 50%; transform: translate(-50%, -50%); padding: 14px; background: #edf1f2ed; border: 1px solid #9baab2; color: #344959; white-space: nowrap; font-size: 12px; }
.factory-empty button { margin-left: 8px; }
.factory-navigation-help { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 5px; padding: 9px 15px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); color: var(--muted); font-size: 10px; }
.factory-machine-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; background: var(--line); border-bottom: 1px solid var(--line); }
.factory-machine-list > button { display: flex; align-items: center; gap: 9px; padding: 12px; min-height: 69px; min-width: 0; border: none; border-image: none; background: var(--panel); box-shadow: none; text-align: left; }
.factory-machine-list > button[aria-pressed="true"] { background: var(--panel-2); box-shadow: inset 3px 0 var(--machine-accent); }
.factory-machine-list > button:hover { background: var(--panel-2); }
.factory-machine-index { color: var(--machine-accent); font: 11px var(--font-num); }
.factory-machine-copy { display: flex; flex: 1; flex-direction: column; gap: 4px; min-width: 0; }
.factory-machine-copy strong { font-size: 11px; font-weight: 600; color: var(--text); line-height: 1.45; }
.factory-machine-copy small { color: var(--muted); font-size: 10px; }
.factory-machine-copy small span { margin: 0 4px; }
.factory-machine-state { display: flex; align-items: center; gap: 5px; font-size: 9px; color: var(--muted); white-space: nowrap; }
.factory-machine-state.active { color: #87ac71; }
.factory-footer-3d { min-height: 48px; font-size: 10px; padding: 11px 15px; border-top: 0; flex-wrap: wrap; }
.factory-footer-3d strong { color: var(--text); font-size: 11px; }
.factory-footer-3d button { margin-left: 7px; min-height: 25px; padding: 2px 7px; font-size: 10px; }
.factory-scene-3d:fullscreen { height: 100%; width: 100%; border: 0; overflow: auto; }
.factory-scene-3d:fullscreen .factory-stage-3d { flex: 1; min-height: 200px; height: auto; }
@media (max-width: 1280px) {
  .factory-machine-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .factory-view-toolbar { align-items: flex-start; }
}
@media (max-width: 700px) {
  .factory-scene-3d .scene-heading { padding: 12px; }
  .factory-mode button { padding: 0 8px; }
  .factory-machine-list > button { padding: 10px 8px; gap: 6px; }
  .factory-machine-state { font-size: 0; }
  .factory-machine-state i { margin-left: 2px; }
  .factory-navigation-help { font-size: 9px; }
  .factory-stage-3d { height: 340px; }
}
</style>
