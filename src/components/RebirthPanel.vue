<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore, type RebirthNodeRow } from '../game/store';
import { REBIRTH_NODES } from '../game/rebirth';

const store = useGameStore();
const rebirth = computed(() => store.snap.rebirth);

// 树的连线：根 → 每条支线的第一格，再按 requires 连到下一层
interface Link {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const links = computed<Link[]>(() => {
  const byId = new Map(REBIRTH_NODES.map((node) => [node.id, node]));
  const out: Link[] = [];
  for (const node of REBIRTH_NODES) {
    const parents = node.requires.length === 0 ? [null] : node.requires;
    for (const parentId of parents) {
      if (parentId === null) continue;
      const parent = byId.get(parentId);
      if (!parent) continue;
      out.push({
        key: `${parentId}->${node.id}`,
        x1: parent.x,
        y1: parent.y + 20,
        x2: node.x,
        y2: node.y - 20,
      });
    }
  }
  // 根节点连到三条支线的第一格
  for (const node of REBIRTH_NODES) {
    if (node.layer !== 1) continue;
    out.push({
      key: `root->${node.id}`,
      x1: rebirth.value.root.x,
      y1: rebirth.value.root.y + 16,
      x2: node.x,
      y2: node.y - 20,
    });
  }
  return out;
});

const branches = computed(() => [
  { id: 'speed', title: '速度支线' },
  { id: 'economy', title: '经济支线' },
  { id: 'research', title: '研究支线' },
]);

function nodeClass(node: RebirthNodeRow) {
  return { owned: node.owned, buyable: !node.owned && node.buyable };
}
</script>

<template>
  <section class="panel">
    <h2>转生</h2>
    <dl class="stats">
      <div class="stat">
        <dt>时空线缆</dt>
        <dd>{{ rebirth.cables }} 条</dd>
      </div>
      <div class="stat">
        <dt>转生次数</dt>
        <dd>{{ rebirth.count }} 次</dd>
      </div>
      <div class="stat">
        <dt>本周目累计 EU</dt>
        <dd>{{ rebirth.runEU }}</dd>
      </div>
      <div class="stat">
        <dt>打到 MAX 可得</dt>
        <dd>{{ rebirth.maxCables }} 条</dd>
      </div>
    </dl>

    <p class="muted small" style="margin: 8px 0 0">
      转生会清空本周目的矿石、GT 币、机器、电压、矿脉、电网与研究进度，只留下时空线缆、
      永久加成、转生次数和累计统计。
    </p>

    <div class="row" style="margin-top: 10px">
      <div class="name">
        {{ rebirth.canRebirth ? '已达 MAX，可以转生' : '还没到 MAX，只能等时空裂缝（每周目一次）' }}
      </div>
      <button
        class="big"
        :class="{ primary: rebirth.canRebirth }"
        :disabled="!rebirth.canRebirth"
        @click="store.rebirth('max')"
      >
        转生
      </button>
    </div>
    <p v-if="rebirth.riftClosed && !rebirth.canRebirth" class="muted small" style="margin: 6px 0 0">
      本周目的时空裂缝已经关掉了，这一轮只剩打到 MAX。
    </p>

    <h2 class="mt">永久加成</h2>
    <p class="muted small" style="margin: 0 0 8px">
      时空线缆只能花在这里。节点是一次性买断，跨周目一直生效；外层要先买内层。
      已买 {{ rebirth.treeOwned }} / {{ rebirth.nodes.length }} 格，买满需要 {{ rebirth.treeTotal }} 条。
    </p>

    <div class="rebirth-tree">
      <svg class="rebirth-links" viewBox="0 0 660 330" aria-hidden="true">
        <line
          v-for="link in links"
          :key="link.key"
          :x1="link.x1"
          :y1="link.y1"
          :x2="link.x2"
          :y2="link.y2"
        />
      </svg>
      <div class="rebirth-root" :style="{ left: rebirth.root.x + 'px', top: rebirth.root.y + 'px' }">
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
        :title="node.owned ? '已点亮' : `前置：${node.requires.join(' / ') || '无'} · 价格 ${node.cost} 条`"
        @click="store.buyRebirthNode(node.id)"
      >
        <b>{{ node.name }}</b>
        <span>{{ node.effectText }}</span>
        <em>{{ node.owned ? '已点亮' : node.cost + ' 条' }}</em>
      </button>
      <div
        v-for="branch in branches"
        :key="branch.id"
        class="rebirth-branch-title"
        :class="branch.id"
      >
        {{ branch.title }}
      </div>
    </div>

    <dl class="stats">
      <div v-for="bonus in rebirth.bonuses" :key="bonus.label" class="stat">
        <dt>{{ bonus.label }}</dt>
        <dd>{{ bonus.value }}</dd>
      </div>
    </dl>
  </section>

  <!-- 时空裂缝：本周目第一次到 LuV 时弹一次 -->
  <Teleport to="body">
    <div v-if="rebirth.riftPending" class="rift-backdrop">
      <div class="rift-dialog">
        <h2>时空裂缝</h2>
        <p>
          电力阶梯在这里出现了一道裂缝。现在穿过去，就能立刻重开一轮，
          并带走 <b>1 条时空线缆</b> —— 刚好够点亮永久加成树最里面的一格。
        </p>
        <p class="muted small">
          裂缝的收益是固定的，跟你的累计 EU、电压都无关；穿过它，本周目的矿石、机器、
          研究进度都会清空。如果你留在这一轮，就只剩打到 MAX 才能转生 ——
          那条路按累计 EU 结算，能拿得多得多。
        </p>
        <p class="muted small">每个周目只有这一次机会，选了不转就不会再出现。</p>
        <div class="rift-actions">
          <button @click="store.declineRift()">留在这一轮</button>
          <button class="primary" @click="store.rebirth('rift')">穿过去（转生）</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
