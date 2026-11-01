<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';
import type { AchievementRow } from '../game/presentation/types';
import AchievementIcon from './AchievementIcon.vue';

// 成就清单：一张小方块一条，一行摆多个；达成的排在前面并点亮
const store = useGameStore();
const achievements = computed(() => store.snap.achievements);
const sorted = computed(() =>
  [...achievements.value.rows].sort((a, b) => {
    if (a.achieved === b.achieved) return 0;
    return a.achieved ? -1 : 1;
  }),
);

// 方块放不下完整的说明，悬停时用 title 补全
function tip(row: AchievementRow): string {
  return row.achieved ? `${row.name}：${row.desc}（达成于 ${row.at}）` : `${row.name}：${row.desc}`;
}
</script>

<template>
  <section class="panel">
    <div class="panel-toggle" aria-label="成就">
      <span>成就</span>
      <span class="muted small">已达成 {{ achievements.done }} / {{ achievements.total }}</span>
    </div>
    <p class="muted small" style="margin: 0 0 8px">
      成就跨周目保留，转生不会清掉。鼠标移到方块上可以看达成条件。
    </p>
    <div class="achievements">
      <div
        v-for="row in sorted"
        :key="row.id"
        class="achievement"
        :class="{ done: row.achieved }"
        tabindex="0"
        :title="tip(row)"
      >
        <span class="mark">{{ row.achieved ? '√' : '·' }}</span>
        <AchievementIcon :icon="row.icon" :size="34" />
        <b class="name">{{ row.name }}</b>
        <span class="meta">{{ row.achieved ? row.at : row.desc }}</span>
      </div>
    </div>
  </section>
</template>
