<script setup lang="ts">
import { computed, nextTick, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
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
const trigger = ref<HTMLButtonElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
function closeDetails(restoreFocus = true) {
  selected.value = null;
  if (restoreFocus) trigger.value?.focus({ preventScroll: true });
}
async function inspect(event: MouseEvent, kind: 'ore' | 'coin', tier: number) {
  if (selected.value?.kind === kind && selected.value.tier === tier) {
    closeDetails();
    return;
  }
  trigger.value = event.currentTarget as HTMLButtonElement;
  selected.value = { kind, tier };
  await nextTick();
  closeButton.value?.focus({ preventScroll: true });
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && selected.value) {
    event.preventDefault();
    closeDetails();
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
onDeactivated(() => closeDetails(false));
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
          aria-controls="resource-detail"
          :aria-label="`${row.name}，${row.amount}，查看收支`" @click="inspect($event, group.kind, row.tier)">
          <span>{{ row.name }}</span><AnimatedNumber :value="row.value" :display="row.amount" />
        </button>
      </div>
    </div>
    <div v-if="activeRow" id="resource-detail" class="inventory-detail" :style="{ '--resource-column': selected?.kind === 'coin' ? 2 : 1 }" role="region" aria-labelledby="resource-detail-title">
      <strong id="resource-detail-title">{{ activeRow.name }}</strong>
      <dl><div v-for="line in activeRow.detail" :key="line.label"><dt>{{ line.label }}</dt><dd>{{ line.value }}</dd></div></dl>
      <button ref="closeButton" type="button" aria-label="关闭资源明细" @click="closeDetails()">×</button>
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
