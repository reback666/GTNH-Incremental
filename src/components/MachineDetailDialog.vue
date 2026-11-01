<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { MachineKind } from '../game/core';
import type { MachineColumn, MachineModelRow } from '../game/presentation/types';
import { useGameStore } from '../game/store';
import { MACHINE_MODELS } from '../game/models';
import MachineIcon from './MachineIcon.vue';
import MachineModelPreview from './MachineModelPreview.vue';

const props = defineProps<{ modelId: string; columns: MachineColumn[] }>();
const emit = defineEmits<{ close: []; jump: [kind: MachineKind] }>();
const store = useGameStore();
const dialog = ref<HTMLElement | null>(null);
const quantity = ref(1);
const payWith = ref<'coin' | 'ore'>('coin');
const draggedTier = ref<number | null>(null);
const touchDraggedTier = ref<number | null>(null);
const fuelOrder = ref<number[]>([]);

const entry = computed(() => {
  for (const column of props.columns) {
    for (const group of column.tiers) {
      const found = group.models.find(model => model.id === props.modelId);
      if (found) return { column, group, model: found };
    }
  }
  return null as { column: MachineColumn; group: { tier: number; voltage: string; unit: string; oreLabel: string }; model: MachineModelRow } | null;
});
const model = computed(() => entry.value?.model ?? null);
const column = computed(() => entry.value?.column ?? null);
const baseModel = computed(() => MACHINE_MODELS.find(item => item.id === props.modelId) ?? null);
const fuelRows = computed(() => model.value?.fuel ?? []);
const previewActivity = computed(() => (model.value?.running ?? 0) > 0 ? 1 : 0);
const maxQuantity = computed(() => Math.max(1, model.value?.count ?? 1));
const canBuy = computed(() => {
  if (!model.value?.unlocked) return false;
  return payWith.value === 'ore' ? model.value.oreAffordable : model.value.affordable;
});

function syncFuelOrder(): void { fuelOrder.value = fuelRows.value.map(row => row.tier); }
watch(() => props.modelId, () => { quantity.value = 1; syncFuelOrder(); void nextTick(() => dialog.value?.focus()); }, { immediate: true });
watch(fuelRows, syncFuelOrder);
function close(): void { emit('close'); }
function onKeydown(event: KeyboardEvent): void { if (event.key === 'Escape') { event.preventDefault(); close(); } }
function buy(count: number): void { store.buy(props.modelId, count, payWith.value); }
function sell(count: number): void { store.sell(props.modelId, count, payWith.value); }
function buyCustom(): void { buy(Math.max(1, Math.floor(quantity.value || 1))); }
function sellCustom(): void { sell(Math.min(maxQuantity.value, Math.max(1, Math.floor(quantity.value || 1)))); }
function dropFuel(targetTier: number): void {
  if (draggedTier.value === null || draggedTier.value === targetTier) return;
  const next = fuelOrder.value.filter(tier => tier !== draggedTier.value);
  next.splice(Math.max(0, next.indexOf(targetTier)), 0, draggedTier.value);
  fuelOrder.value = next;
  store.setGeneratorFuelPriority(props.modelId, next);
  draggedTier.value = null;
}
function beginTouchFuelDrag(tier: number, event: PointerEvent): void {
  if (event.pointerType !== 'touch') return;
  draggedTier.value = tier;
  touchDraggedTier.value = tier;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}
function moveTouchFuelDrag(event: PointerEvent): void {
  if (event.pointerType !== 'touch' || touchDraggedTier.value === null) return;
  const target = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-fuel-tier]');
  const targetTier = target ? Number(target.dataset.fuelTier) : Number.NaN;
  if (!Number.isInteger(targetTier) || targetTier === touchDraggedTier.value) return;
  dropFuel(targetTier);
  draggedTier.value = targetTier;
  touchDraggedTier.value = targetTier;
}
function endTouchFuelDrag(event: PointerEvent): void {
  if (event.pointerType === 'touch') touchDraggedTier.value = null;
}
function restoreFuelOrder(): void {
  const defaultTier = baseModel.value ? baseModel.value.tier - 1 : fuelRows.value[0]?.tier;
  if (defaultTier === undefined) return;
  fuelOrder.value = [...fuelRows.value].sort((a, b) => b.tier - a.tier).map(row => row.tier);
  store.setGeneratorFuelPriority(props.modelId, [defaultTier]);
}
function moveFuel(tier: number, direction: -1 | 1): void {
  const index = fuelOrder.value.indexOf(tier);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= fuelOrder.value.length) return;
  const next = [...fuelOrder.value];
  [next[index], next[target]] = [next[target]!, next[index]!];
  fuelOrder.value = next;
  store.setGeneratorFuelPriority(props.modelId, next);
}
function jumpCategory(): void { if (column.value) emit('jump', column.value.kind); }
</script>

<template>
  <div class="machine-detail-backdrop" @keydown="onKeydown">
    <section ref="dialog" class="machine-detail-dialog" role="dialog" aria-modal="true" :aria-label="(model?.name ?? '机器') + '详情'" tabindex="-1">
      <header class="machine-detail-header">
        <div class="machine-detail-title">
          <MachineIcon v-if="model && column" :model-id="model.id" :kind="column.kind" :size="42" />
          <div><span class="eyebrow">{{ column?.title ?? '设备' }} · {{ entry?.group?.voltage ?? '' }}</span><h2>{{ model?.name ?? '机器详情' }}</h2></div>
        </div>
        <button type="button" class="machine-detail-close" aria-label="关闭机器详情" @click="close">×</button>
      </header>

      <div v-if="model && column" class="machine-detail-layout">
        <div class="machine-detail-visual">
          <MachineModelPreview :model-id="model.id" :running="model.running" :activity="previewActivity" />
          <div class="machine-detail-count"><strong>{{ model.count }}</strong><span>台已部署 · {{ model.running }} 台运行 · {{ model.faulty }} 台故障</span></div>
        </div>

        <div class="machine-detail-info">
          <section class="detail-section detail-status">
            <div class="detail-section-heading"><h3>状态与核心产出</h3><span class="detail-state" :class="{ good: model.running > 0 && !model.stopped, muted: model.stopped }">{{ model.stopped ? '已停机' : model.running > 0 ? '运行中' : '待机' }}</span></div>
            <div class="detail-stats"><div v-for="stat in model.single" :key="stat.label"><span>{{ stat.label }}</span><b>{{ stat.value }}</b></div></div>
          </section>

          <section class="detail-section">
            <h3>生产参数</h3>
            <div class="detail-list">
              <div><span>机型等级</span><b>{{ entry?.group?.voltage }}</b></div>
              <div><span>结构</span><b>{{ model.block === 'multiblock' ? '多方块' : '单方块' }}</b></div>
              <div><span>额定运行</span><b>{{ model.running }} / {{ model.count }} 台</b></div>
              <div><span>故障</span><b>{{ model.faulty }} 台</b></div>
            </div>
          </section>

          <section v-if="model.fuel" class="detail-section">
            <div class="detail-section-heading"><h3>燃料策略</h3><span class="detail-current-fuel">实际使用：{{ model.actualFuel }}</span></div>
            <p class="detail-help">拖动燃料行调整顺序；首选燃料不足时会按顺序尝试下一种，下次结算生效。</p>
            <div class="fuel-list" aria-label="燃料优先级">
              <div v-for="(fuel, index) in fuelRows" :key="fuel.tier" class="fuel-row" :data-fuel-tier="fuel.tier" draggable="true"
                @dragstart="draggedTier = fuel.tier" @dragover.prevent @drop="dropFuel(fuel.tier)"
                @pointerdown="beginTouchFuelDrag(fuel.tier, $event)" @pointermove="moveTouchFuelDrag" @pointerup="endTouchFuelDrag" @pointercancel="endTouchFuelDrag">
                <span class="fuel-grip" aria-hidden="true">⋮⋮</span><b class="fuel-rank">{{ index + 1 }}</b>
                <span class="fuel-copy"><strong>{{ fuel.name }}</strong><small>热值 {{ fuel.heat }} · 单位消耗 {{ fuel.rate }}/秒</small></span>
                <span class="fuel-stock" :class="{ actual: fuel.actual }">{{ fuel.inventory }}</span>
                <button type="button" class="fuel-move" :disabled="index === 0" aria-label="上移燃料" @click="moveFuel(fuel.tier, -1)">↑</button>
                <button type="button" class="fuel-move" :disabled="index === fuelRows.length - 1" aria-label="下移燃料" @click="moveFuel(fuel.tier, 1)">↓</button>
              </div>
            </div>
            <button type="button" class="detail-link" @click="restoreFuelOrder">恢复默认顺序</button>
          </section>
          <section v-else-if="baseModel?.category === 'generator' && baseModel.visPowered" class="detail-section"><h3>资源消耗</h3><p class="detail-help">魔法发电机使用灵气，不消耗矿石燃料。</p></section>

          <section class="detail-section">
            <h3>操作</h3>
            <div class="detail-actions">
              <button v-if="model.stoppable && model.count > 0" type="button" @click="store.toggleStopped(model.id)">{{ model.stopped ? '恢复运行' : '停机' }}</button>
              <button v-if="model.faulty > 0" type="button" @click="store.repair(model.id)">维护 {{ model.faulty }} 台</button>
              <template v-if="model.overclockable"><span class="action-label">超频 {{ model.overclock }}</span><button type="button" :disabled="model.overclock === 0" @click="store.setOverclock(model.id, model.overclock - 1)">−</button><button type="button" :disabled="model.overclock >= 3" @click="store.setOverclock(model.id, model.overclock + 1)">+</button></template>
              <button type="button" @click="jumpCategory">跳到{{ column.title }}</button>
            </div>
            <div class="trade-controls">
              <div class="trade-payment"><span>支付</span><button type="button" :class="{ primary: payWith === 'coin' }" @click="payWith = 'coin'">GT 币</button><button type="button" :class="{ primary: payWith === 'ore' }" @click="payWith = 'ore'">同级矿石</button></div>
              <div class="trade-quantity"><button type="button" @click="quantity = 1">1</button><button type="button" @click="quantity = 10">10</button><input v-model.number="quantity" type="number" min="1" :max="maxQuantity" aria-label="购买或出售数量" /><button type="button" :disabled="!canBuy" @click="buyCustom">买</button><button type="button" :disabled="model.count <= 0" @click="sellCustom">卖</button></div>
              <small>单价：{{ payWith === 'coin' ? model.price : model.orePrice }} · 卖回：{{ payWith === 'coin' ? model.refund : model.oreRefund }}</small>
            </div>
          </section>
        </div>
      </div>
      <div v-else class="machine-detail-empty">找不到这个机型。</div>
    </section>
  </div>
</template>

<style scoped>
.machine-detail-backdrop { position: fixed; inset: 0; z-index: 180; display: grid; place-items: center; padding: 20px; background: rgba(4, 8, 12, 0.68); backdrop-filter: blur(9px); }
.machine-detail-dialog { display: flex; flex-direction: column; width: min(1180px, 96vw); max-height: min(900px, 94vh); overflow: hidden; background: var(--panel); border: 1px solid var(--accent); box-shadow: 0 24px 80px rgba(0, 0, 0, .65); outline: none; }
.machine-detail-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 2; background: var(--panel); }
.machine-detail-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.machine-detail-title h2 { margin: 2px 0 0; }
.machine-detail-close { width: 38px; height: 38px; padding: 0; color: var(--muted); font-size: 28px; line-height: 1; }
.machine-detail-layout { display: grid; grid-template-columns: minmax(330px, .95fr) minmax(420px, 1.05fr); flex: 1 1 auto; min-height: 0; overflow: hidden; gap: 16px; padding: 16px; }
.machine-detail-visual { min-width: 0; min-height: 0; overflow: hidden; }
.machine-detail-count { display: flex; align-items: baseline; gap: 8px; padding: 10px 2px 0; color: var(--muted); }
.machine-detail-count strong { color: var(--accent); font: 700 24px var(--font-num); }
.machine-detail-info { display: grid; align-content: start; gap: 10px; min-width: 0; min-height: 0; overflow-y: auto; padding-right: 4px; }
.detail-section { padding: 12px; background: var(--panel-2); border: 1px solid var(--line); }
.detail-section h3 { margin: 0 0 10px; font-size: 14px; }
.detail-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.detail-state, .detail-current-fuel { color: var(--muted); font-size: 12px; }
.detail-state.good, .detail-current-fuel { color: var(--accent); }
.detail-state.muted { color: var(--muted); }
.detail-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.detail-stats div, .detail-list div { display: flex; justify-content: space-between; gap: 12px; padding: 7px 8px; background: var(--track); border: 1px solid var(--line); }
.detail-stats span, .detail-list span { color: var(--muted); font-size: 12px; }
.detail-stats b, .detail-list b { font-variant-numeric: tabular-nums; text-align: right; }
.detail-list { display: grid; gap: 5px; }
.detail-help { margin: -3px 0 9px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.fuel-list { display: grid; gap: 5px; }
.fuel-row { display: grid; grid-template-columns: 18px 22px minmax(0, 1fr) auto 28px 28px; align-items: center; gap: 5px; min-height: 42px; padding: 5px 6px; background: var(--track); border: 1px solid var(--line); cursor: grab; touch-action: none; }
.fuel-row:active { cursor: grabbing; }
.fuel-grip { color: var(--muted); letter-spacing: -3px; }
.fuel-rank { color: var(--accent); text-align: center; }
.fuel-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.fuel-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fuel-copy small { color: var(--muted); font-size: 11px; }
.fuel-stock { color: var(--muted); font: 13px var(--font-num); }
.fuel-stock.actual { color: var(--accent); }
.fuel-move { min-height: 28px; padding: 0; }
.detail-link { margin-top: 8px; padding: 0; color: var(--accent); background: transparent; border: 0; }
.detail-actions, .trade-payment, .trade-quantity { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.detail-actions button, .trade-controls button { min-height: 30px; padding: 0 9px; }
.action-label { color: var(--muted); font-size: 12px; }
.trade-controls { display: grid; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
.trade-payment > span, .trade-controls > small { color: var(--muted); font-size: 12px; }
.trade-quantity input { width: 70px; min-height: 30px; padding: 0 7px; color: var(--text); background: var(--track); border: 1px solid var(--line); }
.machine-detail-empty { padding: 48px; color: var(--muted); text-align: center; }
@media (max-width: 780px) {
  .machine-detail-backdrop { padding: 8px; place-items: start center; }
  .machine-detail-dialog { width: 100%; max-height: 98vh; }
  .machine-detail-layout { display: flex; flex-direction: column; overflow: hidden; padding: 10px; }
  .machine-detail-visual { flex: 0 0 auto; }
  .machine-detail-info { flex: 1 1 auto; overflow-y: auto; }
  .detail-stats { grid-template-columns: 1fr; }
}
</style>
