<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });
const paths: Record<string, string> = {
  factory: 'M3 21V9l6 3V7l6 3V3h5v18H3 M7 16h1 M12 16h1 M17 16h1',
  tech: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l3 3 M15 15l3 3 M6 18l3-3 M15 9l3-3 M8 8h8v8H8z',
  rift: 'M20 12a8 8 0 1 1-3-6 M16 3h5v5 M21 3l-8 8 M9 12l3 3-3 3',
  settings: 'M10 3h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3l-2-2 2-4 3 1 3-1 1-3 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  power: 'M13 2 5 14h6l-1 8 9-13h-7l1-7',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  layers: 'M12 3 2 8l10 5 10-5-10-5 M2 12l10 5 10-5 M2 16l10 5 10-5',
};
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] ?? paths.factory" /></svg></template>
