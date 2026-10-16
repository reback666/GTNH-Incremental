<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';
import TechTreePanel from '../components/TechTreePanel.vue';
import GridPanel from '../components/GridPanel.vue';
import AchievementPanel from '../components/AchievementPanel.vue';

const store = useGameStore();
const rebirth = computed(() => store.snap.rebirth);
</script>

<template>
  <div class="technology-page">
    <TechTreePanel />
    <GridPanel />

    <!-- 转生摘要 -->
    <section class="panel">
      <div class="row">
        <div class="name">
          <b>转生</b>
          <span class="muted small">
            · 时空线缆 {{ rebirth.cables }} 条 · 已转生 {{ rebirth.count }} 次</span
          >
          <span v-if="rebirth.pendingUniverseName" class="muted small">
            · 下次转生带上 {{ rebirth.pendingUniverseName }}</span
          >
          <span v-if="rebirth.universes.length" class="muted small">
            · 已有宇宙 {{ rebirth.universes.join('、') }}</span
          >
        </div>
        <button
          :class="{ primary: rebirth.canRebirth || rebirth.riftPending }"
          @click="$emit('openRebirth')"
        >
          {{ rebirth.canRebirth || rebirth.riftPending ? '去转生' : '查看转生' }}
        </button>
      </div>
    </section>

    <AchievementPanel />
  </div>
</template>
