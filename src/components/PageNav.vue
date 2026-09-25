<script setup lang="ts">
// 右侧页码条：点数字换页，当前页的按钮比别的页突出。
defineProps<{
  page: number;
  // badge：这一页有新东西要看（当前用在「设置」页的新日志上）
  pages: { id: number; name: string; badge?: boolean }[];
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
      :title="item.badge ? `${item.name}·有新日志` : item.name"
      :aria-current="page === item.id ? 'page' : undefined"
      @click="emit('change', item.id)"
    >
      {{ item.id }}
      <span v-if="item.badge" class="page-badge" />
    </button>
  </nav>
</template>
