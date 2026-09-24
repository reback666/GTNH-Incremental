<script setup lang="ts">
import { ref } from 'vue';
import { useGameStore } from '../game/store';
import SpriteIcon from './SpriteIcon.vue';

const store = useGameStore();

interface Burst {
  id: number;
  x: number;
  y: number;
}

// 飞溅的矿石碎屑
interface Chip extends Burst {
  dx: number;
  dy: number;
  rot: number;
  size: number;
  color: string;
}

const CHIP_COLORS = ['#5ad2c0', '#2f8f83', '#8a97a8', '#4a5563'];

const sparks = ref<Burst[]>([]);
const ripples = ref<Burst[]>([]);
const chips = ref<Chip[]>([]);
const shaking = ref(false);
const flashing = ref(false);
let seq = 0;

function mine(event: MouseEvent) {
  store.manualMine();
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const point: Burst = { id: seq++, x, y };

  sparks.value.push(point);
  ripples.value.push(point);

  // 开采碎屑：六片朝四周飞散
  const fresh: Chip[] = Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 6 + Math.random() * 0.6;
    const distance = 26 + Math.random() * 30;
    return {
      id: seq++,
      x,
      y,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 12,
      rot: (Math.random() - 0.5) * 540,
      size: 3 + Math.round(Math.random() * 3),
      color: CHIP_COLORS[index % CHIP_COLORS.length] as string,
    };
  });
  chips.value.push(...fresh);
  const chipIds = new Set(fresh.map((chip) => chip.id));

  setTimeout(() => {
    sparks.value = sparks.value.filter((s) => s.id !== point.id);
  }, 900);
  setTimeout(() => {
    ripples.value = ripples.value.filter((s) => s.id !== point.id);
  }, 560);
  setTimeout(() => {
    chips.value = chips.value.filter((chip) => !chipIds.has(chip.id));
  }, 700);

  // 重新触发抖动与打击闪光：先摘掉类再挂上
  shaking.value = false;
  flashing.value = false;
  requestAnimationFrame(() => {
    shaking.value = true;
    flashing.value = true;
    setTimeout(() => {
      shaking.value = false;
    }, 280);
    setTimeout(() => {
      flashing.value = false;
    }, 130);
  });
}
</script>

<template>
  <section class="panel">
    <h2>矿脉 · 手动开采</h2>
    <p class="muted small">开局只有一座 T0 矿脉。先手挖攒矿，造出机器之后它就会自己转起来。</p>

    <button class="vein-btn" type="button" @click="mine">
      <span class="vein-sprite" :class="{ shake: shaking, flash: flashing }">
        <SpriteIcon kind="vein" :size="112" />
      </span>
      <span class="vein-label">点击挖矿</span>

      <span
        v-for="chip in chips"
        :key="'c' + chip.id"
        class="debris"
        :style="{
          left: chip.x + 'px',
          top: chip.y + 'px',
          width: chip.size + 'px',
          height: chip.size + 'px',
          background: chip.color,
          '--dx': chip.dx + 'px',
          '--dy': chip.dy + 'px',
          '--rot': chip.rot + 'deg',
        }"
      />
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
