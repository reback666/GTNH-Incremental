<script setup lang="ts">
import { ref } from 'vue';
import { useGameStore } from '../game/store';
import SpriteIcon from './SpriteIcon.vue';

const store = useGameStore();

interface Spark {
  id: number;
  x: number;
  y: number;
}

const sparks = ref<Spark[]>([]);
const ripples = ref<Spark[]>([]);
const shaking = ref(false);
let seq = 0;

function mine(event: MouseEvent) {
  store.manualMine();
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const point = { id: seq++, x: event.clientX - rect.left, y: event.clientY - rect.top };

  sparks.value.push(point);
  ripples.value.push(point);
  setTimeout(() => {
    sparks.value = sparks.value.filter((s) => s.id !== point.id);
  }, 900);
  setTimeout(() => {
    ripples.value = ripples.value.filter((s) => s.id !== point.id);
  }, 560);

  // 重新触发抖动动画：先摘掉类再挂上
  shaking.value = false;
  requestAnimationFrame(() => {
    shaking.value = true;
    setTimeout(() => {
      shaking.value = false;
    }, 280);
  });
}
</script>

<template>
  <section class="panel">
    <h2>矿脉 · 手动开采</h2>
    <p class="muted small">开局只有一座 T0 矿脉。先手挖攒矿，造出机器之后它就会自己转起来。</p>

    <button class="vein-btn" type="button" @click="mine">
      <span class="vein-sprite" :class="{ shake: shaking }">
        <SpriteIcon kind="vein" :size="112" />
      </span>
      <span class="vein-label">点击挖矿</span>

      <span
        v-for="spark in sparks"
        :key="'s' + spark.id"
        class="spark"
        :style="{ left: spark.x + 'px', top: spark.y + 'px' }"
        >+1</span
      >
      <span
        v-for="ripple in ripples"
        :key="'r' + ripple.id"
        class="ripple"
        :style="{ left: ripple.x + 'px', top: ripple.y + 'px' }"
      />
    </button>
  </section>
</template>
