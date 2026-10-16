<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '../game/store';

// 污染：紧凑状态条（数值 + 进度 + 净变化），点开看完整机制说明。整体开关在设置页。
const store = useGameStore();
const risk = computed(() => store.snap.risk);
const snap = computed(() => store.snap);
const open = ref(false);
</script>

<template>
  <section class="pollution-mini" aria-label="污染">
    <button
      type="button"
      class="pollution-summary"
      :aria-expanded="open"
      :title="open ? '收起污染详情' : '展开污染详情'"
      @click="open = !open"
    >
      <span class="power-label">污染</span>
      <b>{{ risk.pollution }}</b>
      <span class="pollution-track" :class="{ off: !risk.enabled }">
        <span
          class="pollution-fill"
          :class="risk.band"
          :style="{ width: (risk.enabled ? risk.pollutionRaw : '0') + '%' }"
        />
        <span class="pollution-mark" style="left: 30%" />
        <span class="pollution-mark" style="left: 70%" />
      </span>
      <span class="muted small" :class="{ danger: risk.enabled && risk.netPositive }">
        {{ risk.enabled ? risk.net : '已关闭' }}
      </span>
      <span aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </button>

    <div v-if="open" class="pollution-detail">
      <p class="muted small">{{ risk.bandName }}</p>
      <dl class="stats stats-loose">
        <div class="stat"><dt>产生</dt><dd>{{ risk.enabled ? risk.growth : '—' }}</dd></div>
        <div class="stat"><dt>净化</dt><dd>{{ risk.enabled ? '-' + risk.purify : '—' }}</dd></div>
        <div class="stat">
          <dt>净变化</dt>
          <dd :class="{ danger: risk.enabled && risk.netPositive }">{{ risk.enabled ? risk.net : '—' }}</dd>
        </div>
      </dl>
      <p class="muted small">
        <template v-if="risk.boosted">
          污染在这个存档里是燃料：30% 是中性点，比它脏就增产、比它干净就减产。
          重度污染仍然会工厂崩溃（{{ risk.collapseChance }}）<template v-if="snap.abyss.active">，而且会腐蚀机器</template>。
        </template>
        <template v-else>
          中度污染会变异（{{ risk.mutationChance }}），重度污染会工厂崩溃（{{ risk.collapseChance }}）。建净化器把污染压回 30% 以下。
        </template>
      </p>
      <template v-if="snap.abyss.active">
        <dl class="stats stats-loose">
          <div class="stat"><dt>污染对产出</dt><dd>{{ snap.abyss.pollutionFactor }}</dd></div>
          <div class="stat"><dt>抑制器抵消</dt><dd>{{ snap.abyss.suppression }} 点</dd></div>
          <div class="stat">
            <dt>腐蚀速率</dt>
            <dd :class="{ danger: snap.abyss.effective !== '0' }">{{ snap.abyss.corrosionPerMinute }}（每台）</dd>
          </div>
        </dl>
        <p class="muted small">{{ snap.abyss.note }}</p>
      </template>
    </div>
  </section>
</template>
