<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '../game/store';
import { MAX_TIER, VOLTAGE_TIERS } from '../numeric/voltage';
import UiIcon from './UiIcon.vue';
import gtnhLogo from '../assets/gtnh-logo.png';
defineProps<{ page: number; pages: { id: number; name: string; icon: string; badge: boolean }[] }>();
const emit = defineEmits<{ change: [page: number] }>();
const store = useGameStore();
const tierName = computed(() => VOLTAGE_TIERS[store.snap.maxTier - 1]);
</script>
<template>
  <aside class="command-rail">
    <div class="rail-brand"><span class="brand-mark"><img :src="gtnhLogo" alt="GTNH" width="36" height="36" /></span><div><strong>GTNH</strong><span>增量 · 工业纪元</span></div></div>
    <div class="rail-divider" />
    <span class="rail-section-label">控制中心</span>
    <nav class="rail-nav" aria-label="游戏页面">
      <button v-for="item in pages" :key="item.id" type="button" :class="{ active: page === item.id }"
        :aria-current="page === item.id ? 'page' : undefined" @click="emit('change', item.id)">
        <UiIcon :name="item.icon" /><span>{{ item.name }}</span>
        <span v-if="item.badge" class="nav-badge" aria-label="有未看的错误记录" />
      </button>
    </nav>
    <div class="rail-era"><span class="rail-section-label">当前工业等级</span><b>{{ tierName }}</b><span>{{ store.snap.maxTier }} / {{ MAX_TIER }} 级电压</span>
      <div class="era-segments"><i v-for="n in MAX_TIER" :key="n" :class="{ lit: n <= store.snap.maxTier }" /></div>
      <span class="rail-time"><UiIcon name="clock" :size="14" />{{ store.snap.playTime }}</span>
    </div>
    <div class="rail-bottom"><span><i class="live-dot" />本地运行</span><small>进度自动保存在此浏览器</small><small>快捷键 1 工厂 · 2 科技 · 3 设置</small></div>
  </aside>
</template>
