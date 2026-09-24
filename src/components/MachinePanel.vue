<script setup lang="ts">
import { ref } from 'vue';
import { useGameStore, type MachineColumn, type MachineTierRow } from '../game/store';
import type { MachineKind, PayWith } from '../game/core';
import SpriteIcon from './SpriteIcon.vue';

defineProps<{ columns: MachineColumn[] }>();
const store = useGameStore();

// 最上方是三个大类，点谁就展开谁，另外两个挤压收起。
const active = ref<MachineKind>('miner');
// 计划书第七章规定用 GT 币买；开局没有产币机器，所以再给一条用矿石建造的路子。
const payWith = ref<PayWith>('coin');

function cells(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function unlockedTiers(column: MachineColumn): MachineTierRow[] {
  return column.tiers.filter((row) => row.unlocked);
}

function canBuy(row: MachineTierRow): boolean {
  return payWith.value === 'ore' ? row.oreAffordable : row.affordable;
}
</script>

<template>
  <section>
    <div class="machine-tabs">
      <button
        v-for="column in columns"
        :key="column.kind"
        type="button"
        class="machine-tab"
        :class="{ active: active === column.kind }"
        @click="active = column.kind"
      >
        <SpriteIcon :kind="column.kind" :size="30" />
        <span class="tab-name">{{ column.title }}</span>
        <span class="tab-count">已建 {{ column.count }} 台</span>
      </button>
    </div>

    <div
      v-for="column in columns"
      :key="column.kind"
      class="machine-body"
      :class="{ collapsed: active !== column.kind }"
    >
      <div class="inner">
        <div class="pad">
          <p class="muted small hint">{{ column.hint }}</p>

          <dl class="stats">
            <div v-for="stat in column.stats" :key="stat.label" class="stat">
              <dt>{{ stat.label }}</dt>
              <dd>{{ stat.value }}</dd>
            </div>
          </dl>

          <div class="row pay-row">
            <span class="muted small">支付</span>
            <button :class="{ primary: payWith === 'coin' }" @click="payWith = 'coin'">GT 币</button>
            <button :class="{ primary: payWith === 'ore' }" @click="payWith = 'ore'">同级矿石</button>
          </div>

          <!-- 每个电压等级一条横杠，机器图标从左往右排 -->
          <div v-for="row in unlockedTiers(column)" :key="row.tier" class="tier-bar">
            <span class="tier-name">{{ row.voltage }}</span>
            <div class="tier-icons">
              <SpriteIcon
                v-for="index in cells(row.icons)"
                :key="index"
                :kind="column.kind"
                :size="20"
                class="icon-pop"
              />
              <span v-if="row.overflow > 0" class="icon-overflow">+{{ row.overflow }}</span>
              <span v-if="row.icons === 0" class="muted small">还没建</span>
            </div>
            <span class="count">×{{ row.count }}</span>
            <span class="price">
              <template v-if="payWith === 'coin'">{{ row.price }} {{ row.unit }}</template>
              <template v-else>{{ row.orePrice }} {{ row.oreLabel }}</template>
            </span>
            <button :disabled="!canBuy(row)" @click="store.buy(column.kind, row.tier, 1, payWith)">
              ×1
            </button>
            <button :disabled="!canBuy(row)" @click="store.buy(column.kind, row.tier, 10, payWith)">
              ×10
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
