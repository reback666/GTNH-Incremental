<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useGameStore } from '../game/store';
import { getCore } from '../game/engine';
import { buildDiagnosticJson, buildDiagnosticReport } from '../game/diagnostics';
import { appVersion, buildStamp } from '../game/build-info';
import {
  LOG_CATEGORIES, categoryName, clearLog, filterLogEntries, flushLog, levelName,
  logEntries, logEvent, logStatus, onLogChange, setLogDebugEnabled, type LogCategory, type LogLevel,
} from '../game/log';
import { formatDuration } from '../numeric/time';

const PAGE_SIZE = 60;
const VERSION = appVersion();
const BUILD = buildStamp();
const store = useGameStore();
const version = ref(0);
let unsubscribe: (() => void) | undefined;
const all = computed(() => { void version.value; return logEntries(); });
const status = computed(() => { void version.value; return logStatus(); });
const level = ref<LogLevel | ''>('');
const category = ref<LogCategory | ''>('');
const query = ref('');
const currentSession = ref(false);
const minutes = ref(0);
const shownLimit = ref(PAGE_SIZE);
const filtered = computed(() => filterLogEntries(all.value, {
  level: level.value, category: category.value, query: query.value, currentSession: currentSession.value,
  ...(minutes.value ? { since: Date.now() - minutes.value * 60000 } : {}),
}).reverse());
const shown = computed(() => filtered.value.slice(0, shownLimit.value));
const countLevel = (value: LogLevel) => all.value.filter(entry => entry.level === value).reduce((sum, entry) => sum + entry.repeat, 0);
const errorCount = computed(() => countLevel('error'));
const warnCount = computed(() => countLevel('warn'));
const hint = ref('');
const fallback = ref('');
const copying = ref(false);
watch([level, category, query, currentSession, minutes], () => { shownLimit.value = PAGE_SIZE; });

function activate(): void {
  if (unsubscribe) return;
  version.value += 1;
  unsubscribe = onLogChange(() => {
    version.value += 1;
    store.markLogSeen();
  });
  store.markLogSeen();
}
function deactivate(): void {
  unsubscribe?.();
  unsubscribe = undefined;
}
onMounted(activate);
onActivated(activate);
onDeactivated(deactivate);
onUnmounted(deactivate);

function resetFilters(): void {
  level.value = '';
  category.value = '';
  query.value = '';
  currentSession.value = false;
  minutes.value = 0;
}

async function copyLog(): Promise<void> {
  if (copying.value) return;
  copying.value = true;
  try {
    flushLog();
    const text = buildDiagnosticReport(getCore());
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch { /* file:// 或剪贴板权限限制时使用手动复制。 */ }
    if (!ok) ok = legacyCopy(text);
    logEvent('info', 'log.export', '复制完整诊断日志', undefined, { method: 'clipboard', success: ok });
    fallback.value = ok ? '' : text;
    hint.value = ok ? '已复制完整日志。' : '请在下方文本框中按 Ctrl+A、Ctrl+C 复制完整日志。';
  } finally {
    copying.value = false;
  }
}

function downloadLog(format: 'txt' | 'json'): void {
  flushLog();
  const text = format === 'json' ? buildDiagnosticJson(getCore()) : buildDiagnosticReport(getCore());
  let url: string | undefined;
  const link = document.createElement('a');
  try {
    url = URL.createObjectURL(new Blob([text], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' }));
    link.href = url;
    link.download = 'GTNH增量日志-' + fileStamp() + '.' + format;
    document.body.appendChild(link);
    link.click();
    logEvent('info', 'log.export', '下载完整诊断日志', undefined, { format });
    fallback.value = '';
    hint.value = '已生成 ' + format.toUpperCase() + ' 日志文件。';
  } catch {
    fallback.value = text;
    hint.value = '无法下载，请在下方文本框中复制完整日志。';
  } finally {
    link.remove();
    if (url) { const objectUrl = url; setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); }
  }
}

function clearAll(): void {
  if (!window.confirm('确定清空全部日志记录？')) return;
  clearLog();
  fallback.value = '';
  hint.value = '日志已清空。';
}

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  const previousFocus = document.activeElement;
  try {
    area.value = text;
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    return document.execCommand('copy');
  } catch { return false; }
  finally {
    area.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }
}

function fileStamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return String(now.getFullYear()) + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' +
    pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
}
</script>

<template>
  <section class="panel log-panel" aria-labelledby="log-title">
    <h2 id="log-title">
      日志
      <span class="muted small">v{{ VERSION }} · 构建 {{ BUILD }}</span>
    </h2>
    <p v-if="store.simulationPaused" class="log-alert">
      模拟因连续出错已暂停。可先下载日志保留现场，再刷新页面重试。
    </p>
    <p v-if="status.storageState === 'memory'" class="log-alert" :title="status.storageError">
      日志暂存在内存，关闭页面前可下载保留。
      <button @click="flushLog">重试保存日志</button>
    </p>

    <div class="row log-actions">
      <div class="name muted small">保留 {{ all.length }} 条 · 错误 {{ errorCount }} 次 · 警告 {{ warnCount }} 次</div>
      <button class="primary" :disabled="copying" @click="copyLog">{{ copying ? '正在复制…' : '复制日志' }}</button>
      <button @click="downloadLog('txt')">下载 TXT</button>
      <button @click="downloadLog('json')">下载 JSON</button>
      <button :disabled="!all.length" @click="clearAll">清空</button>
    </div>
    <p class="muted small log-note">
      日志仅保存在本机。复制和下载包含全部记录及当前游戏状态。
    </p>

    <div class="log-filters" role="group" aria-label="日志筛选">
      <label class="log-search">
        <span>搜索</span>
        <input v-model="query" type="search" placeholder="关键词、事件或设备编号" />
      </label>
      <label>
        <span>级别</span>
        <select v-model="level">
          <option value="">全部级别</option>
          <option v-for="value in (['error', 'warn', 'info', 'debug'] as const)" :key="value" :value="value">{{ levelName(value) }}</option>
        </select>
      </label>
      <label>
        <span>分类</span>
        <select v-model="category">
          <option value="">全部分类</option>
          <option v-for="value in LOG_CATEGORIES" :key="value" :value="value">{{ categoryName(value) }}</option>
        </select>
      </label>
      <label>
        <span>时间</span>
        <select v-model="minutes" title="按最后发生时间筛选">
          <option :value="0">全部时间</option>
          <option :value="5">最近 5 分钟</option>
          <option :value="60">最近 1 小时</option>
          <option :value="1440">最近 24 小时</option>
        </select>
      </label>
      <label class="log-check"><input v-model="currentSession" type="checkbox" />仅本次打开</label>
      <button v-if="level || category || query || currentSession || minutes" @click="resetFilters">重置筛选</button>
    </div>
    <div class="log-options">
      <label class="log-check">
        <input type="checkbox" :checked="status.debugEnabled" @change="setLogDebugEnabled(($event.target as HTMLInputElement).checked)" />
        记录调试信息（本次打开）
      </label>
      <span class="muted small">匹配 {{ filtered.length }} 条 · 最多保留 {{ status.limit }} 条，优先保留错误与警告</span>
    </div>
    <p v-if="hint" class="muted small log-note" role="status">{{ hint }}</p>
    <textarea v-if="fallback" class="log-fallback" aria-label="完整诊断日志，供手动复制" readonly :value="fallback" />

    <ul v-if="shown.length" class="log-list" aria-label="日志记录">
      <li v-for="entry in shown" :key="entry.seq" class="log-item" :class="entry.level">
        <div class="log-head">
          <time class="log-time" :datetime="entry.timestamp">{{ entry.at.slice(5) }}</time>
          <span class="log-tag">{{ levelName(entry.level) }}</span>
          <span class="log-category">{{ categoryName(entry.category) }}</span>
          <span class="log-text">{{ entry.message }}</span>
          <span v-if="entry.repeat > 1" class="log-repeat" :title="'最后发生：' + entry.lastTimestamp">×{{ entry.repeat }}</span>
        </div>
        <details class="log-detail">
          <summary>详情 · 游戏内 {{ formatDuration(entry.gameSeconds) }}</summary>
          <pre>{{ entry.code }} · #{{ entry.seq }} · 会话 {{ entry.sessionId }}
版本 {{ entry.version }} · 构建 {{ entry.build }}
{{ entry.timestamp }}<template v-if="entry.repeat > 1">
累计 {{ entry.repeat }} 次，最后发生 {{ entry.lastTimestamp }} · 游戏内 {{ formatDuration(entry.lastGameSeconds) }}</template><template v-if="entry.context">
{{ JSON.stringify(entry.context, null, 2) }}</template><template v-if="entry.detail">
{{ entry.detail }}</template></pre>
        </details>
      </li>
    </ul>
    <p v-else class="muted small log-note">
      {{ all.length ? '没有符合筛选条件的记录，可调整关键词或重置筛选。' : '暂无日志，关键操作和异常会自动记录在这里。' }}
    </p>
    <div v-if="filtered.length > shown.length" class="log-more">
      <span class="muted small">已显示 {{ shown.length }} / {{ filtered.length }} 条</span>
      <button @click="shownLimit += PAGE_SIZE">加载更早记录</button>
    </div>
  </section>
</template>
