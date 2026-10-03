<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '../game/store';
import { VOLTAGE_TIERS } from '../numeric/voltage';
import MachineIcon from './MachineIcon.vue';

defineProps<{
  page: number;
  pages: { id: number; name: string; badge: boolean }[];
}>();

const emit = defineEmits<{ change: [page: number] }>();

const store = useGameStore();
const snap = computed(() => store.snap);
const tierName = computed(() => VOLTAGE_TIERS[snap.value.maxTier - 1] ?? 'ULV');
// 等级徽标按该级电压色描边；MAX 是彩虹（CSS 里用渐变字）
const tierColor = computed(() => `var(--vt${snap.value.maxTier})`);

// 电能四格：点哪一格就从下面拉出对应的明细表（与资源条时代同一套交互，
// 只是搬进了侧栏——换页时读数常驻，不用滚回第一页看）
type PowerKey = 'stored' | 'generated' | 'consumed';
const openPower = ref<PowerKey | null>(null);

const powerBoxes = computed(
  () =>
    [
      { key: 'stored' as PowerKey, label: '存电量', stat: snap.value.power.stored },
      { key: 'generated' as PowerKey, label: '发电能力', stat: snap.value.power.generated },
      { key: 'consumed' as PowerKey, label: '总耗电量', stat: snap.value.power.consumed },
    ] as const,
);

const activeStat = computed(() => (openPower.value ? snap.value.power[openPower.value] : null));

function togglePower(key: PowerKey) {
  openPower.value = openPower.value === key ? null : key;
}
</script>

<template>
  <aside class="sidebar panel">
    <!-- 工厂铭牌：名号 + 当前电压徽标（按该级电压色） + 已玩时长 -->
    <div class="side-brand">
      <span class="side-title">GTNH 增量</span>
      <span
        class="volt-badge"
        :class="{ 'volt-max': snap.maxTier === 14 }"
        :style="{ '--tier-c': tierColor }"
        >{{ tierName }}</span
      >
      <span class="muted small side-play">已玩 {{ snap.playTime }}</span>
    </div>

    <!-- 页签：替代旧的右侧竖排页码 -->
    <nav class="side-nav">
      <button
        v-for="item in pages"
        :key="item.id"
        type="button"
        class="nav-btn"
        :class="{ active: item.id === page }"
        @click="emit('change', item.id)"
      >
        <span class="nav-key" aria-hidden="true">{{ item.id }}</span>
        <span class="nav-name">{{ item.name }}</span>
        <span v-if="item.badge" class="nav-badge" aria-label="有未看的错误记录" />
      </button>
    </nav>

    <!-- 常驻读数：电能四格（点击下拉明细） -->
    <h2>电能</h2>
    <div class="power-row side-power-row">
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
                  <td class="num-cell">
                    ×{{ row.count }}
                    <span v-if="row.running !== undefined" class="muted small run-split">
                      运行 {{ row.running }} · 停机 {{ row.stopped }}
                    </span>
                  </td>
                  <td class="num-cell">{{ row.amount }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="muted small note">{{ activeStat.emptyText }}</p>
          </template>
        </div>
      </div>
    </div>

    <!-- 常驻读数：研究进度（LuV 解锁后才出现） -->
    <template v-if="snap.research.unlocked">
      <h2 class="mt">研究</h2>
      <template v-if="snap.research.hasTarget">
        <div class="side-research-head">
          <span class="side-research-name">{{ snap.research.targetName }}</span>
          <b class="side-research-pct">{{ snap.research.percent }}%</b>
        </div>
        <div class="side-progress" role="progressbar" :aria-valuenow="snap.research.percent">
          <span :style="{ width: `${snap.research.percent}%` }" />
        </div>
        <p class="muted small side-research-note">
          {{ snap.research.progress }} / {{ snap.research.required }} · 还需
          {{ snap.research.eta }}
        </p>
      </template>
      <p v-else class="muted small">没有进行中的研究</p>
    </template>
  </aside>
</template>
