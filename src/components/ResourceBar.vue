<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '../game/store';
import { VOLTAGE_TIERS } from '../numeric/voltage';
import AnimatedNumber from './AnimatedNumber.vue';
import MachineIcon from './MachineIcon.vue';

const store = useGameStore();
const snap = computed(() => store.snap);
const tierName = computed(() => VOLTAGE_TIERS[snap.value.maxTier - 1] ?? 'ULV');

// 电能四格：点哪一格就从下面拉出对应的明细表
type PowerKey = 'stored' | 'generated' | 'consumed';
const openPower = ref<PowerKey | null>(null);

const powerBoxes = computed(
  () =>
    [
      { key: 'stored' as PowerKey, label: '存电量', stat: snap.value.power.stored },
      { key: 'generated' as PowerKey, label: '总产电量', stat: snap.value.power.generated },
      { key: 'consumed' as PowerKey, label: '总耗电量', stat: snap.value.power.consumed },
    ] as const,
);

const activeStat = computed(() => (openPower.value ? snap.value.power[openPower.value] : null));

function togglePower(key: PowerKey) {
  openPower.value = openPower.value === key ? null : key;
}
</script>

<template>
  <section class="panel">
    <h1>
      GTNH 增量 · {{ tierName }}
      <span class="muted small">已玩 {{ snap.playTime }}</span>
    </h1>

    <!-- ── 第一行：电能 ─────────────────────────────────────── -->
    <h2>电能</h2>
    <div class="power-row">
      <button
        v-for="box in powerBoxes"
        :key="box.key"
        type="button"
        class="power-box"
        :class="{ active: openPower === box.key }"
        @click="togglePower(box.key)"
      >
        <span class="power-label">{{ box.label }}</span>
        <b class="power-value">{{ box.stat.value }}</b>
      </button>
      <div class="power-box static" :class="{ danger: snap.power.ratioShort }">
        <span class="power-label">供电率</span>
        <b class="power-value">{{ snap.power.ratio }}</b>
      </div>
    </div>

    <!-- 点击后从下面拉出的明细表，按电压等级排序 -->
    <div class="power-detail" :class="{ open: activeStat !== null }">
      <div class="power-clip">
        <div class="power-pad">
          <template v-if="activeStat">
            <p v-if="activeStat.note" class="muted small note">{{ activeStat.note }}</p>
            <table v-if="activeStat.rows.length" class="detail-table">
              <thead>
                <tr>
                  <th>电压</th>
                  <th>机器</th>
                  <th>数量</th>
                  <th>合计</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in activeStat.rows" :key="row.name + row.tier">
                  <td>{{ row.voltage }}</td>
                  <td>
                    <span class="model-cell">
                      <MachineIcon :model-id="row.modelId" :kind="row.kind" :size="20" />
                      <span>{{ row.name }}</span>
                    </span>
                  </td>
                  <td class="num-cell">×{{ row.count }}</td>
                  <td class="num-cell">{{ row.amount }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="muted small note">{{ activeStat.emptyText }}</p>
          </template>
        </div>
      </div>
    </div>

    <!-- ── 第二行：矿石 ─────────────────────────────────────── -->
    <h2 class="mt">矿石</h2>
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

    <p v-if="snap.powerShort" class="danger small" style="margin: 10px 0 0">
      电力不足，所有机器都在降载运行。加发电机，或先停掉一些机器。
    </p>
  </section>
</template>
