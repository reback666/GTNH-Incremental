<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '../game/store';
import type { MachineKind } from '../game/core';
import { VOLTAGE_TIERS } from '../numeric/voltage';
import FactoryScene from './FactoryScene.vue';
import MachinePanel from './MachinePanel.vue';
import ResourceBar from './ResourceBar.vue';
import VeinPanel from './VeinPanel.vue';
import PollutionPanel from './PollutionPanel.vue';
import EnergyPanel from './EnergyPanel.vue';
import UiIcon from './UiIcon.vue';
const store = useGameStore();
const selectedKind = ref<MachineKind | 'pickaxe' | null>('miner');
const workshop = ref<HTMLElement | null>(null);
const goal = computed(() => {
  const facilities = store.snap.factory.facilities;
  for (const [kind, title, text] of [
    ['miner', '让开采自动运行', '建造采矿机，让材料不再只靠手动获取。'],
    ['generator', '接通第一条电力线', '发电机用矿石提供电力，驱动整条生产链。'],
    ['machine', '把矿物变成财富', '制造机将矿石与电力转化为 GT 币。'],
  ] as const) {
    if (!facilities.find(item => item.kind === kind)?.count) return { kind, title, text };
  }
  return null;
});
const nextName = computed(() => store.snap.nextTier ? VOLTAGE_TIERS[store.snap.nextTier - 1] : 'MAX');
function select(kind: MachineKind) {
  selectedKind.value = kind;
}
function goToWorkshop(kind: MachineKind) {
  select(kind);
  workshop.value?.scrollIntoView({ behavior: 'auto', block: 'start' });
}
</script>
<template>
  <ResourceBar />
  <div class="factory-workspace">
    <aside class="operations-dock">
      <VeinPanel />
      <EnergyPanel />
      <PollutionPanel />
      <section class="panel expansion-card">
        <span class="eyebrow">{{ goal ? '启动你的工厂' : '下一次跃迁' }}</span>
        <template v-if="goal">
          <h2>{{ goal.title }}</h2><p>{{ goal.text }}</p>
          <button type="button" class="primary" @click="goToWorkshop(goal.kind)">管理设备 <UiIcon name="arrow" :size="16" /></button>
        </template>
        <template v-else>
          <h2>{{ store.snap.nextTier ? `向 ${nextName} 时代进发` : '已抵达 MAX 时代' }}</h2>
          <p>{{ store.snap.nextTier ? `积累 ${store.snap.unlockCost} 枚上一级 GT 币，解锁新矿脉与设备。` : '继续积累电能，探索转生与平行宇宙。' }}</p>
          <div class="expansion-progress" role="progressbar" :aria-valuenow="Math.round(store.snap.factory.nextTierProgress * 100)" aria-valuemin="0" aria-valuemax="100" aria-label="下一电压解锁进度"><span :style="{ width: store.snap.factory.nextTierProgress * 100 + '%' }" /></div>
          <button v-if="store.snap.nextTier" type="button" class="primary" :disabled="!store.snap.canUnlock" @click="store.unlock()">解锁 {{ nextName }} <UiIcon name="arrow" :size="16" /></button>
        </template>
      </section>
    </aside>
    <div class="production-workspace">
    <FactoryScene :selected-kind="selectedKind" @select="select" @manage="goToWorkshop" />
    <section ref="workshop" class="workshop" aria-labelledby="workshop-title">
      <div class="section-heading"><div><span class="eyebrow">建造 · 超频 · 维护</span><h2 id="workshop-title">设备工作台</h2></div><span class="muted small">{{ store.snap.factory.machineCount }} 台设备已部署</span></div>
      <MachinePanel v-model:active-kind="selectedKind" :columns="store.snap.columns" />
    </section>
    </div>
  </div>
</template>
