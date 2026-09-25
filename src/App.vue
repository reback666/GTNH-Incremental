<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useGameStore } from './game/store';
import ResourceBar from './components/ResourceBar.vue';
import MachinePanel from './components/MachinePanel.vue';
import VeinPanel from './components/VeinPanel.vue';
import TechTreePanel from './components/TechTreePanel.vue';
import RiskPanel from './components/RiskPanel.vue';
import RebirthPage from './components/RebirthPage.vue';
import RiftDialog from './components/RiftDialog.vue';

const store = useGameStore();
// 工厂与转生是两个独立的页面：进转生页时只显示转生内容
const view = ref<'factory' | 'rebirth'>('factory');
const rebirth = computed(() => store.snap.rebirth);

onMounted(() => {
  store.boot();
  store.start();
});
</script>

<template>
  <RebirthPage v-if="view === 'rebirth'" @close="view = 'factory'" />

  <template v-else>
    <ResourceBar />

    <section class="panel">
      <div class="row">
        <div class="name">
          <b>转生</b>
          <span class="muted small"> · 时空线缆 {{ rebirth.cables }} 条 · 已转生 {{ rebirth.count }} 次</span>
        </div>
        <button :class="{ primary: rebirth.canRebirth || rebirth.riftPending }" @click="view = 'rebirth'">
          {{ rebirth.canRebirth || rebirth.riftPending ? '去转生' : '查看转生' }}
        </button>
      </div>
    </section>

    <VeinPanel />

    <MachinePanel :columns="store.snap.columns" />

    <TechTreePanel />

    <RiskPanel />

    <section class="panel">
      <h2>存档</h2>
      <p class="muted" style="margin: 0 0 8px">
        自动每 10 秒存一次，关页面时也会存。累计矿石 {{ store.snap.totalOre }}，累计产币
        {{ store.snap.totalCoins }}。
      </p>
      <div class="row">
        <div class="name muted">重开一局（会清掉存档）</div>
        <button @click="store.reset()">重置</button>
      </div>
    </section>
  </template>

  <RiftDialog @accepted="view = 'rebirth'" />
</template>
