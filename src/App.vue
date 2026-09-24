<script setup lang="ts">
import { onMounted } from 'vue';
import { useGameStore } from './game/store';
import ResourceBar from './components/ResourceBar.vue';
import MachineColumn from './components/MachineColumn.vue';
import VeinPanel from './components/VeinPanel.vue';
import TechTreePanel from './components/TechTreePanel.vue';

const store = useGameStore();

onMounted(() => {
  store.boot();
  store.start();
});
</script>

<template>
  <ResourceBar />

  <VeinPanel />

  <div class="machine-grid">
    <MachineColumn v-for="column in store.snap.columns" :key="column.kind" :column="column" />
  </div>

  <TechTreePanel />

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
