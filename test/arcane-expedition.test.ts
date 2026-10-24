import { describe, expect, it } from 'vitest';
import { Decimal, dec, pow } from '../src/numeric/decimal';
import {
  ARCANE_ASPECTS, ARCANE_RESEARCH, ArcaneExpedition, arcaneNodeAspects,
  type ArcaneContext, type ArcaneNode, type ArcaneTask,
} from '../src/game/arcane-expedition';

function economy(balance = '1e100') {
  const wallets = new Map<number, Decimal>();
  const payments: { tier: number; amount: string }[] = [];
  let rejectPay = false;
  const context: ArcaneContext = {
    active: true, maxTier: 14,
    firstMachineCost: tier => dec('500').times(pow('4', tier - 1)),
    energyEU: tier => dec('8').times(pow('4', tier - 1)),
    canPay: (tier, amount) => amount.lte(wallets.get(tier) ?? balance),
    pay: (tier, amount) => {
      if (rejectPay || !context.canPay(tier, amount)) return false;
      wallets.set(tier, (wallets.get(tier) ?? dec(balance)).minus(amount));
      payments.push({ tier, amount: amount.toString() }); return true;
    },
  };
  return { context, wallets, payments, reject: (value: boolean) => { rejectPay = value; } };
}
function setup(research = 1) {
  const env = economy();
  const game = new ArcaneExpedition();
  expect(game.act({ type: 'research', id: 'A0' }, env.context)).toBe(true);
  game.state.research = research;
  return { ...env, game };
}
function buildBench(game: ArcaneExpedition, context: ArcaneContext, tier = 2): string {
  expect(game.act({ type: 'build-bench', tier }, context)).toBe(true);
  return game.state.benches.at(-1)!.id;
}
function buyNode(game: ArcaneExpedition, context: ArcaneContext, tier = 2): ArcaneNode {
  expect(game.act({ type: 'buy-node', tier }, context)).toBe(true);
  return game.state.nodes.at(-1)!;
}
function enqueue(game: ArcaneExpedition, context: ArcaneContext, benchId: string, nodeId: string, task: ArcaneTask, count = 1): boolean {
  return game.act({ type: 'enqueue', benchId, nodeId, task, count }, context);
}
function packCandidate(game: ArcaneExpedition, context: ArcaneContext): ArcaneNode {
  if (!game.state.surveys.length) expect(game.act({ type: 'build-survey', tier: 2 }, context)).toBe(true);
  const survey = game.state.surveys[0];
  for (let i = 0; i < 30 && !survey.candidates.length; i++) game.tick(100, 1, context);
  const node = game.state.nodes.find(n => n.id === survey.candidates[0])!;
  expect(node).toBeDefined(); return node;
}
const saved = (game: ArcaneExpedition) => JSON.stringify(game.state);

describe('独立奥术节点：付款与研究', () => {
  it('未激活时不能操作、付费或推进，已保存实体不出力', () => {
    const { game, context, payments } = setup();
    const before = saved(game), count = payments.length;
    context.active = false;
    expect(game.act({ type: 'buy-node', tier: 2 }, context)).toBe(false);
    game.tick(1e8, 1, context);
    expect(saved(game)).toBe(before);
    expect(payments).toHaveLength(count);
    expect(game.visOutput(context).toString()).toBe('0');
    expect(game.energyDemand(context).toString()).toBe('0');
    expect(game.network(context).enchantmentLevel).toBe(0);
  });

  it('余额不足与实际扣款失败都不改变实体、进度或随机种子', () => {
    const env = economy('1999'); const game = new ArcaneExpedition();
    const before = saved(game);
    expect(game.act({ type: 'research', id: 'A0' }, env.context)).toBe(false);
    expect(saved(game)).toBe(before); expect(env.payments).toHaveLength(0);
    env.wallets.set(2, dec('2000')); env.reject(true);
    expect(game.act({ type: 'research', id: 'A0' }, env.context)).toBe(false);
    expect(saved(game)).toBe(before); expect(env.wallets.get(2)!.toString()).toBe('2000');
  });

  it('首节点一次领取且纯 JSON 往返保持节点、支架和种子', () => {
    const { game, context, payments } = setup(0);
    expect(game.state.nodes).toHaveLength(1);
    expect(game.state.nodes[0]).toMatchObject({ tier: 2, size: 80, quality: 'normal', type: 'standard', location: 'installed' });
    expect(game.visOutput(context).toString()).toBe('6.4');
    expect(payments[0]).toEqual({ tier: 2, amount: '2000' });
    const restored = new ArcaneExpedition(JSON.parse(saved(game)));
    expect(saved(restored)).toBe(saved(game));
    expect(restored.act({ type: 'research', id: 'A0' }, context)).toBe(false);
    expect(restored.state.nodes).toHaveLength(1);
  });

  it('价格和耗电读取实际回调，大数只按 Decimal 结算', () => {
    const { game, context, payments } = setup();
    context.firstMachineCost = tier => dec('1e60').plus(String(tier));
    context.energyEU = tier => dec('1e50').plus(String(tier));
    expect(game.act({ type: 'build-survey', tier: 4 }, context)).toBe(true);
    expect(payments.at(-1)).toEqual({ tier: 4, amount: dec('1e60').plus(4).times(2).toString() });
    expect(game.energyDemand(context).eq(context.energyEU(4).times('0.25'))).toBe(true);
  });

  it('固定购买计数不随丢弃减少，不允许越过工业电压', () => {
    const { game, context, payments } = setup();
    const node = buyNode(game, context);
    expect(payments.at(-1)!.amount).toBe('3000');
    expect(game.act({ type: 'discard', nodeIds: [node.id] }, context)).toBe(true);
    buyNode(game, context);
    expect(payments.at(-1)!.amount).toBe('3300');
    context.maxTier = 2;
    const before = saved(game);
    expect(game.act({ type: 'buy-node', tier: 3 }, context)).toBe(false);
    expect(saved(game)).toBe(before);
  });

  it('研究严格顺序、明确前置，建设条件只在开始检查', () => {
    const { game, context } = setup(0);
    expect(game.act({ type: 'research', id: 'A2' }, context)).toBe(false);
    expect(game.act({ type: 'research', id: 'A1' }, context)).toBe(false);
    buyNode(game, context); buyNode(game, context);
    expect(game.act({ type: 'research', id: 'A1' }, context)).toBe(true);
    expect(game.act({ type: 'research', id: 'A1' }, context)).toBe(false);
    game.tick(450, 0.5, context);
    expect(game.state.researchJob!.work).toBe('225');
    game.tick(675, 1, context);
    expect(game.state.research).toBe(1);
    const original = game.state.nodes[0]; original.size = 100;
    for (const node of game.state.nodes.filter(n => n.location === 'jar')) {
      expect(game.act({ type: 'buy-stand', tier: 2 }, context)).toBe(true);
      expect(game.act({ type: 'install', nodeId: node.id, standId: game.state.stands.at(-1)!.id }, context)).toBe(true);
    }
    expect(game.act({ type: 'research', id: 'A2' }, context)).toBe(true);
    expect(game.act({ type: 'uninstall', nodeId: original.id }, context)).toBe(true);
    game.tick(1800, 1, context);
    expect(game.state.research).toBe(2);
    expect(game.state.researchJob).toBeNull();
  });

  it('普通节点可满足终章，不要求明亮、饕餮或可选分支', () => {
    const { game, context } = setup(5);
    for (let i = 0; i < 11; i++) {
      const node = buyNode(game, context);
      game.act({ type: 'buy-stand', tier: 2 }, context);
      game.act({ type: 'install', nodeId: node.id, standId: game.state.stands.at(-1)!.id }, context);
    }
    expect(game.act({ type: 'research', id: 'A6' }, context)).toBe(true);
    game.tick(10800, 1, context);
    expect(game.state.research).toBe(6);
    expect(game.network(context).enchantmentLevel).toBe(3);
    expect(game.state.garden || game.state.blood).toBe(false);
  });

  it('从 A0 连续完成 A6：标准普通节点十次稳定培养，加第六次保障的普通纯净节点', () => {
    const { context } = economy();
    const game = new ArcaneExpedition({ seed: 2 });
    function research(index: number) {
      context.maxTier = index + 2;
      expect(game.act({ type: 'research', id: ARCANE_RESEARCH[index].id }, context)).toBe(true);
      game.tick(ARCANE_RESEARCH[index].seconds, 1, context);
      expect(game.state.research).toBe(index);
    }
    function installJars() {
      for (const node of game.state.nodes.filter(n => n.location === 'jar')) {
        expect(game.act({ type: 'buy-stand', tier: node.tier }, context)).toBe(true);
        expect(game.act({ type: 'install', nodeId: node.id, standId: game.state.stands.at(-1)!.id }, context)).toBe(true);
      }
    }
    research(0);
    buyNode(game, context); buyNode(game, context);
    research(1);
    const bench = buildBench(game, context);
    expect(enqueue(game, context, bench, game.state.nodes[0].id, { kind: 'cultivate' }, 10)).toBe(true);
    game.tick(20000, 1, context); installJars();
    research(2);
    buyNode(game, context); buyNode(game, context);
    research(3);
    buyNode(game, context); buyNode(game, context); buyNode(game, context);
    research(4);
    expect(game.act({ type: 'build-survey', tier: 2 }, context)).toBe(true);
    const survey = game.state.surveys[0];
    expect(game.act({ type: 'configure-survey', surveyId: survey.id, tier: 2, region: 'plains', target: { kind: 'type', value: 'pure' } }, context)).toBe(true);
    game.tick(5000, 1, context);
    const pure = game.state.nodes.find(n => n.id === survey.candidates[5])!;
    expect(pure).toMatchObject({ type: 'pure', quality: 'normal', size: 60 });
    expect(enqueue(game, context, bench, pure.id, { kind: 'safe-pack' })).toBe(true);
    game.tick(300, 1, context); installJars();
    research(5);
    buyNode(game, context); buyNode(game, context); installJars();
    const installed = game.state.nodes.filter(n => n.location === 'installed');
    expect(installed.every(n => n.quality === 'normal' && (n.type === 'standard' || n.type === 'pure'))).toBe(true);
    expect(installed.reduce((sum, n) => sum + n.size, 0)).toBe(610);
    research(6);
    expect(game.state.garden || game.state.blood).toBe(false);
    expect(game.state.codex.research).toEqual(ARCANE_RESEARCH.map(r => r.id));
  });
});

describe('调查、保护、封装与安装', () => {
  it('候选满暂停、没有电耗、没有覆盖或随机推进', () => {
    const { game, context } = setup(0);
    game.act({ type: 'build-survey', tier: 2 }, context);
    game.tick(100000, 1, context);
    const survey = game.state.surveys[0];
    expect(survey.candidates).toHaveLength(6);
    expect(game.energyDemand(context).toString()).toBe('0');
    const before = saved(game);
    game.tick(72 * 3600, 1, context);
    expect(saved(game)).toBe(before);
  });

  it('零电与手动暂停保存未完成调查和定向计数', () => {
    const { game, context } = setup();
    game.act({ type: 'build-survey', tier: 2 }, context);
    const survey = game.state.surveys[0];
    game.act({ type: 'configure-survey', surveyId: survey.id, tier: 2, region: 'plains', target: { kind: 'type', value: 'pure' } }, context);
    game.tick(300, 0.5, context);
    const before = saved(game); game.tick(1e8, 0, context);
    expect(saved(game)).toBe(before);
    game.act({ type: 'pause', facility: 'survey', id: survey.id, value: true }, context);
    const work = survey.work; game.tick(10000, 1, context);
    expect(survey.work).toBe(work); expect(game.energyDemand(context).isZero()).toBe(true);
  });

  it.each([{ target: 'pure' as const, limit: 6 }, { target: 'sinister' as const, limit: 12 }, { target: 'hungry' as const, limit: 20 }])('定向 $target 的第 $limit 次必定匹配且只产生一个实体', ({ target, limit }) => {
    const { game, context } = setup(4);
    game.act({ type: 'build-survey', tier: 2 }, context);
    const survey = game.state.surveys[0];
    game.act({ type: 'configure-survey', surveyId: survey.id, tier: 2, region: 'plains', target: { kind: 'type', value: target } }, context);
    survey.misses = limit - 1; game.state.seed = 1;
    game.tick(1000, 1, context);
    expect(survey.candidates).toHaveLength(1);
    const node = game.state.nodes.find(n => n.id === survey.candidates[0])!;
    expect(node).toMatchObject({ type: target, quality: 'normal', size: 60 });
    expect(survey.misses).toBe(0); expect(game.state.evaluated).toBe(2);
  });

  it('地区、等级、目标有真实解锁边界，改设置保留候选但重置保底与进度', () => {
    const { game, context } = setup(0);
    game.act({ type: 'build-survey', tier: 2 }, context);
    const node = packCandidate(game, context), survey = game.state.surveys[0];
    context.maxTier = 3;
    const before = saved(game);
    expect(game.act({ type: 'configure-survey', surveyId: survey.id, tier: 3, region: 'plains', target: null }, context)).toBe(false);
    expect(game.act({ type: 'configure-survey', surveyId: survey.id, tier: 2, region: 'outer', target: null }, context)).toBe(false);
    expect(game.act({ type: 'configure-survey', surveyId: survey.id, tier: 2, region: 'plains', target: { kind: 'type', value: 'hungry' } }, context)).toBe(false);
    expect(saved(game)).toBe(before);
    survey.misses = 4;
    expect(game.act({ type: 'configure-survey', surveyId: survey.id, tier: 2, region: 'forest', target: { kind: 'aspect', value: 'water' } }, context)).toBe(true);
    expect(survey.work).toBe('0'); expect(survey.misses).toBe(0); expect(survey.candidates).toContain(node.id);
  });

  it('生成规模与要素符合边界，主倾向保底不破坏总比例', () => {
    const { game, context } = setup(4);
    game.act({ type: 'build-survey', tier: 2 }, context);
    const survey = game.state.surveys[0];
    game.act({ type: 'configure-survey', surveyId: survey.id, tier: 2, region: 'plains', target: { kind: 'aspect', value: 'entropy' } }, context);
    for (let i = 0; i < 80; i++) {
      game.tick(1000, 1, context);
      for (const id of [...survey.candidates]) {
        const node = game.state.nodes.find(n => n.id === id)!;
        const values = Object.values(node.baseAspects).map(v => dec(v));
        expect(values.reduce((s, v) => s.plus(v), dec('0')).eq(1)).toBe(true);
        expect(values.filter(v => v.gt('0.1'))).toHaveLength(2);
        expect(node.size).toBeGreaterThanOrEqual(40); expect(node.size).toBeLessThanOrEqual(100);
        expect(Decimal.max(...values).gte('0.35')).toBe(true); expect(Decimal.max(...values).lte('0.45')).toBe(true);
        game.act({ type: 'discard', nodeIds: [id] }, context);
      }
      expect(survey.misses).toBeLessThan(6);
    }
  });

  it('封装付款不足无变化，稳妥封装占用同一实体，取消候选不丢失', () => {
    const { game, context, wallets } = setup();
    const candidate = packCandidate(game, context);
    const bench = buildBench(game, context);
    wallets.set(2, dec('0'));
    const before = saved(game);
    expect(game.act({ type: 'pack', nodeIds: [candidate.id] }, context)).toBe(false);
    expect(enqueue(game, context, bench, candidate.id, { kind: 'safe-pack' })).toBe(false);
    expect(saved(game)).toBe(before);
    wallets.set(2, dec('10000'));
    expect(enqueue(game, context, bench, candidate.id, { kind: 'safe-pack' })).toBe(true);
    expect(game.state.surveys[0].candidates).not.toContain(candidate.id);
    expect(candidate.location).toBe('packing');
    const job = game.state.benches[0].jobs[0];
    expect(game.act({ type: 'cancel-job', benchId: bench, jobId: job.id }, context)).toBe(true);
    expect(candidate.location).toBe('candidate'); expect(wallets.get(2)!.toString()).toBe('10000');
    expect(game.state.nodes.filter(n => n.id === candidate.id)).toHaveLength(1);
    expect(enqueue(game, context, bench, candidate.id, { kind: 'safe-pack' })).toBe(true);
    game.tick(301, 1, context);
    expect(candidate.location).toBe('jar'); expect(game.state.nodes.filter(n => n.id === candidate.id)).toHaveLength(1);
  });

  it('保护不妨碍明确培养，禁止批量丢弃与占用同一个支架', () => {
    const { game, context } = setup();
    const node = game.state.nodes[0], other = buyNode(game, context);
    expect(game.act({ type: 'protect', nodeId: node.id, value: true }, context)).toBe(true);
    expect(game.act({ type: 'discard', nodeIds: [other.id, node.id] }, context)).toBe(false);
    expect(game.act({ type: 'install', nodeId: other.id, standId: node.standId! }, context)).toBe(false);
    const bench = buildBench(game, context);
    expect(enqueue(game, context, bench, node.id, { kind: 'cultivate' })).toBe(true);
  });
});

describe('培养队列、修复、升阶与退款', () => {
  it('十次培养逐笔涨价合计159，开工才停供能，次数不能重置', () => {
    const { game, context, payments } = setup();
    const bench = buildBench(game, context), node = game.state.nodes[0];
    expect(enqueue(game, context, bench, node.id, { kind: 'cultivate' }, 10)).toBe(true);
    expect(payments.at(-1)).toEqual({ tier: 2, amount: '159' });
    expect(game.state.benches[0].jobs.map(j => j.paid)).toEqual(['8', '9', '10', '12', '13', '16', '18', '21', '24', '28']);
    expect(game.visOutput(context).toString()).toBe('6.4');
    const before = saved(game);
    expect(enqueue(game, context, bench, node.id, { kind: 'cultivate' })).toBe(false); expect(saved(game)).toBe(before);
    game.tick(1, 1, context); expect(game.visOutput(context).isZero()).toBe(true);
    game.tick(30000, 1, context);
    expect(node.cultivations).toBe(10); expect(node.size).toBe(100); expect(node.location).toBe('installed');
    expect(game.visOutput(context).toString()).toBe('8');
    expect(game.state.benches[0].jobs).toHaveLength(0);
  });

  it('取消未开始培养及失效后续全退，开工后取消只退失效后续', () => {
    const { game, context, wallets } = setup();
    const bench = buildBench(game, context), node = game.state.nodes[0]; wallets.set(2, dec('1000'));
    expect(enqueue(game, context, bench, node.id, { kind: 'cultivate' }, 3)).toBe(true);
    expect(wallets.get(2)!.toString()).toBe('973');
    game.act({ type: 'cancel-job', benchId: bench, jobId: game.state.benches[0].jobs[0].id }, context);
    expect(wallets.get(2)!.toString()).toBe('1000'); expect(game.state.benches[0].jobs).toHaveLength(0);
    enqueue(game, context, bench, node.id, { kind: 'cultivate' }, 3); game.tick(1, 1, context);
    game.act({ type: 'cancel-job', benchId: bench, jobId: game.state.benches[0].jobs[0].id }, context);
    expect(wallets.get(2)!.toString()).toBe('992'); expect(node.location).toBe('installed'); expect(node.cultivations).toBe(0);
  });

  it('升级后的作业以未来等级计费，取消升级退款回原结算币种', () => {
    const { game, context, payments, wallets } = setup();
    const bench = buildBench(game, context, 3), node = game.state.nodes[0];
    wallets.set(2, dec('1000')); wallets.set(3, dec('10000'));
    expect(enqueue(game, context, bench, node.id, { kind: 'upgrade-node' })).toBe(true);
    expect(payments.at(-1)).toEqual({ tier: 3, amount: '800' });
    expect(enqueue(game, context, bench, node.id, { kind: 'cultivate' }, 2)).toBe(true);
    expect(payments.at(-1)).toEqual({ tier: 3, amount: '68' });
    game.act({ type: 'cancel-job', benchId: bench, jobId: game.state.benches[0].jobs[0].id }, context);
    expect(wallets.get(3)!.toString()).toBe('10000'); expect(wallets.get(2)!.toString()).toBe('1000');
    expect(game.state.benches[0].jobs).toHaveLength(0);
  });

  it('同一实体不能跨台排队，队列锁定时不能拆装', () => {
    const { game, context } = setup();
    const a = buildBench(game, context), b = buildBench(game, context), node = game.state.nodes[0];
    expect(enqueue(game, context, a, node.id, { kind: 'cultivate' })).toBe(true);
    const before = saved(game);
    expect(enqueue(game, context, b, node.id, { kind: 'cultivate' })).toBe(false);
    expect(game.act({ type: 'uninstall', nodeId: node.id }, context)).toBe(false);
    expect(saved(game)).toBe(before);
    expect(enqueue(game, context, a, node.id, { kind: 'cultivate' })).toBe(true);
  });

  it('修复费用依次计算，重复调谐从基础谱重算，升阶保留次数', () => {
    const { game, context, payments } = setup(4);
    const bench = buildBench(game, context, 3), node = game.state.nodes[0];
    node.quality = 'fading'; node.cultivations = 5;
    expect(enqueue(game, context, bench, node.id, { kind: 'repair' })).toBe(true);
    expect(payments.at(-1)!.amount).toBe('40');
    expect(enqueue(game, context, bench, node.id, { kind: 'repair' })).toBe(true);
    expect(payments.at(-1)!.amount).toBe('80');
    expect(enqueue(game, context, bench, node.id, { kind: 'attune', aspect: 'fire' })).toBe(true);
    expect(enqueue(game, context, bench, node.id, { kind: 'attune', aspect: 'water' })).toBe(true);
    expect(enqueue(game, context, bench, node.id, { kind: 'upgrade-node' })).toBe(true);
    game.tick(20000, 1, context);
    expect(node.quality).toBe('normal'); expect(node.attunement).toBe('water'); expect(node.tier).toBe(3);
    expect(node.cultivations).toBe(5);
    expect(dec(arcaneNodeAspects(node).water).minus(node.baseAspects.water).toString()).toBe('0.1');
    expect(dec(arcaneNodeAspects(node).fire).minus(node.baseAspects.fire).toString()).toBe('-0.02');
    expect(game.state.stands.find(s => s.id === node.standId)!.tier).toBe(3);
  });

  it('处理时原支架可复用，恢复不覆盖新占用者；缸中升阶不赠支架', () => {
    const { game, context } = setup();
    const bench = buildBench(game, context, 3), node = game.state.nodes[0], other = buyNode(game, context), standId = node.standId!;
    enqueue(game, context, bench, node.id, { kind: 'cultivate' }); game.tick(1, 1, context);
    expect(game.act({ type: 'install', nodeId: other.id, standId }, context)).toBe(true);
    game.tick(600, 1, context);
    expect(node.location).toBe('jar'); expect(other.standId).toBe(standId);
    const count = game.state.stands.length;
    enqueue(game, context, bench, node.id, { kind: 'upgrade-node' }); game.tick(900, 1, context);
    expect(node.tier).toBe(3); expect(game.state.stands).toHaveLength(count); expect(node.standId).toBeNull();
  });

  it('满规模拒绝无收益付费，提前到上限的后续作业退款', () => {
    const { game, context, payments, wallets } = setup();
    const bench = buildBench(game, context), node = game.state.nodes[0];
    node.size = 160;
    const before = saved(game), paymentCount = payments.length;
    expect(enqueue(game, context, bench, node.id, { kind: 'abundant' })).toBe(false);
    expect(saved(game)).toBe(before); expect(payments).toHaveLength(paymentCount);
    node.size = 155; game.state.seed = 1; wallets.set(2, dec('1000'));
    expect(enqueue(game, context, bench, node.id, { kind: 'abundant' }, 3)).toBe(true);
    game.tick(10000, 1, context);
    expect(node.size).toBe(160); expect(node.cultivations).toBeLessThan(3);
    expect(payments.some(p => dec(p.amount).lt(0))).toBe(true);
  });

  it('设施升阶停用对应作业，完成后恢复，不清空候选与计数', () => {
    const { game, context } = setup();
    game.act({ type: 'build-survey', tier: 2 }, context); const survey = game.state.surveys[0];
    game.tick(1000, 1, context); survey.misses = 3;
    const before = [...survey.candidates];
    expect(game.act({ type: 'upgrade-survey', id: survey.id }, context)).toBe(true);
    game.tick(899, 1, context); expect(survey.tier).toBe(2); expect(survey.candidates).toEqual(before);
    game.tick(1, 1, context); expect(survey.tier).toBe(3); expect(survey.misses).toBe(3);
    const bench = buildBench(game, context);
    expect(game.act({ type: 'upgrade-bench', id: bench }, context)).toBe(true);
    expect(enqueue(game, context, bench, game.state.nodes[0].id, { kind: 'cultivate' })).toBe(false);
    game.tick(900, 1, context); expect(game.state.benches[0].tier).toBe(3);
  });
});

describe('同化、类型效果与辅助研究', () => {
  it('保护、已供能、自身与已排队供体拒绝；供体开工时才消耗', () => {
    const { game, context } = setup(4);
    const bench = buildBench(game, context), node = game.state.nodes[0], donor = buyNode(game, context);
    node.type = 'hungry'; game.act({ type: 'protect', nodeId: donor.id, value: true }, context);
    const before = saved(game);
    expect(enqueue(game, context, bench, node.id, { kind: 'assimilate', donorId: donor.id })).toBe(false);
    expect(enqueue(game, context, bench, node.id, { kind: 'assimilate', donorId: node.id })).toBe(false);
    expect(saved(game)).toBe(before);
    game.act({ type: 'protect', nodeId: donor.id, value: false }, context);
    expect(enqueue(game, context, bench, donor.id, { kind: 'cultivate' })).toBe(true);
    expect(enqueue(game, context, bench, node.id, { kind: 'assimilate', donorId: donor.id })).toBe(false);
    game.act({ type: 'cancel-job', benchId: bench, jobId: game.state.benches[0].jobs[0].id }, context);
    expect(enqueue(game, context, bench, node.id, { kind: 'assimilate', donorId: donor.id })).toBe(true);
    expect(game.state.nodes).toContain(donor);
    expect(game.act({ type: 'protect', nodeId: donor.id, value: true }, context)).toBe(false);
    expect(game.act({ type: 'discard', nodeIds: [donor.id] }, context)).toBe(false);
    game.tick(1, 1, context);
    expect(game.state.nodes).not.toContain(donor);
    const restored = new ArcaneExpedition(JSON.parse(saved(game)));
    expect(saved(restored)).toBe(saved(game));
    restored.tick(1800, 1, context);
    expect(restored.state.nodes[0].assimilations).toBe(1);
    expect(restored.state.nodes[0].size).toBeGreaterThanOrEqual(88);
  });

  it('类型效果只惠及不高于供能节点的等级，同类不叠乘', () => {
    const { game, context } = setup(4);
    const node = game.state.nodes[0]; node.type = 'hungry'; node.assimilations = 5;
    let network = game.network(context);
    expect(network.magicMultiplierByTier[2].toString()).toBe('1.1');
    expect(network.magicMultiplierByTier[3].toString()).toBe('1');
    const pure = buyNode(game, context, 3); pure.type = 'pure';
    game.act({ type: 'buy-stand', tier: 3 }, context);
    game.act({ type: 'install', nodeId: pure.id, standId: game.state.stands.at(-1)!.id }, context);
    network = game.network(context);
    expect(network.pureMaxTier).toBe(3); expect(network.sinisterMaxTier).toBe(0);
    expect(network.aspects.fire.minus(dec('1').div(6)).abs().lt('1e-30')).toBe(true);
    game.act({ type: 'uninstall', nodeId: pure.id }, context);
    expect(game.network(context).pureMaxTier).toBe(0);
  });

  it('污染必须封闭支架，净化保留质量、规模、调谐和培养次数', () => {
    const { game, context } = setup(2);
    const node = buyNode(game, context); node.type = 'tainted'; node.quality = 'bright'; node.cultivations = 7; node.attunement = 'order';
    game.act({ type: 'buy-stand', tier: 2 }, context); const stand = game.state.stands.at(-1)!;
    expect(game.act({ type: 'install', nodeId: node.id, standId: stand.id }, context)).toBe(false);
    expect(game.act({ type: 'enclose-stand', standId: stand.id }, context)).toBe(true);
    expect(game.act({ type: 'install', nodeId: node.id, standId: stand.id }, context)).toBe(true);
    const bench = buildBench(game, context);
    expect(enqueue(game, context, bench, node.id, { kind: 'purify' })).toBe(true); game.tick(2700, 1, context);
    expect(node).toMatchObject({ type: 'standard', quality: 'bright', size: 50, cultivations: 7, attunement: 'order', location: 'installed' });
  });

  it('花园和血仪式共用研究位置，血仪式每次明确单付，不自动续费', () => {
    const { game, context, payments } = setup(5);
    expect(game.act({ type: 'research', id: 'garden' }, context)).toBe(true);
    expect(game.act({ type: 'research', id: 'blood' }, context)).toBe(false);
    game.tick(2700, 1, context); expect(game.state.garden).toBe(true);
    expect(game.act({ type: 'research', id: 'blood' }, context)).toBe(true);
    game.tick(3600, 1, context); expect(game.state.blood).toBe(true);
    const bench = buildBench(game, context), node = buyNode(game, context);
    expect(enqueue(game, context, bench, node.id, { kind: 'abundant', blood: true })).toBe(true);
    expect(payments.at(-1)).toEqual({ tier: 2, amount: '110' });
    const paidCount = payments.length;
    game.tick(72 * 3600, 1, context);
    expect(node.size).toBeGreaterThanOrEqual(53); expect(node.size).toBeLessThanOrEqual(56);
    expect(node.cultivations).toBe(1); expect(payments).toHaveLength(paidCount);
  });
});

describe('持久化与在线离线一致', () => {
  it('随机结果在开工保存，刷新不重抽，view 不消耗随机种子', () => {
    const { game, context } = setup();
    const bench = buildBench(game, context), node = game.state.nodes[0];
    enqueue(game, context, bench, node.id, { kind: 'abundant' });
    expect(game.state.benches[0].jobs[0].outcome).toBeNull();
    game.tick(10, 1, context);
    const before = saved(game), seed = game.state.seed;
    game.view(context); game.view(context); expect(game.state.seed).toBe(seed);
    const restored = new ArcaneExpedition(JSON.parse(before));
    expect(saved(restored)).toBe(before);
    game.tick(1000, 1, context); restored.tick(1000, 1, context);
    expect(saved(restored)).toBe(saved(game));
  });

  it('同样时间和供电下，离线分段与在线小步得到相同发现、作业和供能', () => {
    const { game, context, payments } = setup(4);
    const bench = buildBench(game, context), node = game.state.nodes[0];
    game.act({ type: 'build-survey', tier: 2 }, context);
    enqueue(game, context, bench, node.id, { kind: 'abundant' }, 10);
    const restored = new ArcaneExpedition(JSON.parse(saved(game))), count = payments.length;
    game.tick(40000, 0.75, context);
    for (let i = 0; i < 400; i++) restored.tick(100, 0.75, context);
    expect(restored.state.seed).toBe(game.state.seed);
    expect(restored.state.nodes).toEqual(game.state.nodes);
    expect(restored.state.surveys[0].candidates).toEqual(game.state.surveys[0].candidates);
    expect(restored.state.completedJobs).toBe(game.state.completedJobs);
    expect(restored.visOutput(context).eq(game.visOutput(context))).toBe(true);
    expect(payments).toHaveLength(count);
  });

  it('转生只保留见闻和随机流，独立模块不保留本轮设施或进度', () => {
    const { game, context } = setup();
    packCandidate(game, context);
    const codex = JSON.stringify(game.state.codex), seed = game.state.seed;
    game.resetRun();
    expect(JSON.stringify(game.state.codex)).toBe(codex); expect(game.state.seed).toBe(seed);
    expect(game.state.nodes).toHaveLength(0); expect(game.state.surveys).toHaveLength(0); expect(game.state.research).toBe(-1);
    expect(game.act({ type: 'research', id: 'A0' }, context)).toBe(true); expect(game.state.nodes).toHaveLength(1);
  });

  it('清洗破损输入：拒绝重复实体、非法电压和非有限金额', () => {
    const { game } = setup(); const raw = JSON.parse(saved(game));
    raw.nodes.push({ ...raw.nodes[0] });
    raw.nodes.push({ ...raw.nodes[0], id: 'node-999', tier: -1 });
    raw.nodes[0].baseAspects = { air: 'NaN' }; raw.seed = NaN;
    raw.benches = [{ id: 'bench-99', tier: 2, jobs: [{ id: 'job-100', nodeId: raw.nodes[0].id, task: { kind: 'cultivate' }, paid: 'Infinity', totalWork: '600', work: '-3', started: true, outcome: null }] }];
    const restored = new ArcaneExpedition(raw);
    expect(restored.state.nodes).toHaveLength(1); expect(restored.state.benches[0].jobs).toHaveLength(0);
    expect(Object.values(restored.state.nodes[0].baseAspects).every(v => dec(v).isFinite())).toBe(true);
    expect(Number.isFinite(restored.state.seed)).toBe(true);
    expect(saved(new ArcaneExpedition(JSON.parse(saved(restored))))).toBe(saved(restored));
  });

  it('研究表完整覆盖 A0–A6，面板快照是纯 JSON 且不会改模型', () => {
    const { game, context } = setup(4);
    buildBench(game, context); buyNode(game, context);
    const before = saved(game), view = game.view(context);
    expect(ARCANE_RESEARCH.map(r => r.id)).toEqual(['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
    expect(view.aspects).toHaveLength(ARCANE_ASPECTS.length);
    expect(() => JSON.stringify(view)).not.toThrow(); expect(saved(game)).toBe(before);
    expect(view.benches[0].options.length).toBeGreaterThan(0);
    const growth = view.benches[0].options.find(o => o.nodeId === game.state.nodes[0].id && o.command.type === 'enqueue' && o.command.task.kind === 'cultivate')!;
    expect(growth.batches.find(b => b.count === 10)!.amount).toBe('159');
  });

  it('见闻顺序、调查候选、设施升级与多节点队列完整往返', () => {
    const { game, context } = setup(4);
    const bench = buildBench(game, context, 3);
    game.act({ type: 'build-survey', tier: 3 }, context);
    game.tick(100000, 1, context);
    const candidate = game.state.nodes.find(n => n.location === 'candidate')!;
    enqueue(game, context, bench, candidate.id, { kind: 'safe-pack' });
    enqueue(game, context, bench, candidate.id, { kind: 'cultivate' }, 3);
    game.act({ type: 'upgrade-survey', id: game.state.surveys[0].id }, context);
    const restored = new ArcaneExpedition(JSON.parse(saved(game)));
    expect(restored.state).toEqual(game.state);
    game.tick(20000, 1, context); restored.tick(20000, 1, context);
    expect(restored.state).toEqual(game.state);
  });

  it('跨等级批量实际扣款失败时退还已扣费用，不推进随机流', () => {
    const { game, context } = setup(4);
    game.act({ type: 'build-survey', tier: 2 }, context);
    game.act({ type: 'build-survey', tier: 3 }, context);
    game.tick(1000, 1, context);
    const ids = game.state.surveys.map(s => s.candidates[0]);
    expect(ids.every(Boolean)).toBe(true);
    let money = dec('850');
    const paid: string[] = [];
    context.canPay = (_tier, amount) => money.gte(amount);
    context.pay = (_tier, amount) => {
      if (money.lt(amount)) return false;
      money = money.minus(amount); paid.push(amount.toString()); return true;
    };
    const before = saved(game);
    expect(game.act({ type: 'pack', nodeIds: ids }, context)).toBe(false);
    expect(saved(game)).toBe(before); expect(money.toString()).toBe('850');
    expect(paid).toEqual(['200', '-200']);
  });

  it('命令清洗拒绝缺失目标和非法配套开关，显式退款回调不调用负数付款', () => {
    const { game, context } = setup();
    game.act({ type: 'build-survey', tier: 2 }, context);
    const before = saved(game);
    expect(game.act({ type: 'configure-survey', surveyId: game.state.surveys[0].id, tier: 2, region: 'forest', target: undefined } as unknown as Parameters<ArcaneExpedition['act']>[0], context)).toBe(false);
    expect(game.act({ type: 'buy-stand', tier: 2, enclosed: 'yes' } as unknown as Parameters<ArcaneExpedition['act']>[0], context)).toBe(false);
    expect(saved(game)).toBe(before);
    const bench = buildBench(game, context);
    enqueue(game, context, bench, game.state.nodes[0].id, { kind: 'cultivate' });
    const refunded: string[] = [];
    context.refund = (tier, amount) => refunded.push(`${tier}:${amount}`);
    game.act({ type: 'cancel-job', benchId: bench, jobId: game.state.benches[0].jobs[0].id }, context);
    expect(refunded).toEqual(['2:8']);
  });
});
