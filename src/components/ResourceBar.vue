<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';
import { VOLTAGE_TIERS } from '../numeric/voltage';
import AnimatedNumber from './AnimatedNumber.vue';

const store = useGameStore();
const snap = computed(() => store.snap);
const tierName = computed(() => VOLTAGE_TIERS[snap.value.maxTier - 1] ?? 'ULV');
const euSurplus = computed(() => !snap.value.rate.euNetRaw.startsWith('-'));
</script>

<template>
  <section class="panel">
    <h1>GTNH 增量 · {{ tierName }}</h1>

    <h2>矿石</h2>
    <div class="chips">
      <div v-for="row in snap.ores" :key="row.tier" class="chip">
        <span>{{ row.name }}</span>
        <AnimatedNumber :value="row.value" :display="row.amount" />
      </div>
    </div>

    <h2 class="mt">GT 币</h2>
    <div class="chips">
      <div v-for="row in snap.coins" :key="row.tier" class="chip">
        <span>{{ row.name }}</span>
        <AnimatedNumber :value="row.value" :display="row.amount" />
      </div>
    </div>

    <h2 class="mt">全厂产能</h2>
    <div class="chips">
      <div class="chip">
        <span>矿石净变化</span>
        <AnimatedNumber :value="snap.rate.orePerSecondRaw" :display="`${snap.rate.orePerSecond}/秒`" />
      </div>
      <div class="chip" :class="{ danger: !euSurplus }">
        <span>电力净收支</span>
        <AnimatedNumber :value="snap.rate.euNetRaw" :display="`${snap.rate.euNet} EU/t`" />
      </div>
      <div class="chip">
        <span>产币</span>
        <AnimatedNumber :value="snap.rate.coinsPerSecond" :display="`${snap.rate.coinsPerSecond}/秒`" />
      </div>
      <div class="chip"><span>烧矿</span> <b>{{ snap.rate.fuelPerSecond }}/秒</b></div>
      <div class="chip">
        <span>供电率</span>
        <b :class="{ danger: snap.powerShort }">{{ (snap.powerRatio * 100).toFixed(0) }}%</b>
      </div>
      <div class="chip"><span>游玩时长</span> <b>{{ snap.playTime }}</b></div>
    </div>
    <p v-if="snap.powerShort" class="danger small" style="margin: 8px 0 0">
      电力不足，所有机器都在降载运行。加发电机，或先停掉一些机器。
    </p>
  </section>
</template>
