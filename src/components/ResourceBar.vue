<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '../game/store';
import AnimatedNumber from './AnimatedNumber.vue';
import UiIcon from './UiIcon.vue';
const store = useGameStore();
const selected = ref<{ kind: 'ore' | 'coin'; tier: number } | null>(null);
const groups = computed(() => [
  { kind: 'ore' as const, title: '材料库存', rows: store.snap.ores },
  { kind: 'coin' as const, title: 'GT 币', rows: store.snap.coins },
]);
const activeRow = computed(() => selected.value
  ? groups.value.find(group => group.kind === selected.value!.kind)?.rows.find(row => row.tier === selected.value!.tier)
  : null);
function inspect(kind: 'ore' | 'coin', tier: number) {
  selected.value = selected.value?.kind === kind && selected.value.tier === tier ? null : { kind, tier };
}
</script>

<template>
  <section class="panel resource-strip">
    <div v-if="store.offlineNote && !store.offlineBannerDismissed" class="offline-banner">
      <UiIcon name="clock" :size="16" /><span class="offline-text">{{ store.offlineNote }}</span>
      <button type="button" class="offline-close" aria-label="收起离线收益" @click="store.offlineBannerDismissed = true">×</button>
    </div>
    <div v-for="group in groups" :key="group.kind" class="resource-group">
      <h2>{{ group.title }} <span class="small muted">点击查看收支</span></h2>
      <div class="inventory-slots">
        <button v-for="row in group.rows" :key="row.tier" type="button" class="inventory-slot"
          :class="{ active: selected?.kind === group.kind && selected?.tier === row.tier }"
          :aria-expanded="selected?.kind === group.kind && selected?.tier === row.tier"
          :aria-label="`${row.name}，${row.amount}，查看收支`" @click="inspect(group.kind, row.tier)">
          <span>{{ row.name }}</span><AnimatedNumber :value="row.value" :display="row.amount" />
        </button>
      </div>
    </div>
    <div v-if="activeRow" class="inventory-detail" role="region" :aria-label="`${activeRow.name}收支明细`">
      <strong>{{ activeRow.name }}</strong>
      <dl><div v-for="line in activeRow.detail" :key="line.label"><dt>{{ line.label }}</dt><dd>{{ line.value }}</dd></div></dl>
      <button type="button" aria-label="关闭资源明细" @click="selected = null">×</button>
    </div>
    <section v-if="store.snap.arcane.active" class="inventory-arcane">
      <h2>灵气与源质</h2>
      <dl class="stats stats-loose">
        <div class="stat"><dt>灵气产出</dt><dd>{{ store.snap.arcane.visProduced }}</dd></div>
        <div class="stat"><dt>灵气消耗</dt><dd>{{ store.snap.arcane.visUsed }}</dd></div>
        <div class="stat"><dt>灵气充裕度</dt><dd>{{ store.snap.arcane.plenty }}</dd></div>
        <div class="stat"><dt>源质存量</dt><dd>{{ store.snap.arcane.essentia }}</dd></div>
        <div class="stat"><dt>源质净变化</dt><dd>{{ store.snap.arcane.essentiaNet }}</dd></div>
      </dl>
    </section>
  </section>
</template>
