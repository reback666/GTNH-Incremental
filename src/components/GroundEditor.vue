<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { GROUND_MATERIALS, createGround, cleanGround, type GroundDesign, type GroundEdit, type GroundEditor, type GroundMaterial, type GroundTool, type SavedGroundPreset } from '../scene/factory3d/ground';

const props = defineProps<{
  design: GroundDesign; presets: SavedGroundPreset[]; enabled: boolean; active: boolean;
  canUndo: boolean; canRedo: boolean; message: string; storageError: string; hover: GroundEdit | null;
  structureName?: string;
}>();
const emit = defineEmits<{
  editor: [editor: GroundEditor]; edit: [edit: GroundEdit]; change: [design: GroundDesign];
  undo: [redo: boolean]; savePreset: [name: string]; removePreset: [id: string];
  export: []; import: [text: string];
}>();
const tool = ref<GroundTool>('floor');
const material = ref<GroundMaterial>('white-concrete');
const layer = ref(0);
const x = ref(4), z = ref(4);
const machineX = ref(props.design.machine.x), machineZ = ref(props.design.machine.z);
const presetId = ref('');
const presetName = ref('');
const importError = ref('');
const editCount = computed(() => Object.keys(props.design.cells).length);
const coordinateValid = computed(() => Number.isSafeInteger(x.value) && Number.isSafeInteger(z.value)
  && Number.isInteger(layer.value) && layer.value >= (tool.value === 'erase' ? -1 : 0) && layer.value <= 255);
watch(() => props.design.machine, machine => { machineX.value = machine.x; machineZ.value = machine.z; });
watch([tool, material, layer, () => props.enabled, () => props.active], () => {
  if (tool.value === 'block' && layer.value < 0) layer.value = 0;
  emit('editor', { tool: props.active && props.enabled ? tool.value : 'view', material: material.value,
    layer: Number.isInteger(layer.value) ? layer.value : 0 });
}, { immediate: true });
function applyPreset(event: Event) {
  presetId.value = (event.target as HTMLSelectElement).value;
  const preset = props.presets.find(item => item.id === presetId.value);
  if (preset) emit('change', cleanGround(preset.design));
  else if (presetId.value === 'grid' || presetId.value === 'preset-1') emit('change', createGround(presetId.value));
}
function applyCell() {
  if (!coordinateValid.value) return;
  emit('edit', { x: x.value, y: tool.value === 'floor' ? -1 : layer.value, z: z.value,
    material: tool.value === 'erase' ? null : material.value });
}
function moveMachine() {
  if (Number.isSafeInteger(machineX.value) && Number.isSafeInteger(machineZ.value)) {
    emit('change', { ...props.design, machine: { x: machineX.value, z: machineZ.value } });
  }
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  try { emit('import', await file.text()); importError.value = ''; }
  catch { importError.value = '文件读取失败，请重新选择。'; }
}
function savePreset() {
  if (!presetName.value.trim()) return;
  emit('savePreset', presetName.value.trim()); presetName.value = '';
}
</script>

<template>
  <div class="ground-controls">
    <div class="ground-controls-heading">
      <span>场地：{{ design.preset === 'preset-1' ? '预设一' : design.preset === 'imported' ? structureName : '16 × 16 区块' }}<small v-if="editCount"> · {{ editCount }} 处自定义</small></span>
    </div>
    <div v-if="enabled" id="ground-editor-panel" class="ground-editor" aria-label="场地编辑器">
      <div class="ground-editor-section">
        <label>应用场地 <select :value="presetId" aria-label="选择场地预设" @change="applyPreset"><option value="" disabled>选择预设…</option><option value="grid">默认 · 粉红边框 / 白色中心</option><option value="preset-1">预设一 · 原厂区地板</option><option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.name }}</option></select></label>
        <button v-if="presets.some(preset => preset.id === presetId)" type="button" @click="emit('removePreset', presetId); presetId = ''">删除此预设</button>
        <span class="ground-preset-note">应用到当前机型的整块场地</span>
      </div>
      <div class="ground-tool-row">
        <div class="ground-tools" role="group" aria-label="场地编辑工具">
          <button v-for="item in ([['view', '观察'], ['floor', '铺地'], ['block', '放方块'], ['erase', '还原 / 拆除']] as const)" :key="item[0]" type="button" :aria-pressed="tool === item[0]" @click="tool = item[0]">{{ item[1] }}</button>
        </div>
        <div class="ground-tools" role="group" aria-label="场地编辑历史"><button type="button" :disabled="!canUndo" @click="emit('undo', false)">撤销</button><button type="button" :disabled="!canRedo" @click="emit('undo', true)">重做</button></div>
      </div>
      <div v-if="tool !== 'view'" class="ground-editor-section">
        <label v-if="tool !== 'erase'">材质 <select v-model="material" aria-label="选择场地材质"><option v-for="item in GROUND_MATERIALS" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <label v-if="tool !== 'floor'">高度 <input v-model.number="layer" type="number" :min="tool === 'erase' ? -1 : 0" max="255" step="1" aria-label="方块高度" /></label>
        <span v-if="hover" class="ground-coordinate">指向 {{ hover.x }}, {{ hover.y === -1 ? '地面' : hover.y }}, {{ hover.z }}</span>
      </div>
      <form v-if="tool !== 'view'" class="ground-editor-section ground-coordinates" @submit.prevent="applyCell">
        <span>按坐标编辑</span><label>X <input v-model.number="x" type="number" step="1" aria-label="编辑方块 X 坐标" required /></label><label>Z <input v-model.number="z" type="number" step="1" aria-label="编辑方块 Z 坐标" required /></label>
        <button type="submit" :disabled="!coordinateValid">{{ tool === 'floor' ? '铺设地面' : tool === 'block' ? '放置方块' : '还原 / 拆除此格' }}</button>
      </form>
      <form class="ground-editor-section ground-coordinates" @submit.prevent="moveMachine">
        <span>整组设备位置</span><label>X <input v-model.number="machineX" type="number" step="1" aria-label="设备 X 坐标" required /></label><label>Z <input v-model.number="machineZ" type="number" step="1" aria-label="设备 Z 坐标" required /></label><button type="submit">移动整组设备</button>
      </form>
      <p class="ground-help">在预览中点击编辑，拖动可转动视角；放方块时点击已有方块可沿该面搭建。铺地更换地表，拆除地表修改会恢复当前预设。高度从地表上方 0 格开始，-1 表示地面。Esc 关闭设置，Ctrl / ⌘ + Z 撤销。</p>
      <form class="ground-editor-section ground-save-preset" @submit.prevent="savePreset"><label>存为预设 <input v-model="presetName" type="text" maxlength="40" placeholder="给场地起个名字" aria-label="场地预设名称" required /></label><button type="submit" :disabled="!presetName.trim()">保存预设</button></form>
      <div class="ground-editor-section ground-backup"><button type="button" @click="emit('export')">导出全部场地</button><label class="ground-file-button">恢复场地备份<input type="file" accept=".json,application/json" aria-label="导入场地 JSON 文件" @change="importFile" /></label><span>仅恢复本游戏导出的备份；外部蓝图使用“导入场地文件”。</span></div>
      <p class="ground-message" role="status">{{ message }}</p><p v-if="storageError || importError" class="ground-error" role="alert">{{ storageError || importError }}</p>
    </div>
    <p v-else class="ground-help ground-disabled">先建造并选择一种机器，即可编辑它的场地。</p>
  </div>
</template>

<style scoped>
.ground-controls { border-bottom: 1px solid var(--line); background: var(--panel); }
.ground-controls-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 9px 15px; font-size: 11px; }
.ground-controls-heading small, .ground-preset-note, .ground-coordinate { color: var(--muted); font-size: 10px; }
.ground-controls-heading button, .ground-editor button, .ground-file-button { min-height: 32px; padding: 5px 9px; font-size: 11px; }
.ground-editor { padding: 14px 15px; background: var(--panel-2); border-top: 1px solid var(--line); display: grid; gap: 12px; }
.ground-editor-section, .ground-tool-row, .ground-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.ground-tool-row { justify-content: space-between; }
.ground-editor label { display: inline-flex; align-items: center; flex-wrap: wrap; max-width: 100%; gap: 7px; font-size: 11px; }
.ground-editor select, .ground-editor input { min-height: 34px; max-width: 100%; padding: 5px 7px; border: 1px solid var(--line); color: var(--text); background: var(--panel); font: inherit; }
.ground-editor select { max-width: min(320px, 65vw); }
.ground-tools button[aria-pressed="true"] { color: var(--accent); outline: 1px solid var(--accent); background: var(--track); }
.ground-coordinates { font-size: 11px; }
.ground-coordinates input { width: 76px; }
.ground-save-preset input { width: min(220px, 50vw); }
.ground-help, .ground-backup span { color: var(--muted); font-size: 10px; line-height: 1.7; margin: 0; }
.ground-message, .ground-error { margin: 0; font-size: 11px; line-height: 1.6; }
.ground-message { min-height: 18px; }
.ground-error { color: var(--danger, #c34f54); padding: 0 15px 10px; }
.ground-disabled { padding: 10px 15px; }
.ground-file-button { position: relative; overflow: hidden; border: 1px solid var(--line); background: var(--panel); cursor: pointer; }
.ground-file-button input { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
.ground-file-button:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 700px) { .ground-editor { padding: 12px; } .ground-editor-section { gap: 8px; } .ground-controls button, .ground-editor input, .ground-editor select { min-height: 40px; } }
</style>
