<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '../game/store';
import AnimatedNumber from './AnimatedNumber.vue';

// 工厂页顶部的横向资源带：矿石组 + GT 币组 + 灵气（奥术宇宙）+ 离线收益。
// 每格悬停/聚焦弹出固定定位明细（产入/耗出/净变化），资源带本身可横向滚动。
const store = useGameStore();
const snap = computed(() => store.snap);
const offlineDismissed = computed(() => store.offlineBannerDismissed);

// 只记住悬停的资源种类与等级和浮层位置；明细每拍从最新 snap 实时查找
type ResKind = 'ore' | 'coin';
interface DetailAnchor {
  kind: ResKind;
  tier: number;
  x: number;
  y: number;
}
const anchor = ref<DetailAnchor | null>(null);
const arcaneOpen = ref(false);

const detail = computed(() => {
  const a = anchor.value;
  if (!a) return null;
  const rows = a.kind === 'ore' ? snap.value.ores : snap.value.coins;
  const row = rows.find((r) => r.tier === a.tier);
  if (!row) return null;
  return { title: row.name, lines: row.detail, x: a.x, y: a.y };
});

function showDetail(event: Event, kind: ResKind, tier: number) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const width = 240;
  anchor.value = {
    kind,
    tier,
    x: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    y: rect.bottom + 6,
  };
}
function hideDetail() {
  anchor.value = null;
}
</script>

<template>
  <section class="res-strip" aria-label="资源">
    <div class="res-scroll">
      <div class="res-group" role="group" aria-label="矿石">
        <span class="res-group-name">矿石</span>
        <div
          v-for="row in snap.ores"
          :key="'o' + row.tier"
          class="res-chip"
          tabindex="0"
          :aria-label="`${row.name} ${row.amount}`"
          @mouseenter="showDetail($event, 'ore', row.tier)"
          @mouseleave="hideDetail"
          @focus="showDetail($event, 'ore', row.tier)"
          @blur="hideDetail"
        >
          <span class="res-name">{{ row.name }}</span>
          <AnimatedNumber :value="row.value" :display="row.amount" />
        </div>
      </div>
      <div class="res-group" role="group" aria-label="GT 币">
        <span class="res-group-name">GT 币</span>
        <div
          v-for="row in snap.coins"
          :key="'c' + row.tier"
          class="res-chip"
          tabindex="0"
          :aria-label="`${row.name} ${row.amount}`"
          @mouseenter="showDetail($event, 'coin', row.tier)"
          @mouseleave="hideDetail"
          @focus="showDetail($event, 'coin', row.tier)"
          @blur="hideDetail"
        >
          <span class="res-name">{{ row.name }}</span>
          <AnimatedNumber :value="row.value" :display="row.amount" />
        </div>
      </div>
      <div v-if="snap.arcane.active" class="res-group" role="group" aria-label="灵气与源质">
        <span class="res-group-name">灵气</span>
        <button
          type="button"
          class="res-chip res-chip-btn"
          :aria-expanded="arcaneOpen"
          title="展开灵气与源质详情"
          @click="arcaneOpen = !arcaneOpen"
        >
          <span class="res-name">充裕度 {{ snap.arcane.plenty }}</span>
          <b :class="{ danger: !snap.arcane.essentiaPositive }">源质 {{ snap.arcane.essentia }}</b>
        </button>
      </div>
    </div>

    <div v-if="store.offlineNote && !offlineDismissed" class="offline-banner">
      <span class="offline-icon" aria-hidden="true">⏱</span>
      <span class="offline-text">{{ store.offlineNote }}</span>
      <button type="button" class="offline-close" aria-label="收起离线收益" @click="store.offlineBannerDismissed = true">
        ×
      </button>
    </div>

    <div v-if="snap.arcane.active && arcaneOpen" class="arcane-detail panel">
      <dl class="stats stats-loose">
        <div class="stat"><dt>灵气产出</dt><dd>{{ snap.arcane.visProduced }}</dd></div>
        <div class="stat"><dt>灵气消耗</dt><dd>{{ snap.arcane.visUsed }}</dd></div>
        <div class="stat"><dt>灵气充裕度</dt><dd>{{ snap.arcane.plenty }}</dd></div>
        <div class="stat">
          <dt>产量加成</dt>
          <dd>普通 {{ snap.arcane.bonusNormal }} / 魔法 {{ snap.arcane.bonusMagic }}</dd>
        </div>
        <div class="stat"><dt>源质存量</dt><dd>{{ snap.arcane.essentia }}</dd></div>
        <div class="stat">
          <dt>源质净变化</dt>
          <dd :class="{ danger: !snap.arcane.essentiaPositive }">{{ snap.arcane.essentiaNet }}</dd>
        </div>
      </dl>
      <p class="muted small arcane-note">{{ snap.arcane.note }}</p>
    </div>

    <Teleport to="body">
      <div v-if="detail" class="model-tip res-pop" role="tooltip" :style="{ left: detail.x + 'px', top: detail.y + 'px' }">
        <div class="tip-name">{{ detail.title }}</div>
        <div v-for="line in detail.lines" :key="line.label" class="tip-row">
          <span>{{ line.label }}</span>
          <b>{{ line.value }}</b>
        </div>
      </div>
    </Teleport>
  </section>
</template>
