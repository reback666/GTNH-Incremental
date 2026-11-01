<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useGameStore } from '../game/store';
import { useMotion } from '../composables/useMotion';
import { miningOrigin } from '../scene/mining-effects';
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
const motion = useMotion();
const info = computed(() => veinTierInfo(store.snap.pickaxe.veinTier));
const veinUrl = computed(() => veinIconUrl(store.snap.pickaxe.veinTier));

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
const active = ref(true);
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
  [() => info.value?.fx, motion.active, active],
  ([fx, moving, visible]) => {
    if (pulseFrame) cancelAnimationFrame(pulseFrame);
    pulseFrame = 0;
    if (fx === 'halo' && moving && visible) pulseFrame = requestAnimationFrame(pulse);
  },
  { immediate: true },
);

interface Impact {
  id: number;
  x: number;
  y: number;
  gain: string;
}
interface Chip {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  rot: number;
  size: number;
  color: string;
}

const stage = ref<HTMLElement | null>(null);
const impacts = ref<Impact[]>([]);
const chips = ref<Chip[]>([]);
const crackSeq = ref(0);
const shaking = ref(false);
let seq = 0;
let effectsTimer: ReturnType<typeof setTimeout> | null = null;
let shakeTimer: ReturnType<typeof setTimeout> | null = null;
let shakeFrame = 0;
const CHIP_COLORS = ['#7b7b7b', '#a8a8a8', '#6a6a6a', '#c3b28b'];

function clearEffects(): void {
  if (effectsTimer) clearTimeout(effectsTimer);
  if (shakeTimer) clearTimeout(shakeTimer);
  if (shakeFrame) cancelAnimationFrame(shakeFrame);
  effectsTimer = null; shakeTimer = null; shakeFrame = 0;
  impacts.value = []; chips.value = []; crackSeq.value = 0; shaking.value = false;
}
watch(motion.feedback, active => { if (!active) clearEffects(); });
onActivated(() => { active.value = true; });
onDeactivated(() => { active.value = false; clearEffects(); });
onBeforeUnmount(() => {
  clearEffects();
  if (pulseFrame) cancelAnimationFrame(pulseFrame);
});

function mine(event: MouseEvent): void {
  const gain = store.snap.pickaxe.outputPerClick;
  store.manualMine();
  if (!motion.feedback.value || !stage.value) return;
  const rect = stage.value.getBoundingClientRect();
  const point = miningOrigin(rect, event.detail === 0 ? null : { x: event.clientX, y: event.clientY },
    { width: stage.value.clientWidth, height: stage.value.clientHeight });
  impacts.value = [...impacts.value, { id: ++seq, ...point, gain }].slice(-8);
  const fresh = Array.from({ length: 8 }, (_, index) => {
    const angle = Math.PI * 2 * index / 8 + Math.random() * 0.5;
    const distance = 18 + Math.random() * 26;
    return { id: ++seq, ...point, dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance - 6,
      rot: (Math.random() - 0.5) * 420, size: 2 + Math.round(Math.random() * 3), color: CHIP_COLORS[index % CHIP_COLORS.length]! };
  });
  chips.value = [...chips.value, ...fresh].slice(-64);
  crackSeq.value++;
  if (effectsTimer) clearTimeout(effectsTimer);
  effectsTimer = setTimeout(() => { impacts.value = []; chips.value = []; crackSeq.value = 0; effectsTimer = null; }, 700);
  if (shakeTimer) clearTimeout(shakeTimer);
  if (shakeFrame) cancelAnimationFrame(shakeFrame);
  shaking.value = false;
  shakeFrame = requestAnimationFrame(() => {
    shakeFrame = 0;
    shaking.value = true;
    shakeTimer = setTimeout(() => { shaking.value = false; shakeTimer = null; }, 220);
  });
}
</script>

<template>
  <section class="panel extraction-card">
    <h2>矿脉</h2>
    <p class="muted small">点击矿石，获得材料。</p>

    <button class="vein-btn" type="button" :aria-label="`开采${store.snap.pickaxe.veinName}矿脉`" @click="mine">
      <span class="vein-sprite" :class="{ shake: shaking }">
        <span ref="stage" class="vein-stage">
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
          <span class="mining-effects" aria-hidden="true">
            <span v-if="crackSeq" :key="crackSeq" class="crack" :style="crackStyle"><span class="crack-strip" /></span>
            <span v-for="chip in chips" :key="'chip' + chip.id" class="debris"
              :style="{ left: chip.x + 'px', top: chip.y + 'px', width: chip.size + 'px', height: chip.size + 'px', background: chip.color, '--dx': chip.dx + 'px', '--dy': chip.dy + 'px', '--rot': chip.rot + 'deg' }" />
            <template v-for="impact in impacts" :key="impact.id">
              <span class="spark" :style="{ left: impact.x + 'px', top: impact.y + 'px' }">+{{ impact.gain }}</span>
              <span class="ripple" :style="{ left: impact.x + 'px', top: impact.y + 'px' }" />
              <span class="hit" :style="{ left: impact.x + 'px', top: impact.y + 'px' }"><span v-for="ray in 4" :key="ray" class="hit-ray" :style="{ '--angle': ray * 90 - 45 + 'deg' }" /><span class="hit-core" /></span>
            </template>
          </span>
        </span>
      </span>
      <span class="vein-label">
        {{ store.snap.pickaxe.veinName }}矿脉
      </span>

    </button>

  </section>
</template>
