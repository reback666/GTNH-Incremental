<script setup lang="ts">
import { onMounted } from 'vue';
import { useGameStore } from './game/store';
import ResourceBar from './components/ResourceBar.vue';
import MachineShop from './components/MachineShop.vue';
import TechTreePanel from './components/TechTreePanel.vue';

const store = useGameStore();

onMounted(() => {
  store.boot();
  store.start();
});
</script>

<template>
  <ResourceBar />

  <section class="panel">
    <h2>手动挖矿</h2>
    <p class="muted" style="margin: 0 0 8px">
      开局只有一座 T0 矿脉。先手挖攒矿，造出采矿机、发电机、制造机，产线就能自己转起来。
    </p>
    <button class="big" @click="store.manualMine()">挖矿 +1 T0 矿石</button>
  </section>

  <div class="cols">
    <MachineShop kind="miner" title="采矿机" hint="放在矿脉上自动产矿。耗电低，是整条循环的入口。" />
    <MachineShop kind="generator" title="发电机" hint="烧本级矿石发电，输出的电供采矿机与制造机使用。" />
  </div>
  <MachineShop kind="machine" title="制造机" hint="吃本级矿石与电力，直接产出本级 GT 币。" />

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
