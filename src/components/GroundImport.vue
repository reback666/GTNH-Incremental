<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import ImportWorker from '../scene/factory3d/ground-import.worker.ts?worker&inline';
import { GROUND_MATERIALS, type GroundMaterial } from '../scene/factory3d/ground';
import type { GroundStructure } from '../scene/factory3d/ground-structure';
import { unresolvedTerrainStates } from '../scene/factory3d/terrain-catalog';

const props = defineProps<{ canApply: boolean; previewError: string; previewReady: boolean }>();
const emit = defineEmits<{ preview: [structure: GroundStructure | null]; save: [structure: GroundStructure, apply: boolean] }>();
const structure = shallowRef<GroundStructure | null>(null);
const loading = ref(false), error = ref(''), message = ref('');
const errorBox = ref<HTMLParagraphElement | null>(null);
const title = ref('');
let worker: Worker | null = null;
let request = 0;
const missing = computed(() => structure.value ? unresolvedTerrainStates({ ...structure.value, overrides: {} }) : []);
const unresolved = computed(() => structure.value ? unresolvedTerrainStates(structure.value) : []);
const canSave = computed(() => !!structure.value && props.previewReady && !unresolved.value.length && !props.previewError && !loading.value);
function cancel() {
  request++; worker?.terminate(); worker = null; loading.value = false;
  structure.value = null; error.value = ''; emit('preview', null);
}
async function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = '';
  if (!file) return;
  cancel(); message.value = ''; title.value = file.name.replace(/\.(schem|schematic|litematic)$/i, '');
  if (!/\.(schem|schematic|litematic)$/i.test(file.name)) { error.value = '请选择 .schem、.schematic 或 .litematic 文件。'; return; }
  if (file.size > 64 * 1024 * 1024) { error.value = '文件超过 64 MB，请缩小蓝图选区。'; return; }
  loading.value = true;
  const current = ++request;
  try {
    const buffer = await file.arrayBuffer();
    if (current !== request) return;
    worker = new ImportWorker();
    worker.onmessage = (event: MessageEvent<{ structure?: GroundStructure; error?: string }>) => {
      if (current !== request) return;
      loading.value = false; worker?.terminate(); worker = null;
      if (event.data.error || !event.data.structure) { error.value = event.data.error ?? '场地读取失败。'; return; }
      structure.value = event.data.structure; title.value = structure.value.name;
      emit('preview', structure.value);
    };
    worker.onerror = () => { if (current === request) { loading.value = false; error.value = '场地读取失败，请检查文件后重试。'; worker?.terminate(); worker = null; } };
    worker.postMessage({ buffer, filename: file.name }, [buffer]);
  } catch { loading.value = false; error.value = '文件无法读取，请重新选择。'; }
}
function replace(state: string, event: Event) {
  if (!structure.value) return;
  const value = (event.target as HTMLSelectElement).value as GroundMaterial | 'skip' | '';
  const overrides = { ...structure.value.overrides };
  if (value) overrides[state] = value; else delete overrides[state];
  structure.value = { ...structure.value, overrides }; emit('preview', structure.value);
}
function save(apply: boolean) {
  if (!canSave.value || !structure.value || apply && !props.canApply) return;
  const next = { ...structure.value, name: title.value.trim().slice(0, 80) || structure.value.name };
  emit('save', next, apply); structure.value = null;
  message.value = apply ? '已保存为预设，并应用到当前机型场地。' : '已保存为场地预设，可在“自定义场地”中应用。';
}
watch(error, async value => { if (value) { await Promise.resolve(); errorBox.value?.focus(); } });
defineExpose({ cancel });
onBeforeUnmount(() => { request++; worker?.terminate(); });
</script>

<template>
  <div class="ground-import" aria-label="外部场地导入">
    <div class="ground-import-heading"><label class="ground-import-file">导入场地文件<input type="file" accept=".schem,.schematic,.litematic" aria-label="导入 Minecraft 场地文件" @change="chooseFile" /></label><span>支持 .schem / .schematic / .litematic</span><button v-if="loading || structure" type="button" @click="cancel">取消导入</button></div>
    <p v-if="loading" role="status">正在读取场地文件，可随时取消…</p>
    <p v-if="error || previewError" ref="errorBox" class="ground-import-error" role="alert" tabindex="-1">{{ error || previewError }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <div v-if="structure" class="ground-import-preview" aria-label="场地文件预览">
      <label>预设名称 <input v-model="title" type="text" maxlength="80" aria-label="导入场地预设名称" /></label>
      <p>{{ structure.format }} · {{ structure.size.join(' × ') }} 格 · {{ structure.blockCount.toLocaleString() }} 个方块<span v-if="structure.regions > 1"> · {{ structure.regions }} 个区域</span></p>
      <p>预览区显示导入场地，同型号机器仍全部呈现；保存或应用后才会写入本地预设。</p>
      <p v-if="!previewReady && !previewError" role="status">正在准备 3D 预览…</p>
      <div v-if="missing.length" class="ground-import-missing">
        <p>以下方块暂不能原样显示，预览中以粉红色线框标出。请选择替换材质，或明确跳过。</p>
        <label v-for="state in missing" :key="state"><span>{{ state }}</span><select :value="structure.overrides[state] ?? ''" :aria-label="`替换方块 ${state}`" @change="replace(state, $event)"><option value="">请选择处理方式…</option><option value="skip">不导入此方块</option><option v-for="material in GROUND_MATERIALS" :key="material.id" :value="material.id">替换为{{ material.name }}</option></select></label>
      </div>
      <div class="ground-import-actions"><button type="button" :disabled="!canSave" @click="save(false)">保存为预设</button><button type="button" class="primary" :disabled="!canSave || !canApply" @click="save(true)">应用到当前机型</button><span v-if="unresolved.length">还有 {{ unresolved.length }} 种方块待处理</span></div>
    </div>
  </div>
</template>

<style scoped>
.ground-import { padding: 10px 15px; border-bottom: 1px solid var(--line); background: var(--panel-2); font-size: 11px; }
.ground-import-heading, .ground-import-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.ground-import-file { position: relative; overflow: hidden; display: inline-flex; align-items: center; min-height: 34px; padding: 5px 10px; border: 1px solid var(--line); background: var(--panel); cursor: pointer; }
.ground-import-file input { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; }
.ground-import-file:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.ground-import-heading > span, .ground-import-preview p, .ground-import-actions span { color: var(--muted); line-height: 1.7; }
.ground-import-preview { display: grid; gap: 10px; margin-top: 12px; }
.ground-import p { margin: 8px 0 0; line-height: 1.7; }
.ground-import-preview label { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.ground-import-preview input, .ground-import-preview select { max-width: 100%; min-height: 34px; padding: 5px 7px; font: inherit; color: var(--text); background: var(--panel); border: 1px solid var(--line); }
.ground-import-preview input { width: min(300px, 60vw); }
.ground-import-missing { display: grid; gap: 10px; max-height: 220px; overflow-y: auto; padding: 10px; background: var(--panel); border: 1px solid var(--line); }
.ground-import-missing label > span { flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere; font-family: var(--font-num); font-size: 10px; }
.ground-import-missing select { max-width: min(300px, 75vw); }
.ground-import button { min-height: 34px; padding: 5px 10px; font-size: 11px; }
.ground-import-error { color: var(--danger, #c34f54); }
@media (max-width: 700px) { .ground-import button, .ground-import-file, .ground-import-preview input, .ground-import-preview select { min-height: 40px; } }
</style>
