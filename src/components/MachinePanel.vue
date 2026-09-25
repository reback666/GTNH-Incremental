<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  useGameStore,
  type MachineColumn,
  type MachineModelRow,
  type MachineTierGroup,
} from '../game/store';
import type { MachineKind, PayWith } from '../game/core';
import { MAX_OVERCLOCK_LEVEL as MAX_OC } from '../numeric/overclock';
import SpriteIcon from './SpriteIcon.vue';
import MachineIcon from './MachineIcon.vue';

const props = defineProps<{ columns: MachineColumn[] }>();
const store = useGameStore();

// 最上方是三个大类，点谁就展开谁，另外两个挤压收起。
const active = ref<MachineKind>('miner');
// 计划书第七章规定用 GT 币买；开局没有产币机器，所以再给一条用矿石建造的路子。
const payWith = ref<PayWith>('coin');

// 每个机型一条横杠，等级写在横杠上，所以不用再套一层分组
interface Bar {
  group: MachineTierGroup;
  model: MachineModelRow;
}

// 机器名的悬停提示。用固定定位 + Teleport 送到 body：
// 面板本身带 overflow:hidden（折叠动画需要），留在里面会被裁掉。
interface TipState {
  name: string;
  lines: { label: string; value: string }[];
  traits: string[];
  x: number;
  y: number;
}

const tip = ref<TipState | null>(null);

function showTip(event: Event, model: MachineModelRow) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const lines = [...model.single];
  if (model.overclock > 0) {
    lines.push({ label: '超频', value: `${model.overclock} 档（速度 +${model.overclock * 60}%）` });
    lines.push({ label: '故障率', value: model.faultHint });
  }
  const width = 178;
  const height = 36 + (lines.length + (model.traits.length ? 1 : 0)) * 19;
  tip.value = {
    name: model.name,
    lines,
    traits: model.traits,
    x: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    y: rect.bottom + 8 + height > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6,
  };
}

function hideTip() {
  tip.value = null;
}

const bars = computed<Bar[]>(() => {
  const column = props.columns.find((item) => item.kind === active.value);
  if (!column) return [];
  const out: Bar[] = [];
  for (const group of column.tiers) {
    if (!group.unlocked) continue;
    for (const model of group.models) out.push({ group, model });
  }
  return out;
});

const activeColumn = computed(() => props.columns.find((item) => item.kind === active.value) ?? null);

function cells(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function canBuy(model: MachineModelRow): boolean {
  // 还没研究出来的机型（ZPM 及以后）不能建造，灰掉按钮
  return model.researched && (payWith.value === 'ore' ? model.oreAffordable : model.affordable);
}
</script>

<template>
  <section>
    <div class="machine-tabs">
      <button
        v-for="column in columns"
        :key="column.kind"
        type="button"
        class="machine-tab"
        :class="{ active: active === column.kind }"
        @click="active = column.kind"
      >
        <SpriteIcon :kind="column.kind" :size="30" />
        <span class="tab-name">{{ column.title }}</span>
        <span class="tab-count">已建 {{ column.count }} 台</span>
      </button>
    </div>

    <div v-for="column in columns" :key="column.kind" class="machine-body" :class="{ collapsed: active !== column.kind }">
      <div class="inner">
        <div class="pad">
          <p class="muted small hint">{{ column.hint }}</p>

          <dl class="stats">
            <div v-for="stat in column.stats" :key="stat.label" class="stat">
              <dt>{{ stat.label }}</dt>
              <dd>{{ stat.value }}</dd>
            </div>
          </dl>

          <div class="row pay-row">
            <span class="muted small">支付</span>
            <button :class="{ primary: payWith === 'coin' }" @click="payWith = 'coin'">GT 币</button>
            <button :class="{ primary: payWith === 'ore' }" @click="payWith = 'ore'">同级矿石</button>
          </div>

          <div v-if="activeColumn && activeColumn.count === 0" class="muted small" style="padding-top: 6px">
            还没有建造任何{{ activeColumn.title }}。
          </div>

          <!-- 一行一个机型：等级 → 机型名 → 机器图标横排 → 数量 → 单价 → 建造按钮 -->
          <div v-for="bar in bars" :key="bar.model.id" class="tier-bar">
            <span class="tier-name">{{ bar.group.voltage }}</span>

            <span
              class="model-name"
              tabindex="0"
              @mouseenter="showTip($event, bar.model)"
              @mouseleave="hideTip"
              @focus="showTip($event, bar.model)"
              @blur="hideTip"
            >
              <span class="model-label">{{ bar.model.name }}</span>
              <span v-if="bar.model.block === 'multiblock'" class="badge mb" title="多方块：产出高，但不能按需发电、需要维护">多方块</span>
              <span
                v-for="trait in bar.model.traits.filter((t) => t !== '需要维护')"
                :key="trait"
                class="badge warn"
                >{{ trait }}</span
              >
              <span v-if="!bar.model.researched" class="badge warn" title="要先在研究里解锁这一级机型">需研究</span>
            </span>

            <div class="tier-icons">
              <MachineIcon
                v-for="index in cells(bar.model.icons)"
                :key="index"
                :model-id="bar.model.id"
                :kind="column.kind"
                :size="20"
                class="icon-pop"
              />
              <span v-if="bar.model.overflow > 0" class="icon-overflow">+{{ bar.model.overflow }}</span>
            </div>

            <span class="count">×{{ bar.model.count }}</span>
            <span v-if="bar.model.overclockable" class="overclock">
              <span class="oc-label">超频</span>
              <button
                class="oc-btn"
                :disabled="bar.model.overclock === 0"
                :title="'降低超频档位（当前 ' + bar.model.overclock + ' 档）'"
                @click="store.setOverclock(bar.model.id, bar.model.overclock - 1)"
              >
                −
              </button>
              <b class="oc-level">{{ bar.model.overclock }}</b>
              <button
                class="oc-btn"
                :disabled="bar.model.overclock >= MAX_OC"
                :title="'提高超频档位：速度 +60%、耗电翻倍，故障率也翻倍'"
                @click="store.setOverclock(bar.model.id, bar.model.overclock + 1)"
              >
                +
              </button>
            </span>
            <span v-if="bar.model.faulty > 0" class="fault">
              故障 {{ bar.model.faulty }} 台
              <button title="修理这台机型的所有故障机器" @click="store.repair(bar.model.id)">
                维护
              </button>
            </span>
            <span class="price">
              <template v-if="payWith === 'coin'">{{ bar.model.price }} {{ bar.group.unit }}</template>
              <template v-else>{{ bar.model.orePrice }} {{ bar.group.oreLabel }}</template>
            </span>
            <button :disabled="!canBuy(bar.model)" @click="store.buy(bar.model.id, 1, payWith)">×1</button>
            <button :disabled="!canBuy(bar.model)" @click="store.buy(bar.model.id, 10, payWith)">×10</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <Teleport to="body">
    <div v-if="tip" class="model-tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">
      <div class="tip-name">{{ tip.name }}</div>
      <div v-for="line in tip.lines" :key="line.label" class="tip-row">
        <span>{{ line.label }}</span>
        <b>{{ line.value }}</b>
      </div>
      <div v-if="tip.traits.length" class="tip-traits">{{ tip.traits.join(' · ') }}</div>
    </div>
  </Teleport>
</template>
