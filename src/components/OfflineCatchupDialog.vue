<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useGameStore, type OfflineInventoryChange } from '../game/store';
import { formatDuration } from '../numeric/time';
import { formatNumber } from '../numeric/format';

const store = useGameStore();

const visible = computed(() => store.catchingUp || store.offlineResult !== null);
const result = computed(() => store.offlineResult);
const groups = computed(() => {
  const changes = result.value?.changes ?? [];
  return [
    { kind: 'ore' as const, title: '材料库存', rows: changes.filter(row => row.kind === 'ore') },
    { kind: 'coin' as const, title: 'GT 币', rows: changes.filter(row => row.kind === 'coin') },
  ].filter(group => group.rows.length > 0);
});
const remainingText = computed(() => {
  const seconds = store.catchUpRemainingSeconds;
  return seconds === null ? '正在估算…' : `约剩 ${formatDuration(seconds)}`;
});

function close(): void {
  store.dismissOfflineResult();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !store.catchingUp && store.offlineResult) {
    event.preventDefault();
    close();
  }
}

function changeLabel(change: OfflineInventoryChange): string {
  return `${change.name}，${activityLabel(change)}`;
}

function producedLabel(change: OfflineInventoryChange): string {
  return change.produced !== '0' ? `+${formatNumber(change.produced)}` : '';
}

function spentLabel(change: OfflineInventoryChange): string {
  return change.spent !== '0' ? `−${formatNumber(change.spent)}` : '';
}

function activityLabel(change: OfflineInventoryChange): string {
  const activity = [producedLabel(change), spentLabel(change)].filter(Boolean).join(' · ');
  return activity || `净变化 ${change.delta.startsWith('-') ? '' : '+'}${formatNumber(change.delta)}`;
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="offline-catchup-backdrop" role="presentation">
      <section class="offline-catchup-dialog" role="dialog" aria-modal="true" aria-labelledby="offline-catchup-title">
        <div class="offline-catchup-heading">
          <div>
            <h2 id="offline-catchup-title">{{ store.catchingUp ? '正在补算离线进度' : (result?.failed ? '离线补算已暂停' : '离线补算') }}</h2>
          </div>
          <span v-if="result?.failed" class="offline-catchup-mark paused">已暂停</span>
        </div>

        <div v-if="store.catchingUp" class="offline-catchup-progress">
          <div class="offline-catchup-progress-line">
            <span>补算生产进度</span>
            <b>{{ Math.round(store.catchUpProgress * 100) }}%</b>
          </div>
          <progress :value="store.catchUpProgress" max="1" aria-label="离线补算进度" />
          <p>{{ remainingText }}</p>
        </div>

        <template v-else-if="result">
          <p class="offline-catchup-summary">
            {{ result.failed ? `已处理 ${formatDuration(result.advanced)}，剩余部分已暂停。` : `已处理 ${formatDuration(result.total)} 的离线时间。` }}
          </p>
          <div v-if="groups.length" class="offline-catchup-changes">
            <section v-for="group in groups" :key="group.kind" class="offline-catchup-group">
              <h3>{{ group.title }}</h3>
              <div v-for="change in group.rows" :key="`${change.kind}-${change.tier}`" class="offline-catchup-row" :aria-label="changeLabel(change)">
                <span>{{ change.name }}</span>
                <span class="offline-catchup-values">
                  <b class="produced">{{ producedLabel(change) || '—' }}</b>
                  <b class="negative">{{ spentLabel(change) || '—' }}</b>
                </span>
              </div>
            </section>
          </div>
          <p v-if="!groups.length" class="offline-catchup-empty">本次没有库存变化。</p>
        </template>

        <div class="offline-catchup-actions">
          <button v-if="!store.catchingUp" type="button" class="primary" @click="close">完成</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
