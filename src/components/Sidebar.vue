<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useGameStore } from '../game/store';
import { VOLTAGE_TIERS } from '../numeric/voltage';
import MachineIcon from './MachineIcon.vue';

// 横向顶栏：左品牌/电压，中间三页导航，右电网四读数 + 研究进度。
// 电力明细以浮层弹出，不占布局高度。
defineProps<{
  page: number;
  pages: { id: number; name: string; badge: boolean }[];
}>();

const emit = defineEmits<{ change: [page: number] }>();

const store = useGameStore();
const snap = computed(() => store.snap);
const tierName = computed(() => VOLTAGE_TIERS[snap.value.maxTier - 1] ?? 'ULV');
const tierColor = computed(() => `var(--vt${snap.value.maxTier})`);

type PowerKey = 'stored' | 'generated' | 'consumed';
const openPower = ref<PowerKey | null>(null);
const root = ref<HTMLElement | null>(null);

const powerBoxes = computed(() => [
  { key: 'stored' as PowerKey, label: '存电', stat: snap.value.power.stored },
  { key: 'generated' as PowerKey, label: '发电', stat: snap.value.power.generated },
  { key: 'consumed' as PowerKey, label: '耗电', stat: snap.value.power.consumed },
]);

const activeStat = computed(() => (openPower.value ? snap.value.power[openPower.value] : null));
const activeLabel = computed(() => powerBoxes.value.find((b) => b.key === openPower.value)?.label ?? '');

function togglePower(key: PowerKey) {
  openPower.value = openPower.value === key ? null : key;
}

// 点浮层外或按 Esc 收起
function onDocPointer(event: PointerEvent) {
  if (openPower.value && root.value && !root.value.contains(event.target as Node)) openPower.value = null;
}
function onDocKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && openPower.value) openPower.value = null;
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer);
  document.addEventListener('keydown', onDocKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer);
  document.removeEventListener('keydown', onDocKey);
});
</script>

<template>
  <header ref="root" class="topbar">
    <div class="top-brand">
      <span class="side-title">GTNH 增量</span>
      <span
        class="volt-badge"
        :class="{ 'volt-max': snap.maxTier === 14 }"
        :style="{ '--tier-c': tierColor }"
        :title="`当前电压上限 ${tierName}`"
        >{{ tierName }}</span
      >
      <span class="muted small top-play">已玩 {{ snap.playTime }}</span>
    </div>

    <nav class="top-nav" aria-label="页面">
      <button
        v-for="item in pages"
        :key="item.id"
        type="button"
        class="nav-btn"
        :class="{ active: item.id === page }"
        :aria-current="item.id === page ? 'page' : undefined"
        :title="`${item.name}（快捷键 ${item.id}）`"
        @click="emit('change', item.id)"
      >
        <span class="nav-key" aria-hidden="true">{{ item.id }}</span>
        <span class="nav-name">{{ item.name }}</span>
        <span v-if="item.badge" class="nav-badge" role="img" aria-label="有未看的错误记录" />
      </button>
    </nav>

    <div class="top-readouts">
      <div class="top-power" role="group" aria-label="电网">
        <button
          v-for="box in powerBoxes"
          :key="box.key"
          type="button"
          class="power-box"
          :class="{ active: openPower === box.key }"
          :aria-expanded="openPower === box.key"
          :title="`${box.label}明细`"
          @click="togglePower(box.key)"
        >
          <span class="power-label">{{ box.label }}</span>
          <b class="power-value">{{ box.stat.value }}</b>
        </button>
        <div class="power-box static" :class="{ danger: snap.power.ratioShort }" title="供电率">
          <span class="power-label">供电率</span>
          <b class="power-value">{{ snap.power.ratio }}</b>
        </div>
      </div>

      <div
        v-if="snap.research.unlocked"
        class="top-research"
        :title="
          snap.research.hasTarget
            ? `${snap.research.targetName}：${snap.research.progress} / ${snap.research.required}，还需 ${snap.research.eta}`
            : '没有进行中的研究'
        "
      >
        <span class="power-label">研究</span>
        <template v-if="snap.research.hasTarget">
          <span class="top-research-name">{{ snap.research.targetName }} {{ snap.research.percent }}%</span>
          <span class="side-progress" role="progressbar" aria-label="研究进度" :aria-valuenow="snap.research.percent" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: `${snap.research.percent}%` }" />
          </span>
        </template>
        <span v-else class="muted small">无</span>
      </div>
    </div>

    <div v-if="activeStat" class="power-pop panel" role="dialog" :aria-label="`${activeLabel}明细`">
      <div class="power-pop-head">
        <b>{{ activeLabel }}明细</b>
        <button type="button" class="power-pop-close" aria-label="关闭明细" @click="openPower = null">×</button>
      </div>
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
                <MachineIcon :model-id="row.modelId" :kind="row.kind" :size="24" />
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
    </div>
  </header>
</template>
