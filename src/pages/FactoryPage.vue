<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useGameStore } from '../game/store';
import ResourceBar from '../components/ResourceBar.vue';
import VeinPanel from '../components/VeinPanel.vue';
import MachinePanel from '../components/MachinePanel.vue';
import PollutionPanel from '../components/PollutionPanel.vue';
import FactoryScene from '../components/FactoryScene.vue';

// 工厂页：顶部资源带 + 左侧 3D 基地（左下角开采 dock、底部污染条）+ 右侧机器控制台
const store = useGameStore();
const selectedModelId = ref<string | null>(null);
const columns = computed(() => store.snap.columns);
const root = ref<HTMLElement | null>(null);

// M 键开采：焦点在输入框、三维视图或组合键时不抢
function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (event.key !== 'm' && event.key !== 'M') return;
  const target = event.target as HTMLElement | null;
  if (target) {
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || target.isContentEditable) return;
    if (target.closest('[role="application"]')) return;
  }
  const button = root.value?.querySelector<HTMLButtonElement>('[data-action="mine"]');
  if (!button) return;
  event.preventDefault();
  button.click();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div ref="root" class="factory-page">
    <ResourceBar class="factory-resources" />

    <div class="factory-workspace">
      <div class="factory-stage panel">
        <FactoryScene v-model:selected="selectedModelId" class="factory-stage-scene" />
        <VeinPanel class="factory-mine-dock" />
        <PollutionPanel class="factory-pollution" />
      </div>

      <aside class="factory-console panel" aria-label="机器控制台">
        <MachinePanel :columns="columns" :selected-model-id="selectedModelId" @select="selectedModelId = $event" />
      </aside>
    </div>
  </div>
</template>
