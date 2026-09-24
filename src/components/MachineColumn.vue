<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore, type MachineColumn } from '../game/store';
import type { PayWith } from '../game/core';
import SpriteIcon from './SpriteIcon.vue';
import AnimatedNumber from './AnimatedNumber.vue';

const props = defineProps<{ column: MachineColumn }>();
const store = useGameStore();

// 计划书第七章规定用 GT 币买；开局没有产币机器，所以再给一条用矿石建造的路子。
const payWith = ref<PayWith>('coin');

const unlockedTiers = computed(() => props.column.tiers.filter((row) => row.unlocked));
const icons = computed(() => Array.from({ length: props.column.icons }, (_, index) => index));

function buy(tier: number, count: number) {
  store.buy(props.column.kind, tier, count, payWith.value);
}

function canBuy(row: { affordable: boolean; oreAffordable: boolean }): boolean {
  return payWith.value === 'ore' ? row.oreAffordable : row.affordable;
}
</script>

<template>
  <section class="panel machine-col">
    <header class="col-head">
      <SpriteIcon :kind="column.kind" :size="48" />
      <div class="col-title">
        <h2>{{ column.title }}</h2>
        <div class="col-count">
          已建 <AnimatedNumber :value="String(column.count)" :display="String(column.count)" />
          台
        </div>
      </div>
    </header>

    <dl class="stats">
      <div v-for="stat in column.stats" :key="stat.label" class="stat">
        <dt>{{ stat.label }}</dt>
        <dd>{{ stat.value }}</dd>
      </div>
    </dl>

    <!-- 机器图像：每建一台就多一个图标 -->
    <div v-if="column.count > 0" class="icon-grid">
      <SpriteIcon
        v-for="index in icons"
        :key="index"
        :kind="column.kind"
        :size="22"
        class="icon-pop"
      />
      <span v-if="column.overflow > 0" class="icon-overflow">+{{ column.overflow }}</span>
    </div>
    <p v-else class="muted small">还没有建造任何{{ column.title }}。</p>

    <div class="row pay-row">
      <span class="muted small">支付</span>
      <button :class="{ primary: payWith === 'coin' }" @click="payWith = 'coin'">币</button>
      <button :class="{ primary: payWith === 'ore' }" @click="payWith = 'ore'">矿</button>
    </div>

    <div v-for="row in unlockedTiers" :key="row.tier" class="row tier-row">
      <span class="tier-name">{{ row.voltage }}</span>
      <span class="count">×{{ row.count }}</span>
      <span class="price">
        <template v-if="payWith === 'coin'">{{ row.price }} {{ row.unit }}</template>
        <template v-else>{{ row.orePrice }} {{ row.oreLabel }}</template>
      </span>
      <button :disabled="!canBuy(row)" @click="buy(row.tier, 1)">×1</button>
      <button :disabled="!canBuy(row)" @click="buy(row.tier, 10)">×10</button>
    </div>
  </section>
</template>
