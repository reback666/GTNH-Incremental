<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  useGameStore,
  type MachineColumn,
  type MachineModelRow,
  type ModifierRow,
  type MachineTierGroup,
} from '../game/store';
import type { MachineKind, PayWith } from '../game/core';
import {
  MAX_OVERCLOCK_LEVEL as MAX_OC,
  overclockEnergyMultiplier,
  overclockSpeedMultiplier,
} from '../numeric/overclock';
import { formatNumber } from '../numeric/format';
import MachineIcon from './MachineIcon.vue';
import { pickaxeIconUrl } from '../game/pickaxe-icons';

const props = defineProps<{ columns: MachineColumn[] }>();
const store = useGameStore();

// 最上方是一排大类标签，点谁就展开谁，其余挤压收起。
// 最后一个是「镐子」：它不是机器类别，展开的是手动挖矿的三条升级线。
const active = ref<MachineKind | 'pickaxe'>('miner');
const PICKAXE_TAB = 'pickaxe';

// 镐子标签上的角标：三条线还剩几次能升
const pickaxeLines = computed(() => store.snap.pickaxe.lines);
const pickaxeChancesLeft = computed(() =>
  pickaxeLines.value.reduce((sum, line) => sum + (line.cap - line.level), 0),
);
const pickaxeTabIcon = computed(() =>
  pickaxeIconUrl('vajra', pickaxeLines.value[0]?.iconTier ?? 1),
);
// 已解锁更高级矿脉、但金刚杵还不够格挖
const pickaxeVeinLocked = computed(
  () => store.snap.pickaxe.veinTier < store.snap.pickaxe.maxVeinTier,
);

function lineIcon(line: { id: 'vajra' | 'collect' | 'blast'; iconTier: number }): string | undefined {
  return pickaxeIconUrl(line.id, line.iconTier);
}
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
  // 类别提示用：这一类机器吃到的增益 / 减益
  modifiers?: ModifierRow[];
}

const tip = ref<TipState | null>(null);

function showTip(event: Event, model: MachineModelRow) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const lines = [...model.single];
  lines.push({ label: '卖回一台', value: `${model.refund}（单价的 50%）` });
  if (model.overclock > 0) {
    lines.push({ label: '超频', value: `${model.overclock} 档（速度 +${model.overclock * 60}%）` });
    lines.push({ label: '故障率', value: model.faultHint });
  }
  if (model.stopped) lines.push({ label: '状态', value: '已停机（不产、不耗、不污染）' });
  const width = 178;
  const height = 36 + lines.length * 19;
  tip.value = {
    name: model.name,
    lines,
    traits: [],
    x: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    y: rect.bottom + 8 + height > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6,
  };
}

function hideTip() {
  tip.value = null;
}

// 悬停「超频」：这一档到底换来了多少速度、多花了多少电、故障率变多高
function showOverclockTip(event: Event, model: MachineModelRow) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const level = model.overclock;
  const speed = overclockSpeedMultiplier(level);
  const energy = overclockEnergyMultiplier(level);
  const lines = [
    { label: '当前档位', value: `${level} / ${MAX_OC} 档` },
    { label: '速度', value: `×${formatNumber(speed)}（+${level * 60}%）` },
    { label: '耗电', value: `×${formatNumber(energy)}` },
    { label: '故障率', value: model.faultHint },
  ];
  const width = 178;
  const height = 36 + (lines.length + 1) * 19;
  tip.value = {
    name: `${model.name} 的超频`,
    lines,
    traits: ['每升一档：速度 +60%、耗电翻倍、故障率也跟着涨'],
    x: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    y: rect.bottom + 8 + height > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6,
  };
}

// 悬停某个标签：列出这一类机器吃到的全部增益 / 减益
function showColumnTip(event: Event, name: string, modifiers: ModifierRow[]) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const width = 320;
  const height = 40 + modifiers.length * 30;
  tip.value = {
    name,
    lines: [],
    traits: [],
    modifiers,
    x: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    y: rect.bottom + 8 + height > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6,
  };
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

// 列可能整列消失（比如奥术宇宙的灵气节点在没那个宇宙时不显示），
// 这时把选中的类别拉回第一列，面板不会空着
watch(
  () => props.columns.map((column) => column.kind).join(','),
  () => {
    if (active.value === PICKAXE_TAB) return;
    if (!props.columns.some((column) => column.kind === active.value) && props.columns[0]) {
      active.value = props.columns[0].kind;
    }
  },
);

// 类别标签上放一台该类的代表机型图标（用 GT 贴图，和面板里的机器图标一致）
const TAB_ICON: Record<MachineKind, string> = {
  miner: 'm-2',
  generator: 'g-lv-steam',
  machine: 'c-2',
  storage: 'b-3',
  purifier: 'p-2',
  research: 'x-7',
  arcane: 'n-1',
  abyss: 's-1',
};

function tabIconId(kind: MachineKind): string {
  return TAB_ICON[kind] ?? '';
}

function cells(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function canBuy(model: MachineModelRow): boolean {
  // 还没研究出来、或者缺对应平行宇宙的机型不能建造，灰掉按钮
  return model.unlocked && (payWith.value === 'ore' ? model.oreAffordable : model.affordable);
}
</script>

<template>
  <section>
    <div class="machine-tabs">
      <button
        type="button"
        class="machine-tab"
        :class="{ active: active === PICKAXE_TAB }"
        @click="active = PICKAXE_TAB"
        @mouseenter="showColumnTip($event, '镐子', store.snap.pickaxe.modifiers)"
        @mouseleave="hideTip"
        @focus="showColumnTip($event, '镐子', store.snap.pickaxe.modifiers)"
        @blur="hideTip"
      >
        <img v-if="pickaxeTabIcon" class="tab-icon" :src="pickaxeTabIcon" alt="" />
        <span class="tab-name">镐子</span>
        <span class="tab-count" :class="{ can: pickaxeChancesLeft > 0 }">
          {{ pickaxeChancesLeft > 0 ? `可升 ${pickaxeChancesLeft} 次` : '已全部升满' }}
        </span>
      </button>
      <button
        v-for="column in columns"
        :key="column.kind"
        type="button"
        class="machine-tab"
        :class="{ active: active === column.kind }"
        @click="active = column.kind"
        @mouseenter="showColumnTip($event, column.title, column.modifiers)"
        @mouseleave="hideTip"
        @focus="showColumnTip($event, column.title, column.modifiers)"
        @blur="hideTip"
      >
        <MachineIcon :model-id="tabIconId(column.kind)" :kind="column.kind" :size="30" />
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
          <div
            v-for="bar in bars"
            :key="bar.model.id"
            class="tier-bar"
            :class="{ stopped: bar.model.stopped }"
          >
            <div class="tier-line">
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
                <span v-if="bar.model.block === 'multiblock'" class="badge mb" title="多方块：产出与效率更高，成本系数也更高">多方块</span>
                <span v-if="!bar.model.researched" class="badge warn" title="要先在研究里解锁这一级机型">需研究</span>
                <span
                  v-if="bar.model.visPowered"
                  class="badge magic"
                  title="魔法机器：不耗电，改吃灵气；产出是同价电力机型的 2.5 倍"
                  >魔法</span
                >
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
              <span class="price">
                <template v-if="payWith === 'coin'">{{ bar.model.price }} {{ bar.group.unit }}</template>
                <template v-else>{{ bar.model.orePrice }} {{ bar.group.oreLabel }}</template>
              </span>

              <span class="trade">
                <button :disabled="!canBuy(bar.model)" @click="store.buy(bar.model.id, 1, payWith)">1x</button>
                <button :disabled="!canBuy(bar.model)" @click="store.buy(bar.model.id, 10, payWith)">10x</button>
                <span class="trade-label">买</span>
              </span>
            </div>

            <div class="tier-line second">
              <span v-if="bar.model.overclockable" class="overclock">
              <span
                class="oc-label"
                tabindex="0"
                @mouseenter="showOverclockTip($event, bar.model)"
                @mouseleave="hideTip"
                @focus="showOverclockTip($event, bar.model)"
                @blur="hideTip"
                >超频</span
              >
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
              <span v-if="bar.model.stoppable && bar.model.count > 0" class="run-state">
                <button
                  class="run-btn"
                  :class="{ stopped: bar.model.stopped }"
                  :title="
                    bar.model.stopped
                      ? '这一机型全部停机：不产、不耗、不污染。点一下恢复运行'
                      : '点一下让这一机型全部停机（不产、不耗、不污染）'
                  "
                  @click="store.toggleStopped(bar.model.id)"
                >
                  {{ bar.model.stopped ? '已停机' : '运行中' }}
                </button>
              </span>
              <span class="trade">
                <button
                  class="sell-btn"
                  :disabled="bar.model.count === 0"
                  :title="`卖回一台拿回 ${bar.model.refund}（单价的 50%）；卖出后重新买回来的价钱也会跟着降`"
                  @click="store.sell(bar.model.id, 1, payWith)"
                >
                  1x
                </button>
                <button
                  class="sell-btn"
                  :disabled="bar.model.count === 0"
                  title="一次卖 10 台"
                  @click="store.sell(bar.model.id, 10, payWith)"
                >
                  10x
                </button>
                <span class="trade-label">卖</span>
              </span>
            </div>
          </div>

          <!-- 研究：当前研究置顶，下面列出所有还没研究出来的机型（可点选） -->
          <template v-if="column.kind === 'research'">
            <h3 class="research-sub">当前研究</h3>
            <div class="research">
              <div class="research-head">
                <span>
                  {{ store.snap.research.hasTarget ? store.snap.research.targetName : '空着' }}
                  <span v-if="store.snap.research.hasTarget" class="badge">
                    {{ store.snap.research.targetTierName }}
                  </span>
                </span>
                <b>{{ store.snap.research.progress }} / {{ store.snap.research.required }}</b>
              </div>
              <div class="research-bar">
                <span :style="{ width: store.snap.research.percent + '%' }" />
              </div>
              <p class="muted small" style="margin: 6px 0 0">
                {{ store.snap.research.note }}
                <template v-if="store.snap.research.eta !== '—'">
                  按当前算力还要 {{ store.snap.research.eta }}。
                </template>
              </p>
            </div>

            <template v-if="store.snap.research.pending.length">
              <h3 class="research-sub">需要研究的机器</h3>
              <div class="research-list">
                <button
                  v-for="row in store.snap.research.pending"
                  :key="row.id"
                  type="button"
                  class="research-item"
                  @click="store.setResearchTarget(row.id)"
                >
                  <span class="research-item-head">
                    <b>
                      {{ row.name }}
                      <span class="badge">{{ row.tierName }}</span>
                      <span v-if="!row.voltageReady" class="badge warn">电压未到</span>
                    </b>
                    <span class="muted small">需要 {{ row.required }} 算力</span>
                  </span>
                  <span v-if="row.percent > 0" class="research-bar">
                    <span :style="{ width: row.percent + '%' }" />
                  </span>
                  <span v-if="row.percent > 0" class="muted small">已攒 {{ row.progress }}</span>
                </button>
              </div>
            </template>
          </template>
        </div>
      </div>
    </div>

    <!-- 镐子：手动挖矿的三条升级线 -->
    <div class="machine-body" :class="{ collapsed: active !== PICKAXE_TAB }">
      <div class="inner">
        <div class="pad">
          <p class="muted small hint">
            手动挖矿的三条升级线，机会随电压等级发放。
          </p>

          <dl class="stats">
            <div class="stat">
              <dt>每次点击</dt>
              <dd>{{ store.snap.pickaxe.outputPerClick }} 枚</dd>
            </div>
            <div class="stat">
              <dt>正在开采</dt>
              <dd>{{ store.snap.pickaxe.veinName }}</dd>
            </div>
          </dl>

          <p v-if="pickaxeVeinLocked" class="pickaxe-locked">
            已解锁 {{ store.snap.pickaxe.maxVeinName }} 矿脉，升级金刚杵才挖得动
          </p>

          <div v-for="line in pickaxeLines" :key="line.id" class="pickaxe-line">
            <img v-if="lineIcon(line)" class="pickaxe-line-icon" :src="lineIcon(line)" alt="" />
            <div class="pickaxe-line-text">
              <span class="pickaxe-line-name">{{ line.name }}</span>
              <span class="muted small">{{ line.hint }}</span>
              <span class="pickaxe-line-effect">
                {{ line.effectNow }}
                <template v-if="line.effectNext">
                  <span class="pickaxe-arrow">→</span>
                  <span class="pickaxe-next">{{ line.effectNext }}</span>
                </template>
              </span>
            </div>
            <div class="pickaxe-line-action">
              <span v-if="!line.locked" class="muted small">{{ line.level }} / {{ line.cap }}</span>
              <button
                class="pickaxe-upgrade"
                type="button"
                :disabled="!line.canUpgrade"
                @click="store.upgradePickaxe(line.id)"
              >
                {{ line.canUpgrade ? '升级' : line.locked ? '未开放' : '已满级' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <Teleport to="body">
    <div
      v-if="tip"
      class="model-tip"
      :class="{ wide: tip.modifiers }"
      :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
    >
      <div class="tip-name">{{ tip.name }}</div>
      <template v-if="tip.modifiers">
        <div v-if="tip.modifiers.length === 0" class="tip-empty">这一类没有任何增益或减益</div>
        <div
          v-for="mod in tip.modifiers"
          :key="mod.source + mod.effect"
          class="tip-mod"
          :class="mod.tone"
        >
          <span class="tip-mod-effect">{{ mod.effect }}</span>
          <b class="tip-mod-value">{{ mod.value }}</b>
          <span class="tip-mod-source">{{ mod.source }}</span>
        </div>
      </template>
      <div v-for="line in tip.lines" :key="line.label" class="tip-row">
        <span>{{ line.label }}</span>
        <b>{{ line.value }}</b>
      </div>
      <div v-if="tip.traits.length" class="tip-traits">{{ tip.traits.join(' · ') }}</div>
    </div>
  </Teleport>
</template>
