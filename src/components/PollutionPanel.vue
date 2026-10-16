<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';

// 污染开关由设置页控制，这里只读取核心快照。
const store = useGameStore();
const risk = computed(() => store.snap.risk);
const snap = computed(() => store.snap);
</script>

<template>
  <section class="panel pollution-panel">
    <h2>污染</h2>
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

      <dl class="stats stats-loose">
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
        <template v-if="risk.boosted">
          污染在这个存档里是燃料：30% 是中性点，比它脏就增产、比它干净就减产。
          重度污染仍然会工厂崩溃（{{ risk.collapseChance }}）
          <template v-if="snap.abyss.active">，而且会腐蚀机器</template>。
        </template>
        <template v-else>
          中度污染会变异（{{ risk.mutationChance }}），重度污染会工厂崩溃（{{
            risk.collapseChance
          }}）。建净化器把污染压回 30% 以下。
        </template>
      </p>

      <!-- 深渊宇宙：污染既推产出也腐蚀机器 -->
      <template v-if="snap.abyss.active">
        <dl class="stats stats-loose">
          <div class="stat">
            <dt>污染对产出</dt>
            <dd>{{ snap.abyss.pollutionFactor }}</dd>
          </div>
          <div class="stat">
            <dt>抑制器抵消</dt>
            <dd>{{ snap.abyss.suppression }} 点</dd>
          </div>
          <div class="stat">
            <dt>腐蚀速率</dt>
            <dd :class="{ danger: snap.abyss.effective !== '0' }">
              {{ snap.abyss.corrosionPerMinute }}（每台）
            </dd>
          </div>
        </dl>
        <p class="muted small" style="margin: 6px 0 0">{{ snap.abyss.note }}</p>
      </template>
    </div>
  </section>
</template>
