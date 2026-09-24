<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { dec } from '../numeric/decimal';

// 数字涨了闪绿、跌了闪红，过了 FLASH_MS 再恢复常态色。
const props = withDefaults(defineProps<{ value: string; display: string; flashMs?: number }>(), {
  flashMs: 700,
});

const direction = ref<'up' | 'down' | 'flat'>('flat');
let previous: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.value,
  (next) => {
    if (previous === null) {
      previous = next;
      return;
    }
    const before = dec(previous);
    const after = dec(next);
    previous = next;
    if (after.eq(before)) return;
    direction.value = after.gt(before) ? 'up' : 'down';
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      direction.value = 'flat';
      timer = null;
    }, props.flashMs);
  },
);

onUnmounted(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <b class="num" :class="direction">{{ display }}</b>
</template>
