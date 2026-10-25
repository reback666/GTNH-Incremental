<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useGameStore } from '../game/store';
import { useMotion } from '../composables/useMotion';
import { COLUMN_META, COLUMN_ORDER } from '../game/presentation/catalog';
import type { MachineKind } from '../game/core';
import { modelIconUrl } from '../game/icons';
import { createFactoryView, type FactoryView, type SceneLabel } from '../scene/factory3d/renderer.js';
import { matchesSceneFilter, sceneMachines } from '../scene/factory3d/state';
import { machineIndexAtCell } from '../scene/factory3d/model-layout';
import { createGround, cleanGround, editGround, groundSiteKey, type GroundDesign, type GroundEdit, type GroundEditor as GroundEditorState } from '../scene/factory3d/ground';
import { useGroundLibrary } from '../composables/useGroundLibrary';
import GroundEditor from './GroundEditor.vue';
import GroundImport from './GroundImport.vue';
import GroundSettingsDialog from './GroundSettingsDialog.vue';
import type { GroundStructure } from '../scene/factory3d/ground-structure';

const props = defineProps<{ selectedKind: MachineKind | 'pickaxe' | null }>();
const emit = defineEmits<{ select: [kind: MachineKind] }>();
const store = useGameStore();
const motion = useMotion();
const root = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const ready = ref(false);
const error = ref('');
const selectedId = ref<string | null>(null);
const selectedIndex = ref(0);
const category = ref<MachineKind | ''>('');
const tier = ref<number | null>(null);
const labels = ref<SceneLabel[]>([]);
const machines = computed(() => sceneMachines(store.snap.factory));
const filter = computed(() => ({ category: category.value, tier: tier.value }));
const filtered = computed(() => machines.value.filter(machine => matchesSceneFilter(machine, filter.value)));
const machineById = computed(() => new Map(machines.value.map(machine => [machine.id, machine])));
const tiers = computed(() => [...new Map(machines.value.map(machine => [machine.tier, machine.voltage])).entries()].sort((a, b) => a[0] - b[0]));
const selected = computed(() => machines.value.find(machine => machine.id === selectedId.value));
const focused = computed(() => selected.value && filtered.value.some(machine => machine.id === selectedId.value)
  ? [selected.value] : []);
const displayed = computed(() => filtered.value.reduce((sum, machine) => sum + machine.count, 0));
const count = computed(() => machines.value.reduce((sum, machine) => sum + machine.count, 0));
const running = computed(() => filtered.value.reduce((sum, machine) => sum + (machine.activity > 0 ? machine.running : 0), 0));
const multiblocks = computed(() => filtered.value.filter(machine => machine.modelKind === 'multiblock').reduce((sum, machine) => sum + machine.count, 0));
const { library, storageError, setSite, savePreset, removePreset, importLibrary, addImportedPreset } = useGroundLibrary();
const defaultGround = createGround();
const site = computed(() => selected.value ? groundSiteKey(selected.value.id) : 'empty:0');
const previewStructure = shallowRef<GroundStructure | null>(null);
const previewDesign = createGround('imported');
const previewError = ref('');
const previewReady = ref(false);
const savedGround = computed(() => library.value.sites[site.value] ?? defaultGround);
const currentGround = computed(() => previewStructure.value ? previewDesign : savedGround.value);
const currentStructure = computed(() => previewStructure.value ?? (currentGround.value.structureId ? library.value.structures[currentGround.value.structureId] : null));
const importPanel = ref<InstanceType<typeof GroundImport> | null>(null);
const settingsOpen = ref(false);
const settingsTab = ref<'edit' | 'import'>('edit');
const mainPreviewHost = ref<HTMLDivElement | null>(null);
const settingsPreviewHost = ref<HTMLDivElement | null>(null);
const mainPreviewHeight = ref(0);
const editor = ref<GroundEditorState>({ tool: 'view', material: 'white-concrete', layer: 0 });
const hover = ref<GroundEdit | null>(null);
const groundMessage = ref('');
const undoStack = ref<GroundDesign[]>([]), redoStack = ref<GroundDesign[]>([]);
const rememberedIndices = new Map<string, number>();
let view: FactoryView | null = null;
let observer: IntersectionObserver | null = null;
let disposed = false;
let active = true;
let viewRevision = 0;

function select(id: string, index = rememberedIndices.get(id) ?? 0): void {
  const machine = machines.value.find(machine => machine.id === id);
  if (!machine) return;
  selectedId.value = id;
  selectedIndex.value = Math.max(0, Math.min(index, machine.count - 1));
  rememberedIndices.set(id, selectedIndex.value);
  view?.select(id, selectedIndex.value);
  emit('select', machine.category);
}
function indexOf(id: string): string { return String(machines.value.findIndex(model => model.id === id) + 1).padStart(2, '0'); }
function status(id: string): string {
  const machine = machines.value.find(machine => machine.id === id);
  if (!machine?.count) return '待建设';
  return machine.running && machine.activity > 0 ? '运行中' : '待机';
}
function modelDescription(machine: typeof machines.value[number]): string {
  if (machine.modelKind === 'multiblock') return `多方块结构 · ${machine.size.join(' × ')} 格`;
  return machine.modelKind === 'effect' ? '原生节点光效' : '原生立体模型';
}
function resetView(): void { view?.reset(); }
function clearFilters(): void { category.value = ''; tier.value = null; }
function focusSelected(): void { if (selected.value) view?.focus(selected.value.id, selectedIndex.value); }
function openSettings(): void {
  mainPreviewHeight.value = mainPreviewHost.value?.getBoundingClientRect().height ?? 0;
  settingsTab.value = selected.value ? 'edit' : 'import'; settingsOpen.value = true;
}
function closeSettings(): void { settingsOpen.value = false; }
async function syncView(): Promise<void> {
  if (!view || !active) return;
  const revision = ++viewRevision;
  try {
    await view.setGround(currentGround.value, previewStructure.value ? `${site.value}:preview` : site.value, currentStructure.value);
    if (revision !== viewRevision || !active || !view) return;
    view.update(focused.value, motion.active.value, {}, count.value);
    if (previewStructure.value) previewReady.value = true;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '场地显示失败。';
    if (previewStructure.value) { previewError.value = message; previewReady.value = false; } else groundMessage.value = message;
  }
}
function previewGround(structure: GroundStructure | null): void { previewError.value = ''; previewReady.value = false; previewStructure.value = structure; }
function saveImportedGround(structure: GroundStructure, apply: boolean): void {
  addImportedPreset(structure, apply && selected.value ? site.value : undefined);
  previewStructure.value = null; previewError.value = '';
  groundMessage.value = apply ? '场地已保存为预设，并应用到当前机型。' : '场地已保存为预设。';
}
function requestGroundEdit(edit: GroundEdit): void { view?.applyGroundEdit(edit); }
function moveCamera(forward: number, side = 0, lift = 0): void { view?.moveCamera(forward, side, lift); }
function changeGround(design: GroundDesign): void {
  if (!selected.value || JSON.stringify(design) === JSON.stringify(currentGround.value)) return;
  const model = selected.value;
  const overlaps = Object.keys(design.cells).some(key => {
    const [x, y, z] = key.split(',').map(Number);
    const index = machineIndexAtCell(x, z, model.size[0], model.size[2], design.machine.x, design.machine.z);
    return y >= 0 && y < model.size[1] && index !== null && index < model.count;
  });
  if (overlaps) { groundMessage.value = '此位置已有装饰方块，请先拆除，或选择其他设备位置。'; return; }
  undoStack.value = [...undoStack.value.slice(-49), currentGround.value]; redoStack.value = [];
  setSite(site.value, design); groundMessage.value = '当前设备的场地已更新。';
}
function applyGroundEdit(edit: GroundEdit): void {
  changeGround(editGround(currentGround.value, edit));
}
function undoGround(redo = false): void {
  const from = redo ? redoStack : undoStack, to = redo ? undoStack : redoStack;
  const design = from.value.at(-1);
  if (!design) return;
  from.value = from.value.slice(0, -1); to.value = [...to.value, currentGround.value];
  setSite(site.value, design); groundMessage.value = redo ? '已重做。' : '已撤销。';
}
function updateEditor(next: GroundEditorState): void { editor.value = next; view?.setGroundEditor(next); }
function saveGroundPreset(name: string): void {
  savePreset(name, cleanGround(currentGround.value)); groundMessage.value = `已保存预设「${name}」。`;
}
function importGrounds(text: string): void {
  try { importLibrary(text); undoStack.value = []; redoStack.value = []; groundMessage.value = '场地与自定义预设已导入。'; }
  catch (cause) { groundMessage.value = cause instanceof SyntaxError ? '场地文件不是有效的 JSON，请检查后重试。' : cause instanceof Error ? cause.message : '场地导入失败。'; }
}
function exportGrounds(): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(library.value, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'GTNH场地.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  groundMessage.value = '已导出全部场地与自定义预设。';
}
async function fullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await root.value?.requestFullscreen();
  } catch { /* 浏览器拒绝全屏时仍可在面板内操作。 */ }
}
watch(filtered, next => {
  const current = next.find(machine => machine.id === selectedId.value);
  if (current) selectedIndex.value = Math.min(selectedIndex.value, current.count - 1);
  else { selectedId.value = next[0]?.id ?? null; selectedIndex.value = 0; }
}, { immediate: true, flush: 'sync' });
watch([focused, motion.active, currentGround, currentStructure, site], syncView, { flush: 'post' });
watch(settingsOpen, open => {
  if (open) view?.setVisible(active);
  else {
    importPanel.value?.cancel(); updateEditor({ ...editor.value, tool: 'view' });
    view?.setVisible(false);
    if (active && canvas.value && observer) { observer.unobserve(canvas.value); observer.observe(canvas.value); }
  }
}, { flush: 'post' });
watch(settingsTab, tab => { if (tab === 'edit') importPanel.value?.cancel(); });
watch(site, () => { undoStack.value = []; redoStack.value = []; groundMessage.value = ''; hover.value = null; });
watch(selectedIndex, index => {
  if (selectedId.value) { rememberedIndices.set(selectedId.value, index); view?.select(selectedId.value, index); }
});
watch(() => props.selectedKind, kind => {
  if (selected.value?.category === kind) return;
  const model = filtered.value.find(machine => machine.category === kind);
  if (!model) return;
  selectedId.value = model.id;
  selectedIndex.value = 0;
  view?.select(selectedId.value);
});
onMounted(async () => {
  if (!canvas.value) return;
  try {
    const created = await createFactoryView(canvas.value, (id, index) => select(id, index), points => { labels.value = points; }, {
      onGroundEdit: applyGroundEdit, onGroundHover: edit => { hover.value = edit; },
      onGroundError: message => { groundMessage.value = message; },
      onGroundExit: closeSettings, onGroundUndo: undoGround,
    });
    if (disposed) { created.dispose(); return; }
    view = created;
    view.setVisible(false);
    await syncView();
    view.setGroundEditor(editor.value);
    ready.value = true;
    canvas.value.dataset.sceneReady = 'true';
    observer = new IntersectionObserver(entries => view?.setVisible(active && (settingsOpen.value || (entries[0]?.isIntersecting ?? false))));
    if (active) observer.observe(canvas.value);
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : '浏览器无法创建 3D 画面';
  }
});
onActivated(() => {
  active = true;
  syncView();
  if (canvas.value) observer?.observe(canvas.value);
});
onDeactivated(() => {
  active = false;
  closeSettings();
  observer?.disconnect();
  view?.setVisible(false);
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
      <div class="factory-title"><span class="eyebrow">一个机型 · 一块场地</span><h2 id="factory-scene-title">设备场地 <span class="factory-voltage">同型号放在一起</span></h2></div>
    </div>
    <div class="factory-view-toolbar">
      <span><i class="factory-status-dot" :class="{ active: running > 0 }" />已建造 {{ count }} 台 · 当前场地 {{ selected?.count ?? 0 }} 台</span>
      <div class="factory-view-actions">
        <button type="button" :aria-pressed="motion.active.value" :disabled="motion.reduced.value" @click="motion.toggle">{{ motion.active.value ? '动态：开' : '动态：关' }}</button>
        <button type="button" :disabled="!ready" @click="resetView">复位视角</button>
        <button type="button" :disabled="!ready || !selected || !filtered.some(machine => machine.id === selectedId)" @click="focusSelected">靠近所选</button>
        <button type="button" @click="fullscreen">全屏</button>
      </div>
    </div>
    <div class="ground-settings-launcher">
      <span>场地：{{ savedGround.preset === 'preset-1' ? '预设一' : savedGround.preset === 'imported' ? currentStructure?.name : '16 × 16 区块' }}</span>
      <div><button type="button" class="ground-settings-edit-button" aria-haspopup="dialog" aria-controls="ground-settings-dialog" :disabled="!ready" @click="openSettings">自定义场地</button></div>
    </div>
    <div class="factory-filters" aria-label="厂区设备筛选">
      <label>类别 <select v-model="category" aria-label="筛选设备类别"><option value="">全部类别</option><option v-for="kind in COLUMN_ORDER" :key="kind" :value="kind">{{ COLUMN_META[kind].title }}</option></select></label>
      <label>电压 <select v-model="tier" aria-label="筛选设备电压"><option :value="null">全部电压</option><option v-for="[value, name] in tiers" :key="value" :value="value">{{ name }}</option></select></label>
      <button v-if="category || tier !== null" type="button" @click="clearFilters">清除筛选</button>
      <span>{{ displayed }} 台设备 · {{ multiblocks }} 台多方块结构</span>
    </div>
    <div ref="mainPreviewHost" class="factory-main-scene-host" :style="settingsOpen ? { height: `${mainPreviewHeight}px` } : undefined">
    <Teleport :to="settingsPreviewHost ?? 'body'" :disabled="!settingsOpen">
    <div class="scene-stage factory-stage-3d" :aria-busy="!ready && !error">
      <canvas ref="canvas" tabindex="0" aria-label="3D 独立设备场地，拖动观察，编辑时点击铺设；WASD 飞行，空格上升，Shift 下降，R 复位。" />
      <div v-if="!ready || error" class="factory-loading" role="status">
        <span class="factory-loading-cube" aria-hidden="true" />
        <strong>{{ error ? '场地画面加载失败' : '正在准备设备场地' }}</strong>
        <span>{{ error || '准备机器与现代化材质…' }}</span>
      </div>
      <div v-if="ready" class="factory-number-layer" aria-label="场景内设备">
        <template v-for="label in labels" :key="label.id">
          <button v-if="label.visible" type="button" class="factory-number" :class="{ selected: selectedId === label.id }"
            :style="{ left: `${label.x}%`, top: `${label.y}%` }"
            :aria-label="`查看${machineById.get(label.id)?.name}第 ${label.index + 1} 台`"
            @click="select(label.id, label.index)">{{ indexOf(label.id) }}</button>
        </template>
      </div>
      <div v-if="ready && !count" class="factory-empty">尚未建造设备</div>
      <div v-else-if="ready && !displayed" class="factory-empty">没有符合筛选的设备 <button type="button" @click="clearFilters">清除筛选</button></div>
      <div v-if="ready" class="factory-view-note"><span>{{ selected ? `${selected.name} · 共 ${selected.count} 台` : '机型独立场地' }}</span><span>{{ previewStructure ? '导入预览 · 尚未应用' : currentGround.preset === 'grid' ? '16 × 16 · 连续区块地板' : currentGround.preset === 'imported' ? currentStructure?.name : '预设一 · 原厂区地板' }}</span></div>
    </div>
    </Teleport>
    </div>
    <div class="factory-navigation-help"><span>拖动观察 · WASD 飞行 · 空格 / Shift 升降 · R 复位</span></div>
    <div class="factory-machine-list" aria-label="厂区设备列表">
      <button v-for="machine in filtered" :key="machine.id" type="button"
        :data-model-id="machine.id" :aria-pressed="selectedId === machine.id" :style="{ '--machine-accent': machine.accent }"
        @click="select(machine.id)">
        <span class="factory-machine-index">{{ indexOf(machine.id) }}</span>
        <img v-if="modelIconUrl(machine.id)" class="factory-machine-icon" :src="modelIconUrl(machine.id)" alt="" />
        <span class="factory-machine-copy"><strong>{{ machine.name }}</strong><small>{{ machine.voltage }} · {{ COLUMN_META[machine.category].title }} · {{ machine.count }} 台</small><small>{{ modelDescription(machine) }}</small></span>
        <span class="factory-machine-state" :class="{ active: status(machine.id) === '运行中' }"><i />{{ status(machine.id) }}</span>
      </button>
    </div>
    <div class="scene-footer factory-footer-3d">
      <span class="factory-selection-summary" :class="{ empty: !selected }" :aria-hidden="!selected">
        <span class="factory-selection-copy"><template v-if="selected"><strong>{{ selected.name }}</strong> <span class="muted">· {{ selected.voltage }} · 第 {{ selectedIndex + 1 }} / {{ selected.count }} 台 · {{ modelDescription(selected) }} · 本台{{ selectedIndex < selected.running ? '启用' : '停机' }} · {{ selected.activity > 0 ? '类别正在生产' : '类别当前无生产' }}</span></template></span>
      </span>
    </div>
    <GroundSettingsDialog v-model:open="settingsOpen" v-model:tab="settingsTab" :model-name="selected?.name ?? ''" :count="selected?.count ?? 0">
      <template #edit>
        <GroundEditor :design="savedGround" :structure-name="currentStructure?.name ?? ''" :presets="library.presets" :enabled="!!selected && ready && !previewStructure" :active="settingsOpen && settingsTab === 'edit'" :can-undo="undoStack.length > 0" :can-redo="redoStack.length > 0" :message="groundMessage" :storage-error="storageError" :hover="hover" @editor="updateEditor" @edit="requestGroundEdit" @change="changeGround" @undo="undoGround" @save-preset="saveGroundPreset" @remove-preset="removePreset" @export="exportGrounds" @import="importGrounds" />
      </template>
      <template #import>
        <GroundImport ref="importPanel" :can-apply="!!selected && ready" :preview-ready="previewReady" :preview-error="previewError" @preview="previewGround" @save="saveImportedGround" />
      </template>
      <template #preview>
        <div ref="settingsPreviewHost" class="ground-settings-scene-host" />
        <div class="ground-settings-view-actions" role="group" aria-label="设置页预览操作"><span>拖动观察 · WASD 移动 · 空格 / Shift 升降</span><button type="button" :disabled="!ready" @click="resetView">复位视角</button><button type="button" :disabled="!ready || !selected" @click="focusSelected">靠近所选</button><button type="button" :disabled="!ready" @click="moveCamera(3)">靠近</button><button type="button" :disabled="!ready" @click="moveCamera(-3)">远离</button></div>
      </template>
    </GroundSettingsDialog>
  </section>
</template>

<style scoped>
.factory-scene-3d { background: var(--panel); }
.factory-scene-3d .scene-heading { padding: 17px 18px 14px; }
.factory-title h2 { display: flex; align-items: center; gap: 10px; }
.factory-voltage { font: 11px var(--font-num); padding: 3px 8px; background: var(--track); border: 1px solid var(--line); color: var(--accent); }
.factory-view-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 9px 16px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--panel-2); }
.factory-view-toolbar > span { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 11px; }
.factory-status-dot, .factory-machine-state i { width: 5px; height: 5px; display: inline-block; background: var(--muted); }
.factory-status-dot.active, .factory-machine-state.active i { background: #91bf77; box-shadow: 0 0 5px #91bf7733; }
.factory-view-actions { display: flex; flex-wrap: wrap; gap: 5px; }
.factory-view-actions button { min-height: 28px; padding: 3px 8px; font-size: 10px; }
.factory-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 8px 15px; border-bottom: 1px solid var(--line); font-size: 11px; }
.factory-filters label { display: flex; align-items: center; gap: 6px; }
.factory-filters select { max-width: 150px; min-height: 30px; color: var(--text); background: var(--panel-2); border: 1px solid var(--line); }
.factory-filters > span { margin-left: auto; color: var(--muted); }
.factory-filters button { min-height: 30px; padding: 3px 8px; font-size: 11px; }
.ground-settings-launcher { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 9px 15px; border-bottom: 1px solid var(--line); background: var(--panel); font-size: 11px; }
.ground-settings-launcher > span { min-width: 0; overflow-wrap: anywhere; }
.ground-settings-launcher > div { display: flex; flex-wrap: wrap; gap: 8px; }
.ground-settings-launcher button { min-height: 32px; padding: 5px 9px; font-size: 11px; }
.factory-main-scene-host { min-width: 0; }
.ground-settings-scene-host { flex: 1; min-height: 0; min-width: 0; }
.ground-settings-scene-host .scene-stage.factory-stage-3d { height: 100%; min-height: 0; }
.ground-settings-view-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 9px 12px; border-top: 1px solid var(--line); }
.ground-settings-view-actions span { flex: 1 1 100%; color: var(--muted); font-size: 10px; }
.ground-settings-view-actions button { min-height: 32px; padding: 4px 8px; font-size: 11px; }
.factory-machine-icon { width: 34px; height: 34px; flex-shrink: 0; object-fit: contain; image-rendering: pixelated; }
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
.factory-machine-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: max-content; align-content: start; gap: 1px; max-height: 240px; overflow-y: auto; overscroll-behavior: contain; background: var(--line); border-bottom: 1px solid var(--line); }
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
.factory-selection-summary { display: flex; align-items: center; flex: 1 1 460px; min-width: 0; }
.factory-selection-summary.empty { visibility: hidden; }
.factory-selection-copy { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.factory-scene-3d:fullscreen { height: 100%; width: 100%; border: 0; overflow: auto; }
.factory-scene-3d:fullscreen .factory-stage-3d { flex: 1; min-height: 200px; height: auto; }
@media (max-width: 1280px) {
  .factory-machine-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .factory-view-toolbar { align-items: flex-start; }
}
@media (max-width: 700px) {
  .ground-settings-launcher button, .ground-settings-view-actions button { min-height: 40px; }
  .factory-scene-3d .scene-heading { padding: 12px; }
  .factory-machine-list > button { padding: 10px 8px; gap: 6px; }
  .factory-machine-state { font-size: 0; }
  .factory-machine-state i { margin-left: 2px; }
  .factory-navigation-help { font-size: 9px; }
  .factory-stage-3d { height: 340px; }
}
</style>
