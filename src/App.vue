<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useGameStore } from './game/store';
import ResourceBar from './components/ResourceBar.vue';
import MachinePanel from './components/MachinePanel.vue';
import VeinPanel from './components/VeinPanel.vue';
import PollutionPanel from './components/PollutionPanel.vue';
import TechTreePanel from './components/TechTreePanel.vue';
import GridPanel from './components/GridPanel.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import RebirthPage from './components/RebirthPage.vue';
import RiftDialog from './components/RiftDialog.vue';
import Sidebar from './components/Sidebar.vue';
import AchievementPanel from './components/AchievementPanel.vue';
import LogPanel from './components/LogPanel.vue';
import FxLayer from './components/FxLayer.vue';

const store = useGameStore();
// 工厂的内容分三页，右边点页码换页；转生是独立页面，不在页码里
const PAGES = [
  { id: 1, name: '工厂' },
  { id: 2, name: '科技' },
  { id: 3, name: '设置' },
];
const page = ref(1);
const view = ref<'factory' | 'rebirth'>('factory');
const rebirth = computed(() => store.snap.rebirth);
// 设置页上有没看过的错误记录时，页码按钮上挂一个小红点
const pages = computed(() =>
  PAGES.map((item) => ({ ...item, badge: item.id === 3 && store.unseenLogErrors > 0 })),
);

function goTo(target: number) {
  if (page.value === target) return;
  page.value = target;
  // 换页之后停在上一页的滚动位置会很迷惑，直接回到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── 存档导入导出 ──────────────────────────────────────────
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
  a.download = `GTNH增量存档-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
  a.click();
  URL.revokeObjectURL(url);
  saveMessage.value = '已导出为 JSON 文件（在浏览器下载目录里）';
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

// 键盘 1/2/3 直接换页：输入框里打字时不触发
function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || view.value !== 'factory') return;
  const target = event.target as HTMLElement | null;
  if (target && /^(input|select|textarea)$/i.test(target.tagName)) return;
  const index = Number(event.key);
  if (index >= 1 && index <= PAGES.length) {
    goTo(index);
    // 焦点还留在旧页码按钮上的话，键盘操作会让它一直挂着聚焦描边（绿框），
    // 换完页就把它清掉
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
}

// 界面主题（设置页切换，随存档走）：皮肤类挂在 body 上，全站样式跟着换
watch(
  () => store.snap.uiTheme,
  (theme) => {
    document.body.classList.toggle('skin-light', theme === 'light');
    document.body.classList.toggle('theme-classic', theme === 'classic');
  },
  { immediate: true },
);

onMounted(() => {
  store.boot();
  store.start();
  window.addEventListener('keydown', onKeydown);
});
</script>

<template>
  <RebirthPage v-if="view === 'rebirth'" @close="view = 'factory'" />

  <template v-else>
    <!-- 桌面双栏：左侧仪表侧栏（铭牌 / 页签 / 电能 / 研究）+ 右侧内容区 -->
    <div class="app-shell">
      <Sidebar :page="page" :pages="pages" @change="goTo" />

      <main class="page-body">
        <Transition name="page" mode="out-in">
          <div :key="page">
        <!-- 第 1 页：工厂 -->
        <template v-if="page === 1">
          <ResourceBar />
          <VeinPanel />
          <MachinePanel :columns="store.snap.columns" />
          <PollutionPanel />
        </template>

        <!-- 第 2 页：科技、电网、转生 -->
        <template v-else-if="page === 2">
          <TechTreePanel />
          <GridPanel />
          <section class="panel">
            <div class="row">
              <div class="name">
                <b>转生</b>
                <span class="muted small">
                  · 时空线缆 {{ rebirth.cables }} 条 · 已转生 {{ rebirth.count }} 次</span
                >
                <span v-if="rebirth.pendingUniverseName" class="muted small">
                  · 下次转生带上 {{ rebirth.pendingUniverseName }}</span
                >
                <span v-if="rebirth.universes.length" class="muted small">
                  · 已有宇宙 {{ rebirth.universes.join('、') }}</span
                >
              </div>
              <button
                :class="{ primary: rebirth.canRebirth || rebirth.riftPending }"
                @click="view = 'rebirth'"
              >
                {{ rebirth.canRebirth || rebirth.riftPending ? '去转生' : '查看转生' }}
              </button>
            </div>
          </section>
          <AchievementPanel />
        </template>

        <!-- 第 3 页：设置与存档 -->
        <template v-else>
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
        </template>
          </div>
        </Transition>
      </main>
    </div>
  </template>

  <RiftDialog @accepted="view = 'rebirth'" />

  <!-- 全屏特效层：电压解锁烟花（不挡操作） -->
  <FxLayer />
</template>
