<script setup lang="ts">
import { ref } from 'vue';
import { useGameStore } from '../game/store';
import SettingsPanel from './SettingsPanel.vue';
import LogPanel from './LogPanel.vue';
const store = useGameStore();
const importInput = ref<HTMLInputElement | null>(null);
const saveMessage = ref('');

function exportSave(): void {
  const json = store.exportSave();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  a.href = url;
  a.download = `GTNH-Incremental存档-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function onImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  // 覆盖当前进度是不可逆操作，解析前后都要用户确认
  if (!window.confirm('导入会覆盖当前存档（现有进度将丢失），确定吗？')) return;
  const text = await file.text();
  const result = store.importSave(text);
  saveMessage.value = result.message;
}

</script>
<template><div class="settings-workspace">
          <SettingsPanel />
          <section class="panel">
            <h2>统计</h2>
            <dl class="stats">
              <div v-for="row in store.snap.stats" :key="row.label" class="stat">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </section>
          <section class="panel">
            <h2>存档</h2>
            <div class="row">
              <div class="name">自动存档间隔</div>
              <input
                class="time-slider"
                type="range"
                min="5"
                max="60"
                step="1"
                :value="store.snap.autosaveSeconds"
                aria-label="自动存档间隔（秒）"
                @input="
                  store.setAutosaveSeconds(Number(($event.target as HTMLInputElement).value))
                "
              />
              <span class="count">{{ store.snap.autosaveSeconds }} 秒</span>
            </div>
            <div class="row">
              <div class="name muted">迁移存档</div>
              <button @click="exportSave">导出存档</button>
              <button @click="importInput?.click()">导入存档</button>
              <input
                ref="importInput"
                type="file"
                accept=".json,application/json"
                style="display: none"
                @change="onImportFile"
              />
            </div>
            <p v-if="saveMessage" class="muted small" style="margin: 0 0 8px">{{ saveMessage }}</p>
            <div class="row">
              <div class="name muted">重开一局（会清掉存档）</div>
              <button @click="store.reset()">重置</button>
            </div>
          </section>
          <LogPanel />
</div></template>
