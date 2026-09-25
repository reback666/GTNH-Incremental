import { SIM_STEP_MS } from './constants';
import { MACHINE_MODELS } from './models';
import { formatLogEntry, logEntries, levelName, type LogEntry } from './log';
import { type GameCore } from './core';
import { coinName, oreName } from '../numeric/credit';
import { ZERO } from '../numeric/decimal';
import { formatNumber } from '../numeric/format';
import { gridMode } from '../numeric/grid';
import { VOLTAGE_TIERS } from '../numeric/voltage';

// 玩家反馈问题时要交给作者的那份材料：
// 环境信息 + 导出那一刻的游戏状态 + 日志。全部拼成纯文本，玩家能直接粘贴。

export function buildStamp(): string {
  return typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : '开发环境';
}

// 环境信息：同一个问题在不同浏览器 / 打开方式下表现可能完全不同，
// 这几行是作者判断「是不是只有他一个人这样」的起点。
export function environmentInfo(): string[] {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const loc = typeof location === 'undefined' ? undefined : location;
  const view = typeof window === 'undefined' ? undefined : window;
  const lines = [
    `游戏版本：${buildStamp()}`,
    `导出时间：${stamp(new Date())}`,
    `浏览器：${nav?.userAgent ?? '未知（非浏览器环境）'}`,
    `打开方式：${
      !loc
        ? '未知'
        : loc.protocol === 'file:'
          ? '本地文件（file://）'
          : `网页（${loc.protocol}//${loc.host}）`
    }`,
  ];
  if (view) {
    lines.push(
      `屏幕：${view.screen.width}×${view.screen.height}，像素比 ${view.devicePixelRatio}`,
    );
  }
  if (nav?.language) lines.push(`语言：${nav.language}`);
  return lines;
}

// 导出那一刻的游戏状态。出错时也会抓一份，所以这里只放作者定位问题要用的事实，
// 不做界面口径的格式化（数值给原始可读文本，便于和存档对照）。
export function stateSnapshot(core: GameCore): string[] {
  const lines: string[] = [];
  const voltage = (tier: number) => VOLTAGE_TIERS[tier - 1] ?? `T${tier}`;

  lines.push(
    `游戏内时长：${duration(core.playSeconds)}｜电压上限：${voltage(core.maxTier)}` +
      `｜历史最高：${voltage(core.peakTier)}`,
  );
  lines.push(
    `周目：第 ${core.rebirthCount + 1} 周目（已转生 ${core.rebirthCount} 次）` +
      `｜平行宇宙：${core.universes.length > 0 ? core.universes.join('、') : '无'}` +
      `｜下次转生带：${core.pendingUniverse ?? '未选'}`,
  );
  lines.push(
    `电网：${gridMode(core.grid).name}｜污染：${formatNumber(core.pollution)}%` +
      `${core.pollutionEnabled ? '' : '（机制已关闭）'}`,
  );
  lines.push(
    `已研究：${core.researched.map(voltage).join('、') || '无'}` +
      `｜研究进度：${formatNumber(core.researchProgress)}`,
  );

  const owned = MACHINE_MODELS.filter((model) => core.countOf(model.id) > 0);
  const total = MACHINE_MODELS.reduce((sum, model) => sum + core.countOf(model.id), 0);
  if (owned.length === 0) {
    lines.push('机器：无');
  } else {
    lines.push(`机器（共 ${total} 台）：`);
    for (const model of owned) {
      const faulty = core.faultyCountOf(model.id);
      const overclock = core.overclockOf(model.id);
      lines.push(
        `  ${model.name}（${voltage(model.tier)}·${model.id}）×${core.countOf(model.id)}` +
          `${faulty > 0 ? `，故障 ${faulty}` : ''}` +
          `${overclock > 0 ? `，超频 ${overclock} 档` : ''}`,
      );
    }
  }

  const ores = core.ores
    .map((amount, index) => ({ name: oreName(index), amount }))
    .filter((item) => item.amount.gt(0));
  lines.push(
    ores.length === 0
      ? '矿石：无'
      : `矿石：${ores.map((item) => `${item.name} ${formatNumber(item.amount)}`).join('｜')}`,
  );

  const coins = core.coins
    .map((amount, index) => ({ name: coinName(index + 1), amount }))
    .filter((item) => item.amount.gt(0));
  lines.push(
    coins.length === 0
      ? 'GT 币：无'
      : `GT 币：${coins.map((item) => `${item.name} ${formatNumber(item.amount)}`).join('｜')}`,
  );

  lines.push(
    `存电：${formatNumber(core.storedEU)} / ${formatNumber(core.batteryCapacity())} EU` +
      `｜时空线缆：${formatNumber(core.cables)} 条`,
  );

  // 上一拍的实时读数：问题是「产出不对」时，这几项最能说明当时的厂况
  const report = core.lastReport;
  const step = SIM_STEP_MS / 1000;
  const sum = (list: GameCore['ores']) => list.reduce((total, item) => total.plus(item), ZERO);
  lines.push(
    `上一拍：发电 ${formatNumber(report.euGenerated.div(step))} EU/t` +
      `｜耗电 ${formatNumber(report.euConsumed.div(step))} EU/t` +
      `｜供电比 ${(report.powerRatio * 100).toFixed(0)}%` +
      `｜产矿 ${formatNumber(sum(report.oreGained).div(step))}/秒` +
      `｜产币 ${formatNumber(sum(report.coinsGained).div(step))}/秒`,
  );

  return lines;
}

export function buildDiagnosticReport(core: GameCore, entries = logEntries()): string {
  const errors = entries.filter((entry) => entry.level === 'error').length;
  const warnings = entries.filter((entry) => entry.level === 'warn').length;
  return [
    '=== GTNH 增量 诊断日志 ===',
    ...environmentInfo(),
    '',
    '--- 导出时的游戏状态 ---',
    ...stateSnapshot(core),
    '',
    `--- 日志（共 ${entries.length} 条：错误 ${errors}、警告 ${warnings}）---`,
    ...(entries.length === 0 ? ['（没有记录到任何事件）'] : entries.map(formatLogEntry)),
    '',
    `--- 日志结束（级别：${levelName('info')} / ${levelName('warn')} / ${levelName('error')}）---`,
  ].join('\n');
}

function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function duration(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h} 小时 ${m} 分` : m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}
