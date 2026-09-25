<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';

// 成就清单：达成的排在前面，未达成的灰着显示目标
const store = useGameStore();
const achievements = computed(() => store.snap.achievements);
const collapsed = computed(() => store.achievementsCollapsed);
const sorted = computed(() =>
  [...achievements.value.rows].sort((a, b) => {
    if (a.achieved === b.achieved) return 0;
    return a.achieved ? -1 : 1;
  }),
);
</script>

<template>
  <section class="panel">
    <div class="ach-head">
      <h2>成就</h2>
      <button type="button" class="ach-toggle" @click="store.toggleAchievements()">
        {{ collapsed ? '展开列表' : '收起列表' }}
      </button>
    </div>
    <p class="muted small" style="margin: 0 0 8px">
      已达成 {{ achievements.done }} / {{ achievements.total }}。成就跨周目保留，转生不会清掉。
    </p>
    <div v-if="!collapsed" class="achievements">
      <div v-for="row in sorted" :key="row.id" class="achievement" :class="{ done: row.achieved }">
        <span class="mark">{{ row.achieved ? '√' : '·' }}</span>
        <span class="text">
          <b>{{ row.name }}</b>
          <span class="muted small">{{ row.desc }}</span>
        </span>
        <span class="at muted small">{{ row.at }}</span>
      </div>
    </div>
  </section>
</template>
