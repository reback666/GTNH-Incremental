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

// 紧凑开采 dock：矿脉贴图（Modernity 帧条带）+ 固定的裂纹 / 回弹 / 数字。
// 粒子统一交给 FxLayer 的 ParticleOverlay，这里不再生成逐粒子 DOM，连点多少次 DOM 都不变。
const store = useGameStore();
const info = computed(() => veinTierInfo(store.snap.pickaxe.veinTier));
const veinUrl = computed(() => veinIconUrl(store.snap.pickaxe.veinTier));

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
const crackStyle = computed(() => ({
  '--icon': `url(${fxIconUrl('destroy')})`,
  '--frames': String(fxIconFrames('destroy')),
  '--loop': `${fxIconLoopMs('destroy')}ms`,
}));

// 无尽矿脉的原版脉动（InfinityRenderer.renderPulse）；reduced-motion 时不跑
const echoEl = ref<HTMLElement | null>(null);
let pulseFrame = 0;
const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const reduced = ref(motionQuery?.matches ?? false);
const onMotionChange = (event: MediaQueryListEvent) => {
  reduced.value = event.matches;
};
motionQuery?.addEventListener('change', onMotionChange);

function gaussian(): number {
  const u = Math.random() || Number.EPSILON;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}
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
  [() => info.value?.fx, reduced],
  ([fx, isReduced]) => {
    if (pulseFrame) cancelAnimationFrame(pulseFrame);
    pulseFrame = 0;
    if (echoEl.value) echoEl.value.style.transform = '';
    if (fx === 'halo' && !isReduced) pulseFrame = requestAnimationFrame(pulse);
  },
  { immediate: true },
);

// 固定 DOM 的打击反馈：改 class / 文本重播动画，不增删节点
const hitting = ref(false);
const combo = ref(0);
let hitTimer = 0;
let comboTimer = 0;

function mine(event: MouseEvent) {
  store.manualMine(event);
  combo.value += 1;
  window.clearTimeout(comboTimer);
  comboTimer = window.setTimeout(() => {
    combo.value = 0;
  }, 900);
  if (reduced.value) return;
  const button = event.currentTarget as HTMLElement | null;
  // 先摘类、强制回流、再挂类，让同一节点的动画从头再播（直接操作 class，避开 Vue 批处理）
  button?.classList.remove('hitting');
  void button?.offsetWidth;
  button?.classList.add('hitting');
  hitting.value = true;
  window.clearTimeout(hitTimer);
  hitTimer = window.setTimeout(() => {
    hitting.value = false;
  }, 450);
}

onBeforeUnmount(() => {
  if (pulseFrame) cancelAnimationFrame(pulseFrame);
  window.clearTimeout(hitTimer);
  window.clearTimeout(comboTimer);
  motionQuery?.removeEventListener('change', onMotionChange);
});
</script>

<template>
  <section class="mine-dock" aria-label="手动开采">
    <button
      class="vein-btn"
      :class="{ hitting }"
      type="button"
      :title="`开采${store.snap.pickaxe.veinName}矿脉：每次 +${store.snap.pickaxe.outputPerClick}（M 键）`"
      :aria-label="`开采${store.snap.pickaxe.veinName}矿脉，每次 ${store.snap.pickaxe.outputPerClick}`"
      aria-keyshortcuts="M"
      data-action="mine"
      @click="mine"
    >
      <span class="vein-sprite">
        <span class="vein-stage">
          <span v-if="info?.fx === 'fuzzy'" class="vein-halo vein-halo-fuzzy" :style="fuzzyStyle">
            <span class="vein-halo-strip" />
          </span>
          <span v-if="info?.fx === 'halo'" class="vein-halo vein-halo-square" :style="haloStyle" />
          <span class="vein-clip">
            <span v-if="veinUrl" class="vein-frames" :style="spriteStyle" />
            <SpriteIcon v-else kind="vein" :size="96" />
          </span>
          <span v-if="info?.fx === 'halo'" ref="echoEl" class="vein-echo">
            <span class="vein-clip">
              <span class="vein-frames" :style="spriteStyle" />
            </span>
          </span>
          <span class="crack" :style="crackStyle" aria-hidden="true">
            <span class="crack-strip" />
          </span>
        </span>
      </span>
      <span class="vein-label">{{ store.snap.pickaxe.veinName }}矿脉</span>
      <span class="mine-gain" aria-hidden="true">
        +{{ store.snap.pickaxe.outputPerClick }}<template v-if="combo > 1"> ×{{ combo }}</template>
      </span>
    </button>
  </section>
</template>
