<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useGameStore } from '../game/store';
import SpriteIcon from './SpriteIcon.vue';
import {
  fxIconFrames,
  fxIconLoopMs,
  fxIconUrl,
  veinIconUrl,
  veinLoopMs,
  veinTierInfo,
} from '../game/veins';

const store = useGameStore();
const info = computed(() => veinTierInfo(store.snap.currentVein.tier));
const veinUrl = computed(() => veinIconUrl(store.snap.currentVein.tier));

// 贴图是竖排的帧条带，用 steps() 逐帧切换，和 Minecraft 的动画贴图一个机制
const spriteStyle = computed(() => ({
  '--frames': String(info.value?.frames ?? 1),
  '--loop': `${info.value ? veinLoopMs(info.value) : 1000}ms`,
  backgroundImage: veinUrl.value ? `url(${veinUrl.value})` : 'none',
}));

const haloStyle = computed(() => ({ '--icon': `url(${fxIconUrl('halo')})` }));
const fuzzyStyle = computed(() => ({
  '--icon': `url(${fxIconUrl('haloFuzzy')})`,
  '--frames': String(fxIconFrames('haloFuzzy')),
  '--loop': `${fxIconLoopMs('haloFuzzy')}ms`,
}));
// 石头碎裂：原版 10 级破坏贴图，一次点击播完整段
const crackStyle = computed(() => ({
  '--icon': `url(${fxIconUrl('destroy')})`,
  '--frames': String(fxIconFrames('destroy')),
  '--loop': `${fxIconLoopMs('destroy')}ms`,
}));

const echoEl = ref<HTMLElement | null>(null);
let pulseFrame = 0;

function gaussian(): number {
  const u = Math.random() || Number.EPSILON;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// 原版 InfinityRenderer.renderPulse：缩放 = 高斯随机 × 0.15 + 0.95，偏移取 (1 - 缩放) / 2
function pulse() {
  const el = echoEl.value;
  if (el) {
    const scale = gaussian() * 0.15 + 0.95;
    const offset = (1 - scale) / 2;
    el.style.transform = `translate(${offset * 100}%, ${offset * 100}%) scale(${scale})`;
  }
  pulseFrame = requestAnimationFrame(pulse);
}

watch(
  () => info.value?.fx,
  (fx) => {
    if (pulseFrame) cancelAnimationFrame(pulseFrame);
    pulseFrame = 0;
    if (fx === 'halo') pulseFrame = requestAnimationFrame(pulse);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (pulseFrame) cancelAnimationFrame(pulseFrame);
});

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

// 石头碎屑：跟矿脉石头同色系的灰，混一片矿脉的青色
const CHIP_COLORS = ['#7b7b7b', '#6a6a6a', '#8f8f8f', '#5c5c5c', '#9a9a9a', '#2f8f83'];

const sparks = ref<Burst[]>([]);
const ripples = ref<Burst[]>([]);
// 镐子落点：中心亮点 + 一圈短星芒
const hits = ref<Burst[]>([]);
// 落点裂开的石头缝
const cracks = ref<Burst[]>([]);
const chips = ref<Chip[]>([]);
const shaking = ref(false);
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
  hits.value.push(point);
  cracks.value.push(point);

  // 石头碎屑：八片朝四周飞散
  const fresh: Chip[] = Array.from({ length: 8 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 8 + Math.random() * 0.5;
    const distance = 18 + Math.random() * 26;
    return {
      id: seq++,
      x,
      y,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 6,
      rot: (Math.random() - 0.5) * 420,
      size: 2 + Math.round(Math.random() * 3),
      color: CHIP_COLORS[index % CHIP_COLORS.length] as string,
    };
  });
  chips.value.push(...fresh);
  const chipIds = new Set(fresh.map((chip) => chip.id));

  setTimeout(() => {
    sparks.value = sparks.value.filter((s) => s.id !== point.id);
  }, 1050);
  setTimeout(() => {
    ripples.value = ripples.value.filter((s) => s.id !== point.id);
  }, 820);
  setTimeout(() => {
    hits.value = hits.value.filter((s) => s.id !== point.id);
  }, 320);
  setTimeout(() => {
    cracks.value = cracks.value.filter((s) => s.id !== point.id);
  }, 900);
  setTimeout(() => {
    chips.value = chips.value.filter((chip) => !chipIds.has(chip.id));
  }, 800);

  // 重新触发轻微的下沉回弹：先摘掉类再挂上
  shaking.value = false;
  requestAnimationFrame(() => {
    shaking.value = true;
    setTimeout(() => {
      shaking.value = false;
    }, 340);
  });
}
</script>

<template>
  <section class="panel">
    <h2>矿脉 · 手动开采</h2>
    <p class="muted small">开局只有一座 T0 矿脉。先手挖攒矿，造出机器之后它就会自己转起来。</p>

    <button class="vein-btn" type="button" @click="mine">
      <span class="vein-sprite" :class="{ shake: shaking }">
        <span class="vein-stage">
          <span
            v-if="info?.fx === 'fuzzy'"
            class="vein-halo vein-halo-fuzzy"
            :style="fuzzyStyle"
          >
            <span class="vein-halo-strip" />
          </span>
          <span v-if="info?.fx === 'halo'" class="vein-halo vein-halo-square" :style="haloStyle" />
          <span class="vein-clip">
            <span v-if="veinUrl" class="vein-frames" :style="spriteStyle" />
            <SpriteIcon v-else kind="vein" :size="112" />
          </span>
          <span v-if="info?.fx === 'halo'" ref="echoEl" class="vein-echo">
            <span class="vein-clip">
              <span class="vein-frames" :style="spriteStyle" />
            </span>
          </span>
        </span>
      </span>
      <span class="vein-label">
        {{ store.snap.currentVein.name }} · {{ info?.material }} —— 点击挖矿
      </span>

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
      <span
        v-for="hit in hits"
        :key="'h' + hit.id"
        class="hit"
        :style="{ left: hit.x + 'px', top: hit.y + 'px' }"
      >
        <span v-for="ray in 4" :key="ray" class="hit-ray" :style="{ '--angle': ray * 90 - 45 + 'deg' }" />
        <span class="hit-core" />
      </span>
      <span
        v-for="crack in cracks"
        :key="'k' + crack.id"
        class="crack"
        :style="{ ...crackStyle, left: crack.x + 'px', top: crack.y + 'px' }"
      >
        <span class="crack-strip" />
      </span>
    </button>
  </section>
</template>
