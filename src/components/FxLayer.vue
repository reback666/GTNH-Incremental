<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useMotion } from '../composables/useMotion';
import { onFx, type FxEvent } from '../game/fx';

/*
  全屏特效层：盖在页面最上方、不挡任何操作，订阅 fx 总线放粒子。
  voltage-unlock：一簇烟花从屏幕上部炸开（金 + 主题色两批）。
  系统开了「减少动态效果」时整个层不工作。
*/

interface Spark {
  id: number;
  /** left/top 用 vw / vh，散开向量与颜色交给 CSS 变量 */
  left: number;
  top: number;
  dx: number;
  dy: number;
  color: string;
  size: number;
  delay: number;
}

const motion = useMotion();
const timers = new Set<ReturnType<typeof setTimeout>>();
function later(callback: () => void, delay: number) {
  const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
  timers.add(timer);
}
function clearEffects() {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  sparks.value = [];
}
const sparks = ref<Spark[]>([]);
watch(motion.active, active => { if (!active) clearEffects(); });
let nextId = 0;
let cleanup: (() => void) | null = null;

const FIREWORK_COLORS = ['#ffd76e', '#58c4a3', '#8fd0ff', '#f0a09e'];

function burst(centerLeft: number, centerTop: number, count: number, colors: string[]) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = 60 + Math.random() * 90;
    const id = ++nextId;
    sparks.value.push({
      id,
      left: centerLeft,
      top: centerTop,
      dx: Math.cos(angle) * distance,
      // 稍微带一点下坠感：向上散得多、向下散得少
      dy: Math.sin(angle) * distance * 0.7 - 20,
      color: colors[i % colors.length]!,
      size: 3 + Math.random() * 3,
      delay: Math.random() * 0.08,
    });
  }
  later(() => {
    sparks.value = [];
  }, 1400);
}

onMounted(() => {
  cleanup = onFx((event: FxEvent) => {
    if (motion.active.value && event.kind === 'voltage-unlock') {
      burst(30 + Math.random() * 40, 18 + Math.random() * 12, 26, FIREWORK_COLORS);
      // 半拍后补一簇小的，层次感
      later(() => burst(25 + Math.random() * 50, 24 + Math.random() * 10, 14, FIREWORK_COLORS), 180);
    }
  });
});

onUnmounted(() => {
  cleanup?.();
  clearEffects();
});
</script>

<template>
  <div class="fx-layer" aria-hidden="true">
    <span
      v-for="spark in sparks"
      :key="spark.id"
      class="fx-spark"
      :style="{
        left: spark.left + 'vw',
        top: spark.top + 'vh',
        width: spark.size + 'px',
        height: spark.size + 'px',
        background: spark.color,
        color: spark.color,
        '--dx': spark.dx + 'px',
        '--dy': spark.dy + 'px',
        animationDelay: spark.delay + 's',
      }"
    />
  </div>
</template>
