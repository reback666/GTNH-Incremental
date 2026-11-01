import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASE_MACHINE_COST, BASE_MACHINE_ENERGY, BASE_MACHINE_OUTPUT, COINS_PER_ORE, EARLY_POLLUTION_FACTOR, UNLOCK_COST_IN_MACHINES } from '../src/game/constants';
import { machineCost, MARGINAL_COST_GROWTH } from '../src/numeric/cost';
import { dec, type Decimal } from '../src/numeric/decimal';
import { machineOutput } from '../src/numeric/output';
import { MAX_TIER, VOLTAGE_TIERS } from '../src/numeric/voltage';
import { runArcaneBalance, renderArcaneBalance, type ArcaneBalanceReport } from './arcane-balance';
import { tierOreBudget, verifyProgression, type ProgressionCheckpoint } from './progression';

type Verification = ReturnType<typeof verifyProgression>;
const fmt = (value: string | number | Decimal) => dec(String(value)).toSignificantDigits(7).toString();
const hours = (seconds: number) => fmt(dec(String(seconds)).div(3600));

// 免费首台、满负载、仅制造机币价的敏感性算式；不是可执行推进模型。
export function estimateManufacturing(count: number) {
  let bootstrap = dec('0');
  let later = dec('0');
  for (let purchased = 0; purchased < count; purchased++) {
    if (purchased > 0) bootstrap = bootstrap.plus(machineCost({ baseCost: BASE_MACHINE_COST, tier: 1, purchased })
      .div(dec(BASE_MACHINE_OUTPUT).times(purchased)));
    later = later.plus(machineCost({ baseCost: BASE_MACHINE_COST, tier: 2, purchased }));
  }
  later = later.div(machineOutput({ baseOutput: BASE_MACHINE_OUTPUT, tier: 1 }).times(count));
  return { count, bootstrap, later, total: bootstrap.plus(later.times(MAX_TIER - 1)) };
}

export function renderBalance(result?: Verification, arcane?: ArcaneBalanceReport) {
  const lines = [
    '# 数值估算与真实推进核验', '',
    '由 `scripts/balance.ts` 生成。参数以 `src/game/constants.ts`、`src/numeric` 和实际机型目录为准。只分析本地新开档，不读取用户存档。', '',
    '## 运行方式', '',
    '- 快速估算（只输出终端，不覆盖本页已记录的实证）：`npm run balance`。',
    '- 真实核验并重生成本页：`npm run balance -- --verify --arcane --wall-seconds=60 --segments=12 --days=7`。',
    '- 跨进程续跑：`npm run balance -- --verify --resume=outputs/balance/progression-checkpoint.json --arcane-report=outputs/balance/arcane-balance-mv-lv-seed-20261024-4h.json --wall-seconds=60 --segments=20 --days=7`。每段更新真实 checkpoint，`--checkpoint=路径` 可指定保存位置。模拟预算按累计时间计算；若已到 7 天，需要增大 `--days` 才会继续。',
    '- 可选 `--tier=15`、`--seed=20261024`、`--segments=6`（同进程分段续跑，不重开档）。等待期间约每两秒墙钟输出当前阶段；预算停止保留实证，不等于游戏死锁。', '',
    '## 当前基准', '',
    '| 基准 | 当前值 |', '| --- | --- |',
    `| 首台 ULV 制造机币价 | ${BASE_MACHINE_COST} |`,
    `| ULV 制造机额定币/秒 | ${BASE_MACHINE_OUTPUT} |`,
    `| ULV 制造机耗电（核心口径） | ${BASE_MACHINE_ENERGY} |`,
    `| 每枚矿对应制造币数 | ${COINS_PER_ORE} |`,
    `| 突破费用/目标级首台制造机价 | ${UNLOCK_COST_IN_MACHINES} |`,
    `| 同机型边际成本增长 | ${MARGINAL_COST_GROWTH} |`,
    `| 净化开放前排放倍率 | ${EARLY_POLLUTION_FACTOR} |`, '',
    '## 简化敏感性估算', '',
    '以下是假设免费获得首台制造机、之后永远满负载、每级固定 K 台制造机的币价累加。它忽略手动开局、矿脉分流、直接制造矿耗、采矿及供电设备成本、燃料、污染、故障、研究投资与算力、突破费和币种隔离；不是玩家可执行的流程，也不能解释为全通耗时或上下界。', '',
    '| 假设每级制造机 K | 简化 ULV 小时 | 简化后续单级小时 | 简化累计小时（非通关） |',
    '| --- | --- | --- | --- |',
  ];
  for (const row of [5, 10, 20, 50, 80, 100].map(estimateManufacturing)) {
    lines.push(`| ${row.count} | ${fmt(row.bootstrap.div(3600))} | ${fmt(row.later.div(3600))} | ${fmt(row.total.div(3600))} |`);
  }
  lines.push('', '不得由此反解“买多少台就满足 3–7 天”，也不能把不同等级 GT 币当作新档可随意兑换的同一种币。', '',
    '## ULV–MAX 额定矿耗诊断', '',
    '同级基础矿机总产矿均分到当前及所有低级矿种；制造机直接烧本级矿。表中旧配置固定两矿、两制造、四台基础发电机，燃料按其额定负载需求计算；不含净化、算力、污染及旧矿跨级电网。负数表示该同级配置无法维持额定满负载，不代表整个游戏不可推进。最低矿机数只计制造直接矿耗，忽略供电，是供给需求的诊断值而非实际建设建议。', '',
    '| 电压 | 单矿机本级矿/秒 | 单制造机矿/秒 | 旧配置燃料/秒 | 旧配置净矿/秒 | 单制造最低矿机数（不计燃料） |',
    '| --- | --- | --- | --- | --- | --- |');
  for (let tier = 1; tier <= MAX_TIER; tier++) {
    const b = tierOreBudget(tier);
    lines.push(`| ${b.voltage} | ${fmt(b.oreShare)} | ${fmt(b.manufacturingPerMachine)} | ${fmt(b.fuelForTwoMinersTwoMachines)} | ${fmt(b.netForTwoMinersTwoMachines)} | ${b.minersForOneMachineIgnoringFuel} |`);
  }
  lines.push('', '只比较“总采矿量/发电燃料”会漏掉矿种均分和制造直接矿耗，不能得出“矿石始终宽裕”的结论。', '',
    '## 真实 GameCore 核验', '',
    '策略只调用手动挖矿、正常购买、正常突破、研究投资、维修、停机和存读档接口。每拍 `tick(1)`，不注资、不调用开发者解锁、不修改经济、不关闭随机事件；种子默认 20261024。起步每秒两次点击，最多十六次，够费用即建设；之后每五游戏秒检查扩建和维修。矿石优先付款，保留上级币；按矿脉分流、制造耗矿和燃料估计增加矿机，目标四台本级制造；缺电时利用有燃料库存的已解锁旧级发电机，按需建净化器，付币投资后等待真实算力研究；突破后停掉更早的制造线，保留前一级及本级制造。', '',
    '每个矿机、发电机、净化器机型最多买 64 台是本验证策略的搜索边界，游戏没有这个上限。核验返回包含真实核心存档、随机数状态、累计秒数和阶段的 checkpoint，可通过 `verifyProgression(tier, { resume: previous.checkpoint })` 继续，墙钟预算每段单独计算，模拟预算按累计时间计算。验证不使用镐子升级、电网切换、宇宙或转生加成，因此未证明最优路线，也未验证转生后的循环。阶段“就绪”仅表示必需机型已买到至少一台，不能等同满负载、稳定产线或 MAX 转生完成。', '');
  if (!result) {
    lines.push('本次仅生成估算，未运行真实推进；ULV–MAX 实证和 3–7 天目标均未核验。');
    return lines.join('\n').trimEnd() + '\n';
  }
  lines.push(`本次状态：**${result.status}**；实际计算 ${fmt(result.wallSeconds)} 秒，推进 ${result.seconds} 游戏秒（${hours(result.seconds)} 小时），到达 **${VOLTAGE_TIERS[result.maxTier - 1]}**。`, '',
    `手动总点击 ${result.starterClicks} 次；首次自动矿发生在第 ${result.firstAutomationSeconds ?? '未发生'} 秒，累计 ${result.firstAutomationClicks ?? '未发生'} 次点击。`, '',
    '| 电压 | 到达游戏秒 | 必需机型就绪秒 | 阶段末设备数 | 阶段末污染 | 已研究机型数 |',
    '| --- | --- | --- | --- | --- | --- |');
  for (const voltage of VOLTAGE_TIERS) {
    const stage = result.stages.find(item => item.voltage === voltage);
    lines.push(stage ? `| ${voltage} | ${stage.reachedSeconds} | ${stage.readySeconds ?? '未就绪'} | ${stage.machines} | ${stage.pollution} | ${stage.researches} |`
      : `| ${voltage} | 未核验 | 未核验 | — | — | — |`);
  }
  lines.push('', '设备数、污染、研究数为离开该阶段或本次停止时的快照；到达和就绪时间单独记录。', '',
    `本次购买 ${result.purchases} 台、维修 ${result.repairs} 台次、经历停电 ${result.outages} 拍；MAX 转生资格：${result.canMaxRebirth ? '已具备（未执行转生）' : '未具备'}。`, '',
    '### 停止现场', '', '```json', JSON.stringify(result.blocker, null, 2), '```', '',
    '### 目标差距', '');
  if (result.firstAutomationSeconds !== null) {
    lines.push(`- 首次自动矿目标约 300 秒，实测 ${result.firstAutomationSeconds} 秒，提前 ${300 - result.firstAutomationSeconds} 秒；当前开局比该目标快，不能称“约五分钟”已匹配。`);
  }
  lines.push(result.status === 'complete'
    ? `- 本次目标电压机型就绪耗时 ${hours(result.seconds)} 小时；3–7 天窗口为 72–168 小时。此状态不包含执行 MAX 转生或全研究/全宇宙完成，不能据此宣称完整终局目标满足。`
    : `- 3–7 天目标为 259200–604800 游戏秒。本次仅核验至 ${result.seconds} 秒；${result.maxTier === MAX_TIER ? 'MAX 尚未就绪' : `${VOLTAGE_TIERS[result.maxTier]}–MAX 尚未核验完成`}，无法给出可靠全程耗时或断言目标满足。`,
    '- `wall-limit` 是真实计算时间预算到期，`simulation-limit` 是游戏时间预算到期；都不等于经济永远卡死。停止现场的价格、库存、研究和供电应结合策略上限判断，不能外推未执行的部分。', '',
    '奥术宇宙同预算对照由 `scripts/arcane-balance.ts` 独立核验；该对照使用明确列出的预设实验资产，不是无注资的新档推进证据。');
  if (arcane) lines.push('', renderArcaneBalance(arcane));
  else lines.push('本次未合并奥术对照实测；运行时加 `--arcane` 才会实际执行并附上其结果。');
  return lines.join('\n').trimEnd() + '\n';
}

function main() {
  const args = process.argv.slice(2);
  const numberOption = (name: string, fallback: number) => {
    const arg = args.find(value => value.startsWith(`--${name}=`));
    const value = arg ? Number(arg.slice(name.length + 3)) : fallback;
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Invalid --${name}`);
    return value;
  };
  if (!args.includes('--verify')) {
    console.log(renderBalance());
    console.log('仅估算；未覆盖 docs/balance.md。运行 --verify 才执行真实核验并记录实证。');
    return;
  }
  const pathOption = (name: string) => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  const checkpointPath = pathOption('checkpoint') ?? 'outputs/balance/progression-checkpoint.json';
  const resumePath = pathOption('resume');
  const resumed: ProgressionCheckpoint | undefined = resumePath ? JSON.parse(readFileSync(resumePath, 'utf8')) : undefined;
  const arcanePath = pathOption('arcane-report');
  const tier = numberOption('tier', MAX_TIER);
  const segments = numberOption('segments', 1);
  if (!Number.isInteger(segments)) throw new RangeError('Invalid --segments');
  const arcane: ArcaneBalanceReport | undefined = arcanePath ? JSON.parse(readFileSync(arcanePath, 'utf8')) : args.includes('--arcane') ? runArcaneBalance({ onProgress: event => console.log(`奥术 ${event.scenario}/${event.arm} ${event.second}/${event.totalSeconds}s`) }) : undefined;
  let result: Verification | undefined;
  for (let segment = 1; segment <= segments; segment++) {
    result = verifyProgression(tier, {
      ...((result?.checkpoint ?? resumed) ? { resume: (result?.checkpoint ?? resumed)! } : {}),
      maxWallMs: numberOption('wall-seconds', 120) * 1000,
      maxSeconds: numberOption('days', 7) * 86400,
      seed: numberOption('seed', 20261024),
      onProgress: event => console.log(`[${event.wallSeconds.toFixed(1)}s] ${event.phase} ${event.voltage} 游戏=${event.seconds}s ${event.action} 矿=${fmt(event.ore)} 币=${fmt(event.coin)} 币/秒=${fmt(event.coinPerSecond)} 供电=${event.powerRatio} 污染=${event.pollution}`),
    });
    mkdirSync(dirname(checkpointPath), { recursive: true });
    writeFileSync(checkpointPath, JSON.stringify(result.checkpoint, null, 2) + '\n', 'utf8');
    writeFileSync(new URL('../docs/balance.md', import.meta.url), renderBalance(result, arcane), 'utf8');
    console.log(`已记录 docs/balance.md：${result.status}，${result.seconds} 游戏秒，${result.wallSeconds.toFixed(2)} 计算秒。`);
    console.log(`可恢复存档：${checkpointPath}`);
    console.log(JSON.stringify(result.blocker));
    if (result.status !== 'wall-limit') break;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
