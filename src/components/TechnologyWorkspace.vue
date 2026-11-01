<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useGameStore } from '../game/store';
import TechTreePanel from './TechTreePanel.vue';
import AchievementPanel from './AchievementPanel.vue';
import EnergyPanel from './EnergyPanel.vue';
import SiliconDispatchPanel from './SiliconDispatchPanel.vue';
import UiIcon from './UiIcon.vue';
import ArcaneExpeditionPanel from './ArcaneExpeditionPanel.vue';

const store = useGameStore();

type TechnologyTab = 'tech' | 'arcane' | 'energy' | 'silicon' | 'achievements';

const tab = ref<TechnologyTab>('tech');
const tabs = computed(() => [
  { id: 'tech' as const, label: '科技树', icon: 'tech' },
  ...(store.snap.arcaneExpedition.active ? [{ id: 'arcane' as const, label: '魔导手册', icon: 'layers' }] : []),
  { id: 'energy' as const, label: '电能', icon: 'power' },
  ...(store.snap.silicon.active ? [{ id: 'silicon' as const, label: 'AI 调度', icon: 'tech' }] : []),
  { id: 'achievements' as const, label: '成就', icon: 'layers' },
]);

watch(tabs, available => {
  if (!available.some(item => item.id === tab.value)) tab.value = 'tech';
}, { immediate: true });
</script>

<template>
  <div class="technology-workspace">
    <nav class="technology-tabs" role="tablist" aria-label="工程科技分类">
      <button
        v-for="item in tabs"
        :id="`technology-tab-${item.id}`"
        :key="item.id"
        type="button"
        role="tab"
        :aria-selected="tab === item.id"
        :aria-controls="`technology-panel-${item.id}`"
        :class="{ active: tab === item.id }"
        @click="tab = item.id"
      >
        <UiIcon :name="item.icon" :size="17" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <section
      :id="`technology-panel-${tab}`"
      class="technology-panel"
      role="tabpanel"
      :aria-labelledby="`technology-tab-${tab}`"
    >
      <TechTreePanel v-if="tab === 'tech'" />
      <ArcaneExpeditionPanel
        v-else-if="tab === 'arcane'"
        :state="store.snap.arcaneExpedition"
        @action="store.arcaneAction"
      />
      <EnergyPanel v-else-if="tab === 'energy'" />
      <SiliconDispatchPanel v-else-if="tab === 'silicon'" />
      <AchievementPanel v-else-if="tab === 'achievements'" />
    </section>
  </div>
</template>
