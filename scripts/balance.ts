// 数值平衡推算脚本。直接用 src/numeric 里的公式，避免分析和实现两边漂移。
// 运行：npx tsx scripts/balance.ts
import { writeFileSync } from 'node:fs';
import { Decimal, ZERO, dec, pow } from '../src/numeric/decimal';
import { machineCost } from '../src/numeric/cost';
import { machineEnergy, machineOutput } from '../src/numeric/output';
import { generatorFuelRate, generatorOutputEU } from '../src/numeric/generator';
import { minerEnergyEU, minerOrePerSecond } from '../src/numeric/miner';
import { VOLTAGE_TIERS, MAX_TIER } from '../src/numeric/voltage';

// ── 模型参数（计划书未定义的量，集中在这里，方便对照） ──────────────────
const BASE_COST = '1000'; // tier-1 机器第 1 台的成本，单位 tier-1 币
const BASE_OUTPUT = '10'; // tier-1 机器每秒产出的 tier-1 币
const BASE_ENERGY = '8'; // tier-1 制造机的耗电，EU/t（1A × ULV）
const COIN_FACTOR = 4; // 币值 4 合 1

// 币值：1 枚 tier-n 币 = 4^(n-1) 枚 tier-1 币
const coinValue = (tier: number): Decimal => pow(String(COIN_FACTOR), tier - 1);

// S(K) = Σ_{k=0}^{K-1} 1.07^k（无量纲，边际成本倍数的累加）
const marginalSum = (count: number): Decimal => {
  let sum = ZERO;
  for (let k = 0; k < count; k += 1) {
    sum = sum.plus(machineCost({ baseCost: 1, tier: 1, purchased: k }));
  }
  return sum;
};

// 第 1 级：自举。开局给 1 台机器，之后边赚边买。
function bootstrapSeconds(count: number): Decimal {
  let seconds = ZERO;
  for (let k = 2; k <= count; k += 1) {
    const cost = machineCost({ baseCost: BASE_COST, tier: 1, purchased: k - 1 });
    const income = dec(BASE_OUTPUT).times(k - 1);
    seconds = seconds.plus(cost.div(income));
  }
  return seconds;
}

// 第 n≥2 级：钱来自第 n-1 级的 K 台机器，收入恒定。
// 总价（tier-(n-1) 币） ÷ 上一级收入（tier-(n-1) 币/秒）
function perTierSeconds(count: number): Decimal {
  // 第 n≥2 级：总价（tier-(n-1) 币）= 基础成本 × 4^(n-1) × S(K)
  //            收入（tier-(n-1) 币/秒）= 基础产出 × 4^(n-2) × K
  // 第 2 级代入即可，结果对所有 n≥2 相同。
  const totalCost = machineCost({ baseCost: BASE_COST, tier: 2, purchased: 0 }).times(
    marginalSum(count),
  );
  const income = machineOutput({ baseOutput: BASE_OUTPUT, tier: 1 }).times(count);
  return totalCost.div(income);
}

interface RunResult {
  machinesPerTier: number;
  bootstrap: Decimal;
  perTier: Decimal;
  totalSeconds: Decimal;
  totalHours: Decimal;
  totalMachines: number;
  peakEnergyPerTier: Decimal; // 每级 K 台制造机的总耗电
  generatorsPerTier: Decimal; // 需要多少台同级发电机
  orePerSecondPerTier: Decimal; // 每级发电机的烧矿速率
  unlockCost: Decimal; // 第 n 级 K 台的累计成本（折 tier-1 币）
}

function run(machinesPerTier: number): RunResult {
  const bootstrap = bootstrapSeconds(machinesPerTier);
  const perTier = perTierSeconds(machinesPerTier);
  const totalSeconds = bootstrap.plus(perTier.times(MAX_TIER - 1));

  // 最高一级（MAX）的电力与矿石需求
  const perMachineEnergy = machineEnergy({ baseEnergy: BASE_ENERGY, tier: MAX_TIER });
  const peakEnergyPerTier = perMachineEnergy.times(machinesPerTier);
  const genOutput = generatorOutputEU(MAX_TIER);
  const generatorsPerTier = peakEnergyPerTier.div(genOutput);
  const orePerSecondPerTier = generatorFuelRate(MAX_TIER).times(generatorsPerTier);

  const unlockCost = machineCost({ baseCost: BASE_COST, tier: MAX_TIER, purchased: 0 })
    .times(marginalSum(machinesPerTier))
    .times(coinValue(MAX_TIER - 1));

  return {
    machinesPerTier,
    bootstrap,
    perTier,
    totalSeconds,
    totalHours: totalSeconds.div(3600),
    totalMachines: MAX_TIER * machinesPerTier,
    peakEnergyPerTier,
    generatorsPerTier,
    orePerSecondPerTier,
    unlockCost,
  };
}

const fmtH = (s: Decimal): string => s.div(3600).toSignificantDigits(3).toString();
// 大数用科学计数法，小数保留 3 位有效数字
const fmt = (d: Decimal, digits = 3): string =>
  d.abs().gte(100000) ? d.toExponential(digits - 1).replace('e+', 'e') : d.toSignificantDigits(digits).toString();
// 时长：超过 90 分钟就换算成小时
const fmtDur = (seconds: Decimal): string => {
  const minutes = seconds.div(60);
  return minutes.gte(90) ? `${fmt(minutes.div(60))} 小时` : `${fmt(minutes)} 分钟`;
};

const rows = [5, 10, 20, 40, 60, 80, 90, 100, 120, 150, 200].map(run);

// 扫描 K，解出各个目标时长对应的台数
const scan: RunResult[] = [];
for (let k = 1; k <= 300; k += 1) scan.push(run(k));
const solveK = (goalHours: number): number => {
  const goal = dec(goalHours);
  let best = scan[0]!;
  for (const r of scan) {
    if (r.totalHours.minus(goal).abs().lt(best.totalHours.minus(goal).abs())) best = r;
  }
  return best.machinesPerTier;
};
const target = scan.reduce((a, b) =>
  a.totalHours.minus(80).abs().lt(b.totalHours.minus(80).abs()) ? a : b,
);

const lines: string[] = [];
lines.push('# 数值平衡推算');
lines.push('');
lines.push('本文回答一个问题：**现有公式能不能撑住计划书第十七章的「游戏内 7 日 ≈ 80-100 小时等效游玩」节奏。**');
lines.push('');
lines.push('所有数字都由 `scripts/balance.ts` 生成，直接调用 `src/numeric` 里的公式，可复现。');
lines.push('');
lines.push('## 一、模型');
lines.push('');
lines.push('### 1.1 已定的规则');
lines.push('');
lines.push('| 项 | 规则 | 来源 |');
lines.push('| --- | --- | --- |');
lines.push('| 电压 | 14 级 ULV→MAX，每级 4 倍 | 计划书第二章 |');
lines.push('| 机器成本 | 基础 × 4^(tier-1) × 1.07^已购，单位是**上一级**的币 | 计划书第七章、第八章 |');
lines.push('| 机器产出 | 基础 × 4^(tier-1)，单位是**本级**的币 | 计划书第八章 |');
lines.push('| 币值 | 4 合 1：1 枚 tier-n 币 = 4^(n-1) 枚 tier-1 币 | 计划书第七章 |');
lines.push('| 发行层级 | 制造机只产本级的币，买本级机器用上一级的币 | 计划书第七章 |');
lines.push('| 发电机输出 | 8 × 4^(tier-1) EU/t | GTNH wiki |');
lines.push('| 矿石能量值 | 128 × 4^(tier-1) EU/枚 | 作者定 |');
lines.push('');
lines.push('### 1.2 假设的量（计划书未定义）');
lines.push('');
lines.push('| 参数 | 取值 | 说明 |');
lines.push('| --- | --- | --- |');
lines.push(`| tier-1 机器第 1 台成本 | ${BASE_COST} 枚 tier-1 币 | 沿用上一版分析的取值 |`);
lines.push(`| tier-1 机器产出 | ${BASE_OUTPUT} 枚 tier-1 币/秒 | 同上 |`);
lines.push(`| tier-1 制造机耗电 | ${BASE_ENERGY} EU/t | 按「本级 1A」取 |`);
lines.push('| 推进策略 | 每级买满 K 台，再进下一级 | 简化策略，便于对照 |');
lines.push('| 开局 | 直接给 1 台 tier-1 机器 | 手动挖矿阶段不计入模型 |');
lines.push('');
lines.push('### 1.3 关键结构：币值递增正好抵消回本时间');
lines.push('');
lines.push('把成本与产出都折成 tier-1 币价值：');
lines.push('');
lines.push('```');
lines.push('tier-n 机器成本价值 = 基础成本 × 4^(n-1) × 4^(n-2) = 基础成本 × 4^(2n-3)');
lines.push('tier-n 机器产出价值 = 基础产出 × 4^(n-1) × 4^(n-1) = 基础产出 × 4^(2n-2)');
lines.push('');
lines.push('回本时间 = 成本 ÷ 产出 = (基础成本 ÷ 基础产出) ÷ 4   —— 与等级无关');
lines.push('```');
lines.push('');
lines.push(`也就是说，**升级电压不改变回本速度**。以基础成本 ${BASE_COST}、基础产出 ${BASE_OUTPUT} 计，单机回本恒为 **${fmt(dec(BASE_COST).div(BASE_OUTPUT).div(4))} 秒**。`);
lines.push('');
lines.push('升级真正买到的是「同样的产能用更少的机器」——省机器台数、省电力、省界面格子，而不是更快回本。');
lines.push('');
lines.push('### 1.4 推进公式');
lines.push('');
lines.push('第 1 级是自举（自己赚自己的币），时间靠逐台累加：');
lines.push('');
lines.push('```');
lines.push('T₁ = Σ_{k=2..K} 成本(k) ÷ ((k-1) × 基础产出)');
lines.push('```');
lines.push('');
lines.push('第 n≥2 级的钱来自上一级的 K 台机器，收入恒定：');
lines.push('');
lines.push('```');
lines.push('Tₙ = [基础成本 × 4^(n-1) × S(K)] ÷ [K × 基础产出 × 4^(n-2)]');
lines.push('   = 4 × (基础成本 ÷ 基础产出) × S(K) ÷ K          S(K) = Σ 1.07^k');
lines.push('```');
lines.push('');
lines.push('**Tₙ 与 n 无关**，所以 13 个等级各花一样长的时间。');
lines.push('');
lines.push('## 二、结果');
lines.push('');
lines.push('| 每级台数 K | 第 1 级耗时 | 每级耗时 | 全通总耗时 | 总机器数 |');
lines.push('| --- | --- | --- | --- | --- |');
for (const r of rows) {
  lines.push(`| ${r.machinesPerTier} | ${fmtDur(dec(r.bootstrap))} | ${fmtDur(dec(r.perTier))} | **${fmtH(r.totalSeconds)} 小时** | ${r.totalMachines} |`);
}
lines.push('');
lines.push('### 2.1 对照 80-100 小时目标');
lines.push('');
lines.push(`要让全通落在 80-100 小时，**每级需要买满约 ${target.machinesPerTier} 台机器**（当前模型下为 ${fmtH(target.totalSeconds)} 小时）。`);
lines.push('');
lines.push('| 目标 | 对应每级台数 |');
lines.push('| --- | --- |');
for (const goal of [10, 20, 40, 80, 100, 200]) {
  lines.push(`| ${goal} 小时 | 约 ${solveK(goal)} 台 |`);
}
lines.push('');
lines.push('这张表也说明一件事：**总时长对 K 极其敏感**。K 从 80 加到 90（+12.5%），');
lines.push('总时长从 58 小时跳到 103 小时（+76%）。因为 1.07^K 是指数项，累加和 S(K) 增长得比 K 快得多。');
lines.push('调参时这一点要留意：K 只要挪几台，节奏就会成倍变化。');
lines.push('');
lines.push('### 2.2 这个规模带来的电力与矿石需求');
lines.push('');
lines.push(`按每级 ${target.machinesPerTier} 台算，最高一级（MAX）的制造机会消耗：`);
lines.push('');
lines.push(`- 单台 MAX 制造机耗电 **${fmt(machineEnergy({ baseEnergy: BASE_ENERGY, tier: MAX_TIER }))} EU/t**`);
lines.push(`- ${target.machinesPerTier} 台合计 **${fmt(target.peakEnergyPerTier)} EU/t**`);
lines.push(`- 需要 **${fmt(target.generatorsPerTier)} 台 MAX 发电机**（单台 ${fmt(generatorOutputEU(MAX_TIER))} EU/t）`);
lines.push(`- 这些发电机合计烧矿 **${fmt(target.orePerSecondPerTier)} 枚/秒**`);
lines.push('');
lines.push('注意：同级制造机耗电与同级发电机输出**都是 4^(tier-1) 倍**，所以「1 台发电机养 1 台制造机」这个比例**与等级无关**。');
lines.push('');
lines.push('### 2.3 采矿机：GTNH 数值下矿石不会成为瓶颈');
lines.push('');
lines.push('采矿机的 GTNH 实测值（wiki「采矿机」条目）：');
lines.push('');
lines.push('| 等级 | 耗电 | 耗时 | 时运 | 采掘范围 |');
lines.push('| --- | --- | --- | --- | --- |');
lines.push('| LV（基础采矿机） | 8 EU/t | 8 秒/方块 | I | 17×17 |');
lines.push('| MV（优良采矿机） | 32 EU/t | 4 秒 | II | 33×33 |');
lines.push('| HV（进阶采矿机） | 128 EU/t | 2 秒 | III | 49×49 |');
lines.push('');
lines.push('规律是**耗电 ×4、耗时 ÷2** —— 正是 GTNH 的超频规则。GTNH 只做到 HV，再往上没有官方数值。');
lines.push('当前实现按同一规律外推到全部 14 级，外推是否合理需要作者确认。');
lines.push('');
lines.push('按这个规律，各级采矿机的产矿速率与「一台采矿机够养几台同级发电机」：');
lines.push('');
lines.push('| 等级 | 产矿（枚/秒） | 烧矿（枚/秒/台） | 一台采矿机养几台发电机 |');
lines.push('| --- | --- | --- | --- |');
for (let tier = 1; tier <= MAX_TIER; tier += 1) {
  const ore = minerOrePerSecond(tier);
  const burn = generatorFuelRate(tier);
  lines.push(`| ${VOLTAGE_TIERS[tier - 1]} | ${fmt(ore)} | ${fmt(burn)} | ${fmt(ore.div(burn))} |`);
}
lines.push('');
lines.push('**关键结论：矿石不是瓶颈，而且越往后越宽松。** 采矿机每级快 2 倍，发电机烧矿速率却与等级无关，');
lines.push('所以到 MAX 时一台采矿机够养上千台发电机。矿石只在 ULV 附近接近 1:1。');
lines.push('');
lines.push('顺带一个电力比例：同级采矿机耗电只有同级发电机输出的 1/4，所以「1 台发电机 : 4 台采矿机」');
lines.push('（若制造机按 1 台吃满 1 台发电机的电，则「1 发电机 : 1 制造机 : 4 采矿机」）。');
lines.push('');
lines.push('## 三、结论');
lines.push('');
lines.push('1. **节奏能成立，但靠的是「每级买满约 90 台」而不是公式里任何指数项。**');
lines.push('   1.07^K 的边际成本是唯一的规模闸门，K 直接决定总时长。');
lines.push('2. **升级不加快回本。** 币值 4 合 1 与产出 4 倍递增完全抵消，回本时间恒定。');
lines.push('   这不算问题，但意味着「升级」的收益必须来自别处——目前看是省机器、省电力。');
lines.push('3. **电力是等比放大的约束。** 同级制造机耗电与发电机输出同倍率，所以发电机∶制造机恒为 1∶1。');
lines.push('   想让电力成为真正的资源，需要让发电机的倍数低于制造机，或让矿石供给卡住。');
lines.push('4. **矿石反而越来越宽松，不是瓶颈。** 采矿机每级快 2 倍，而发电机烧矿速率与等级无关，');
lines.push('   所以到 MAX 时一台采矿机够养上千台发电机。若希望矿石在中后期仍是约束，需要换一条采矿机提速规则。');
lines.push('');
lines.push('## 四、待定');
lines.push('');
lines.push('| 问题 | 影响 |');
lines.push('| --- | --- |');
lines.push('| 采矿机的提速规则是否照搬 GTNH（每级快 2 倍） | GTNH 只到 HV，外推到 MAX 会得到「一台采矿机 512 枚/秒」，等于取消矿石约束 |');
lines.push(
  `| 每级台数 K 定多少 | 直接决定总时长：${solveK(20)} 台 ≈ 20 小时，${solveK(80)} 台 ≈ 80 小时，${solveK(200)} 台 ≈ 200 小时 |`,
);
lines.push('| tier-1 机器的基础成本与产出比值 | 回本时间 = 比值 ÷ 4，改变它会等比改变所有等待时间 |');
lines.push('| 制造机的基础耗电 | 决定发电机∶制造机的比例，当前是 1∶1 |');

writeFileSync('docs/balance.md', lines.join('\n') + '\n', 'utf8');
console.log(`已写入 docs/balance.md，共 ${lines.length} 行`);
console.log(`关键结果：K=${target.machinesPerTier} 台/级 -> 全通 ${fmtH(target.totalSeconds)} 小时`);
for (const r of rows) {
  console.log(`K=${String(r.machinesPerTier).padStart(3)}  全通 ${fmtH(r.totalSeconds).padStart(10)} 小时   总机器 ${r.totalMachines}`);
}
