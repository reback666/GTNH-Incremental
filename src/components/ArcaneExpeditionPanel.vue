<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Decimal, dec } from '../numeric/decimal';
import { formatNumber } from '../numeric/format';
import { modelIconUrl } from '../game/icons';
import { coinName, paymentTier } from '../numeric/credit';
import {
  ARCANE_ASPECTS, ARCANE_QUALITIES, ARCANE_REGIONS, ARCANE_TYPES,
  type ArcaneActionView, type ArcaneCommand, type ArcaneJobOption,
  type ArcaneRegion, type ArcaneTarget, type ArcaneView,
} from '../game/arcane-expedition';

const props = defineProps<{ state: ArcaneView }>();
const emit = defineEmits<{ action: [command: ArcaneCommand] }>();
const tab = ref('nodes');
const tabs = [{ id: 'nodes', label: '节点与安装' }, { id: 'surveys', label: '地区调查' }, { id: 'work', label: '培养作业' }, { id: 'research', label: '魔导研究' }, { id: 'codex', label: '见闻图鉴' }];
const buildIndex = ref(0);
const selected = ref<string[]>([]);
const detailId = ref('');
const compareId = ref('');
const filter = ref('all');
const nodePage = ref(0);
const standPage = ref(0);
const PAGE_SIZE = 24;
const confirmDiscard = ref(false);
const confirmAbandon = ref('');
const drafts = reactive<Record<string, { region: ArcaneRegion; tier: number; target: number }>>({});
const workChoice = reactive<Record<string, string>>({});
const workCount = reactive<Record<string, number>>({});
const detail = computed(() => props.state.nodes.find(n => n.id === detailId.value));
const compare = computed(() => props.state.nodes.find(n => n.id === compareId.value));
const visibleNodes = computed(() => props.state.nodes.filter(n => filter.value === 'all' || n.location === filter.value));
const pageCount = computed(() => Math.max(1, Math.ceil(visibleNodes.value.length / PAGE_SIZE)));
const pageNodes = computed(() => visibleNodes.value.slice(nodePage.value * PAGE_SIZE, (nodePage.value + 1) * PAGE_SIZE));
const pageStands = computed(() => props.state.stands.slice(standPage.value * PAGE_SIZE, (standPage.value + 1) * PAGE_SIZE));
const standNodes = computed(() => new Map(props.state.nodes.filter(node => node.standId).map(node => [node.standId, node.id])));
watch(filter, () => { nodePage.value = 0; });
watch(pageCount, count => { nodePage.value = Math.min(nodePage.value, count - 1); });
const chosenNodes = computed(() => props.state.nodes.filter(n => selected.value.includes(n.id)));
const canPack = computed(() => props.state.active && chosenNodes.value.length > 0 && chosenNodes.value.every(n => n.location === 'candidate' && !n.busy && n.actions.find(a => a.command.type === 'pack')?.enabled));
const canDiscard = computed(() => props.state.active && chosenNodes.value.length > 0 && chosenNodes.value.every(n => !n.protected && !n.busy && n.location !== 'installed'));
const buildAction = computed(() => props.state.buildOptions[buildIndex.value]);

watch(() => props.state.surveys, surveys => {
  for (const survey of surveys) if (!drafts[survey.id]) drafts[survey.id] = { region: survey.region, tier: survey.nodeTier, target: props.state.targets.findIndex(t => JSON.stringify(t.target) === JSON.stringify(survey.target)) };
}, { immediate: true });
watch(() => props.state.nodes.map(n => n.id), ids => { selected.value = selected.value.filter(id => ids.includes(id)); });
watch(() => props.state.benches, benches => {
  for (const bench of benches) {
    if (!bench.options.some(o => optionKey(o) === workChoice[bench.id])) workChoice[bench.id] = bench.options[0] ? optionKey(bench.options[0]) : '';
    const choice = selectedWork(bench.id);
    if (!choice?.batches.some(b => b.count === workCount[bench.id])) workCount[bench.id] = 1;
  }
}, { immediate: true });
watch(selected, () => { confirmDiscard.value = false; });

function number(value: string): string { return formatNumber(dec(value), { significantDigits: 5 }); }
function percent(value: string): string { return dec(value).times(100).toFixed(1); }
function minutes(value: string | number): string { return dec(String(value)).div(60).toDecimalPlaces(1).toString(); }
function progress(work: string, total: string | number): number { return Decimal.min(100, dec(work).div(String(total)).times(100)).toNumber(); }
function prices(action: ArcaneActionView): string {
  return action.costs.length ? action.costs.map(c => `${number(c.amount)} ${coinName(paymentTier(c.tier))}`).join(' ＋ ') : '无需付款';
}
function dispatch(action: ArcaneActionView): void { if (action.enabled) emit('action', action.command); }
function configure(id: string): void {
  const draft = drafts[id];
  if (!draft) return;
  const target: ArcaneTarget | null = props.state.targets[draft.target]?.target ?? null;
  emit('action', { type: 'configure-survey', surveyId: id, region: draft.region, tier: draft.tier, target });
}
function toggleSelection(id: string): void { selected.value = selected.value.includes(id) ? selected.value.filter(i => i !== id) : [...selected.value, id]; }
function bulkDiscard(): void {
  if (!canDiscard.value) return;
  if (!confirmDiscard.value) { confirmDiscard.value = true; return; }
  emit('action', { type: 'discard', nodeIds: [...selected.value] }); selected.value = []; confirmDiscard.value = false;
}
function optionKey(option: ArcaneJobOption): string { return JSON.stringify(option.command); }
function selectedWork(id: string): ArcaneJobOption | undefined {
  const options = props.state.benches.find(b => b.id === id)?.options ?? [];
  return options.find(o => optionKey(o) === workChoice[id]) ?? options[0];
}
function selectedBatch(id: string) {
  const option = selectedWork(id);
  return option?.batches.find(b => b.count === (workCount[id] ?? 1)) ?? option?.batches[0];
}
function enqueue(id: string): void {
  const option = selectedWork(id);
  const batch = selectedBatch(id);
  if (!option || !batch?.enabled || option.command.type !== 'enqueue') return;
  emit('action', { ...option.command, count: batch.count });
}
function cancel(benchId: string, jobId: string, started: boolean): void {
  if (started && confirmAbandon.value !== jobId) { confirmAbandon.value = jobId; return; }
  emit('action', { type: 'cancel-job', benchId, jobId }); confirmAbandon.value = '';
}
const taskLabels: Record<string, string> = { 'safe-pack': '稳妥封装', repair: '质量修复', cultivate: '稳定培养', abundant: '丰饶培养', attune: '要素调谐', 'upgrade-node': '节点升阶', purify: '污染净化', assimilate: '受控同化' };
</script>

<template>
  <section class="arcane-panel" aria-label="奥术节点与魔导手册">
    <header class="heading">
      <div><h2>奥术节点 · 魔导手册</h2><p>调查、选择与培养，为现有灵气网络增加供能。</p></div>
      <div class="readings"><strong>{{ number(state.vis) }} 灵气/秒</strong><span>设施额定需求 {{ number(state.energy) }} EU/t</span><span>本轮评估 {{ state.evaluated }} 颗</span></div>
    </header>
    <p v-if="!state.active" class="notice" role="status">奥术宇宙尚未激活，节点、调查与作业均已暂停。</p>
    <div class="aspect-grid" aria-label="在线节点的加权要素比例">
      <span v-for="aspect in state.aspects" :key="aspect.id" :title="aspect.effect">{{ aspect.name }} <b>{{ percent(aspect.share) }}%</b></span>
    </div>
    <p class="network-note">魔法制造 ×{{ number(state.network.fireMultiplier) }} · 魔法采矿 ×{{ number(state.network.earthMultiplier) }} · 灵气需求 ×{{ number(state.network.demandMultiplier) }}</p>
    <nav class="tabs" aria-label="魔导手册分类"><button v-for="item in tabs" :key="item.id" type="button" :class="{ active: tab === item.id }" :aria-pressed="tab === item.id" @click="tab = item.id">{{ item.label }}</button></nav>

    <div v-if="tab === 'nodes'" class="section-body">
      <div class="build-row">
        <label>购买节点或建设设施<select v-model="buildIndex" :disabled="!state.active"><option v-for="(action, index) in state.buildOptions" :key="index" :value="index">{{ action.label }}</option></select></label>
        <div v-if="buildAction"><p>{{ prices(buildAction) }}</p><button type="button" :disabled="!buildAction.enabled" :title="buildAction.reason" @click="dispatch(buildAction)">{{ buildAction.enabled ? '确认购买' : buildAction.reason }}</button></div>
      </div>
      <p class="muted">固定购买的普通标准节点规模为 50；支架可重复使用。污染节点需要封闭配套。</p>
      <div class="toolbar">
        <label>筛选<select v-model="filter"><option value="all">全部节点</option><option value="candidate">调查候选</option><option value="jar">缸中节点</option><option value="installed">正在安装</option><option value="packing">待稳妥封装</option></select></label>
        <button type="button" @click="selected = pageNodes.map(n => n.id)">选择当前页</button>
        <button type="button" :disabled="!selected.length" @click="selected = []">取消选择</button>
        <button type="button" :disabled="!canPack" @click="emit('action', { type: 'pack', nodeIds: [...selected] })">普通封装 {{ chosenNodes.length }} 颗</button>
        <button type="button" :disabled="!canDiscard" @click="bulkDiscard">{{ confirmDiscard ? '确认放弃所选节点（不可恢复）' : '放弃所选' }}</button>
      </div>
      <p v-if="canPack" class="muted">普通封装逐颗收取各自等级的 0.10 倍首台制造机价格；每颗有 5% 概率降一级质量。稳妥封装请在培养作业选择。</p>
      <div class="node-grid">
        <article v-for="node in pageNodes" :key="node.id" class="node-card" :class="{ selected: node.id === detailId }">
          <img :src="modelIconUrl('n-1')" width="48" height="48" alt="灵气节点原生物品图标" style="image-rendering: pixelated; float: right;" />
          <label class="select-node"><input type="checkbox" :checked="selected.includes(node.id)" @change="toggleSelection(node.id)"><span>{{ node.tierName }} · {{ node.typeName }} · {{ node.qualityName }}</span></label>
          <button class="node-detail-button" type="button" @click="detailId = node.id"><strong>{{ node.id }} · 规模 {{ node.size }}</strong><span>{{ node.status }}</span><span>{{ number(node.output) }} 灵气/秒 · 培养 {{ node.cultivations }}/10 · 同化 {{ node.assimilations }}/5</span></button>
          <p class="muted">{{ node.aspectsText }}</p>
          <div class="button-row"><button type="button" :disabled="!state.active" :aria-pressed="node.protected" @click="emit('action', { type: 'protect', nodeId: node.id, value: !node.protected })">{{ node.protected ? '已保护 · 取消保护' : '收藏保护' }}</button><button v-for="(action, i) in node.actions" :key="i" type="button" :disabled="!action.enabled" :title="action.reason || prices(action)" @click="dispatch(action)">{{ action.label }}<small v-if="action.costs.length">{{ prices(action) }}</small></button></div>
        </article>
      </div>
      <nav v-if="pageCount > 1" class="toolbar" aria-label="节点分页"><button type="button" :disabled="nodePage === 0" @click="nodePage--">上一页</button><span>{{ nodePage + 1 }} / {{ pageCount }} 页 · {{ visibleNodes.length }} 颗</span><button type="button" :disabled="nodePage >= pageCount - 1" @click="nodePage++">下一页</button></nav>
      <p v-if="!visibleNodes.length" class="muted">暂无此类节点。完成魔导入门可获得第一颗节点。</p>
      <aside v-if="detail" class="detail" aria-label="节点详情与比较">
        <div class="heading"><h3>{{ detail.id }} · {{ detail.typeName }} / {{ detail.qualityName }}</h3><button type="button" @click="detailId = ''">关闭详情</button></div>
        <p>{{ detail.aspectsText }}</p><p>额定供能 {{ number(detail.potentialOutput) }}，当前 {{ number(detail.output) }} 灵气/秒；{{ ARCANE_TYPES.find(t => t.id === detail?.type)?.effect }}</p>
        <p v-if="detail.stopWarning" class="notice">{{ detail.stopWarning }}</p>
        <label>与另一颗节点比较<select v-model="compareId"><option value="">选择比较对象</option><option v-for="node in state.nodes.filter(n => n.id !== detail?.id)" :key="node.id" :value="node.id">{{ node.id }} · {{ node.typeName }} · 规模 {{ node.size }}</option></select></label>
        <div v-if="compare" class="compare-table"><table><thead><tr><th>属性</th><th>{{ detail.id }}</th><th>{{ compare.id }}</th></tr></thead><tbody><tr><th>类型 / 质量</th><td>{{ detail.typeName }} / {{ detail.qualityName }}</td><td>{{ compare.typeName }} / {{ compare.qualityName }}</td></tr><tr><th>规模 / 培养</th><td>{{ detail.size }} / {{ detail.cultivations }} 次</td><td>{{ compare.size }} / {{ compare.cultivations }} 次</td></tr><tr><th>额定灵气/秒</th><td>{{ number(detail.potentialOutput) }}</td><td>{{ number(compare.potentialOutput) }}</td></tr><tr><th>要素</th><td>{{ detail.aspectsText }}</td><td>{{ compare.aspectsText }}</td></tr></tbody></table></div>
      </aside>
      <details><summary>支架（{{ state.stands.length }}）</summary><ul class="stand-list"><li v-for="stand in pageStands" :key="stand.id"><span>{{ stand.id }} · {{ state.tiers.find(t => t.tier === stand.tier)?.name }} · {{ stand.enclosed ? '封闭配套' : '普通' }} · {{ standNodes.get(stand.id) ?? '空闲' }}</span><button v-if="!stand.enclosed" type="button" :disabled="!state.active" @click="emit('action', { type: 'enclose-stand', standId: stand.id })">加装封闭配套（0.30 倍同级首台制造机价）</button></li></ul><nav v-if="state.stands.length > PAGE_SIZE" class="toolbar" aria-label="支架分页"><button type="button" :disabled="standPage === 0" @click="standPage--">上一页</button><span>{{ standPage + 1 }} / {{ Math.ceil(state.stands.length / PAGE_SIZE) }} 页</span><button type="button" :disabled="(standPage + 1) * PAGE_SIZE >= state.stands.length" @click="standPage++">下一页</button></nav></details>
    </div>

    <div v-else-if="tab === 'surveys'" class="section-body">
      <p class="muted">候选满后自动暂停且不耗电。更改地区、等级或定向会清空当前进度和保底计数，保留已有候选。</p>
      <article v-for="survey in state.surveys" :key="survey.id" class="facility">
        <h3>{{ survey.id }} · {{ state.tiers.find(t => t.tier === survey.tier)?.name }}</h3><p>{{ survey.status }} · 候选 {{ survey.candidates.length }}/{{ survey.capacity }} · 定向未中 {{ survey.misses }}<template v-if="survey.limit"> / {{ survey.limit }} 次保障</template></p>
        <progress :value="progress(survey.upgrade?.work ?? survey.work, survey.upgrade ? 900 : survey.duration)" max="100" :aria-label="`${survey.id}进度`" />
        <div v-if="drafts[survey.id]" class="form-grid">
          <label>地区<select v-model="drafts[survey.id].region" :disabled="!state.active || !!survey.upgrade"><option v-for="region in state.regions" :key="region.id" :value="region.id" :disabled="!region.unlocked">{{ region.name }}{{ region.unlocked ? '' : '（未开放）' }}</option></select></label>
          <label>发现节点等级<select v-model="drafts[survey.id].tier" :disabled="!state.active || !!survey.upgrade"><option v-for="tier in state.tiers.filter(t => t.tier <= survey.tier)" :key="tier.tier" :value="tier.tier">{{ tier.name }}</option></select></label>
          <label>定向目标<select v-model="drafts[survey.id].target" :disabled="!state.active || !!survey.upgrade"><option v-for="(target, index) in state.targets" :key="index" :value="index">{{ target.label }}</option></select></label>
        </div>
        <div class="button-row"><button type="button" :disabled="!state.active || !!survey.upgrade" @click="configure(survey.id)">应用设置（重置本次进度）</button><button type="button" :disabled="!state.active" @click="emit('action', { type: 'pause', facility: 'survey', id: survey.id, value: !survey.paused })">{{ survey.paused ? '恢复调查' : '暂停调查' }}</button><button type="button" :disabled="!survey.upgradeAction.enabled" :title="survey.upgradeAction.reason" @click="dispatch(survey.upgradeAction)">{{ survey.upgradeAction.label }} · {{ prices(survey.upgradeAction) }}</button><button type="button" @click="filter = 'candidate'; tab = 'nodes'">查看候选</button></div>
      </article>
      <p v-if="!state.surveys.length" class="muted">在“节点与安装”选择建设调查点，即可持续自动调查。</p>
    </div>

    <div v-else-if="tab === 'work'" class="section-body">
      <p class="muted">每台一个作业位置，同一节点只能锁定到一台。队列逐笔预付，未开工可全退；开工后可暂停，主动放弃不退款。供体开工时消耗。</p>
      <article v-for="bench in state.benches" :key="bench.id" class="facility">
        <h3>{{ bench.id }} · {{ state.tiers.find(t => t.tier === bench.tier)?.name }} · {{ bench.paused ? '已暂停' : bench.upgrade ? '升阶中' : bench.jobs.length ? '作业队列' : '空闲' }}</h3>
        <progress v-if="bench.upgrade" :value="progress(bench.upgrade.work, 900)" max="100" aria-label="培养台升阶进度" />
        <div class="button-row"><button type="button" :disabled="!state.active" @click="emit('action', { type: 'pause', facility: 'bench', id: bench.id, value: !bench.paused })">{{ bench.paused ? '恢复作业' : '暂停作业' }}</button><button type="button" :disabled="!bench.upgradeAction.enabled" :title="bench.upgradeAction.reason" @click="dispatch(bench.upgradeAction)">{{ bench.upgradeAction.label }} · {{ prices(bench.upgradeAction) }}</button></div>
        <div v-if="bench.options.length" class="job-form">
          <label>选择节点和作业<select v-model="workChoice[bench.id]" :disabled="!state.active"><option v-for="option in bench.options" :key="optionKey(option)" :value="optionKey(option)">{{ option.label }} · {{ prices(option) }}</option></select></label>
          <template v-if="selectedWork(bench.id)">
            <p>{{ selectedWork(bench.id)!.label }} · {{ prices(selectedWork(bench.id)!) }} · 基础工时 {{ minutes(selectedWork(bench.id)!.seconds) }} 分钟 · {{ selectedWork(bench.id)!.gains }}</p>
            <p v-if="selectedWork(bench.id)!.chanceFive" class="muted">+5 基础结果概率预览 {{ percent(selectedWork(bench.id)!.chanceFive!) }}%，开工时按其他在线节点固定；血仪式在结果上另加 1。</p>
            <p v-if="state.nodes.find(n => n.id === selectedWork(bench.id)!.nodeId)?.stopWarning" class="notice">{{ state.nodes.find(n => n.id === selectedWork(bench.id)!.nodeId)?.stopWarning }}</p>
            <label v-if="selectedWork(bench.id)!.batches.length > 1">连续培养次数<select v-model="workCount[bench.id]"><option v-for="batch in selectedWork(bench.id)!.batches" :key="batch.count" :value="batch.count">{{ batch.count }} 次 · 合计 {{ number(batch.amount) }} 结算币</option></select></label>
            <p v-if="selectedBatch(bench.id)" class="muted">本次预付合计 {{ number(selectedBatch(bench.id)!.amount) }}，基础总工时 {{ minutes(selectedBatch(bench.id)!.seconds) }} 分钟。多次费用按未来等级与培养次数逐笔计算。</p>
            <button type="button" :disabled="!state.active || !selectedBatch(bench.id)?.enabled" @click="enqueue(bench.id)">{{ selectedBatch(bench.id)?.enabled ? '确认排队并预付费用' : 'GT 币不足' }}</button>
          </template>
        </div>
        <p v-else class="muted">当前没有可安排的作业。检查节点等级、研究、占用和培养上限。</p>
        <ol class="job-list"><li v-for="job in bench.jobs" :key="job.id"><div><strong>{{ job.nodeId }} · {{ taskLabels[job.task.kind] }}</strong><span>{{ job.started ? '已开工' : '尚未开工' }} · 已付 {{ number(job.paid) }}（T{{ job.tier }} 结算币）</span><span v-if="job.chanceFive !== null">已固定 +5 概率 {{ percent(job.chanceFive) }}%，完成后揭示结果</span><span v-if="job.task.kind === 'assimilate'">供体 {{ job.task.donorId }}{{ job.started ? ' 已投入' : ' 已锁定' }}</span><progress :value="progress(job.work, job.totalWork)" max="100" :aria-label="`${job.id}进度`" /></div><button type="button" :disabled="!state.active" @click="cancel(bench.id, job.id, job.started)">{{ job.started ? confirmAbandon === job.id ? '确认放弃，不退款' : '放弃本次作业' : '取消并全额退款' }}</button></li></ol>
      </article>
      <p v-if="!state.benches.length" class="muted">在“节点与安装”建设培养台。A1 后开放培养、稳妥封装和要素调谐。</p>
    </div>

    <div v-else-if="tab === 'research'" class="section-body">
      <div v-if="state.researchJob" class="facility"><h3>当前研究：{{ state.researchJob.name }}</h3><progress :value="progress(state.researchJob.work, state.researchJob.totalWork)" max="100" aria-label="研究进度" /><button type="button" :disabled="!state.active" @click="emit('action', { type: 'pause', facility: 'research', id: state.researchJob.id, value: !state.researchJob.paused })">{{ state.researchJob.paused ? '继续研究' : '暂停研究' }}</button></div>
      <article v-for="research in state.researchOptions" :key="research.id" class="research-row"><div><h3>{{ research.label }} <span v-if="research.completed">· 已完成</span></h3><p>{{ research.requires }} · {{ research.seconds ? `${minutes(research.seconds)} 分钟基础工时` : '即时完成' }}</p><p>{{ research.unlock }}</p><span class="muted">{{ prices(research) }}</span></div><button type="button" :disabled="!research.enabled" :title="research.reason" @click="dispatch(research)">{{ research.completed ? '已完成' : research.enabled ? '确认研究' : research.reason }}</button></article>
    </div>

    <div v-else class="section-body">
      <p class="muted">图鉴跨转生保留，只记录见闻，不增加产能。</p>
      <h3>节点类型</h3><ul class="codex-list"><li v-for="type in ARCANE_TYPES" :key="type.id"><b>{{ state.codex.types.includes(type.id) ? type.name : '尚未发现' }}</b><span v-if="state.codex.types.includes(type.id)">{{ type.effect }}</span></li></ul>
      <h3>质量</h3><p>{{ ARCANE_QUALITIES.filter(q => state.codex.qualities.includes(q.id)).map(q => q.name).join('、') || '暂无记录' }}</p>
      <h3>地区</h3><p>{{ ARCANE_REGIONS.filter(r => state.codex.regions.includes(r.id)).map(r => r.name).join('、') || '暂无调查记录' }}</p>
      <h3>元始要素</h3><p>{{ ARCANE_ASPECTS.filter(a => state.codex.aspects.includes(a.id)).map(a => a.name).join('、') || '暂无记录' }}</p>
      <h3>完成研究</h3><p>{{ state.codex.research.join('、') || '暂无记录' }}</p>
    </div>
    <details v-if="state.notices.length" class="event-list"><summary>最近进展 · 发现 {{ state.discoveries }} 颗 / 完成 {{ state.completedJobs }} 项作业</summary><ul><li v-for="(notice, i) in [...state.notices].reverse()" :key="i">{{ notice }}</li></ul></details>
  </section>
</template>

<style scoped>
.arcane-panel { padding: 20px; background: var(--panel); color: var(--text); border: 3px solid var(--line); border-image: var(--skin-panel) 3 fill / 3px stretch; min-width: 0; }
.heading, .button-row, .toolbar, .build-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.heading { justify-content: space-between; align-items: start; }
h2 { margin: 0 0 8px; font-size: 20px; } h3 { margin: 0 0 8px; font-size: 15px; }
p { margin: 8px 0; line-height: 1.6; } .muted, .heading p, .network-note { color: var(--muted); font-size: 12px; }
.readings { display: grid; gap: 6px; font-size: 12px; } .readings strong { font-size: 18px; color: var(--accent); }
.aspect-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; margin-top: 16px; }
.aspect-grid span { padding: 8px; border: 1px solid var(--line); background: var(--panel-2, var(--panel)); font-size: 12px; }
.aspect-grid b { display: block; margin-top: 4px; }
.tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
button, select, input[type="number"] { min-height: 44px; font: inherit; color: var(--text); background: var(--panel-2, var(--panel)); border: 1px solid var(--line); border-radius: 4px; padding: 8px 12px; max-width: 100%; }
button { cursor: pointer; min-width: 44px; white-space: normal; overflow-wrap: anywhere; } button.active, button[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); }
button:hover:not(:disabled), button:focus-visible, select:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .55; cursor: default; } button small { display: block; font-size: 11px; margin-top: 4px; }
label { display: grid; gap: 6px; font-size: 12px; min-width: 0; } select { width: 100%; } input[type="number"] { width: 100px; }
.section-body { display: grid; gap: 12px; } .build-row { align-items: end; } .build-row > label { flex: 1 1 230px; }
.toolbar { align-items: end; padding: 12px 0; } .node-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 12px; }
.node-card, .facility, .detail, .research-row { padding: 14px; border: 1px solid var(--line); background: var(--panel-2, var(--panel)); min-width: 0; }
.node-card.selected { border-color: var(--accent); } .select-node { display: flex; align-items: center; min-height: 44px; cursor: pointer; }
.select-node input { width: 20px; height: 20px; margin: 0 10px 0 0; } .node-detail-button { display: grid; gap: 6px; text-align: left; width: 100%; background: transparent; }
.node-detail-button span { font-size: 12px; } .node-card p, .job-list span { overflow-wrap: anywhere; }
.notice { padding: 12px; border: 1px solid var(--accent); background: var(--panel); font-size: 12px; }
.form-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 12px 0; }
progress { width: 100%; height: 12px; accent-color: var(--accent); margin: 10px 0; } .job-form { display: grid; gap: 8px; margin-top: 16px; }
.job-list { list-style-position: inside; padding: 0; margin-bottom: 0; } .job-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; border-top: 1px solid var(--line); padding: 12px 0; }
.job-list li > div { display: grid; gap: 6px; flex: 1 1 220px; } .job-list span { font-size: 12px; color: var(--muted); }
.research-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; } .research-row > div { flex: 1 1 250px; }
.research-row p { font-size: 12px; } .stand-list, .codex-list, .event-list ul { padding-left: 20px; } .stand-list li { margin: 8px 0; } .stand-list span { display: block; margin-bottom: 6px; }
.codex-list li { margin: 12px 0; } .codex-list span { display: block; color: var(--muted); font-size: 12px; margin-top: 4px; }
summary { cursor: pointer; padding: 12px 0; min-height: 44px; box-sizing: border-box; } .event-list { margin-top: 16px; border-top: 1px solid var(--line); font-size: 12px; } .event-list li { margin-bottom: 8px; }
.compare-table { overflow-x: auto; margin-top: 12px; } table { border-collapse: collapse; width: 100%; font-size: 12px; } th, td { border: 1px solid var(--line); padding: 10px; min-width: 80px; text-align: left; }
@media (max-width: 640px) { .arcane-panel { padding: 12px; } .aspect-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .form-grid { grid-template-columns: 1fr; } .tabs button { flex: 1 1 100px; } .toolbar > *, .build-row > div { flex: 1 1 100%; } .toolbar button { width: 100%; } .detail { position: fixed; inset: 0; z-index: 100; overflow-y: auto; padding: 20px; background: var(--panel); } .node-grid { grid-template-columns: 1fr; } }
</style>
