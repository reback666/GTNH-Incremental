<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';

const store = useGameStore();
const snap = computed(() => store.snap);

const MISJUDGE_NOTE = '该调度有 5% 的误判率，误判在下一拍自动纠正。';
const repairHint = `发生故障的机器在当拍内完成修复。${MISJUDGE_NOTE}`;
const overclockHint =
  `可用出力达到需求的 2 倍时升档，供电率低于 90% 时降档，` +
  `其余情况维持原档以避免频繁切换。${MISJUDGE_NOTE}`;
const sheddingHint = computed(
  () =>
    `供电不足时按 ${snap.value.silicon.sheddingOrder} 的顺序整组停机，` +
    `其余机器保持满负荷运行，而非全厂统一降载。${MISJUDGE_NOTE}`,
);
</script>

<template>
  <section class="panel silicon-dispatch-panel">
    <div class="section-heading">
      <div>
        <span class="eyebrow">硅基宇宙</span>
        <h2>AI 调度</h2>
      </div>
      <span class="status-pill" :class="{ active: snap.silicon.active }">
        {{ snap.silicon.active ? '已启用' : '未拥有' }}
      </span>
    </div>

    <template v-if="snap.silicon.active">
      <p class="muted small silicon-note">{{ snap.silicon.note }}</p>
      <div class="silicon-options">
        <div class="silicon-option" :title="repairHint">
          <div>
            <b>自动维护</b>
            <span class="muted small">故障机器当拍修复</span>
          </div>
          <div class="button-row">
            <button :class="{ primary: snap.silicon.autoRepair }" @click="store.setSiliconOption('repair', true)">开启</button>
            <button :class="{ primary: !snap.silicon.autoRepair }" @click="store.setSiliconOption('repair', false)">关闭</button>
          </div>
        </div>
        <div class="silicon-option" :title="overclockHint">
          <div>
            <b>自动超频</b>
            <span class="muted small">按供电率自动升降档</span>
          </div>
          <div class="button-row">
            <button :class="{ primary: snap.silicon.autoOverclock }" @click="store.setSiliconOption('overclock', true)">开启</button>
            <button :class="{ primary: !snap.silicon.autoOverclock }" @click="store.setSiliconOption('overclock', false)">关闭</button>
          </div>
        </div>
        <div class="silicon-option" :title="sheddingHint">
          <div>
            <b>按优先级停机</b>
            <span class="muted small">缺电时整组降低负载</span>
          </div>
          <div class="button-row">
            <button :class="{ primary: snap.silicon.shedding }" @click="store.setSiliconOption('shedding', true)">开启</button>
            <button :class="{ primary: !snap.silicon.shedding }" @click="store.setSiliconOption('shedding', false)">关闭</button>
          </div>
        </div>
      </div>
    </template>
    <p v-else class="muted">获得硅基宇宙后，这里可以管理三项 AI 调度。</p>
  </section>
</template>

<style scoped>
.silicon-dispatch-panel { width: 100%; box-sizing: border-box; }
.silicon-note { margin: 0 0 16px; }
.silicon-options { display: grid; gap: 10px; }
.silicon-option { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px; border: 1px solid var(--line); background: var(--panel-2, var(--track)); }
.silicon-option > div:first-child { display: grid; gap: 4px; }
.silicon-option .button-row { display: flex; gap: 6px; flex: 0 0 auto; }
.status-pill { padding: 4px 8px; border: 1px solid var(--line); color: var(--muted); font-size: 11px; }
.status-pill.active { border-color: var(--accent); color: var(--accent); }
@media (max-width: 640px) {
  .silicon-option { align-items: flex-start; flex-direction: column; }
  .silicon-option .button-row { width: 100%; }
  .silicon-option .button-row button { flex: 1; }
}
</style>
