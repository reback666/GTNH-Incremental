<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '../game/store';
import type { MachineKind } from '../game/core';
import { VOLTAGE_TIERS } from '../numeric/voltage';
import FactoryScene from './FactoryScene3D.vue';
import MachinePanel from './MachinePanel.vue';
import ResourceBar from './ResourceBar.vue';
import VeinPanel from './VeinPanel.vue';
import PollutionPanel from './PollutionPanel.vue';
import EnergyPanel from './EnergyPanel.vue';
import UiIcon from './UiIcon.vue';
import { modelIconUrl } from '../game/icons';
import { formatNumber } from '../numeric/format';
import MachineDetailDialog from './MachineDetailDialog.vue';
const store = useGameStore();
const emit = defineEmits<{ technology: [] }>();
const selectedKind = ref<MachineKind | 'pickaxe' | null>('miner');
const detailModelId = ref<string | null>(null);
const nodePage = ref(0);
const selectedNodeId = ref('');
const installedNodes = computed(() => store.snap.arcaneExpedition.nodes.filter(node => node.location === 'installed'));
const selectedNode = computed(() => installedNodes.value.find(node => node.id === selectedNodeId.value));
const visibleNodes = computed(() => installedNodes.value.slice(nodePage.value * 12, (nodePage.value + 1) * 12));
const sceneExpanded = ref(!window.matchMedia('(max-width: 700px), (max-height: 1000px)').matches);
function toggleScene(event: Event) {
  sceneExpanded.value = (event.currentTarget as HTMLDetailsElement).open;
}
const nextName = computed(() => store.snap.nextTier ? VOLTAGE_TIERS[store.snap.nextTier - 1] : 'MAX');
function select(kind: MachineKind) {
  selectedKind.value = kind;
}
function openDetails(modelId: string): void {
  detailModelId.value = modelId;
}
function closeDetails(): void {
  detailModelId.value = null;
}
function jumpFromDetails(kind: MachineKind): void {
  selectedKind.value = kind;
  closeDetails();
}
</script>
<template>
  <div>
  <ResourceBar />
  <div class="factory-workspace">
    <aside class="operations-dock">
      <VeinPanel />
      <EnergyPanel />
      <PollutionPanel />
      <section class="panel expansion-card voltage-unlock" aria-label="电压突破">
        <span class="eyebrow">电压突破</span>
        <h2>{{ store.snap.nextTier ? `解锁 ${nextName} 时代` : '已抵达 MAX 时代' }}</h2>
        <p>{{ store.snap.nextTier ? `需要 ${store.snap.unlockCost} 枚上一级 GT 币。` : '继续积累，探索转生与平行宇宙。' }}</p>
        <div class="expansion-progress" role="progressbar" :aria-valuenow="Math.round(store.snap.factory.nextTierProgress * 100)" aria-valuemin="0" aria-valuemax="100" aria-label="电压突破进度"><span :style="{ width: store.snap.factory.nextTierProgress * 100 + '%' }" /></div>
        <button v-if="store.snap.nextTier" type="button" class="primary" :disabled="!store.snap.canUnlock" @click="store.unlock()">解锁 {{ nextName }} <UiIcon name="arrow" :size="16" /></button>
      </section>
    </aside>
    <div class="production-workspace">
    <details class="factory-preview" :open="sceneExpanded" @toggle="toggleScene">
      <summary><span>设备场地 <span class="muted small">{{ store.snap.factory.machineCount }} 台设备</span></span><span class="muted small">{{ sceneExpanded ? '收起场地' : '展开场地' }}</span></summary>
      <FactoryScene :selected-kind="selectedKind" @select="select" />
    </details>
    <section v-if="store.snap.arcaneExpedition.active" class="panel arcane-factory" aria-label="奥术节点设施区">
      <div class="section-heading"><h2>奥术设施区</h2><button type="button" @click="emit('technology')">打开魔导手册</button></div>
      <p class="muted small">已安装 {{ installedNodes.length }} 颗节点 · 支架 {{ store.snap.arcaneExpedition.stands.length }} 座 · 调查点 {{ store.snap.arcaneExpedition.surveys.length }} 座 · 培养台 {{ store.snap.arcaneExpedition.benches.length }} 座</p>
      <div class="arcane-node-list"><button v-for="node in visibleNodes" :key="node.id" type="button" :aria-pressed="selectedNodeId === node.id" @click="selectedNodeId = node.id"><img :src="modelIconUrl('n-1')" width="36" height="36" alt="" /><span>{{ node.id }} · {{ node.tierName }}<small>{{ node.typeName }} / {{ node.qualityName }} · {{ formatNumber(node.output) }} 灵气/秒</small></span></button></div>
      <div v-if="installedNodes.length > 12" class="arcane-pages"><button type="button" :disabled="nodePage === 0" @click="nodePage--">上一页</button><span>{{ nodePage + 1 }} / {{ Math.ceil(installedNodes.length / 12) }}</span><button type="button" :disabled="(nodePage + 1) * 12 >= installedNodes.length" @click="nodePage++">下一页</button></div>
      <p v-if="selectedNode" class="small">{{ selectedNode.id }} · {{ selectedNode.aspectsText }}；灵气按工作台的优先级分配给魔法设备和附魔设备。</p>
      <p v-if="store.snap.arcaneExpedition.researchOptions.some(option => option.id === 'garden' && option.completed)" class="small">花园共生已建立，满足水与地倾向时减少培养工时。</p>
      <p v-if="store.snap.arcaneExpedition.researchOptions.some(option => option.id === 'blood' && option.completed)" class="small">血仪式设施已建立，可为丰饶培养支付额外费用增加成长。</p>
    </section>
    <section class="workshop" aria-labelledby="workshop-title">
      <div class="section-heading"><div><span class="eyebrow">建造 · 超频 · 维护</span><h2 id="workshop-title">设备工作台</h2></div><span class="muted small">{{ store.snap.factory.machineCount }} 台设备已部署</span></div>
      <MachinePanel v-model:active-kind="selectedKind" :columns="store.snap.columns" @open-details="openDetails" />
    </section>
    </div>
  </div>
  <MachineDetailDialog
    v-if="detailModelId"
    :model-id="detailModelId"
    :columns="store.snap.columns"
    @close="closeDetails"
    @jump="jumpFromDetails"
  />
  </div>
</template>

<style scoped>
.arcane-factory { padding: 14px; }
.arcane-node-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 6px; }
.arcane-node-list button { display: flex; align-items: center; gap: 8px; min-height: 48px; text-align: left; }
.arcane-node-list button[aria-pressed="true"] { outline: 2px solid var(--accent); }
.arcane-node-list img { image-rendering: pixelated; }
.arcane-node-list small { display: block; margin-top: 4px; color: var(--muted); }
.arcane-pages { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
</style>
