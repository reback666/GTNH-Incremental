// 时间格式化：抽成一份公共实现，界面、日志、诊断报告都读它。
//
// 这里刻意保持零依赖（不引 Decimal、不碰浏览器对象）：日志层要在任何环境里都能用
// （模拟层、界面层、node 测试），所以不能把它拖进 Vue / pinia / 资源加载那一套里。

// 时长：小时级只到分，分钟级到秒，秒级直接给秒。
// 例：3725 → 「1 小时 2 分」，95 → 「1 分 35 秒」，42 → 「42 秒」。
export function formatDuration(seconds: number): string {
  // 负数与 NaN 都按 0 处理：时长没有负的，宁可显示 0 秒也不要冒出「-5 秒」
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h} 小时 ${m} 分` : m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

// 墙上时间戳，日志与诊断报告里给人看：2026-09-30 18:30:05
export function formatStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
