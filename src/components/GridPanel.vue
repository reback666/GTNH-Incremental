<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';

// 电网：花对应等级的 GT 币解锁，解锁后自由切换（计划书第六章）。
const store = useGameStore();
const risk = computed(() => store.snap.risk);
const currentGrid = computed(
  () => risk.value.gridModes.find((mode) => mode.id === risk.value.grid)?.name ?? '',
);
</script>

<template>
  <section class="panel">
    <div class="panel-toggle" aria-label="电网">
      <span>电网</span>
      <span class="muted small">
        使用中：{{ currentGrid }}<template v-if="risk.outage"> · 断电中</template>
      </span>
    </div>
    <div class="grid-modes">
      <div
        v-for="mode in risk.gridModes"
        :key="mode.id"
        class="grid-mode"
        :class="{ active: risk.grid === mode.id, locked: !mode.unlocked }"
      >
        <div class="grid-info">
          <b>{{ mode.name }}</b>
          <span class="muted small">{{ mode.summary }}</span>
          <span v-if="!mode.unlocked" class="muted small">{{ mode.requirement }}</span>
        </div>
        <span class="grid-actions">
          <template v-if="mode.unlocked">
            <button type="button" :disabled="risk.grid === mode.id" @click="store.setGrid(mode.id)">
              {{ risk.grid === mode.id ? '使用中' : '切换' }}
            </button>
          </template>
          <template v-else>
            <span class="price">{{ mode.cost }} {{ mode.unit }}</span>
            <button type="button" :disabled="!mode.unlockable" @click="store.unlockGrid(mode.id)">
              解锁
            </button>
          </template>
        </span>
      </div>
    </div>
    <p v-if="risk.grid === 'black'" class="muted small" style="margin: 8px 0 0">
      累计被黑市薅走 {{ risk.siphoned }} 币。
    </p>
    <p v-if="risk.outage" class="danger small" style="margin: 8px 0 0">
      电网断电中：所有机器停转，等它恢复。
    </p>
  </section>
</template>
