<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore, type RebirthNodeRow } from '../game/store';
import { REBIRTH_NODES } from '../game/rebirth';

// 独立的转生页面：进来之后只显示转生相关的东西，工厂界面完全不出现。
// 从主界面顶部的入口进来，或转生刚发生时自动进来；点「回到工厂」返回。
const emit = defineEmits<{ close: [] }>();
const store = useGameStore();
const rebirth = computed(() => store.snap.rebirth);
const universes = computed(() => store.snap.universes);
// 本次转生要带上的宇宙。选择存在存档里（rebirth.pendingUniverse），
// 所以来回切页面、刷新都不会丢
const pickedUniverse = computed(() => store.snap.rebirth.pendingUniverse);

function pickUniverse(id: string, owned: boolean, implemented: boolean) {
  if (owned || !implemented) return;
  // 再点一下取消选择
  store.setPendingUniverse(pickedUniverse.value === id ? null : id);
}

function doRebirth() {
  store.rebirth('max', pickedUniverse.value || undefined);
}

interface Link {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// 树的连线：根 → 每条支线的第一格，再按前置关系连到下一层
const links = computed<Link[]>(() => {
  const byId = new Map(REBIRTH_NODES.map((node) => [node.id, node]));
  const out: Link[] = [];
  for (const node of REBIRTH_NODES) {
    if (node.layer === 1) {
      out.push({
        key: `root->${node.id}`,
        x1: rebirth.value.root.x,
        y1: rebirth.value.root.y + 16,
        x2: node.x,
        y2: node.y - 20,
      });
      continue;
    }
    for (const parentId of node.requires) {
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
  return out;
});

function nodeClass(node: RebirthNodeRow) {
  return { owned: node.owned, buyable: !node.owned && node.buyable };
}
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

    <h2 class="mt">平行宇宙</h2>
    <p class="muted small" style="margin: 0 0 8px">
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

    <h2 class="mt">永久加成</h2>

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
        :title="node.owned ? undefined : `前置：${node.requires.join(' / ') || '无'} · 价格 ${node.cost} 条`"
        @click="store.buyRebirthNode(node.id)"
      >
        <span>{{ node.effectText }}</span>
        <em v-if="!node.owned">{{ node.cost }} 条</em>
      </button>
    </div>

    <h2 class="mt">已生效的加成</h2>
    <dl class="stats">
      <div v-for="bonus in rebirth.bonuses" :key="bonus.label" class="stat">
        <dt>{{ bonus.label }}</dt>
        <dd>{{ bonus.value }}</dd>
      </div>
    </dl>

    <div class="row" style="margin-top: 16px">
      <div class="name muted">加成买完就回工厂继续下一轮</div>
      <button @click="emit('close')">回到工厂</button>
    </div>
  </section>
</template>
