// 便携单文件不依赖外部音频：多数音效由 WebAudio 合成，开关声使用内嵌采样。
// 浏览器要求首次交互后才能出声：交互类音效（挖矿、购买…）天然满足，
// 启动阶段的事件音效会被 AudioContext 创建失败/挂起挡掉，属于预期行为。

import { BUTTON_DOWN_OGG } from './samples/button-down';

// 各音效要用到的采样名（音效表之外的第二层素材）。需要新采样时在这里登记。
const SAMPLE_SOURCES: Partial<Record<SoundId, string>> = {
  toggle: BUTTON_DOWN_OGG,
};

export type SoundId =
  | 'mine'
  | 'buy'
  | 'sell'
  | 'toggle'
  | 'unlock'
  | 'achievement'
  | 'rebirth'
  | 'challengePass'
  | 'challengeFail'
  | 'planck'
  | 'outage'
  | 'restore'
  | 'steal'
  | 'mutation'
  | 'collapse'
  | 'pollution';

export interface SoundDef {
  id: SoundId;
  name: string;
  // 设置页列表按这两组分区
  group: '操作' | '事件';
  desc: string;
}

export const SOUNDS: readonly SoundDef[] = [
  { id: 'mine', name: '挖矿', group: '操作', desc: '手动挖矿点击：石头被敲下来的闷响' },
  { id: 'buy', name: '购买', group: '操作', desc: '购买机器 / 镐子升级 / 买加成树节点' },
  { id: 'sell', name: '卖出', group: '操作', desc: '卖出机器找回零钱' },
  { id: 'toggle', name: '开关', group: '操作', desc: '超频升降档 / 运行-停机切换（GT 机器启停的机械咔哒）' },
  { id: 'unlock', name: '电压解锁', group: '事件', desc: '电压上限提升（仿 MC 经验升级的琶音）' },
  { id: 'achievement', name: '研究 / 成就', group: '事件', desc: '研究完成、成就达成' },
  { id: 'rebirth', name: '裂缝 / 转生', group: '事件', desc: '时空裂缝出现、转生完成' },
  { id: 'challengePass', name: '挑战通过', group: '事件', desc: '转生结算时挑战判定通过' },
  { id: 'challengeFail', name: '挑战失效', group: '事件', desc: '挂着的挑战当场违规失效' },
  { id: 'planck', name: '普朗克锚', group: '事件', desc: '铸造普朗克锚（一次性大事件）' },
  { id: 'outage', name: '电力不足', group: '事件', desc: '供电率跌破 100%、产出开始降载' },
  { id: 'restore', name: '供电恢复', group: '事件', desc: '供电率回到 100%' },
  { id: 'steal', name: '黑市窃取', group: '事件', desc: '黑市电网薅走一笔 GT 币' },
  { id: 'mutation', name: '变异奖励', group: '事件', desc: '中度污染随机变异给了奖励' },
  { id: 'collapse', name: '污染故障', group: '事件', desc: '重度污染导致机器停机，可维护恢复' },
  { id: 'pollution', name: '污染升级', group: '事件', desc: '污染进入中度 / 重度' },
];

const SOUND_IDS = new Set<string>(SOUNDS.map((sound) => sound.id));

export function isSoundId(value: unknown): value is SoundId {
  return typeof value === 'string' && SOUND_IDS.has(value);
}

// ── 合成引擎 ───────────────────────────────────────────────

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
// 页面上没有 WebAudio（老浏览器、测试环境）时静默降级
let supported = typeof window !== 'undefined' && 'AudioContext' in window;

const MASTER_VOLUME = 0.22;

function audio(): AudioContext | null {
  if (!supported) return null;
  if (ctx === null) {
    try {
      ctx = new window.AudioContext();
      master = ctx.createGain();
      master.gain.value = MASTER_VOLUME;
      master.connect(ctx.destination);
    } catch {
      supported = false;
      return null;
    }
  }
  // 挂起状态（还没发生过用户手势）下尝试恢复；失败就这一声不响
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// 所有声音都汇到主音量节点再出去：整体响度一处调
function output(c: RecipeContext): AudioNode {
  return master ?? c.destination;
}

interface ToneOptions {
  // 开始时间（秒，相对 now）
  at?: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  // 结束频率（起音频率滑过去）
  glideTo?: number;
}

// 一个音符：起音 5ms、指数衰减。全部音效的积木。
function tone(c: RecipeContext, freq: number, options: ToneOptions = {}): void {
  const { at = 0, dur = 0.15, type = 'sine', vol = 1, glideTo } = options;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(output(c));
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// 一段白噪声（过低通）：敲击、崩裂的积木。
function thump(c: RecipeContext, options: { at?: number; dur?: number; vol?: number; filter?: number } = {}): void {
  const { at = 0, dur = 0.08, vol = 1, filter = 500 } = options;
  const t0 = c.currentTime + at;
  const length = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const lowpass = c.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = filter;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(lowpass).connect(gain).connect(output(c));
  src.start(t0);
}

type RecipeContext = BaseAudioContext;
type SampleMap = ReadonlyMap<SoundId, AudioBuffer>;

const RECIPES: Record<SoundId, (c: RecipeContext, samples: SampleMap) => void> = {
  // 石头闷响「咚」：低频噪声垫底 + 短促的低音滑落
  mine: (c) => {
    thump(c, { dur: 0.06, vol: 0.9, filter: 420 });
    tone(c, 95, { dur: 0.09, type: 'triangle', vol: 0.6, glideTo: 55 });
  },
  // 确认声：两个短音上行
  buy: (c) => {
    tone(c, 660, { dur: 0.07, type: 'triangle', vol: 0.7 });
    tone(c, 880, { at: 0.07, dur: 0.1, type: 'triangle', vol: 0.7 });
  },
  // 金币：两声高音叮当
  sell: (c) => {
    tone(c, 1319, { dur: 0.05, vol: 0.55 });
    tone(c, 1760, { at: 0.06, dur: 0.1, vol: 0.5 });
  },
  // 开关：GT 机器启停的机械「咔哒」（真实采样）；解码失败退回合成短音
  toggle: (c, samples) => {
    const buffer = samples.get('toggle');
    if (buffer) {
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.connect(output(c));
      src.start();
      return;
    }
    tone(c, 440, { dur: 0.03, type: 'square', vol: 0.35 });
  },
  // 电压解锁：仿 MC 经验升级——一串往上跑的拨弦琶音
  unlock: (c) => {
    [523, 659, 784, 1047, 1319].forEach((freq, index) => {
      tone(c, freq, { at: index * 0.07, dur: 0.18, vol: 0.6 });
      tone(c, freq * 2, { at: index * 0.07, dur: 0.12, vol: 0.15 });
    });
  },
  // 研究 / 成就：两音上行铃 + 一点闪光
  achievement: (c) => {
    tone(c, 784, { dur: 0.12, type: 'triangle', vol: 0.6 });
    tone(c, 1175, { at: 0.1, dur: 0.22, type: 'triangle', vol: 0.6 });
    tone(c, 2093, { at: 0.1, dur: 0.3, vol: 0.12 });
  },
  // 裂缝 / 转生：低频涌起 + 高频闪
  rebirth: (c) => {
    tone(c, 110, { dur: 0.8, vol: 0.5, glideTo: 220 });
    tone(c, 1568, { at: 0.25, dur: 0.4, vol: 0.15 });
    tone(c, 2093, { at: 0.45, dur: 0.5, vol: 0.12 });
  },
  // 挑战通过：上行三和弦 + 收尾高音
  challengePass: (c) => {
    [523, 659, 784].forEach((freq) => tone(c, freq, { dur: 0.25, type: 'triangle', vol: 0.45 }));
    tone(c, 1047, { at: 0.18, dur: 0.4, type: 'triangle', vol: 0.5 });
  },
  // 挑战失效：两声低沉下行
  challengeFail: (c) => {
    tone(c, 220, { dur: 0.22, vol: 0.5 });
    tone(c, 165, { at: 0.2, dur: 0.3, vol: 0.5 });
  },
  // 普朗克锚：深水重击 + 长闪
  planck: (c) => {
    tone(c, 55, { dur: 0.5, vol: 0.7 });
    thump(c, { dur: 0.3, vol: 0.6, filter: 300 });
    tone(c, 2093, { at: 0.2, dur: 0.8, vol: 0.12 });
    tone(c, 2637, { at: 0.35, dur: 0.9, vol: 0.1 });
  },
  // 电力不足：锯齿波下滑
  outage: (c) => {
    tone(c, 330, { dur: 0.35, type: 'sawtooth', vol: 0.35, glideTo: 110 });
  },
  // 供电恢复：三角波上滑
  restore: (c) => {
    tone(c, 220, { dur: 0.3, type: 'triangle', vol: 0.4, glideTo: 440 });
  },
  // 黑市窃取：两声鬼祟的下行短音
  steal: (c) => {
    tone(c, 880, { dur: 0.06, vol: 0.35 });
    tone(c, 740, { at: 0.08, dur: 0.09, vol: 0.3 });
  },
  // 变异：带颤音的奇异音
  mutation: (c) => {
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    osc.frequency.value = 988;
    const vibrato = c.createOscillator();
    vibrato.frequency.value = 14;
    const depth = c.createGain();
    depth.gain.value = 40;
    vibrato.connect(depth).connect(osc.frequency);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.35, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
    osc.connect(gain).connect(output(c));
    osc.start(t0);
    vibrato.start(t0);
    osc.stop(t0 + 0.4);
    vibrato.stop(t0 + 0.4);
  },
  // 工厂崩溃：噪声爆裂 + 低音砸地
  collapse: (c) => {
    thump(c, { dur: 0.25, vol: 1, filter: 900 });
    tone(c, 70, { dur: 0.3, vol: 0.6, glideTo: 40 });
  },
  // 污染升级：两声警告哔哔
  pollution: (c) => {
    tone(c, 620, { dur: 0.09, type: 'square', vol: 0.3 });
    tone(c, 620, { at: 0.14, dur: 0.09, type: 'square', vol: 0.3 });
  },
};

// 把该音效要用的采样解码出来（采样是 ogg，需要异步 decode）。
// 解码失败只影响这一声，配方各自有合成兜底。
async function prepareSamples(id: SoundId, c: RecipeContext): Promise<SampleMap> {
  const source = SAMPLE_SOURCES[id];
  const map = new Map<SoundId, AudioBuffer>();
  if (source === undefined) return map;
  try {
    const raw = Uint8Array.from(atob(source), (ch) => ch.charCodeAt(0));
    const buffer = await c.decodeAudioData(raw.buffer);
    map.set(id, buffer);
  } catch {
    // 浏览器解不动这个 ogg 就走合成兜底
  }
  return map;
}

// 播放入口：enabled = 总开关，muted = 被单独关掉的音效 id 列表。
// 播不出来（没有 WebAudio / 还没发生过用户手势）就静默跳过。
export function playSound(id: SoundId, enabled: boolean, muted: readonly string[]): void {
  if (!enabled || muted.includes(id)) return;
  const c = audio();
  if (c === null || c.state !== 'running') return;
  void (async () => {
    const samples = await prepareSamples(id, c);
    try {
      RECIPES[id](c, samples);
    } catch {
      // 某个音效合成出错不影响游戏
    }
  })();
}

// ── 离线渲染：把某个音效渲染成 AudioBuffer（导出 wav 试听用） ──────────────
// 与 playSound 走同一份配方，保证导出的文件和游戏里听到的完全一致。
export async function renderSound(id: SoundId, seconds = 2): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === 'undefined') return null;
  const sampleRate = 44100;
  const offline = new OfflineAudioContext(1, Math.floor(sampleRate * seconds), sampleRate);
  // 采样先解码完，再同步接线（接线期间挂上离线主音量，接完立刻恢复）
  const samples = await prepareSamples(id, offline);
  const gain = offline.createGain();
  gain.gain.value = MASTER_VOLUME;
  gain.connect(offline.destination);
  const prevMaster = master;
  master = gain;
  try {
    RECIPES[id](offline, samples);
  } finally {
    master = prevMaster;
  }
  return offline.startRendering();
}
