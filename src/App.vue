<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useGameStore } from './game/store';
import ResourceBar from './components/ResourceBar.vue';
import MachinePanel from './components/MachinePanel.vue';
import VeinPanel from './components/VeinPanel.vue';
import TechTreePanel from './components/TechTreePanel.vue';
import GridPanel from './components/GridPanel.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import RebirthPage from './components/RebirthPage.vue';
import RiftDialog from './components/RiftDialog.vue';
import PageNav from './components/PageNav.vue';
import AchievementPanel from './components/AchievementPanel.vue';
import LogPanel from './components/LogPanel.vue';

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

onMounted(() => {
  store.boot();
  store.start();
});
</script>

<template>
  <RebirthPage v-if="view === 'rebirth'" @close="view = 'factory'" />

  <template v-else>
    <PageNav :page="page" :pages="pages" @change="goTo" />

    <Transition name="page" mode="out-in">
      <div :key="page" class="page-body">
        <!-- 第 1 页：工厂 -->
        <template v-if="page === 1">
          <ResourceBar />
          <VeinPanel />
          <MachinePanel :columns="store.snap.columns" />
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
            <p class="muted" style="margin: 0 0 8px">
              自动每 10 秒存一次，关页面时也会存。累计矿石 {{ store.snap.totalOre }}，累计产币
              {{ store.snap.totalCoins }}。
            </p>
            <div class="row">
              <div class="name muted">重开一局（会清掉存档）</div>
              <button @click="store.reset()">重置</button>
            </div>
          </section>
          <LogPanel />
        </template>
      </div>
    </Transition>
  </template>

  <RiftDialog @accepted="view = 'rebirth'" />
</template>
