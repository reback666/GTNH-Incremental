<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useGameStore } from './game/store';
import FactoryPage from './pages/FactoryPage.vue';
import TechnologyPage from './pages/TechnologyPage.vue';
import SettingsPage from './pages/SettingsPage.vue';
import RebirthPage from './components/RebirthPage.vue';
import RiftDialog from './components/RiftDialog.vue';
import Sidebar from './components/Sidebar.vue';
import FxLayer from './components/FxLayer.vue';

const store = useGameStore();

const PAGES = [
  { id: 1, name: '工厂' },
  { id: 2, name: '科技' },
  { id: 3, name: '设置' },
];
const page = ref(1);
const view = ref<'factory' | 'rebirth'>('factory');
const pages = computed(() =>
  PAGES.map((item) => ({ ...item, badge: item.id === 3 && store.unseenLogErrors > 0 })),
);

function goTo(target: number) {
  if (page.value === target) return;
  page.value = target;
}

function openRebirth() {
  view.value = 'rebirth';
}

function closeRebirth() {
  view.value = 'factory';
}

// 键盘 1/2/3 换页：不在输入/组合输入/contenteditable时抢键
function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (view.value !== 'factory') return;
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (target.isContentEditable) return;
  const index = Number(event.key);
  if (Number.isInteger(index) && index >= 1 && index <= PAGES.length) {
    // 三维视图自己用数字 0 复位，焦点在场景里时不切页
    if (target.closest('[role="application"]')) return;
    event.preventDefault();
    goTo(index);
  }
}

// 主题（设置页切换，随存档走）：皮肤类挂body
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

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <RebirthPage v-if="view === 'rebirth'" @close="closeRebirth" />

  <template v-else>
    <div class="app-shell">
      <Sidebar :page="page" :pages="pages" @change="goTo" />

      <main class="page-body" :class="{ 'page-body--fixed': page === 1 }">
        <Transition name="page" mode="out-in">
          <FactoryPage v-if="page === 1" :key="1" />
          <TechnologyPage v-else-if="page === 2" :key="2" @open-rebirth="openRebirth" />
          <SettingsPage v-else :key="3" />
        </Transition>
      </main>
    </div>
  </template>

  <RiftDialog @accepted="view = 'rebirth'" />
  <FxLayer />
</template>
