<script setup lang="ts">
import { computed, ref, nextTick } from 'vue';
import { useGameStore, type RebirthNodeRow } from '../game/store';
import { REBIRTH_CANVAS_SIZE, REBIRTH_NODES } from '../game/rebirth';

// 独立的转生页面：进来之后只显示转生相关的东西，工厂界面完全不出现。
// 从主界面顶部的入口进来，或转生刚发生时自动进来；点「回到工厂」返回。
const emit = defineEmits<{ close: [] }>();
const store = useGameStore();
const rebirth = computed(() => store.snap.rebirth);
const universes = computed(() => store.snap.universes);
// 本次转生要带上的宇宙。选择存在存档里（rebirth.pendingUniverse），
// 所以来回切页面、刷新都不会丢
const pickedUniverse = computed(() => store.snap.rebirth.pendingUniverse);
const universesCollapsed = computed(() => store.universesCollapsed);
const challengesCollapsed = computed(() => store.challengesCollapsed);
const treeCollapsed = computed(() => store.treeCollapsed);
const historyCollapsed = computed(() => store.historyCollapsed);

const historySummary = computed(() => {
  const rows = store.snap.rebirth.historyRows;
  if (rows.length === 0) return '还没有转生记录';
  return `${rows.length} 条 · 最近一趟 ${rows[0]!.cables} 条线缆`;
});

// 收起时的摘要：一眼看出挑战挂没挂、树点了多少
const challengesSummary = computed(() => {
  const active = activeChallengeName.value;
  const failed = store.snap.rebirth.activeChallengeFailed;
  const parts: string[] = [];
  parts.push(active ? `本周目：${active}${failed ? '（已失效）' : ''}` : '本周目未挂挑战');
  if (pendingChallengeName.value) parts.push(`本次挂：${pendingChallengeName.value}`);
  return parts.join(' · ');
});

const treeSummary = computed(() => {
  const nodes = store.snap.rebirth.nodes;
  const owned = nodes.filter((node) => node.owned);
  const spent = owned.reduce((sum, node) => sum + Number(node.cost), 0);
  return `已点亮 ${owned.length} / ${nodes.length} 节点 · 已花 ${spent} 条`;
});

// 收起来的时候也要能一眼看出「有几个宇宙、这次带哪个」
const universesSummary = computed(() => {
  const owned = universes.value.filter((universe) => universe.owned).length;
  const picked = store.snap.rebirth.pendingUniverseName;
  return `已拥有 ${owned} 个${picked ? ` · 本次带 ${picked}` : ''}`;
});

function pickUniverse(id: string, owned: boolean, implemented: boolean) {
  if (owned || !implemented) return;
  // 再点一下取消选择
  store.setPendingUniverse(pickedUniverse.value === id ? null : id);
}

function doRebirth() {
  store.rebirth('max', pickedUniverse.value || undefined);
}

// 挑战时间线：再点一下已选中的卡片就取消（挂 0 或 1 个，不可叠加）
const challengeRows = computed(() => store.snap.rebirth.challengeRows);
const activeChallengeName = computed(() => store.snap.rebirth.activeChallengeName);
const pendingChallengeName = computed(() => store.snap.rebirth.pendingChallengeName);

function pickChallenge(id: string, eligible: boolean) {
  if (!eligible) return;
  store.setPendingChallenge(pendingChallengeName.value === '' || pendingChallengeName.value !== challengeName(id) ? id : null);
}

function challengeName(id: string): string {
  return store.snap.rebirth.challengeRows.find((row) => row.id === id)?.name ?? id;
}

interface Link {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// 树的连线：根 → 每条支线的第一格，再按前置关系连到下一层（中心连中心）
const links = computed<Link[]>(() => {
  const byId = new Map(REBIRTH_NODES.map((node) => [node.id, node]));
  const out: Link[] = [];
  for (const node of REBIRTH_NODES) {
    if (node.layer === 1) {
      out.push({
        key: `root->${node.id}`,
        x1: rebirth.value.root.x,
        y1: rebirth.value.root.y,
        x2: node.x,
        y2: node.y,
      });
      continue;
    }
    for (const parentId of node.requires) {
      const parent = byId.get(parentId);
      if (!parent) continue;
      out.push({
        key: `${parentId}->${node.id}`,
        x1: parent.x,
        y1: parent.y,
        x2: node.x,
        y2: node.y,
      });
    }
  }
  return out;
});

function nodeClass(node: RebirthNodeRow) {
  return {
    owned: node.owned,
    buyable: !node.owned && node.buyable,
    // 宇宙支线：还没拥有对应宇宙时置灰并上锁
    gated: !node.owned && node.requireUniverse !== '' && !ownedUniverseNames.value.has(node.requireUniverseName),
  };
}

const ownedUniverseNames = computed(
  () => new Set(universes.value.filter((universe) => universe.owned).map((u) => u.name)),
);

// ── 树画布的拖拽平移 ────────────────────────────────────────
const viewport = ref<HTMLDivElement | null>(null);

// 画布挂载/卸载都会走这里：首次挂载（含折叠后首次展开）把视图停在中心，
// 之后的挂载恢复上次拖到的位置（卸载时记下滚动值）
function setViewport(el: unknown): void {
  if (el === null) {
    const node = viewport.value;
    if (node) lastPan = { left: node.scrollLeft, top: node.scrollTop };
    viewport.value = null;
    return;
  }
  viewport.value = el as HTMLDivElement;
  nextTick(() => {
    const node = viewport.value;
    if (!node) return;
    if (!treeEverOpened) {
      treeEverOpened = true;
      node.scrollLeft = (REBIRTH_CANVAS_SIZE - node.clientWidth) / 2;
      node.scrollTop = (REBIRTH_CANVAS_SIZE - node.clientHeight) / 2;
    } else if (lastPan) {
      node.scrollLeft = lastPan.left;
      node.scrollTop = lastPan.top;
    }
  });
}
const dragging = ref(false);
// 拖过的距离超过阈值就吞掉紧跟的 click，免得平移结束误买节点
let panMoved = 0;
let panLast: { x: number; y: number } | null = null;

function onPanDown(event: PointerEvent) {
  if (event.button !== 0) return;
  dragging.value = true;
  panMoved = 0;
  panLast = { x: event.clientX, y: event.clientY };
  viewport.value?.setPointerCapture(event.pointerId);
}

function onPanMove(event: PointerEvent) {
  if (!dragging.value || !panLast) return;
  const dx = event.clientX - panLast.x;
  const dy = event.clientY - panLast.y;
  panMoved += Math.abs(dx) + Math.abs(dy);
  panLast = { x: event.clientX, y: event.clientY };
  if (viewport.value) {
    viewport.value.scrollLeft -= dx;
    viewport.value.scrollTop -= dy;
  }
}

function onPanUp() {
  dragging.value = false;
  panLast = null;
}

function onNodeClick(node: RebirthNodeRow) {
  if (node.owned || !node.buyable) return;
  if (panMoved > 6) return; // 刚拖完视口，不当成点击
  store.buyRebirthNode(node.id);
}

// 把视图停在中心（时空锚点）。树默认收起、挂载时画布还不存在，
// 所以首次展开时也要居中一次（之后展开不再重置，保留用户拖到的位置）
let treeEverOpened = false;
let lastPan: { left: number; top: number } | null = null;
</script>

<template>
  <section class="panel rebirth-page">
    <h1>转生</h1>
    <p class="muted small" style="margin: 4px 0 0">
      转生会清空本周目的矿石、GT 币、机器、电压、矿脉、电网与研究进度，
      只留下时空线缆、永久加成、转生次数和累计统计。
    </p>

    <div class="power-row">
      <div class="power-box static">
        <span class="power-label">时空线缆</span>
        <b class="power-value">{{ rebirth.cables }} 条</b>
      </div>
      <div class="power-box static">
        <span class="power-label">转生次数</span>
        <b class="power-value">{{ rebirth.count }} 次</b>
      </div>
      <div class="power-box static">
        <span class="power-label">本周目累计 EU</span>
        <b class="power-value">{{ rebirth.runEU }}</b>
      </div>
      <div class="power-box static">
        <span class="power-label">打到 MAX 可得</span>
        <b class="power-value">{{ rebirth.maxCables }} 条</b>
      </div>
    </div>

    <div class="row" style="margin-top: 12px">
      <div class="name">
        {{
          rebirth.canRebirth
            ? '已达 MAX：现在转生按累计 EU 结算'
            : '还没到 MAX：只能等时空裂缝（每周目一次）'
        }}
      </div>
      <button
        class="big"
        :class="{ primary: rebirth.canRebirth }"
        :disabled="!rebirth.canRebirth"
        @click="doRebirth"
      >
        转生
      </button>
    </div>
    <p v-if="rebirth.riftClosed && !rebirth.canRebirth" class="muted small" style="margin: 6px 0 0">
      本周目的时空裂缝已经关掉了，这一轮只剩打到 MAX。
    </p>

    <div class="row" style="margin-top: 8px">
      <div class="name">
        <template v-if="rebirth.planckOwned">
          <b>普朗克锚</b>已铸造：MAX 转生的线缆结算永久 ×1.5
        </template>
        <template v-else>
          <b>普朗克锚</b>（终局装置）：花 300 条线缆铸造，MAX 转生的线缆结算永久 ×1.5
        </template>
      </div>
      <button
        v-if="!rebirth.planckOwned"
        :disabled="!rebirth.planckBuyable"
        :title="rebirth.planckBuyable ? undefined : '线缆不够（需要 300 条）'"
        @click="store.buyPlanckAnchor()"
      >
        铸造（300 条）
      </button>
    </div>

    <button
      type="button"
      class="rebirth-toggle"
      :aria-expanded="!universesCollapsed"
      @click="store.toggleUniverses()"
    >
      <span>{{ universesCollapsed ? '▸' : '▾' }} 平行宇宙</span>
      <span class="muted small">{{ universesSummary }}</span>
    </button>
    <template v-if="!universesCollapsed">
      <p class="muted small" style="margin: 4px 0 8px">
        转生时可以带一个宇宙走，选过的永久叠加 —— 下一轮开始，核心规则就多一条。
      </p>
      <p v-if="rebirth.pendingUniverseName" class="small" style="margin: 0 0 8px">
        本次转生将带上：<b>{{ rebirth.pendingUniverseName }}</b>
      </p>
      <div class="universe-list">
        <button
          v-for="universe in universes"
          :key="universe.id"
          type="button"
          class="universe"
          :class="{ picked: pickedUniverse === universe.id, owned: universe.owned, todo: !universe.implemented }"
          :disabled="universe.owned || !universe.implemented"
          @click="pickUniverse(universe.id, universe.owned, universe.implemented)"
        >
          <b>
            {{ universe.name }}
            <span v-if="universe.owned" class="tag-owned">已拥有</span>
            <span v-else-if="!universe.implemented" class="tag-todo">未实现</span>
            <span v-else-if="pickedUniverse === universe.id" class="tag-picked">本次选择</span>
          </b>
          <span class="muted small">{{ universe.summary }}</span>
          <span v-for="effect in universe.effects" :key="effect" class="muted small effect">
            · {{ effect }}
          </span>
        </button>
      </div>
    </template>

    <button
      type="button"
      class="rebirth-toggle"
      :aria-expanded="!challengesCollapsed"
      @click="store.toggleChallenges()"
    >
      <span>{{ challengesCollapsed ? '▸' : '▾' }} 挑战时间线</span>
      <span class="muted small">{{ challengesSummary }}</span>
    </button>
    <template v-if="!challengesCollapsed">
    <p v-if="activeChallengeName" class="small" style="margin: 4px 0 4px">
      本周目挑战：<b>{{ activeChallengeName }}</b>（{{ store.snap.rebirth.activeChallengeDesc }}，
      结算
      <span :class="{ danger: store.snap.rebirth.activeChallengeFailed }">
        {{ store.snap.rebirth.activeChallengeFailed ? '已失效，不加成' : `通过 ${store.snap.rebirth.activeChallengeBonus}` }}
      </span>{{ store.snap.rebirth.activeChallengeFirstDone && !store.snap.rebirth.activeChallengeFailed ? '，首通已达成' : '' }}）
    </p>
    <p v-else class="muted small" style="margin: 4px 0 4px">本周目没有挂挑战。</p>
    <p class="muted small" style="margin: 4px 0 6px">
      转生时可以自愿挂上 0 或 1 个挑战，下一周目全程受检：通过则线缆结算乘倍率并点亮首通成就，
      违规立刻失效（没有惩罚）。
      <template v-if="pendingChallengeName">本次转生将挂上：<b>{{ pendingChallengeName }}</b></template>
      <template v-else>本次转生不挂挑战。</template>
    </p>
    <div class="universe-list">
      <button
        v-for="row in challengeRows"
        :key="row.id"
        type="button"
        class="universe"
        :class="{ picked: row.selected, todo: !row.eligible }"
        :disabled="!row.eligible"
        :title="row.eligible ? undefined : `需要拥有（或本次带上）${row.requireUniverseName}`"
        @click="pickChallenge(row.id, row.eligible)"
      >
        <b>
          {{ row.name }}
          <span class="muted small">{{ row.bonus }}</span>
          <span v-if="row.firstDone" class="tag-owned">首通已达成</span>
          <span v-if="row.selected" class="tag-picked">本次选择</span>
        </b>
        <span class="muted small">{{ row.desc }}</span>
        <span v-if="!row.eligible" class="muted small effect">· 需要拥有（或本次带上）{{ row.requireUniverseName }}</span>
      </button>
    </div>
    </template>

    <button
      type="button"
      class="rebirth-toggle"
      :aria-expanded="!treeCollapsed"
      @click="store.toggleTree()"
    >
      <span>{{ treeCollapsed ? '▸' : '▾' }} 永久加成</span>
      <span class="muted small">{{ treeSummary }}</span>
    </button>
    <template v-if="!treeCollapsed">
    <p class="muted small" style="margin: 4px 0 4px">
      以「时空锚点」为中心向四周延伸；按住画布拖动查看整棵树。
    </p>
    <div
      :ref="setViewport"
      class="rebirth-viewport"
      :class="{ dragging }"
      @pointerdown="onPanDown"
      @pointermove="onPanMove"
      @pointerup="onPanUp"
      @pointercancel="onPanUp"
    >
      <div class="rebirth-canvas">
        <svg class="rebirth-links" :viewBox="`0 0 ${REBIRTH_CANVAS_SIZE} ${REBIRTH_CANVAS_SIZE}`" aria-hidden="true">
          <line
            v-for="link in links"
            :key="link.key"
            :x1="link.x1"
            :y1="link.y1"
            :x2="link.x2"
            :y2="link.y2"
          />
        </svg>
        <div
          class="rebirth-root"
          :style="{ left: rebirth.root.x + 'px', top: rebirth.root.y + 'px' }"
        >
          {{ rebirth.root.name }}
        </div>
        <button
          v-for="node in rebirth.nodes"
          :key="node.id"
          type="button"
          class="rebirth-node"
          :class="nodeClass(node)"
          :style="{ left: node.x + 'px', top: node.y + 'px' }"
          :disabled="node.owned || !node.buyable"
          :title="
            node.owned
              ? undefined
              : node.requireUniverseName !== '' && !ownedUniverseNames.has(node.requireUniverseName)
                ? `需要拥有${node.requireUniverseName}`
                : `前置：${node.requires.join(' / ') || '无'} · 价格 ${node.cost} 条`
          "
          @click="onNodeClick(node)"
        >
          <span>{{ node.effectText }}</span>
          <em v-if="!node.owned">
            {{ node.requireUniverseName !== '' && !ownedUniverseNames.has(node.requireUniverseName) ? `🔒 ${node.requireUniverseName}` : `${node.cost} 条` }}
          </em>
        </button>
      </div>
    </div>

    <h2 class="mt">已生效的加成</h2>
    <dl class="stats">
      <div v-for="bonus in rebirth.bonuses" :key="bonus.label" class="stat">
        <dt>{{ bonus.label }}</dt>
        <dd>{{ bonus.value }}</dd>
      </div>
    </dl>
    </template>

    <button
      type="button"
      class="rebirth-toggle"
      :aria-expanded="!historyCollapsed"
      @click="store.toggleHistory()"
    >
      <span>{{ historyCollapsed ? '▸' : '▾' }} 转生履历</span>
      <span class="muted small">{{ historySummary }}</span>
    </button>
    <template v-if="!historyCollapsed">
      <p v-if="store.snap.rebirth.historyRows.length === 0" class="muted small" style="margin: 4px 0 0">
        还没有转生记录——第一次转生之后这里会记下每一趟的路线、宇宙、挑战与线缆结算。
      </p>
      <table v-else class="detail-table history-table">
        <thead>
          <tr>
            <th>周目</th>
            <th>路线</th>
            <th>宇宙</th>
            <th>挑战</th>
            <th>结算</th>
            <th>时长</th>
            <th>电压</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in store.snap.rebirth.historyRows" :key="row.run">
            <td class="num-cell">#{{ row.run }}</td>
            <td>{{ row.route }}</td>
            <td>{{ row.universe }}</td>
            <td>
              {{ row.challenge }}
              <span v-if="row.challengeNote !== '—'" class="muted small">{{ row.challengeNote }}</span>
            </td>
            <td class="num-cell">{{ row.cables }} 条</td>
            <td>{{ row.duration }}</td>
            <td>{{ row.voltage }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <div class="row" style="margin-top: 16px">
      <div class="name muted">加成买完就回工厂继续下一轮</div>
      <button @click="emit('close')">回到工厂</button>
    </div>
  </section>
</template>
