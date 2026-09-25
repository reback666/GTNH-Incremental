<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';

// 时空裂缝：本周目第一次到 LuV 时弹一次的offer。
// 无论选哪边都把这扇门关掉；选「穿过去」由上层切到转生页面。
const emit = defineEmits<{ accepted: [] }>();
const store = useGameStore();
const rebirth = computed(() => store.snap.rebirth);

function accept() {
  if (store.rebirth('rift') !== null) emit('accepted');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="rebirth.riftPending" class="rift-backdrop">
      <div class="rift-dialog">
        <h2>时空裂缝</h2>
        <p>
          电力阶梯在这里出现了一道裂缝。现在穿过去，就能立刻重开一轮，
          并带走 <b>1 条时空线缆</b> —— 刚好够点亮永久加成树最里面的一格。
        </p>
        <p class="muted small">
          裂缝的收益是固定的，跟你的累计 EU、电压都无关；穿过它，本周目的矿石、机器、
          研究进度都会清空。如果你留在这一轮，就只剩打到 MAX 才能转生 ——
          那条路按累计 EU 结算，能拿得多得多。
        </p>
        <p class="muted small">每个周目只有这一次机会，选了不转就不会再出现。</p>
        <div class="rift-actions">
          <button @click="store.declineRift()">留在这一轮</button>
          <button class="primary" @click="accept">穿过去（转生）</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
