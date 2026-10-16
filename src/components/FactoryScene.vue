<script setup lang="ts">
// 工业基地 3D 视图。自己读 store，父组件只需 <FactoryScene v-model:selected="id" />。
// Three.js 实例放在普通变量里，绝不进 Vue 响应式；快照每次刷新只做纯投影 + setPlan。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useGameStore } from '../game/store';
import { buildFactoryPlan, findGroup, type FactoryPlan } from '../rendering/factory-model';
import { FactoryScene, type FactorySceneStats } from '../rendering/factory-scene';
import { STATUS_COLORS, STATUS_LABELS } from '../rendering/palette';

const props = withDefaults(defineProps<{ selected?: string | null }>(), { selected: null });
const emit = defineEmits<{
  /** 选中机型变化（点击机器、键盘选择、失效清除）；null = 取消选中 */
  (event: 'update:selected', modelId: string | null): void;
  /** 同上，便于不用 v-model 的调用方 */
  (event: 'select', modelId: string | null): void;
  /** WebGL 不可用，已降级为文字摘要 */
  (event: 'unavailable'): void;
}>();

const store = useGameStore();
const host = ref<HTMLDivElement | null>(null);
const mode = ref<'loading' | 'ready' | 'fallback'>('loading');
const paused = ref(false);
const reducedMotion = ref(false);
const hovered = ref<string | null>(null);
const stats = ref<FactorySceneStats | null>(null);
// 内部选中：受控时跟随 props，非受控时自己记
const localSelected = ref<string | null>(props.selected);

let scene: FactoryScene | null = null;
let media: MediaQueryList | null = null;
let statsTimer = 0;

const plan = computed<FactoryPlan>(() => buildFactoryPlan(store.snap));
const selectedGroup = computed(() => findGroup(plan.value, localSelected.value));
const hoveredGroup = computed(() => findGroup(plan.value, hovered.value));
const dynamic = computed(() => !paused.value && !reducedMotion.value);

const STATUS_ORDER = ['running', 'idle', 'unpowered', 'stopped', 'faulty', 'storage'] as const;

function choose(modelId: string | null): void {
  if (modelId === localSelected.value) return;
  localSelected.value = modelId;
  scene?.setSelected(modelId);
  emit('update:selected', modelId);
  emit('select', modelId);
}

watch(
  () => props.selected,
  (value) => {
    localSelected.value = value;
    scene?.setSelected(value);
  },
);

watch(plan, (value) => {
  scene?.setPlan(value);
  // 清空存档 / 导入后机型不在了：清掉失效选中
  if (localSelected.value && !findGroup(value, localSelected.value)) choose(null);
});

watch(dynamic, () => scene?.setMotion({ paused: paused.value, reduced: reducedMotion.value }));

function onReducedChange(event: MediaQueryListEvent): void {
  reducedMotion.value = event.matches;
}

onMounted(() => {
  media = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion.value = media.matches;
  media.addEventListener('change', onReducedChange);
  if (!host.value) return;
  scene = FactoryScene.create(host.value, {
    onSelect: (id) => choose(id),
    onHover: (id) => (hovered.value = id),
  });
  if (!scene) {
    mode.value = 'fallback';
    emit('unavailable');
    return;
  }
  scene.setMotion({ paused: paused.value, reduced: reducedMotion.value });
  scene.setPlan(plan.value);
  if (localSelected.value) {
    if (findGroup(plan.value, localSelected.value)) scene.setSelected(localSelected.value);
    else choose(null);
  }
  mode.value = 'ready';
  statsTimer = window.setInterval(() => {
    if (scene) stats.value = scene.getStats();
  }, 1000);
});

onBeforeUnmount(() => {
  window.clearInterval(statsTimer);
  media?.removeEventListener('change', onReducedChange);
  scene?.dispose();
  scene = null;
});

// ── 按钮 / 键盘替代 ───────────────────────────────────────
const ROTATE_STEP = Math.PI / 8;
function rotateLeft() { scene?.rotate(ROTATE_STEP); }
function rotateRight() { scene?.rotate(-ROTATE_STEP); }
function zoomIn() { scene?.zoomBy(1.2); }
function zoomOut() { scene?.zoomBy(1 / 1.2); }
function resetView() { scene?.resetView(); }
function focusSelected() { scene?.focusModel(localSelected.value); }
function togglePause() { paused.value = !paused.value; }

function onKeydown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  // 只处理视口自身的按键；输入类元素与可编辑内容保留原生键位
  const target = event.target as HTMLElement | null;
  if (target !== event.currentTarget && target?.closest('input, select, textarea, button, [contenteditable]')) return;
  const handled = (() => {
    switch (event.key) {
      case 'q': case 'Q': rotateLeft(); return true;
      case 'e': case 'E': rotateRight(); return true;
      case 'ArrowUp': scene?.rotate(0, 0.08); return true;
      case 'ArrowDown': scene?.rotate(0, -0.08); return true;
      case 'ArrowLeft': rotateLeft(); return true;
      case 'ArrowRight': rotateRight(); return true;
      case 'w': case 'W': scene?.pan(0, -2); return true;
      case 's': case 'S': scene?.pan(0, 2); return true;
      case 'a': case 'A': scene?.pan(-2, 0); return true;
      case 'd': case 'D': scene?.pan(2, 0); return true;
      case '+': case '=': zoomIn(); return true;
      case '-': case '_': zoomOut(); return true;
      case '0': case 'Home': resetView(); return true;
      case 'f': case 'F': focusSelected(); return true;
      case 'p': case 'P': togglePause(); return true;
      case 'Escape': choose(null); return true;
      default: return false;
    }
  })();
  if (handled) event.preventDefault();
}

function onPick(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  choose(value || null);
  // 从下拉选中机型时直接把镜头移到它的机位
  if (value) scene?.focusModel(value);
}
</script>

<template>
  <section
    class="factory-scene"
    :data-mode="mode"
    :data-dynamic="dynamic ? 'on' : 'off'"
    :data-total-machines="plan.totalMachines"
    :data-shown-units="plan.shownUnits"
    :data-owned-models="plan.ownedModels"
    :data-hidden-models="plan.hiddenModels"
    :data-selected="localSelected ?? ''"
    :data-scene-units="stats?.units ?? ''"
    :data-scene-frames="stats?.frames ?? ''"
    :data-scene-busy="stats ? stats.building + stats.recycling : ''"
    :data-scene-calls="stats?.calls ?? ''"
    aria-label="工业基地"
  >
    <div
      v-show="mode !== 'fallback'"
      ref="host"
      class="factory-scene__viewport"
      tabindex="0"
      role="application"
      aria-label="工业基地三维视图：拖动旋转，滚轮缩放，Q/E 旋转，WASD 平移，+/- 缩放，0 复位，F 聚焦选中机型，P 暂停动态，Esc 取消选中"
      @keydown="onKeydown"
    ></div>

    <!-- WebGL 不可用：真实工厂摘要 -->
    <div v-if="mode === 'fallback'" class="factory-scene__fallback" role="status">
      <p class="factory-scene__fallback-title">当前环境不支持 WebGL，基地以文字摘要显示，游戏其他操作不受影响。</p>
      <p>共 {{ plan.totalMachines }} 台机器，{{ plan.ownedModels }} 种机型。</p>
      <ul class="factory-scene__fallback-list">
        <li v-for="zone in plan.zones.filter((z) => z.count > 0)" :key="zone.kind">
          {{ zone.title }}：{{ zone.count }} 台
        </li>
      </ul>
    </div>

    <div class="factory-scene__hud" aria-live="polite">
      <span class="factory-scene__stat" data-stat="total">机器 {{ plan.totalMachines }} 台</span>
      <span class="factory-scene__stat" data-stat="shown">
        显示 {{ plan.shownUnits }} 个代表<template v-if="plan.totalMachines > plan.shownUnits">（其余聚合）</template>
      </span>
      <span v-if="plan.hiddenModels > 0" class="factory-scene__stat" data-stat="hidden">
        {{ plan.hiddenModels }} 种机型超出显示预算
      </span>
      <span class="factory-scene__stat" :class="{ 'is-warn': plan.outage || plan.powerShort }" data-stat="power">
        电网 {{ plan.outage ? '停电' : plan.powerShort ? '缺电' : '正常' }} · {{ plan.powerRatio }}
      </span>
      <span class="factory-scene__stat" data-stat="vein">矿脉 {{ plan.veinName }}</span>
      <span v-if="plan.totalMachines === 0" class="factory-scene__stat" data-stat="empty">
        尚未建造机器
      </span>
    </div>

    <div class="factory-scene__controls" role="toolbar" aria-label="视图控制">
      <button type="button" data-action="rotate-left" title="向左旋转（Q）" :disabled="mode !== 'ready'" @click="rotateLeft">⟲</button>
      <button type="button" data-action="rotate-right" title="向右旋转（E）" :disabled="mode !== 'ready'" @click="rotateRight">⟳</button>
      <button type="button" data-action="zoom-in" title="放大（+）" :disabled="mode !== 'ready'" @click="zoomIn">＋</button>
      <button type="button" data-action="zoom-out" title="缩小（-）" :disabled="mode !== 'ready'" @click="zoomOut">－</button>
      <button type="button" data-action="reset" title="复位视角，显示完整基地（0）" :disabled="mode !== 'ready'" @click="resetView">复位</button>
      <button type="button" data-action="focus" title="聚焦选中机型（F）" :disabled="mode !== 'ready' || !selectedGroup" @click="focusSelected">聚焦</button>
      <button
        type="button"
        data-action="pause"
        :aria-pressed="paused"
        :title="reducedMotion ? '系统已减少动态' : '暂停 / 恢复动态（P）'"
        @click="togglePause"
      >
        {{ paused || reducedMotion ? '动态已停' : '暂停动态' }}
      </button>
      <label class="factory-scene__picker">
        <span class="factory-scene__sr">选择机型</span>
        <select data-action="pick" :value="localSelected ?? ''" @change="onPick">
          <option value="">选择机型…</option>
          <option v-for="group in plan.groups" :key="group.key" :value="group.modelId">
            {{ group.voltage }} {{ group.name }} ×{{ group.count }}
          </option>
        </select>
      </label>
    </div>

    <div v-if="hoveredGroup && hoveredGroup.modelId !== localSelected" class="factory-scene__hover">
      {{ hoveredGroup.voltage }} {{ hoveredGroup.name }} ×{{ hoveredGroup.count }}
    </div>

    <aside v-if="selectedGroup" class="factory-scene__info" :data-model-id="selectedGroup.modelId">
      <header>
        <span class="factory-scene__tier" :class="`vt${selectedGroup.tier}`">{{ selectedGroup.voltage }}</span>
        <strong>{{ selectedGroup.name }}</strong>
        <button type="button" data-action="deselect" title="取消选中（Esc）" @click="choose(null)">×</button>
      </header>
      <p>
        {{ selectedGroup.kindTitle }} · {{ selectedGroup.block === 'multiblock' ? '多方块' : '单方块' }}
        <template v-if="selectedGroup.manualStopped"> · 已手动停机</template>
      </p>
      <dl>
        <div data-field="count"><dt>总台数</dt><dd>{{ selectedGroup.count }}</dd></div>
        <template v-for="key in STATUS_ORDER" :key="key">
          <div v-if="selectedGroup.statusCounts[key] > 0" :data-field="key">
            <dt><i :style="{ background: STATUS_COLORS[key] }"></i>{{ STATUS_LABELS[key] }}</dt>
            <dd>{{ selectedGroup.statusCounts[key] }}</dd>
          </div>
        </template>
      </dl>
      <p class="factory-scene__note">
        场景显示 {{ selectedGroup.shown }} 个代表<template v-if="selectedGroup.aggregated > 0">，另有 {{ selectedGroup.aggregated }} 台聚合</template>
      </p>
    </aside>
  </section>
</template>

<style scoped>
.factory-scene {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
  overflow: hidden;
  background: #101215;
  color: #e8e2d0;
  font-size: 12px;
}
.factory-scene__viewport {
  position: absolute;
  inset: 0;
  outline: none;
  cursor: grab;
}
.factory-scene__viewport:focus-visible {
  box-shadow: inset 0 0 0 2px #f2c230;
}
.factory-scene__hud,
.factory-scene__controls {
  position: absolute;
  left: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  pointer-events: none;
}
.factory-scene__hud { top: 8px; right: 8px; }
.factory-scene__controls { bottom: 8px; pointer-events: auto; }
.factory-scene__stat,
.factory-scene__controls button,
.factory-scene__controls select,
.factory-scene__hover,
.factory-scene__info {
  background: rgba(23, 25, 27, 0.88);
  border: 1px solid #3a3f44;
  border-left: 3px solid #c46a2f;
}
.factory-scene__stat { padding: 2px 6px; }
.factory-scene__stat.is-warn { border-left-color: #ff3030; color: #ffb43a; }
.factory-scene__controls button,
.factory-scene__controls select {
  min-width: 30px;
  height: 28px;
  padding: 0 8px;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.factory-scene__controls button:hover:not(:disabled),
.factory-scene__controls button:focus-visible,
.factory-scene__controls select:focus-visible {
  border-color: #f2c230;
  outline: none;
}
.factory-scene__controls button[aria-pressed='true'] { border-left-color: #f2c230; color: #f2c230; }
.factory-scene__controls button:disabled { opacity: 0.45; cursor: default; }
.factory-scene__hover {
  position: absolute;
  top: 36px;
  left: 8px;
  padding: 2px 6px;
  pointer-events: none;
}
.factory-scene__info {
  position: absolute;
  top: 36px;
  right: 8px;
  width: 220px;
  padding: 8px;
  border-left-color: #f2c230;
}
.factory-scene__info header { display: flex; align-items: center; gap: 6px; }
.factory-scene__info header strong { flex: 1; }
.factory-scene__info header button {
  background: none;
  border: 0;
  color: inherit;
  font-size: 16px;
  cursor: pointer;
}
.factory-scene__info p { margin: 4px 0; color: #b9b3a3; }
.factory-scene__info dl { margin: 6px 0; display: grid; gap: 2px; }
.factory-scene__info dl div { display: flex; justify-content: space-between; }
.factory-scene__info dt { display: flex; align-items: center; gap: 4px; }
.factory-scene__info dt i { width: 8px; height: 8px; display: inline-block; }
.factory-scene__info dd { margin: 0; font-variant-numeric: tabular-nums; }
.factory-scene__tier { padding: 0 4px; border: 1px solid currentColor; }
.factory-scene__note { font-size: 11px; }
.factory-scene__fallback { position: absolute; inset: 40px 12px 48px; overflow: auto; }
.factory-scene__fallback-title { color: #ffb43a; }
.factory-scene__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
