<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, ref } from 'vue';
import { useGameStore, REBIRTH_TABS, type RebirthTab } from '../game/store';
import type { RebirthNodeRow } from '../game/presentation/types';
import { REBIRTH_BRANCHES, REBIRTH_CANVAS_SIZE } from '../game/rebirth';
import AchievementIcon from './AchievementIcon.vue';

// 时空星图：仿「饼干点点乐」的转生星图，节点按 GTNH 任务书（BetterQuesting）的任务格样式画。
// 任务格三态沿用任务书配色：灰 = 未解锁，黄 = 可购买，绿 = 已完成；连线跟随下游节点的状态。
const emit = defineEmits<{ close: [] }>();
const store = useGameStore();
const rebirth = computed(() => store.snap.rebirth);
const sourceNodes = computed(() => rebirth.value.nodes);

// 只显示已买的节点和与它们相邻的下一格（前置都已买）；宇宙门控不隐藏，显示成上锁
const visibleNodeIds = computed(() => {
  const owned = new Set(sourceNodes.value.filter((node) => node.owned).map((node) => node.id));
  return new Set(
    sourceNodes.value
      .filter((node) => owned.has(node.id) || node.requires.every((id) => owned.has(id)))
      .map((node) => node.id),
  );
});

const ownedUniverses = computed(() => rebirth.value.universes);
const universes = computed(() => store.snap.universes);

// 画布四周留白，节点画在中间的 REBIRTH_CANVAS_SIZE 见方区域
const PAD = 320;
const SIZE = REBIRTH_CANVAS_SIZE + PAD * 2;
const ROOT = { x: rebirth.value.root.x + PAD, y: rebirth.value.root.y + PAD };
const STAR_ICON = { kind: 'sprite', sprite: 'star' } as const;

// ── 节点与连线 ─────────────────────────────────────────────
type NodeState = 'owned' | 'buyable' | 'open' | 'locked';

function stateOf(node: RebirthNodeRow): NodeState {
  if (node.owned) return 'owned';
  if (node.buyable) return 'buyable';
  return node.unlocked ? 'open' : 'locked';
}

function gated(node: RebirthNodeRow): boolean {
  return !node.owned && node.requireUniverse !== '' && !ownedUniverses.value.includes(node.requireUniverseName);
}

const nodes = computed(() =>
  sourceNodes.value
    .filter((node) => visibleNodeIds.value.has(node.id))
    .map((node) => ({
    ...node,
    cx: node.x + PAD,
    cy: node.y + PAD,
    state: stateOf(node),
    gated: gated(node),
    color: REBIRTH_BRANCHES.find((branch) => branch.id === node.branch)?.color ?? '#fff',
  })),
);

const links = computed(() => {
  const byId = new Map(nodes.value.map((node) => [node.id, node]));
  return nodes.value.flatMap((node) => {
    const state = node.owned ? 'owned' : node.unlocked ? 'available' : 'locked';
    const parents = node.requires.length === 0 ? [{ id: 'root', cx: ROOT.x, cy: ROOT.y }] : node.requires.filter((id) => visibleNodeIds.value.has(id)).map((id) => byId.get(id)!);
    return parents.map((parent) => ({ key: `${parent.id}->${node.id}`, x1: parent.cx, y1: parent.cy, x2: node.cx, y2: node.cy, state }));
  });
});

// 背景：固定种子的星点 + 每层一圈轨道，平移时跟着画布走
const STARS = (() => {
  let seed = 20261018;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: 260 }, (_, i) => ({
    key: i,
    x: rand() * SIZE,
    y: rand() * SIZE,
    r: 0.4 + rand() * 1.3,
    o: 0.2 + rand() * 0.7,
    twinkle: rand() < 0.18,
  }));
})();
const ORBITS = computed(() => {
  const radii = new Map<number, number>();
  for (const node of nodes.value) {
    const r = Math.hypot(node.cx - ROOT.x, node.cy - ROOT.y);
    radii.set(node.layer, Math.min(radii.get(node.layer) ?? Infinity, r));
  }
  return [...radii.values()];
});

const ownedCount = computed(() => rebirth.value.nodes.filter((node) => node.owned).length);

// ── 章节（支线）导航 ───────────────────────────────────────
const chapters = computed(() =>
  REBIRTH_BRANCHES.map((branch) => {
    const all = sourceNodes.value.filter((node) => node.branch === branch.id);
    const list = nodes.value.filter((node) => node.branch === branch.id);
    return {
      ...branch,
      owned: all.filter((node) => node.owned).length,
      total: all.length,
      buyable: list.some((node) => node.buyable),
      cx: list.reduce((sum, node) => sum + node.cx, 0) / list.length,
      cy: list.reduce((sum, node) => sum + node.cy, 0) / list.length,
    };
  }),
);

// ── 平移 ────────────────────────────────────────────────────
const viewport = ref<HTMLDivElement | null>(null);
const stage = ref<HTMLDivElement | null>(null);
const active = ref(false);
const dragging = ref(false);
let savedPan: { left: number; top: number } | null = null;
let panMoved = 0;
let panLast: { x: number; y: number } | null = null;

function scrollToPoint(x: number, y: number, smooth: boolean) {
  const el = viewport.value;
  if (!el) return;
  const reduce = document.body.classList.contains('motion-off');
  el.scrollTo({ left: x - el.clientWidth / 2, top: y - el.clientHeight / 2, behavior: smooth && !reduce ? 'smooth' : 'auto' });
}

function rememberPan() {
  if (active.value && viewport.value) savedPan = { left: viewport.value.scrollLeft, top: viewport.value.scrollTop };
  hovered.value = null;
}

onActivated(() => {
  const pan = savedPan;
  active.value = true;
  nextTick(() => {
    const el = viewport.value;
    if (!el) return;
    if (pan) el.scrollTo(pan.left, pan.top);
    else scrollToPoint(ROOT.x, ROOT.y, false);
  });
});
onDeactivated(() => {
  active.value = false;
  hovered.value = null;
  onPanUp();
});

function onPanDown(event: PointerEvent) {
  if (event.button !== 0) return;
  dragging.value = true;
  panMoved = 0;
  panLast = { x: event.clientX, y: event.clientY };
  // 按在节点上不捕获指针：捕获后 click 会落到视口上，节点就买不出去
  if ((event.target as HTMLElement | null)?.closest('.quest-node')) return;
  viewport.value?.setPointerCapture(event.pointerId);
}

function onPanMove(event: PointerEvent) {
  if (!dragging.value || !panLast || !viewport.value) return;
  const dx = event.clientX - panLast.x;
  const dy = event.clientY - panLast.y;
  panMoved += Math.abs(dx) + Math.abs(dy);
  panLast = { x: event.clientX, y: event.clientY };
  viewport.value.scrollLeft -= dx;
  viewport.value.scrollTop -= dy;
  if (panMoved > 6) hovered.value = null;
}

function onPanUp() {
  dragging.value = false;
  panLast = null;
}

function buy(node: RebirthNodeRow) {
  if (panMoved > 6 || !node.buyable) return;
  store.buyRebirthNode(node.id);
}

// ── 悬停提示（鼠标悬停与键盘聚焦都会弹出）────────────────
const hovered = ref<{ id: string; left: number; top: number; flip: boolean } | null>(null);
const hoveredNode = computed(() => (hovered.value ? nodes.value.find((node) => node.id === hovered.value!.id) ?? null : null));

function showTip(id: string, event: Event) {
  if (dragging.value && panMoved > 6) return;
  const box = stage.value?.getBoundingClientRect();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (!box) return;
  const flip = rect.right + 300 > box.right;
  hovered.value = {
    id,
    left: flip ? rect.left - box.left - 12 : rect.right - box.left + 12,
    top: Math.min(Math.max(rect.top - box.top - 6, 8), box.height - 190),
    flip,
  };
}

function hideTip() {
  hovered.value = null;
}

// ── 转生 / 宇宙 / 挑战 ──────────────────────────────────────
const pickedUniverse = computed(() => rebirth.value.pendingUniverse);
const challengeRows = computed(() => rebirth.value.challengeRows);

function pickUniverse(id: string, owned: boolean, implemented: boolean) {
  if (owned || !implemented) return;
  store.setPendingUniverse(pickedUniverse.value === id ? null : id);
}

function pickChallenge(id: string, eligible: boolean, selected: boolean) {
  if (!eligible) return;
  store.setPendingChallenge(selected ? null : id);
}

function doRebirth() {
  store.rebirth('max', pickedUniverse.value || undefined);
}

const TAB_NAMES: Record<RebirthTab, string> = {
  bonuses: '已生效加成',
  universes: '平行宇宙',
  challenges: '挑战时间线',
  history: '转生履历',
};

const tabBadge = computed<Record<RebirthTab, string>>(() => ({
  bonuses: `${ownedCount.value}/${rebirth.value.nodes.length}`,
  universes: rebirth.value.pendingUniverseName ? `带 ${rebirth.value.pendingUniverseName}` : '',
  challenges: rebirth.value.pendingChallengeName ? `挂 ${rebirth.value.pendingChallengeName}` : '',
  history: rebirth.value.historyRows.length ? `${rebirth.value.historyRows.length} 条` : '',
}));
</script>

<template>
  <section class="starmap" :class="{ 'starmap-inactive': !active }">
    <div ref="stage" class="starmap-stage">
      <div
        ref="viewport"
        class="starmap-viewport"
        :class="{ dragging }"
        @pointerdown="onPanDown"
        @pointermove="onPanMove"
        @pointerup="onPanUp"
        @pointercancel="onPanUp"
        @scroll.passive="rememberPan"
      >
        <div v-memo="[nodes, rebirth.root.name]" class="starmap-canvas" :style="{ width: `${SIZE}px`, height: `${SIZE}px` }">
          <svg class="starmap-sky" :viewBox="`0 0 ${SIZE} ${SIZE}`" aria-hidden="true">
            <circle v-for="star in STARS" :key="star.key" :cx="star.x" :cy="star.y" :r="star.r" :opacity="star.o" :class="{ twinkle: star.twinkle }" />
            <circle v-for="r in ORBITS" :key="r" class="orbit" :cx="ROOT.x" :cy="ROOT.y" :r="r" />
            <line
              v-for="link in links"
              :key="link.key"
              :class="`link link-${link.state}`"
              :x1="link.x1"
              :y1="link.y1"
              :x2="link.x2"
              :y2="link.y2"
            />
          </svg>

          <div class="quest-root" :style="{ left: `${ROOT.x}px`, top: `${ROOT.y}px` }">
            <AchievementIcon :icon="STAR_ICON" :size="44" />
            <span class="root-label">{{ rebirth.root.name }}</span>
          </div>

          <button
            v-for="node in nodes"
            :key="node.id"
            type="button"
            class="quest-node"
            :class="[`is-${node.state}`, { 'is-gated': node.gated }]"
            :style="{ left: `${node.cx}px`, top: `${node.cy}px`, '--branch': node.color }"
            :aria-disabled="!node.buyable"
            :aria-label="`${node.name}，${node.effectText}，${node.owned ? '已完成' : `${node.cost} 条线缆`}`"
            @pointerenter="showTip(node.id, $event)"
            @pointerleave="hideTip"
            @focus="showTip(node.id, $event)"
            @blur="hideTip"
            @click="buy(node)"
          >
            <AchievementIcon :icon="node.icon" :size="32" />
            <i v-if="node.owned" class="quest-check" aria-hidden="true">✔</i>
            <em v-else class="quest-cost">{{ node.gated ? '🔒' : `${node.cost} 条` }}</em>
          </button>
        </div>
      </div>

      <!-- 右上：线缆余额与转生操作，中央留给星图 -->
      <div class="hud-actions">
      <div class="hud-top">
        <span class="hud-label">时空线缆</span>
        <b class="hud-cables">{{ rebirth.cables }}</b>
        <span class="hud-sub">已点亮 {{ ownedCount }} / {{ rebirth.nodes.length }} · 已转生 {{ rebirth.count }} 次</span>
      </div>

        <button type="button" class="hud-rebirth" :class="{ ready: rebirth.canRebirth }" :disabled="!rebirth.canRebirth" @click="doRebirth">
          转生
          <small>{{ rebirth.canRebirth ? `本次可得 ${rebirth.maxCables} 条` : '需达到 MAX' }}</small>
        </button>
        <button type="button" class="hud-button" @click="emit('close')">回到工厂</button>
      </div>

      <!-- 左侧：任务书章节列表 -->
      <nav class="quest-chapters" aria-label="星图支线">
        <button
          v-for="chapter in chapters"
          :key="chapter.id"
          type="button"
          class="chapter"
          :style="{ '--branch': chapter.color }"
          :title="`${chapter.name}支线`"
          @click="scrollToPoint(chapter.cx, chapter.cy, true)"
        >
          <AchievementIcon :icon="chapter.icon" :size="20" />
          <span class="chapter-name">{{ chapter.name }}</span>
          <span class="chapter-count">{{ chapter.owned }}/{{ chapter.total }}</span>
          <i v-if="chapter.buyable" class="chapter-dot" aria-label="有可购买节点" />
          <span class="chapter-bar" :style="{ width: `${(chapter.owned / chapter.total) * 100}%` }" />
        </button>
        <button type="button" class="chapter chapter-home" @click="scrollToPoint(ROOT.x, ROOT.y, true)">
          <AchievementIcon :icon="STAR_ICON" :size="20" />
          <span class="chapter-name">回到锚点</span>
        </button>
      </nav>

      <div class="quest-legend" aria-hidden="true">
        <span><i class="sw owned" />已完成</span>
        <span><i class="sw buyable" />可购买</span>
        <span><i class="sw open" />线缆不足</span>
        <span><i class="sw locked" />未解锁</span>
      </div>

      <div
        v-if="hovered && hoveredNode"
        class="quest-tip"
        :class="{ flip: hovered.flip }"
        :style="{ left: `${hovered.left}px`, top: `${hovered.top}px` }"
        role="tooltip"
      >
        <b class="tip-title" :class="`is-${hoveredNode.state}`">{{ hoveredNode.name }}</b>
        <span class="tip-chapter">{{ hoveredNode.branchName }}支线 · 第 {{ hoveredNode.layer }} 层</span>
        <span class="tip-effect">{{ hoveredNode.effectText }}</span>
        <span v-if="hoveredNode.owned" class="tip-done">✔ 已完成，永久生效</span>
        <template v-else>
          <span v-if="hoveredNode.gated" class="tip-warn">需要先拥有平行宇宙：{{ hoveredNode.requireUniverseName }}</span>
          <span v-else-if="!hoveredNode.unlocked" class="tip-warn">前置任务：{{ hoveredNode.requireNames.join('、') }}</span>
          <span class="tip-cost" :class="{ short: hoveredNode.unlocked && !hoveredNode.buyable }">
            价格 {{ hoveredNode.cost }} 条时空线缆{{ hoveredNode.buyable ? ' · 点击购买' : '' }}
          </span>
        </template>
      </div>
    </div>

    <p class="starmap-note muted small">
      {{ rebirth.canRebirth ? '已达 MAX：现在转生按累计 EU 结算' : '还没到 MAX：只能等时空裂缝（每周目一次）' }}<template v-if="rebirth.riftClosed && !rebirth.canRebirth">，本周目的裂缝已经关掉了</template>。
      转生会清空本周目的矿石、GT 币、机器、电压、矿脉、电网与研究进度，只留下线缆、星图加成、转生次数和累计统计。
      本周目累计 {{ rebirth.runEU }} EU。按住星空拖动查看整张星图。
    </p>

    <section class="panel starmap-panel">
      <div class="starmap-tabs" role="tablist" aria-label="转生选项">
        <button
          v-for="tab in REBIRTH_TABS"
          :id="`rebirth-tab-${tab}`"
          :key="tab"
          type="button"
          role="tab"
          :aria-selected="store.rebirthTab === tab"
          :aria-controls="`rebirth-panel-${tab}`"
          :class="{ active: store.rebirthTab === tab }"
          @click="store.setRebirthTab(tab)"
        >
          {{ TAB_NAMES[tab] }}
          <span v-if="tabBadge[tab]" class="muted small">{{ tabBadge[tab] }}</span>
        </button>
      </div>

      <div :id="`rebirth-panel-${store.rebirthTab}`" role="tabpanel" :aria-labelledby="`rebirth-tab-${store.rebirthTab}`">
        <template v-if="store.rebirthTab === 'bonuses'">
          <div class="row">
            <div class="name">
              <template v-if="rebirth.planckOwned"><b>普朗克锚</b>已铸造：MAX 转生的线缆结算永久 ×1.5</template>
              <template v-else><b>普朗克锚</b>（终局装置）：花 300 条线缆铸造，MAX 转生的线缆结算永久 ×1.5</template>
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
          <dl class="stats">
            <div v-for="bonus in rebirth.bonuses" :key="bonus.label" class="stat">
              <dt>{{ bonus.label }}</dt>
              <dd>{{ bonus.value }}</dd>
            </div>
          </dl>
        </template>

        <template v-else-if="store.rebirthTab === 'universes'">
          <p class="muted small tab-intro">转生时可以带一个宇宙走，选过的永久叠加 —— 下一轮开始，核心规则就多一条。</p>
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
              <span v-for="effect in universe.effects" :key="effect" class="muted small effect">· {{ effect }}</span>
            </button>
          </div>
        </template>

        <template v-else-if="store.rebirthTab === 'challenges'">
          <p v-if="rebirth.activeChallengeName" class="small tab-intro">
            本周目挑战：<b>{{ rebirth.activeChallengeName }}</b>（{{ rebirth.activeChallengeDesc }}，结算
            <span :class="{ danger: rebirth.activeChallengeFailed }">
              {{ rebirth.activeChallengeFailed ? '已失效，不加成' : `通过 ${rebirth.activeChallengeBonus}` }}
            </span>{{ rebirth.activeChallengeFirstDone && !rebirth.activeChallengeFailed ? '，首通已达成' : '' }}）
          </p>
          <p v-else class="muted small tab-intro">本周目没有挂挑战。</p>
          <p class="muted small tab-intro">
            转生时可以自愿挂上 0 或 1 个挑战，下一周目全程受检：通过则线缆结算乘倍率并点亮首通成就，违规立刻失效（没有惩罚）。
          </p>
          <div class="universe-list">
            <button
              v-for="row in challengeRows"
              :key="row.id"
              type="button"
              class="universe"
              :class="{ picked: row.selected, todo: !row.eligible }"
              :disabled="!row.eligible"
              @click="pickChallenge(row.id, row.eligible, row.selected)"
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

        <template v-else>
          <p v-if="rebirth.historyRows.length === 0" class="muted small tab-intro">
            还没有转生记录——第一次转生之后这里会记下每一趟的路线、宇宙、挑战与线缆结算。
          </p>
          <table v-else class="detail-table history-table">
            <thead>
              <tr><th>周目</th><th>路线</th><th>宇宙</th><th>挑战</th><th>结算</th><th>时长</th><th>电压</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in rebirth.historyRows" :key="row.run">
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
      </div>
    </section>
  </section>
</template>

<style scoped>
/* 星图本身固定用深色星空，不跟随浅色 / 经典主题 */
.starmap-stage {
  position: relative;
  height: clamp(520px, 76vh, 940px);
  overflow: hidden;
  border: 3px solid #1c1c24;
  outline: 1px solid #4a4a58;
  background: radial-gradient(ellipse at 50% 45%, #1a1534 0%, #0c0b1d 45%, #040409 100%);
  color: #e8e8f0;
  box-shadow: inset 0 0 80px #000c;
}

.starmap-viewport {
  position: absolute;
  inset: 0;
  overflow: auto;
  cursor: grab;
  scrollbar-width: none;
  overscroll-behavior: contain;
  touch-action: none;
}
.starmap-viewport::-webkit-scrollbar { display: none; }
.starmap-viewport.dragging { cursor: grabbing; user-select: none; }

.starmap-canvas { position: relative; }

.starmap-sky {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.starmap-sky circle { fill: #fff; }
.starmap-sky .twinkle { animation: twinkle 3.2s ease-in-out infinite alternate; }
.starmap-sky .orbit { fill: none; stroke: #8f86d8; stroke-opacity: 0.12; stroke-dasharray: 2 7; }

.link { stroke-width: 3; stroke-linecap: square; }
.link-owned { stroke: #3fbf5f; filter: drop-shadow(0 0 3px #3fbf5f99); }
.link-available { stroke: #e8c13a; stroke-dasharray: 8 6; animation: flow 1.2s linear infinite; }
.link-locked { stroke: #50505c; stroke-opacity: 0.7; }

/* ── 任务格（BetterQuesting 风格：方框 + 物品图标 + 斜面描边）── */
.quest-root,
.starmap button.quest-node {
  position: absolute;
  transform: translate(-50%, -50%);
}

.quest-root {
  display: grid;
  place-items: center;
  width: 78px;
  height: 78px;
  border: 3px solid #b48cff;
  background: #24183f;
  box-shadow: inset 3px 3px 0 #ffffff26, inset -3px -3px 0 #0008, 0 0 28px #b48cff88;
}
.root-label {
  position: absolute;
  top: calc(100% + 6px);
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
  color: #e6d8ff;
  text-shadow: 0 1px 0 #000, 0 0 8px #b48cff;
}

.starmap button.quest-node {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  min-height: 0;
  padding: 0;
  border: 3px solid #5a5a66;
  border-image: none;
  background: #2b2b33;
  color: inherit;
  box-shadow: inset 2px 2px 0 #ffffff1f, inset -2px -2px 0 #0009, 0 3px 8px #0009;
  cursor: default;
  transition: transform 120ms, box-shadow 200ms, border-color 200ms, background 200ms;
}
/* 左上角一小块支线色，方便一眼认出属于哪条支线 */
.starmap button.quest-node::before {
  content: '';
  position: absolute;
  top: -3px;
  left: -3px;
  width: 9px;
  height: 9px;
  background: var(--branch);
}
.starmap button.quest-node :deep(img) { image-rendering: pixelated; }

.starmap button.quest-node.is-locked { border-color: #44444e; background: #1e1e25; }
.starmap button.quest-node.is-locked :deep(.achievement-icon) { filter: grayscale(1) brightness(0.45); }
.starmap button.quest-node.is-open { border-color: #8a7330; background: #2c281c; }
.starmap button.quest-node.is-buyable {
  border-color: #ffd23f;
  background: #3a3218;
  cursor: pointer;
  animation: quest-pulse 1.4s ease-in-out infinite;
}
.starmap button.quest-node.is-owned {
  border-color: #3fbf5f;
  background: #1c3524;
  box-shadow: inset 2px 2px 0 #ffffff26, inset -2px -2px 0 #0009, 0 0 12px #3fbf5f66;
}
.starmap button.quest-node:hover,
.starmap button.quest-node:focus-visible {
  z-index: 2;
  transform: translate(-50%, -50%) scale(1.12);
  outline: none;
}
.starmap button.quest-node:focus-visible { box-shadow: 0 0 0 2px #fff, 0 0 16px #fff8; }

.quest-check,
.quest-cost {
  position: absolute;
  pointer-events: none;
  font-style: normal;
  font-family: var(--font-num);
  line-height: 1;
}
.quest-check {
  right: -6px;
  bottom: -6px;
  padding: 2px 3px;
  font-size: 10px;
  color: #d8ffe0;
  background: #2e8f47;
  border: 1px solid #0008;
}
.quest-cost {
  top: calc(100% + 5px);
  padding: 2px 5px;
  white-space: nowrap;
  font-size: 10px;
  color: #c8c8d4;
  background: #000a;
}
.is-buyable .quest-cost { color: #ffe27a; }
.is-locked .quest-cost { color: #77778a; }

/* ── HUD ─────────────────────────────────────────────────── */
.hud-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 22px 8px;
  background: linear-gradient(#000c, #0006);
  border: 1px solid #ffffff1f;
  pointer-events: none;
  text-shadow: 0 2px 0 #000;
}
.hud-label { font-size: 12px; letter-spacing: 0.2em; color: #b9b0e8; }
.hud-cables { font-family: var(--font-num); font-size: 30px; line-height: 1.15; color: #f3e9ff; text-shadow: 0 0 14px #b48cff, 0 2px 0 #000; }
.hud-sub { font-size: 12px; color: #a8a8bc; }

.hud-actions {
  position: absolute;
  top: 14px;
  right: 14px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
.starmap .hud-rebirth,
.starmap .hud-button {
  border-image: none;
  border-width: 2px;
  background: #15141f;
  color: #e8e8f0;
  border-color: #4a4a58;
}
.starmap .hud-rebirth {
  flex-direction: column;
  gap: 0;
  min-height: 52px;
  padding: 4px 18px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.2;
}
.hud-rebirth small { font-size: 11px; font-weight: 400; opacity: 0.8; }
.starmap .hud-rebirth.ready { border-color: #b48cff; background: #2a1b4d; box-shadow: 0 0 18px #b48cff80; }
.starmap .hud-rebirth:not(:disabled):hover,
.starmap .hud-button:not(:disabled):hover { background: #2a2840; border-color: #b48cff; }
.starmap .hud-rebirth:disabled { color: #8a8a9a; opacity: 0.8; }

/* ── 任务书章节列表 ─────────────────────────────────────── */
.quest-chapters {
  position: absolute;
  top: 14px;
  left: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 150px;
  padding: 6px;
  background: #000000a6;
  border: 1px solid #ffffff1f;
}
.starmap .chapter {
  position: relative;
  justify-content: flex-start;
  gap: 8px;
  min-height: 34px;
  padding: 0 8px;
  overflow: hidden;
  border: 1px solid #ffffff14;
  border-left: 3px solid var(--branch, #b48cff);
  border-image: none;
  background: #ffffff0a;
  color: #e8e8f0;
  font-size: 13px;
}
.starmap .chapter:not(:disabled):hover { background: #ffffff1c; border-color: var(--branch, #b48cff); }
.chapter-name { flex: 1; text-align: left; }
.chapter-count { font-family: var(--font-num); font-size: 11px; color: #a8a8bc; }
.chapter-dot { position: absolute; top: 4px; right: 4px; width: 6px; height: 6px; background: #ffd23f; box-shadow: 0 0 6px #ffd23f; }
.chapter-bar { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--branch); }
.starmap .chapter-home { margin-top: 4px; border-left-color: #b48cff; }

.quest-legend {
  position: absolute;
  left: 14px;
  bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 4px 10px;
  font-size: 11px;
  color: #b4b4c6;
  background: #0009;
  pointer-events: none;
}
.quest-legend span { display: inline-flex; align-items: center; gap: 5px; }
.sw { width: 10px; height: 10px; border: 2px solid; }
.sw.owned { border-color: #3fbf5f; background: #1c3524; }
.sw.buyable { border-color: #ffd23f; background: #3a3218; }
.sw.open { border-color: #8a7330; background: #2c281c; }
.sw.locked { border-color: #44444e; background: #1e1e25; }

/* ── 悬停提示：Minecraft 物品提示框的紫边黑底 ──────────── */
.quest-tip {
  position: absolute;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: max-content;
  max-width: 280px;
  padding: 8px 10px;
  background: #100010f2;
  border: 2px solid #5000ff;
  border-color: #5000ff #28007f #28007f #5000ff;
  box-shadow: 0 0 0 1px #100010, 0 6px 20px #000c;
  font-size: 13px;
  line-height: 1.45;
  pointer-events: none;
}
.quest-tip.flip { transform: translateX(-100%); }
.tip-title { font-size: 14px; color: #fff; }
.tip-title.is-owned { color: #55ff55; }
.tip-title.is-buyable { color: #ffff55; }
.tip-title.is-locked { color: #aaaaaa; }
.tip-chapter { font-size: 11px; color: #8888aa; }
.tip-effect { color: #55ffff; }
.tip-done { color: #55ff55; }
.tip-warn { color: #ff7777; }
.tip-cost { color: #ffaa00; font-family: var(--font-num); font-size: 12px; }
.tip-cost.short { color: #ff5555; }

/* ── 下方的转生选项 ─────────────────────────────────────── */
.starmap-note { margin: 10px 2px 14px; line-height: 1.6; }

.starmap-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--line);
}
.starmap-tabs button {
  min-height: 36px;
  margin-bottom: -1px;
  border-width: 1px 1px 2px;
  border-image: none;
  border-color: transparent;
  background: transparent;
  color: var(--muted);
  font-weight: 600;
}
.starmap-tabs button.active { color: var(--text); border-color: var(--line) var(--line) var(--accent); background: var(--panel-2); }
.tab-intro { margin: 0 0 8px; }
.starmap-panel .row { margin-bottom: 12px; }

@keyframes quest-pulse {
  0%, 100% { box-shadow: inset 2px 2px 0 #ffffff26, inset -2px -2px 0 #0009, 0 0 6px #ffd23f55; }
  50% { box-shadow: inset 2px 2px 0 #ffffff26, inset -2px -2px 0 #0009, 0 0 18px #ffd23fcc; }
}
@keyframes flow { to { stroke-dashoffset: -28; } }
@keyframes twinkle { from { opacity: 0.15; } }

.starmap-inactive *, .starmap-inactive *::before, .starmap-inactive *::after { animation-play-state: paused !important; }
:global(body.motion-off) .starmap * { animation: none !important; }

@media (max-width: 760px) {
  .starmap-stage { height: 72vh; }
  .quest-chapters { width: auto; }
  .chapter-name, .chapter-count, .quest-legend { display: none; }
  .hud-sub { display: none; }
  .hud-cables { font-size: 24px; }
}
</style>
