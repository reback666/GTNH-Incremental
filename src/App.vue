<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useGameStore } from './game/store';
import { useMotion } from './composables/useMotion';
import { VOLTAGE_TIERS } from './numeric/voltage';
import Sidebar from './components/Sidebar.vue';
import FactoryWorkspace from './components/FactoryWorkspace.vue';
import TechnologyWorkspace from './components/TechnologyWorkspace.vue';
import SettingsWorkspace from './components/SettingsWorkspace.vue';
import RebirthPage from './components/RebirthPage.vue';
import RiftDialog from './components/RiftDialog.vue';
import FxLayer from './components/FxLayer.vue';
import UiIcon from './components/UiIcon.vue';
import OfflineCatchupDialog from './components/OfflineCatchupDialog.vue';

const store = useGameStore();
const motion = useMotion();
const page = ref(1);
const pageBody = ref<HTMLElement | null>(null);
const PAGES = [
  { id: 1, name: '工厂总览', shortName: '工厂', icon: 'factory', subtitle: '从一块矿石，到一整个工业文明。' },
  { id: 2, name: '工程科技', shortName: '工程科技', icon: 'tech', subtitle: '跨越电压等级，拓展生产的边界。' },
  { id: 4, name: '时空星图', shortName: '星图', icon: 'rift', subtitle: '重启时间线，把这一轮积累带向下一个宇宙。' },
  { id: 3, name: '设置与存档', shortName: '设置', icon: 'settings', subtitle: '按你的习惯配置控制台，管理本地进度。' },
];
const pages = computed(() => PAGES.map(item => ({ ...item, badge: item.id === 3 && store.unseenLogErrors > 0 })));
const current = computed(() => PAGES.find(item => item.id === page.value)!);
const tierName = computed(() => VOLTAGE_TIERS[store.snap.maxTier - 1]);
function goTo(target: number) {
  if (page.value === target) return;
  page.value = target;
  const behavior = motion.active.value ? 'smooth' : 'auto';
  pageBody.value?.scrollTo({ top: 0, behavior });
  window.scrollTo({ top: 0, behavior });
}
function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('input,select,textarea,[contenteditable="true"],[role="dialog"]')) return;
  if (/^[1234]$/.test(event.key)) goTo(Number(event.key));
}
watch(() => store.snap.uiTheme, theme => {
  document.body.classList.toggle('skin-light', theme === 'light');
  document.body.classList.toggle('theme-classic', theme === 'classic');
}, { immediate: true });
watch(motion.active, active => document.body.classList.toggle('motion-off', !active), { immediate: true });
onMounted(() => { store.boot(); store.start(); window.addEventListener('keydown', onKeydown); });
onUnmounted(() => { store.stop(); window.removeEventListener('keydown', onKeydown); });
</script>

<template>
  <div class="app-shell">
    <Sidebar :page="page" :pages="pages" @change="goTo" />
    <main ref="pageBody" class="page-body">
      <header class="workspace-header">
        <div><span class="eyebrow">工业控制台 <span class="header-separator">/</span> {{ tierName }} 时代</span><h1>{{ current.name }}</h1><p>{{ current.subtitle }}</p></div>
        <div class="header-status"><span :class="{ danger: store.snap.power.ratioShort }"><UiIcon name="power" :size="16" />供电 {{ store.snap.power.ratio }}</span>
          <button type="button" class="era-link" @click="goTo(2)">{{ tierName }} <UiIcon name="arrow" :size="16" /></button>
        </div>
      </header>
      <div v-if="store.catchingUp" class="catchup-status" role="status"><span>正在补算生产进度</span><progress :value="store.catchUpProgress" max="1" /><b>{{ Math.round(store.catchUpProgress * 100) }}%</b></div>
      <div class="workspace-content" :inert="store.catchingUp || undefined" :aria-busy="store.catchingUp">
        <Transition name="page" mode="out-in">
          <KeepAlive>
            <FactoryWorkspace v-if="page === 1" @technology="goTo(2)" />
            <TechnologyWorkspace v-else-if="page === 2" />
            <RebirthPage v-else-if="page === 4" @close="goTo(1)" />
            <SettingsWorkspace v-else />
          </KeepAlive>
        </Transition>
      </div>
    </main>
  </div>
  <RiftDialog @accepted="goTo(4)" />
  <OfflineCatchupDialog />
  <FxLayer />
</template>
