<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  useGameStore,
  type MachineColumn,
  type MachineModelRow,
  type MachineTierGroup,
} from '../game/store';
import type { MachineKind, PayWith } from '../game/core';
import SpriteIcon from './SpriteIcon.vue';

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
  return payWith.value === 'ore' ? model.oreAffordable : model.affordable;
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

            <span class="model-name">
              {{ bar.model.name }}
              <span v-if="bar.model.block === 'multiblock'" class="badge mb" title="多方块：产出高，但不能按需发电、需要维护">多方块</span>
              <span
                v-for="trait in bar.model.traits.filter((t) => t !== '需要维护')"
                :key="trait"
                class="badge warn"
                >{{ trait }}</span
              >
            </span>

            <div class="tier-icons">
              <SpriteIcon
                v-for="index in cells(bar.model.icons)"
                :key="index"
                :kind="column.kind"
                :size="20"
                class="icon-pop"
              />
              <span v-if="bar.model.overflow > 0" class="icon-overflow">+{{ bar.model.overflow }}</span>
            </div>

            <span class="count">×{{ bar.model.count }}</span>
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
</template>
