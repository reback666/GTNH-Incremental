<script setup lang="ts">
import { computed } from 'vue';
import { PALETTE, SPRITES, SPRITE_GRID, type SpriteKind, type SpriteRect } from '../game/sprites';

// 两种用法：给类别名（kind），或直接给一组方块（rects，成就配图用）
const props = withDefaults(
  defineProps<{ kind?: SpriteKind; rects?: SpriteRect[]; size?: number }>(),
  { size: 64 },
);
const shape = computed<SpriteRect[]>(() => props.rects ?? (props.kind ? SPRITES[props.kind] : []));
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="`0 0 ${SPRITE_GRID} ${SPRITE_GRID}`"
    shape-rendering="crispEdges"
    class="sprite"
    aria-hidden="true"
  >
    <rect
      v-for="(rect, index) in shape"
      :key="index"
      :x="rect[0]"
      :y="rect[1]"
      :width="rect[2]"
      :height="rect[3]"
      :fill="PALETTE[rect[4]]"
    />
  </svg>
</template>
