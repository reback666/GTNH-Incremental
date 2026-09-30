<script setup lang="ts">
import { computed } from 'vue';
import type { AchievementIcon } from '../game/achievements';
import { modelIconUrl } from '../game/icons';
import { pickaxeIconUrl } from '../game/pickaxe-icons';
import { veinIconUrl } from '../game/veins';
import { ACHIEVEMENT_SPRITES } from '../game/sprites';
import SpriteIcon from './SpriteIcon.vue';

// 成就配图：能用现成贴图就用贴图（机型 / 矿脉 / 镐子），其余的用代码画的像素图标。
const props = withDefaults(defineProps<{ icon: AchievementIcon; size?: number }>(), { size: 34 });

const imageUrl = computed(() => {
  if (props.icon.kind === 'model') return modelIconUrl(props.icon.id);
  if (props.icon.kind === 'pickaxe') return pickaxeIconUrl(props.icon.line, props.icon.tier);
  return undefined;
});

// 矿脉贴图是竖排帧条带（9 / 10 / 11 / 13 级带动画），这里只取第一帧：
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
    <span v-else-if="veinStyle" class="vein-frame" :style="veinStyle" />
    <SpriteIcon v-else-if="rects" :rects="rects" :size="size" />
  </span>
</template>
