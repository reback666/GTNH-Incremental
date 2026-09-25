<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';
import { VOLTAGE_TIERS } from '../numeric/voltage';
import { paymentTier, coinName } from '../numeric/credit';

const store = useGameStore();
const snap = computed(() => store.snap);
const nextName = computed(() =>
  snap.value.nextTier === null ? null : VOLTAGE_TIERS[snap.value.nextTier - 1],
);
const payName = computed(() =>
  snap.value.nextTier === null ? '' : coinName(paymentTier(snap.value.nextTier)),
);
</script>

<template>
  <section class="panel">
    <h2>科技树</h2>
    <div class="tags">
      <div
        v-for="(name, index) in VOLTAGE_TIERS"
        :key="name"
        class="tag"
        :style="index + 1 <= snap.maxTier ? { borderColor: 'var(--accent)' } : {}"
      >
        <span>{{ name }}</span>
        <b>{{ index + 1 <= snap.maxTier ? '已解锁' : '未解锁' }}</b>
      </div>
    </div>

    <template v-if="snap.nextTier !== null">
      <p style="margin: 12px 0 8px">
        解锁 <b>{{ nextName }}</b> 需要攒够 <b>{{ snap.unlockCost }}</b> {{ payName }}（用上一级的币结算）。
      </p>
      <button class="big" :class="{ primary: snap.canUnlock }" :disabled="!snap.canUnlock" @click="store.unlock()">
        解锁 {{ nextName }}
      </button>
      <p class="muted" style="margin: 8px 0 0">
        解锁后开放 {{ nextName }} 级矿脉。
        <template v-if="snap.nextTier >= 8">
          {{ nextName }} 及以后的机型还要先在「研究」里研究出来才能建造。
        </template>
        已开放矿脉：T{{ snap.veins.join(' / T') }}
      </p>
    </template>
    <p v-else class="muted">已达 MAX 电压。</p>
  </section>
</template>
