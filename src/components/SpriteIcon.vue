<script setup lang="ts">
import { PALETTE, SPRITES, SPRITE_GRID, type SpriteKind } from '../game/sprites';

withDefaults(defineProps<{ kind: SpriteKind; size?: number }>(), { size: 64 });
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
      v-for="(rect, index) in SPRITES[kind]"
      :key="index"
      :x="rect[0]"
      :y="rect[1]"
      :width="rect[2]"
      :height="rect[3]"
      :fill="PALETTE[rect[4]]"
    />
  </svg>
</template>
