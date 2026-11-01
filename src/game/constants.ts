import { Decimal } from '../numeric/decimal';
import { machineCost } from '../numeric/cost';
import { storageKey } from './storage-key';

// 第一阶段的参数。计划书未定义这些数，集中在这里便于后续调参。
// 标「计划书」的是文档已定的值，标「暂定」的是为了能跑通而选的值。

// 计划书第八章：成本/产出比 500。
// ULV 制造机每秒 1 枚币（作者定），首台成本 500 枚币，两者之比仍是 500，
// 每级 50 台的全通推算见 docs/balance.md，由当前电压总数与参数生成。
// 注意：单独把产量调小、成本不动，会让通关时间同比拉长，改节奏请改成本。
export const BASE_MACHINE_COST = '500';
export const BASE_MACHINE_OUTPUT = '1';

// 暂定：制造机基础耗电，按「本级 1A」取。
export const BASE_MACHINE_ENERGY = '8';

// 暂定：制造机直接吃矿的速率 —— 每产出 100 枚本位币消耗 1 枚本级矿石。
// 与制造机产量无关，是「矿 → 币」的换算率。
export const COINS_PER_ORE = '100';

// 暂定：解锁 X 级需要攒够 X-1 级币，数量 = 该级第 1 台机器成本的 10 倍。
export const UNLOCK_COST_IN_MACHINES = 10;

// 电网解锁价 = 该等级第一台机器价格的这个倍数，用该等级的 GT 币支付（计划书第六章）。
export const GRID_UNLOCK_COST_MACHINES = 16;

// 净化器开放前仅产生完整排放的 5%，避免开局在没有治理工具时积累重污染。
export const EARLY_POLLUTION_FACTOR = '0.05';

export const HIGH_RISK_REACTOR_MODEL = 'g-uhv-mb-naquadah';
export const REACTOR_RISK_OUTPUT_FACTOR = '1.5';
export const REACTOR_RISK_CHECK_SECONDS = 600;
export const REACTOR_RISK_CHANCE = 0.01;

// 模拟步长（计划书第十四章：运算 1 Hz 或更低）。
// 界面跟着模拟拍与玩家操作刷新，数字的平滑过渡由 AnimatedNumber 负责。
export const SIM_STEP_MS = 1000;

// 存档结构版本，用于迁移（计划书第十四章）。
// v1：机器数量按电压等级存（miners/generators/machines 各 14 个）
// v2：改按机型存（counts: 机型 id → 数量），因为同一个等级现在可以有多个机型
// v3：加了超频档位、故障台数、存电存量（第二阶段：自动化与深度）
// v4：加了污染值与开关、电网模式、黑市窃取累计（第二阶段：风险杠杆）
// v5：电网改成花 GT 币解锁，存档要记「已解锁哪些电网」
// v6：加了算力驱动的研究（第三阶段：研究站与计算机）
// v7：加了转生：时空线缆、永久加成节点、本周目累计 EU（第三阶段：转生）
// v8：加了开发者模式开关（设置页里的测试开关）
// v9：加了累计统计与成就（最高电压、累计线缆、历史最高污染、达成记录…）
// v10：加了平行宇宙（转生时选，选过的永久叠加）
// v11：加了奥术宇宙的源质存量
// v12：加了「下次转生要带的平行宇宙」这个选择
// v13：加了镐子的三条升级线（金刚杵 / 连锁采集 / 连锁爆破）
// v14：加了硅基宇宙的三项 AI 开关
// v15：加了每个机型的手动停机开关
// v16：研究改成手选项目（选中等级 + 各等级各自进度）
// v17：研究细到机型（每个机型单独研究）
// v18：加了随机事件计时器（波动电网断电 / 黑市窃取 / 变异 / 工厂崩溃）
// v19：加了挑战时间线（挂着的挑战、违规与热身标记、首通记录、待挂的选择）
// v20：加了转生履历（最近 50 条）与「普朗克锚」终局装置
// v21：加了数字显示模式（设置页的界面偏好：自动 / 科学计数法 / 完整数字）
// v22：加了自动存档间隔（存档框里的滑条，秒）
// v23：加了音效开关（设置页：总开关 + 每种音效单独关）
// v24：加了界面主题（设置页：暗钢 / 原版亮灰，GT GUI 重设计的两套皮肤）
// v25：在 UIV 与 UXV 之间插入 UMV，旧档的 UXV / MAX 等级与资源位置顺移。
// v26：记录稳定的电压标识，配置增减或调整顺序时按标识恢复资源与进度。
// v27：记录已投资研究项目，切换、存读档不重复付费；原有研究进度免补缴。
// v28：奥术实体、附魔、灵气调度与反应堆风险运行状态；原资源和机型字段保留。
// v29：按机型保存发电机燃料优先级。
export const SAVE_VERSION = 29;

// 自动存档间隔（秒）：存档框滑条的范围，默认沿用写死的 10 秒
export const AUTOSAVE_SECONDS_DEFAULT = 10;
export const AUTOSAVE_SECONDS_MIN = 5;
export const AUTOSAVE_SECONDS_MAX = 60;
export const SAVE_KEY = storageKey('gtnh-incremental-save');
// 上次写档的墙上时间单独存一个键：存档本体保持纯状态（还能逐字节比较），
// 离线收益按这个时间戳算（见 save.ts 的 secondsSinceLastSave）
export const SAVE_TIME_KEY = storageKey('gtnh-incremental-save-time');
// 界面主题单独存一个键：纯界面偏好，重开一局（清存档）不该把主题也重置掉
export const THEME_KEY = storageKey('gtnh-incremental-theme');
// 设置页的界面状态（折叠开关、离线横幅关闭态、开发者模式）也单独存：同上，重开不清
export const UI_KEY = storageKey('gtnh-incremental-ui');

// 终局装置「普朗克锚」（大纲 C2 轻方案）：花 300 条线缆买一次（永久），
// 之后 MAX 路线转生的线缆结算 ×1.5（裂缝不受影响）
export const PLANCK_ANCHOR_COST = '300';
export const PLANCK_ANCHOR_MULTIPLIER = '1.5';

export function unlockCost(machineTier: number): Decimal {
  return machineCost({ baseCost: BASE_MACHINE_COST, tier: machineTier, purchased: 0 }).times(
    UNLOCK_COST_IN_MACHINES,
  );
}
