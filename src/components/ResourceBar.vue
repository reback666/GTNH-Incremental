<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';
import { VOLTAGE_TIERS } from '../numeric/voltage';

const store = useGameStore();
const snap = computed(() => store.snap);
const tierName = computed(() => VOLTAGE_TIERS[snap.value.maxTier - 1] ?? 'ULV');
</script>

<template>
  <section class="panel">
    <h1>GTNH 增量 · {{ tierName }}</h1>

    <h2>矿石</h2>
    <div class="chips">
      <div v-for="row in snap.ores" :key="row.tier" class="chip">
        <span>{{ row.name }}</span> <b>{{ row.amount }}</b>
      </div>
    </div>

    <h2 style="margin-top: 12px">GT 币</h2>
    <div class="chips">
      <div v-for="row in snap.coins" :key="row.tier" class="chip">
        <span>{{ row.name }}</span> <b>{{ row.amount }}</b>
      </div>
    </div>

    <h2 style="margin-top: 12px">电网</h2>
    <div class="chips">
      <div class="chip"><span>发电</span> <b>{{ snap.powerGenerated }} EU</b></div>
      <div class="chip"><span>耗电</span> <b>{{ snap.powerConsumed }} EU</b></div>
      <div class="chip" :class="{ danger: snap.powerShort }">
        <span>供电率</span> <b>{{ (snap.powerRatio * 100).toFixed(0) }}%</b>
      </div>
      <div class="chip"><span>游玩时长</span> <b>{{ snap.playTime }}</b></div>
    </div>
    <p v-if="snap.powerShort" class="danger" style="margin: 8px 0 0">
      电力不足，所有机器都在降载运行。补发电机或降低机器数量。
    </p>
  </section>
</template>
