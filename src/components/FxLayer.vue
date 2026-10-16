<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { onFx, type FxEvent, type FxPoint } from '../game/fx';
import { ParticleOverlay, type ParticleBurst } from '../rendering/particles';

/**
 * 全屏反馈层：
 * - 文字提示：订阅常驻，与粒子是否可用无关；最多 5 条，连续挖矿合并为一条增长计数。
 * - 粒子：统一走 ParticleOverlay（WebGL）。系统 reduced-motion 实时生效：
 *   开启时销毁 overlay、清掉画布；关闭后重新创建。WebGL 不可用时只有文字。
 */

const canvasHost = ref<HTMLDivElement | null>(null);
let overlay: ParticleOverlay | null = null;
let unsubscribe: (() => void) | null = null;
const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

interface Toast {
  id: number;
  key: string;
  text: string;
  timer: number;
}
const toasts = ref<Toast[]>([]);
let toastSeq = 0;
const MAX_TOASTS = 5;
const TOAST_MS = 3200;

function removeToast(id: number) {
  const index = toasts.value.findIndex((t) => t.id === id);
  if (index < 0) return;
  window.clearTimeout(toasts.value[index]!.timer);
  toasts.value.splice(index, 1);
}

/** 同 key 的提示原地更新文字并续时，不新增条目 */
function addToast(text: string, key = '') {
  if (key) {
    const existing = toasts.value.find((t) => t.key === key);
    if (existing) {
      existing.text = text;
      window.clearTimeout(existing.timer);
      existing.timer = window.setTimeout(() => removeToast(existing.id), TOAST_MS);
      return;
    }
  }
  const id = ++toastSeq;
  const timer = window.setTimeout(() => removeToast(id), TOAST_MS);
  toasts.value.push({ id, key, text, timer });
  // 先挤掉最老的挖矿提示，保证建造/维护等反馈不被连点刷掉
  while (toasts.value.length > MAX_TOASTS) {
    const victim = toasts.value.find((t) => t.key === 'mine' && t.id !== id) ?? toasts.value[0]!;
    removeToast(victim.id);
  }
}

// 挖矿合并：1.2 秒内的连续开采累计次数
let mineCombo = 0;
let mineComboTimer = 0;

function burst(origin: FxPoint | undefined, config: Omit<ParticleBurst, 'x' | 'y'>) {
  if (!overlay || !origin) return;
  overlay.burst({ x: origin.x, y: origin.y, ...config });
}

const FIREWORK_COLORS = ['#ffd76e', '#58c4a3', '#8fd0ff', '#f0a09e'];
const pick = () => FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)]!;

function handleEvent(event: FxEvent) {
  switch (event.kind) {
    case 'voltage-unlock': {
      const w = window.innerWidth;
      const h = window.innerHeight;
      burst({ x: w * (0.3 + Math.random() * 0.4), y: h * (0.18 + Math.random() * 0.12) }, {
        count: 26, color: pick(), spread: 12, speed: 140, life: 1.1, lifeJitter: 0.15, size: 4, sizeJitter: 1.5, gravity: 0.6,
      });
      burst({ x: w * (0.25 + Math.random() * 0.5), y: h * (0.24 + Math.random() * 0.1) }, {
        count: 14, color: pick(), spread: 8, speed: 120, life: 0.9, lifeJitter: 0.1, size: 3, sizeJitter: 1, gravity: 0.6,
      });
      if (event.payload.name) addToast(`电压上限提升至 ${event.payload.name}`, 'voltage');
      break;
    }
    case 'mine': {
      burst(event.payload.origin, {
        count: 12, color: '#6ee7a8', spread: 16, vy: -80, speed: 35, life: 0.75, lifeJitter: 0.15, size: 3, sizeJitter: 1, gravity: -0.4,
      });
      mineCombo += 1;
      window.clearTimeout(mineComboTimer);
      mineComboTimer = window.setTimeout(() => {
        mineCombo = 0;
      }, 1200);
      if (event.payload.amount) {
        addToast(mineCombo > 1 ? `开采 ×${mineCombo}（每次 +${event.payload.amount}）` : `+${event.payload.amount} 矿石`, 'mine');
      }
      break;
    }
    case 'build':
      if (event.payload.count <= 0) break;
      burst(event.payload.origin, {
        count: 16, color: '#ffd76e', spread: 8, speed: 80, life: 0.6, lifeJitter: 0.1, size: 3, sizeJitter: 1, gravity: 0.8,
      });
      addToast(`建造 ${event.payload.name} ×${event.payload.count}`);
      break;
    case 'sell':
      if (event.payload.count <= 0) break;
      burst(event.payload.origin, { count: 10, color: '#8b97a7', spread: 6, speed: 60, life: 0.5, size: 2.5, gravity: 1.2 });
      addToast(`卖出 ${event.payload.name} ×${event.payload.count}`);
      break;
    case 'repair':
      if (event.payload.count <= 0) break;
      burst(event.payload.origin, {
        count: 14, color: '#58c4a3', spread: 8, speed: 70, life: 0.65, size: 3, sizeJitter: 1, gravity: 0.7,
      });
      addToast(`维护 ${event.payload.name}：修好 ${event.payload.count} 台`);
      break;
    case 'pickaxe-upgrade':
      burst(event.payload.origin, {
        count: 18, color: '#ff8c00', spread: 10, speed: 85, life: 0.7, lifeJitter: 0.12, size: 3, sizeJitter: 1, gravity: 0.6,
      });
      addToast(`${event.payload.name} 升至第 ${event.payload.level} 级`);
      break;
    case 'research-done':
      burst({ x: window.innerWidth / 2, y: window.innerHeight * 0.3 }, {
        count: 24, color: '#8fd0ff', spread: 14, speed: 110, life: 1.0, lifeJitter: 0.2, size: 4, sizeJitter: 1.5, gravity: 0.5,
      });
      addToast(`研究完成：${event.payload.name}`);
      break;
  }
}

function stopParticles() {
  overlay?.dispose();
  overlay = null;
  // dispose 之后若画布仍留在容器里，一并清掉
  if (canvasHost.value) canvasHost.value.replaceChildren();
}

function syncParticles() {
  if (motionQuery?.matches) {
    stopParticles();
  } else if (!overlay && canvasHost.value) {
    overlay = ParticleOverlay.create(canvasHost.value, 2048);
  }
}

onMounted(() => {
  // 订阅始终存在：粒子不可用时文字反馈照常
  unsubscribe = onFx(handleEvent);
  syncParticles();
  motionQuery?.addEventListener('change', syncParticles);
});

onUnmounted(() => {
  unsubscribe?.();
  motionQuery?.removeEventListener('change', syncParticles);
  window.clearTimeout(mineComboTimer);
  for (const t of toasts.value) window.clearTimeout(t.timer);
  stopParticles();
});
</script>

<template>
  <div class="fx-layer">
    <div ref="canvasHost" class="fx-canvas" aria-hidden="true" />
    <div class="fx-toasts" role="status" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="item in toasts" :key="item.id" class="fx-toast">{{ item.text }}</div>
      </TransitionGroup>
    </div>
  </div>
</template>
