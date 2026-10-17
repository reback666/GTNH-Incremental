<script setup lang="ts">
import { computed } from 'vue';
import type { AchievementIcon } from '../game/achievements';
import { modelIconUrl } from '../game/icons';
import { pickaxeIconUrl, pickaxeIconIsStrip } from '../game/pickaxe-icons';
import { veinIconUrl } from '../game/veins';
import { ACHIEVEMENT_SPRITES } from '../game/sprites';
import SpriteIcon from './SpriteIcon.vue';

// 成就配图：能用现成贴图就用贴图（机型 / 矿脉 / 镐子），其余的用代码画的像素图标。
const props = withDefaults(defineProps<{ icon: AchievementIcon; size?: number }>(), { size: 34 });

const imageUrl = computed(() => {
  if (props.icon.kind === 'model') return modelIconUrl(props.icon.id);
  // 动画条带（金刚杵全线 / 采集爆破满级）走下面 pickaxeStripStyle 的第一帧渲染
  if (props.icon.kind === 'pickaxe' && !pickaxeIconIsStrip(props.icon.line, props.icon.tier)) {
    return pickaxeIconUrl(props.icon.line, props.icon.tier);
  }
  return undefined;
});

// 镐子条带图标：成就格子里取第一帧（与矿脉贴图成就同一套裁剪方式）
const pickaxeStripStyle = computed(() => {
  if (props.icon.kind !== 'pickaxe' || !pickaxeIconIsStrip(props.icon.line, props.icon.tier)) {
    return undefined;
  }
  const url = pickaxeIconUrl(props.icon.line, props.icon.tier);
  if (!url) return undefined;
  return { backgroundImage: `url(${url})`, backgroundSize: `${props.size}px auto` };
});

// 矿脉贴图是竖排帧条带（9 / 10 / 11 / 13 / 14 级带动画），这里只取第一帧：
// 宽度按 size 缩放，容器裁掉下面的帧。
const veinStyle = computed(() => {
  if (props.icon.kind !== 'vein') return undefined;
  const url = veinIconUrl(props.icon.tier);
  if (!url) return undefined;
  return { backgroundImage: `url(${url})`, backgroundSize: `${props.size}px auto` };
});

const rects = computed(() =>
  props.icon.kind === 'sprite' ? ACHIEVEMENT_SPRITES[props.icon.sprite] : undefined,
);
</script>

<template>
  <span class="achievement-icon" :style="{ width: `${size}px`, height: `${size}px` }">
    <img v-if="imageUrl" :src="imageUrl" :width="size" :height="size" alt="" />
    <span v-else-if="pickaxeStripStyle" class="vein-frame" :style="pickaxeStripStyle" />
    <span v-else-if="veinStyle" class="vein-frame" :style="veinStyle" />
    <SpriteIcon v-else-if="rects" :rects="rects" :size="size" />
  </span>
</template>
