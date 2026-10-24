<script setup lang="ts">
import { useGameStore } from '../game/store';
import TechTreePanel from './TechTreePanel.vue';
import GridPanel from './GridPanel.vue';
import AchievementPanel from './AchievementPanel.vue';
import EnergyPanel from './EnergyPanel.vue';
import UiIcon from './UiIcon.vue';
import ArcaneExpeditionPanel from './ArcaneExpeditionPanel.vue';

const store = useGameStore();
const emit = defineEmits<{ explore: [] }>();
</script>

<template>
  <div class="technology-workspace">
    <div><TechTreePanel /><ArcaneExpeditionPanel v-if="store.snap.arcaneExpedition.active" :state="store.snap.arcaneExpedition" @action="store.arcaneAction" /><GridPanel /><AchievementPanel /></div>
    <aside><EnergyPanel /><section class="panel technology-rift"><UiIcon name="rift" :size="32" /><h2>另一条时间线</h2><p class="muted">时空线缆 {{ store.snap.rebirth.cables }} 条 · 已转生 {{ store.snap.rebirth.count }} 次</p><button class="primary" type="button" @click="emit('explore')">探索时空星图</button></section></aside>
  </div>
</template>
