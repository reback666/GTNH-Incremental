<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';

// 设置：污染机制的整体开关与污染读数（计划书第六章）。
// 电网、转生都在别的页面，这里只管设置项。
const store = useGameStore();
const risk = computed(() => store.snap.risk);
</script>

<template>
  <section class="panel">
    <h2>设置</h2>

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
  </section>
</template>
