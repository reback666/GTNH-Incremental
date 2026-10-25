<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; tab: 'edit' | 'import'; modelName: string; count: number }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; 'update:tab': [tab: 'edit' | 'import'] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const scrollStyles = new Map<HTMLElement, string>();
let returnFocus: HTMLElement | null = null;

function unlockScroll() {
  for (const [element, overflow] of scrollStyles) element.style.overflow = overflow;
  scrollStyles.clear();
}
function close() { emit('update:open', false); }
function closed() {
  if (dialog.value?.open) return;
  unlockScroll(); emit('update:open', false);
  const target = returnFocus; returnFocus = null;
  nextTick(() => { if (target?.isConnected) target.focus({ preventScroll: true }); });
}
function tabKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tab = event.key === 'Home' ? 'edit' : event.key === 'End' ? 'import' : props.tab === 'edit' ? 'import' : 'edit';
  emit('update:tab', tab);
  nextTick(() => dialog.value?.querySelector<HTMLButtonElement>(`[data-settings-tab="${tab}"]`)?.focus());
}
watch(() => props.open, async open => {
  await nextTick();
  if (open !== props.open) return;
  const element = dialog.value;
  if (!element) return;
  if (open && !element.open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    for (const target of [document.documentElement, document.body, document.querySelector<HTMLElement>('.page-body')]) {
      if (target) { scrollStyles.set(target, target.style.overflow); target.style.overflow = 'hidden'; }
    }
    element.showModal();
  } else if (!open && element.open) { unlockScroll(); element.close(); }
}, { immediate: true });
onBeforeUnmount(() => { dialog.value?.close(); unlockScroll(); });
</script>

<template>
  <dialog id="ground-settings-dialog" ref="dialog" class="ground-settings-dialog" aria-labelledby="ground-settings-title" @cancel.prevent="close" @close="closed" @click="event => event.target === dialog && close()">
    <header class="ground-settings-heading">
      <div><h2 id="ground-settings-title">场地设置</h2><p>{{ modelName ? `${modelName} · ${count} 台共用此场地` : '导入并保存场地预设' }}</p></div>
      <button type="button" class="ground-settings-close" autofocus @click="close">完成设置</button>
    </header>
    <div class="ground-settings-body">
      <aside class="ground-settings-sidebar">
        <div class="ground-settings-tabs" role="tablist" aria-label="场地设置内容" @keydown="tabKey">
          <button id="ground-tab-edit" type="button" role="tab" data-settings-tab="edit" :aria-selected="tab === 'edit'" :tabindex="tab === 'edit' ? 0 : -1" aria-controls="ground-settings-edit" @click="emit('update:tab', 'edit')">自定义场地</button>
          <button id="ground-tab-import" type="button" role="tab" data-settings-tab="import" :aria-selected="tab === 'import'" :tabindex="tab === 'import' ? 0 : -1" aria-controls="ground-settings-import" @click="emit('update:tab', 'import')">导入场地</button>
        </div>
        <div class="ground-settings-scroll">
          <div v-show="tab === 'edit'" id="ground-settings-edit" role="tabpanel" aria-labelledby="ground-tab-edit"><slot name="edit" /></div>
          <div v-show="tab === 'import'" id="ground-settings-import" role="tabpanel" aria-labelledby="ground-tab-import"><slot name="import" /></div>
        </div>
      </aside>
      <div class="ground-settings-preview"><slot name="preview" /></div>
    </div>
  </dialog>
</template>

<style scoped>
.ground-settings-dialog { width: min(1320px, calc(100vw - 32px)); height: min(860px, calc(100dvh - 32px)); max-width: none; max-height: none; padding: 0; margin: auto; color: var(--text); background: var(--panel); border: 2px solid var(--line); font: inherit; box-shadow: 0 24px 80px #0008; }
.ground-settings-dialog[open] { display: flex; flex-direction: column; }
.ground-settings-dialog::backdrop { background: #080d18b8; }
.ground-settings-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-shrink: 0; padding: 15px 18px; border-bottom: 1px solid var(--line); background: var(--panel-2); }
.ground-settings-heading > div { min-width: 0; }
.ground-settings-heading h2 { margin: 0; font-size: 16px; }
.ground-settings-heading p { margin: 6px 0 0; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
.ground-settings-close { flex-shrink: 0; min-height: 38px; padding: 6px 12px; font-size: 12px; }
.ground-settings-body { display: grid; grid-template-columns: 360px minmax(0, 1fr); flex: 1; min-height: 0; }
.ground-settings-sidebar { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--line); }
.ground-settings-tabs { display: flex; gap: 8px; padding: 12px; border-bottom: 1px solid var(--line); }
.ground-settings-tabs button { flex: 1; min-height: 36px; font-size: 12px; }
.ground-settings-tabs button[aria-selected="true"] { color: var(--accent); outline: 1px solid var(--accent); background: var(--track); }
.ground-settings-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.ground-settings-preview { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--panel-2); }
@media (max-width: 1000px) { .ground-settings-body { grid-template-columns: 310px minmax(0, 1fr); } }
@media (max-width: 700px) {
  .ground-settings-dialog { width: 100vw; height: 100dvh; border: 0; }
  .ground-settings-heading { padding: 12px; }
  .ground-settings-body { display: flex; flex-direction: column; }
  .ground-settings-preview { order: -1; height: 35dvh; min-height: 210px; flex-shrink: 0; border-bottom: 1px solid var(--line); }
  .ground-settings-sidebar { flex: 1; border-right: 0; }
  .ground-settings-tabs { padding: 10px 12px; }
  .ground-settings-tabs button, .ground-settings-close { min-height: 42px; }
}
</style>
