import { dec, type Decimal } from '../numeric/decimal';
import { MAX_TIER } from '../numeric/voltage';
import type { UniverseId } from './universes';

// 挑战时间线（docs/转生拓展大纲.md M3，2026-10-01 拍板：规则与倍率按本表，
// 不加「失败安慰」——违规那一刻挑战静默失效，结算拿不到加成）。
//
// 转生时自愿挂上 0 或 1 个挑战（不可叠加），挑战跟着新周目开始生效、全程受检，
// 转生结算时未失效则线缆乘以各自的倍率；首通另外点亮一条成就。
// 失败没有任何惩罚：违规只把 challengeViolated 置位，本周目照常玩。

export type ChallengeId = 'pure' | 'red' | 'grid' | 'power' | 'speedrun';

export interface Challenge {
  id: ChallengeId;
  name: string;
  // 规则一句话（界面选择卡与状态行共用）
  desc: string;
  // 结算倍率（通过时线缆 × 这个数）
  bonus: string;
  // 需要拥有（或本次带上）对应宇宙才能挂
  requireUniverse?: UniverseId;
}

// 纯净时间线的污染上限（%）；赤色时间线的热身线（%）
export const CHALLENGE_PURE_LIMIT = '30';
export const CHALLENGE_RED_PRIME = '60';
// 极限时间线：游戏内 8 小时内打到 MAX
export const CHALLENGE_SPEEDRUN_SECONDS = 8 * 3600;
// 稳频时间线：供电率低于这条就失效
export const CHALLENGE_POWER_FLOOR = 0.95;

export const CHALLENGES: Challenge[] = [
  {
    id: 'pure',
    name: '纯净时间线',
    desc: `全程污染不超过 ${CHALLENGE_PURE_LIMIT}%`,
    bonus: '1.3',
  },
  {
    id: 'red',
    name: '赤色时间线',
    desc: `污染首次到 ${CHALLENGE_RED_PRIME}% 之后，一路保持不再跌破`,
    bonus: '1.5',
    requireUniverse: 'abyss',
  },
  {
    id: 'grid',
    name: '断网时间线',
    desc: '全程只接普通电网，不解锁其余三种',
    bonus: '1.2',
  },
  {
    id: 'power',
    name: '稳频时间线',
    desc: `供电率从未跌破 ${CHALLENGE_POWER_FLOOR * 100}%`,
    bonus: '1.25',
  },
  {
    id: 'speedrun',
    name: '极限时间线',
    desc: `${CHALLENGE_SPEEDRUN_SECONDS / 3600} 小时内打到 MAX`,
    bonus: '1.4',
  },
];

const BY_ID = new Map<string, Challenge>(CHALLENGES.map((challenge) => [challenge.id, challenge]));

export function challengeById(id: string): Challenge | undefined {
  return BY_ID.get(id);
}

export function isChallengeId(id: string): id is ChallengeId {
  return BY_ID.has(id);
}

export interface ChallengeVerdict {
  violated: boolean;
  primed: boolean;
}

// 每拍对激活中的挑战评估一次。
// primed 只用于赤色时间线：污染第一次到 60% 才算「热身完成」，判定从那一刻开始——
// 否则开局污染为 0 会立刻违规，挑战就没法挂了。从未热身过 = 没参与，结算不给加成。
export function evaluateChallenge(
  id: ChallengeId,
  input: {
    pollution: Decimal;
    gridCount: number;
    powerRatio: number;
    playSeconds: number;
    maxTier: number;
    primed: boolean;
  },
): ChallengeVerdict {
  switch (id) {
    case 'pure':
      return { violated: input.pollution.gt(dec(CHALLENGE_PURE_LIMIT)), primed: true };
    case 'red': {
      const primed = input.primed || input.pollution.gte(dec(CHALLENGE_RED_PRIME));
      return { violated: primed && input.pollution.lt(dec(CHALLENGE_RED_PRIME)), primed };
    }
    case 'grid':
      return { violated: input.gridCount > 1, primed: true };
    case 'power':
      return { violated: input.powerRatio < CHALLENGE_POWER_FLOOR, primed: true };
    case 'speedrun':
      return {
        violated: input.playSeconds >= CHALLENGE_SPEEDRUN_SECONDS && input.maxTier < MAX_TIER,
        primed: true,
      };
  }
}

// 结算时挑战算不算通过：没失效；赤色还要求热身过（全程没到过 60% 等于没参与）
export function challengeSettles(id: ChallengeId, violated: boolean, primed: boolean): boolean {
  if (violated) return false;
  return id !== 'red' || primed;
}
