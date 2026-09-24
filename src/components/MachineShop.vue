<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '../game/store';
import type { MachineKind } from '../game/core';

const props = defineProps<{ kind: MachineKind; title: string; hint: string }>();
const store = useGameStore();
const rows = computed(() => store.snap.machines[props.kind].filter((row) => row.unlocked));
// 计划书第七章规定用币买；开局没有产币机器，所以再给一条用矿石建造的路子。
const payWith = ref<'coin' | 'ore'>('coin');

function buy(tier: number, count: number) {
  store.buy(props.kind, tier, count, payWith.value);
}
</script>

<template>
  <section class="panel">
    <h2>{{ title }}</h2>
    <p class="muted" style="margin: 0 0 8px">{{ hint }}</p>
    <div class="row" style="margin-bottom: 4px">
      <div class="name muted">支付方式</div>
      <button :class="{ primary: payWith === 'coin' }" @click="payWith = 'coin'">GT 币</button>
      <button :class="{ primary: payWith === 'ore' }" @click="payWith = 'ore'">同级矿石</button>
    </div>
    <div v-for="row in rows" :key="row.tier" class="row">
      <div class="name">
        T{{ row.tier }}
        <span class="count">已建 {{ row.count }}</span>
      </div>
      <div class="count">
        <template v-if="payWith === 'coin'">{{ row.price }} {{ row.unit }}</template>
        <template v-else>{{ row.orePrice }} T{{ row.tier - 1 }} 矿</template>
      </div>
      <button
        :disabled="payWith === 'coin' ? !row.affordable : !row.oreAffordable"
        @click="buy(row.tier, 1)"
      >
        ×1
      </button>
      <button
        :disabled="payWith === 'coin' ? !row.affordable : !row.oreAffordable"
        @click="buy(row.tier, 10)"
      >
        ×10
      </button>
    </div>
  </section>
</template>
