<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '../game/store';
import { VOLTAGE_TIERS } from '../numeric/voltage';
import { dec } from '../numeric/decimal';
import type { DevResourceTarget } from '../game/core';

// 设置：污染机制的整体开关、开发者模式（计划书第六章）。
// 污染读数在第 1 页最下方，电网与转生在别的页面，这里只管设置项。
const store = useGameStore();
const risk = computed(() => store.snap.risk);
const snap = computed(() => store.snap);
const devMode = computed(() => snap.value.devMode);
// 开发者工具里「解锁到」下拉选中的等级
const unlockTier = ref(1);

// 开发者工具里「资源」那一行：目标用 'ores' / 'coins' / 'both' 或 'ore:3' / 'coin:3' 表示
const resTarget = ref('both');
const resAmount = ref('1e12');
// 输入不合法或操作没生效时把原因写在按钮旁边，不做静默失败
const resError = ref('');

function adjustResource(sign: 1 | -1): void {
  const amount = cleanAmount(resAmount.value);
  if (amount === null) {
    resError.value = '数量要是大于 0 的数字，可以写 1e12 这种科学计数法';
    return;
  }
  const [head, tierText] = resTarget.value.split(':');
  const target: DevResourceTarget =
    head === 'ore' || head === 'coin'
      ? { scope: head, tier: Number(tierText) }
      : { scope: head as 'ores' | 'coins' | 'both' | 'cables' };
  resError.value = store.devAdjustResource(target, amount, sign) ? '' : '这次调整没有生效';
}

// 数量校验交给 Decimal：整数、小数、1e12 都收，空串 / 乱写 / 0 一律拒绝。
// 返回清理后的文本，交给 core 再解析一次。
function cleanAmount(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  try {
    const value = dec(trimmed);
    return value.isFinite() && value.gt(0) ? trimmed : null;
  } catch {
    return null;
  }
}
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
      关掉之后污染不再增长、也不产生任何影响（默认开启）。污染值显示在第 1 页最下方。
    </p>

    <!-- ── 硅基宇宙：三项 AI 开关（只有拥有这个宇宙才显示） ──── -->
    <template v-if="snap.silicon.active">
      <h2 class="mt">硅基宇宙 · AI 调度</h2>
      <div class="row">
        <div class="name">自动维护</div>
        <button
          :class="{ primary: snap.silicon.autoRepair }"
          @click="store.setSiliconOption('repair', true)"
        >
          开启
        </button>
        <button
          :class="{ primary: !snap.silicon.autoRepair }"
          @click="store.setSiliconOption('repair', false)"
        >
          关闭
        </button>
      </div>
      <div class="row">
        <div class="name">自动超频</div>
        <button
          :class="{ primary: snap.silicon.autoOverclock }"
          @click="store.setSiliconOption('overclock', true)"
        >
          开启
        </button>
        <button
          :class="{ primary: !snap.silicon.autoOverclock }"
          @click="store.setSiliconOption('overclock', false)"
        >
          关闭
        </button>
      </div>
      <div class="row">
        <div class="name">按优先级停机</div>
        <button
          :class="{ primary: snap.silicon.shedding }"
          @click="store.setSiliconOption('shedding', true)"
        >
          开启
        </button>
        <button
          :class="{ primary: !snap.silicon.shedding }"
          @click="store.setSiliconOption('shedding', false)"
        >
          关闭
        </button>
      </div>
      <p class="muted small" style="margin: 6px 0 0">
        自动维护：故障机器当拍修好。自动超频：电力扛得住翻倍时才升档，明显缺电就降档。
        按优先级停机：缺电时整组停掉优先级最低的机器（{{ snap.silicon.sheddingOrder }}），
        而不是全厂一起减半。三件事都有 5% 误判率，做错了下一拍自己纠正。
      </p>
      <p class="muted small" style="margin: 6px 0 0">{{ snap.silicon.note }}</p>
    </template>

    <!-- ── 开发者模式 ─────────────────────────────────────────── -->
    <h2 class="mt">开发者模式</h2>
    <div class="row">
      <div class="name">测试用的快捷操作</div>
      <button :class="{ primary: devMode }" @click="store.setDevMode(true)">开启</button>
      <button :class="{ primary: !devMode }" @click="store.setDevMode(false)">关闭</button>
    </div>
    <p class="muted small" style="margin: 6px 0 0">
      打开之后下面会露出一排快捷操作，用来跳过前期、直接测后面的内容。正常玩的时候关掉就行（默认关闭）。
    </p>

    <div v-if="devMode" class="dev-tools">
      <div class="row">
        <div class="name">解锁到</div>
        <select v-model.number="unlockTier">
          <option v-for="(name, index) in VOLTAGE_TIERS" :key="name" :value="index + 1">
            {{ name }}
          </option>
        </select>
        <button @click="store.devUnlockTo(unlockTier)">解锁</button>
      </div>
      <div class="row resource-row">
        <div class="name">资源</div>
        <select v-model="resTarget">
          <option value="both">每级矿石+币</option>
          <option value="ores">每级矿石</option>
          <option value="coins">每级 GT 币</option>
          <option value="cables">时空线缆</option>
          <option v-for="(name, index) in VOLTAGE_TIERS" :key="`ore-${name}`" :value="`ore:${index + 1}`">
            {{ name }} 矿石
          </option>
          <option v-for="(name, index) in VOLTAGE_TIERS" :key="`coin-${name}`" :value="`coin:${index + 1}`">
            {{ name }} GT 币
          </option>
        </select>
        <input
          v-model="resAmount"
          class="dev-amount"
          type="text"
          inputmode="decimal"
          aria-label="数量"
        />
        <button @click="adjustResource(1)">增加</button>
        <button @click="adjustResource(-1)">减少</button>
      </div>
      <p v-if="resError" class="danger small" style="margin: 2px 0 0">{{ resError }}</p>
      <div class="row">
        <div class="name">时间</div>
        <button @click="store.devAdvance(60)">快进 1 分钟</button>
        <button @click="store.devAdvance(600)">快进 10 分钟</button>
        <button @click="store.devAdvance(3600)">快进 1 小时</button>
      </div>
      <div class="row">
        <div class="name">机器</div>
        <button @click="store.devClearMachines()">清空全部机器</button>
      </div>
      <div class="row">
        <div class="name">平行宇宙</div>
        <button
          v-for="universe in snap.universes"
          :key="universe.id"
          @click="
            universe.owned
              ? store.devRevokeUniverse(universe.id)
              : store.devGrantUniverse(universe.id)
          "
        >
          {{ universe.owned ? '取消' : '获得' }}{{ universe.name }}
        </button>
      </div>

      <dl class="stats">
        <div class="stat">
          <dt>当前等级</dt>
          <dd>{{ VOLTAGE_TIERS[snap.maxTier - 1] }}</dd>
        </div>
        <div class="stat">
          <dt>已研究</dt>
          <dd>{{ snap.research.hasTarget ? snap.research.targetName + ' 未完成' : '全部完成' }}</dd>
        </div>
        <div class="stat">
          <dt>本周目累计 EU</dt>
          <dd>{{ snap.rebirth.runEU }}</dd>
        </div>
        <div class="stat">
          <dt>时空线缆</dt>
          <dd>{{ snap.rebirth.cables }} 条</dd>
        </div>
      </dl>
    </div>
  </section>
</template>
