<script setup lang="ts">
// 右侧页码条：点数字换页，当前页的按钮比别的页突出。
defineProps<{
  page: number;
  pages: { id: number; name: string }[];
}>();

const emit = defineEmits<{ change: [page: number] }>();
</script>

<template>
  <nav class="page-nav" aria-label="页面切换">
    <button
      v-for="item in pages"
      :key="item.id"
      type="button"
      class="page-dot"
      :class="{ active: page === item.id }"
      :title="item.name"
      :aria-current="page === item.id ? 'page' : undefined"
      @click="emit('change', item.id)"
    >
      {{ item.id }}
    </button>
  </nav>
</template>
