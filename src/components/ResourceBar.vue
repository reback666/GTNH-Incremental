<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';
import AnimatedNumber from './AnimatedNumber.vue';

const store = useGameStore();
const snap = computed(() => store.snap);

// 离线收益横幅：这次打开页面期间关掉就不再出现（关闭状态放在 store 上，换页不丢）
const offlineDismissed = computed(() => store.offlineBannerDismissed);
</script>

<template>
  <section class="panel">
    <!-- 离线收益：横幅卡片，看完点 × 收起 -->
    <div v-if="store.offlineNote && !offlineDismissed" class="offline-banner">
      <span class="offline-icon" aria-hidden="true">⏱</span>
      <span class="offline-text">{{ store.offlineNote }}</span>
      <button type="button" class="offline-close" aria-label="收起离线收益" @click="store.offlineBannerDismissed = true">
        ×
      </button>
    </div>

    <!-- ── 矿石（电能四格与标题已搬进左侧仪表侧栏，换页常驻） ── -->
    <h2>矿石</h2>
    <div class="chips">
      <!-- 鼠标移上去（或键盘聚焦）时，框向下拉伸出这一级的实时产量 -->
      <div v-for="row in snap.ores" :key="row.tier" class="chip" tabindex="0">
        <div class="chip-head">
          <span class="chip-name">{{ row.name }}</span>
          <AnimatedNumber :value="row.value" :display="row.amount" />
        </div>
        <div class="chip-detail">
          <div class="chip-clip">
            <div v-for="line in row.detail" :key="line.label" class="chip-line">
              <span>{{ line.label }}</span>
              <b>{{ line.value }}</b>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── 第三行：GT 币 ────────────────────────────────────── -->
    <h2 class="mt">GT 币</h2>
    <div class="chips">
      <div v-for="row in snap.coins" :key="row.tier" class="chip" tabindex="0">
        <div class="chip-head">
          <span class="chip-name">{{ row.name }}</span>
          <AnimatedNumber :value="row.value" :display="row.amount" />
        </div>
        <div class="chip-detail">
          <div class="chip-clip">
            <div v-for="line in row.detail" :key="line.label" class="chip-line">
              <span>{{ line.label }}</span>
              <b>{{ line.value }}</b>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── 奥术宇宙：灵气与源质 ─────────────────────────────── -->
    <template v-if="snap.arcane.active">
      <h2 class="mt">灵气（奥术宇宙）</h2>
      <dl class="stats stats-loose">
        <div class="stat">
          <dt>灵气产出</dt>
          <dd>{{ snap.arcane.visProduced }}</dd>
        </div>
        <div class="stat">
          <dt>灵气消耗</dt>
          <dd>{{ snap.arcane.visUsed }}</dd>
        </div>
        <div class="stat">
          <dt>灵气充裕度</dt>
          <dd>{{ snap.arcane.plenty }}</dd>
        </div>
        <div class="stat">
          <dt>产量加成</dt>
          <dd>普通 {{ snap.arcane.bonusNormal }} / 魔法 {{ snap.arcane.bonusMagic }}</dd>
        </div>
        <div class="stat">
          <dt>源质存量</dt>
          <dd>{{ snap.arcane.essentia }}</dd>
        </div>
        <div class="stat">
          <dt>源质净变化</dt>
          <dd :class="{ danger: !snap.arcane.essentiaPositive }">{{ snap.arcane.essentiaNet }}</dd>
        </div>
      </dl>
      <p class="muted small" style="margin: 6px 0 0">{{ snap.arcane.note }}</p>
    </template>

  </section>
</template>
