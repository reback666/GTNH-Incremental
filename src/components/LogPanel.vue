<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useGameStore } from '../game/store';
import { getCore } from '../game/engine';
import { appVersion, buildDiagnosticReport, buildStamp } from '../game/diagnostics';
import { clearLog, levelName, logEntries, logEvent, onLogChange, type LogEntry } from '../game/log';

// 面板上最多列这么多条；复制与下载给的始终是全部日志
const LOG_SHOWN = 60;

// 版本号与构建时间都标在这里：玩家截图这一行就能说清手上是哪份产物
const VERSION = appVersion();
const BUILD = buildStamp();

const store = useGameStore();
// 日志不走 store 快照：它变化不频繁，订阅后直接读，省掉每 20 Hz 的比对
const version = ref(0);
let unsubscribe: (() => void) | null = null;

const all = computed<LogEntry[]>(() => {
  void version.value;
  return logEntries();
});
const shown = computed(() => all.value.slice(-LOG_SHOWN).reverse());
const errorCount = computed(() => all.value.filter((entry) => entry.level === 'error').length);
const warnCount = computed(() => all.value.filter((entry) => entry.level === 'warn').length);
const hint = ref('');
// 浏览器不让自动复制时，把整份日志摊在文本框里让玩家手动复制
const fallback = ref('');

onMounted(() => {
  unsubscribe = onLogChange(() => {
    version.value += 1;
    // 玩家正看着日志面板，就算已经看过了
    store.markLogSeen();
  });
  store.markLogSeen();
});
onUnmounted(() => {
  unsubscribe?.();
  unsubscribe = null;
});

function report(): string {
  return buildDiagnosticReport(getCore());
}

async function copyLog(): Promise<void> {
  const text = report();
  let ok = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch {
    ok = false;
  }
  if (!ok) ok = legacyCopy(text);
  logEvent('info', 'log.export', `导出日志（复制${ok ? '成功' : '失败，已改为手动复制'}）`);
  fallback.value = ok ? '' : text;
  hint.value = ok
    ? '已复制到剪贴板，把它发给作者即可。'
    : '浏览器不允许自动复制：下面的文本框里按 Ctrl+A、Ctrl+C 复制。';
}

function downloadLog(): void {
  const text = report();
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `GTNH增量日志-${fileStamp()}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  logEvent('info', 'log.export', '导出日志（下载 txt 文件）');
  fallback.value = '';
  hint.value = '已下载成 txt 文件，把它发给作者即可。';
}

function clearAll(): void {
  if (!window.confirm('清空后这份日志就找不回来了，确定吗？')) return;
  clearLog();
  fallback.value = '';
  hint.value = '日志已清空。';
}

// 老浏览器与 file:// 打开时 navigator.clipboard 往往不可用，用老办法兜一下
function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function fileStamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}
</script>

<template>
  <section class="panel">
    <h2>
      日志
      <span class="muted small">v{{ VERSION }} · 构建 {{ BUILD }}</span>
    </h2>
    <p v-if="store.simulationPaused" class="log-alert">
      模拟已暂停：连续出错，游戏不会继续推进。请复制日志发给作者，然后刷新页面重来。
    </p>

    <div class="row">
      <div class="name muted small">
        共 {{ all.length }} 条 · 错误 {{ errorCount }} 条 · 警告 {{ warnCount }} 条
      </div>
      <button class="primary" @click="copyLog">复制日志</button>
      <button @click="downloadLog">下载文件</button>
      <button @click="clearAll">清空</button>
    </div>
    <p v-if="hint" class="muted small" style="margin: 6px 0 0">{{ hint }}</p>
    <textarea v-if="fallback" class="log-fallback" readonly :value="fallback" />

    <ul v-if="shown.length" class="log-list">
      <li v-for="entry in shown" :key="entry.seq" class="log-item" :class="entry.level">
        <div class="log-head">
          <span class="log-time">{{ entry.at.slice(5) }}</span>
          <span class="log-tag">{{ levelName(entry.level) }}</span>
          <span class="log-text">{{ entry.message }}</span>
        </div>
        <details v-if="entry.detail" class="log-detail">
          <summary>详情</summary>
          <pre>{{ entry.detail }}</pre>
        </details>
      </li>
    </ul>
    <p v-else class="muted small" style="margin: 8px 0 0">
      还没有记录到事件。出问题时这里会自动留下线索。
    </p>
    <p v-if="all.length > shown.length" class="muted small" style="margin: 6px 0 0">
      上面只列最近 {{ shown.length }} 条，复制与下载给的是全部 {{ all.length }} 条。
    </p>
  </section>
</template>
