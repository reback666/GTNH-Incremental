<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';

const store = useGameStore();
const risk = computed(() => store.snap.risk);
</script>

<template>
  <section class="panel">
    <h2>设置与风险</h2>

    <div class="row">
      <div class="name">污染机制</div>
      <button :class="{ primary: risk.enabled }" @click="store.setPollutionEnabled(true)">开启</button>
      <button :class="{ primary: !risk.enabled }" @click="store.setPollutionEnabled(false)">
        关闭
      </button>
    </div>
    <p class="muted small" style="margin: 6px 0 0">
      关掉之后污染不再增长、也不产生任何影响（默认开启）。
    </p>

    <div class="pollution">
      <div class="pollution-head">
        <span>污染值</span>
        <b>{{ risk.pollution }}</b>
      </div>
      <div class="pollution-track" :class="{ off: !risk.enabled }">
        <span
          class="pollution-fill"
          :class="risk.band"
          :style="{ width: (risk.enabled ? risk.pollutionRaw : '0') + '%' }"
        />
        <span class="pollution-mark" style="left: 30%">30%</span>
        <span class="pollution-mark" style="left: 70%">70%</span>
      </div>
      <p class="muted small" style="margin: 6px 0 0">{{ risk.bandName }}</p>

      <dl class="stats">
        <div class="stat">
          <dt>产生</dt>
          <dd>{{ risk.enabled ? risk.growth : '—' }}</dd>
        </div>
        <div class="stat">
          <dt>净化</dt>
          <dd>{{ risk.enabled ? '-' + risk.purify : '—' }}</dd>
        </div>
        <div class="stat">
          <dt>净变化</dt>
          <dd :class="{ danger: risk.enabled && risk.netPositive }">
            {{ risk.enabled ? risk.net : '—' }}
          </dd>
        </div>
      </dl>
      <p class="muted small" style="margin: 0">
        中度污染会变异（{{ risk.mutationChance }}），重度污染会工厂崩溃（{{
          risk.collapseChance
        }}）。建净化器把污染压回 30% 以下。
      </p>
    </div>

    <h2 class="mt">电网</h2>
    <div class="grid-modes">
      <button
        v-for="mode in risk.gridModes"
        :key="mode.id"
        type="button"
        class="grid-mode"
        :class="{ active: risk.grid === mode.id, locked: !mode.unlocked }"
        :disabled="!mode.unlocked"
        @click="store.setGrid(mode.id)"
      >
        <b>
          {{ mode.name }}
          <span v-if="!mode.unlocked" class="lock">{{ mode.unlockLabel }}</span>
        </b>
        <span class="muted small">{{ mode.summary }}</span>
      </button>
    </div>
    <p v-if="risk.outage" class="danger small" style="margin: 8px 0 0">
      电网断电中：所有机器停转，等它恢复。
    </p>
    <p v-if="risk.grid === 'black'" class="muted small" style="margin: 8px 0 0">
      累计被黑市薅走 {{ risk.siphoned }} 币。
    </p>
  </section>
</template>
