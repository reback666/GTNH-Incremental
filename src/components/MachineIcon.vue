<script setup lang="ts">
import { computed } from 'vue';
import { modelIconUrl } from '../game/icons';
import type { MachineKind } from '../game/core';
import SpriteIcon from './SpriteIcon.vue';

// 有 GTNH 贴图就用贴图，没有就回退到代码绘制的类别图标。
const props = withDefaults(
  defineProps<{ modelId: string; kind: MachineKind; size?: number }>(),
  { size: 24 },
);

const url = computed(() => modelIconUrl(props.modelId));
</script>

<template>
  <img v-if="url" class="machine-icon" :src="url" :width="size" :height="size" alt="" />
  <SpriteIcon v-else :kind="kind" :size="size" />
</template>
