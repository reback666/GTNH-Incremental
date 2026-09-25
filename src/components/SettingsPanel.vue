<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGameStore } from '../game/store';
import { VOLTAGE_TIERS } from '../numeric/voltage';

// 设置：污染机制的整体开关与污染读数（计划书第六章）。
// 电网、转生都在别的页面，这里只管设置项。
const store = useGameStore();
const risk = computed(() => store.snap.risk);
const snap = computed(() => store.snap);
const devMode = computed(() => snap.value.devMode);
// 开发者工具里「解锁到」下拉选中的等级
const unlockTier = ref(1);
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
      关掉之后污染不再增长、也不产生任何影响（默认开启）。
    </p>

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

      <dl class="stats">
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
        中度污染会变异（{{ risk.mutationChance }}），重度污染会工厂崩溃（{{
          risk.collapseChance
        }}）。建净化器把污染压回 30% 以下。
      </p>
    </div>

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
      <div class="row">
        <div class="name">资源</div>
        <button @click="store.devGrantResources()">每级矿石与 GT 币各 +1e12</button>
      </div>
      <div class="row">
        <div class="name">时空线缆</div>
        <button @click="store.devGrantCables('10')">+10 条</button>
        <button @click="store.devGrantCables('1')">+1 条</button>
      </div>
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
          :disabled="universe.owned"
          @click="store.devGrantUniverse(universe.id)"
        >
          {{ universe.owned ? '已有' : '获得' }}{{ universe.name }}
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
