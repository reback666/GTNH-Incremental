<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useGameStore } from '../game/store';
import { useMotion } from '../composables/useMotion';
import { MACHINE_MODELS } from '../game/models';
import { sceneModelState } from '../scene/factory3d/state';
import type { FactoryView } from '../scene/factory3d/renderer.js';

const props = defineProps<{ modelId: string; running: number; activity: number }>();
const store = useGameStore();
const motion = useMotion();
const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref('');
let view: FactoryView | null = null;
let disposed = false;

const model = computed(() => MACHINE_MODELS.find(item => item.id === props.modelId) ?? null);
const state = computed(() => {
  if (!model.value) return null;
  return sceneModelState(model.value, store.snap.factory, 1, props.running > 0 ? 1 : 0, props.activity);
});

function update(): void {
  if (!view || !state.value) return;
  view.update([state.value], motion.active.value && !motion.reduced.value, {}, 1);
  view.select(state.value.id, 0);
}

watch([state, () => motion.active.value], update, { flush: 'post' });

onMounted(async () => {
  if (!canvas.value || !state.value) return;
  try {
    const { createFactoryView } = await import('../scene/factory3d/renderer.js');
    if (disposed || !canvas.value) return;
    view = await createFactoryView(canvas.value, () => {}, () => {}, { preview: true });
    if (disposed) {
      view.dispose();
      view = null;
      return;
    }
    view.setVisible(true);
    update();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '模型预览加载失败';
  }
});

onUnmounted(() => {
  disposed = true;
  view?.dispose();
  view = null;
});
</script>

<template>
  <div class="machine-model-preview" :class="{ failed: error }">
    <canvas ref="canvas" tabindex="0" aria-label="机器模型预览，可拖动旋转、滚轮缩放，按 R 复位视角" />
    <div v-if="error" class="machine-model-fallback">
      <span class="machine-model-fallback-icon">{{ model?.name?.slice(0, 1) ?? '?' }}</span>
      <strong>{{ model?.name ?? '机器模型' }}</strong>
      <small>{{ error }}</small>
    </div>
    <span class="machine-model-hint">自动旋转 · 拖动查看 · 滚轮缩放 · R 复位</span>
  </div>
</template>

<style scoped>
.machine-model-preview {
  position: relative;
  min-height: 360px;
  height: min(58vh, 520px);
  overflow: hidden;
  background: linear-gradient(160deg, rgba(20, 29, 38, 0.98), rgba(8, 13, 18, 0.98));
  border: 1px solid var(--line);
}
.machine-model-preview canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.machine-model-hint {
  position: absolute;
  left: 12px;
  bottom: 10px;
  color: var(--muted);
  font-size: 11px;
  pointer-events: none;
}
.machine-model-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  color: var(--muted);
  background: var(--panel-2);
}
.machine-model-fallback-icon {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 36px;
}
.machine-model-fallback strong { color: var(--text); }
.machine-model-fallback small { max-width: 240px; text-align: center; }
@media (max-width: 700px) {
  .machine-model-preview { min-height: 240px; height: 38vh; }
}
</style>
