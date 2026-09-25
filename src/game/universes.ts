// 平行宇宙（计划书第五章）。
//
// 每次转生可以选一个宇宙，选过的会一直叠加上去 —— 所以越到后面，一轮里生效的规则越多。
// 宇宙的跨周目价值就靠这里：不是「蓝图」，而是把核心规则改掉。
// 已实现 / 未实现分开标注，未实现的只出现在界面上说明，不参与结算。

export type UniverseId = 'industry' | 'arcane' | 'abyss' | 'silicon';

export interface Universe {
  id: UniverseId;
  name: string;
  // 一句话说清它改了什么规则
  summary: string;
  // 具体效果，界面按行显示
  effects: string[];
  implemented: boolean;
}

export const UNIVERSES: Universe[] = [
  {
    id: 'industry',
    name: '工业宇宙',
    summary: '量子纠缠打通电压：币值统一结算，机器批量建造更便宜',
    effects: [
      '跨电压结算：买机器可以用任意不高于其结算等级的币，按 4:1 币值折算扣款',
      '并联折扣：同一机型的边际成本增长从 1.07^k 降到 1.05^k',
    ],
    implemented: true,
  },
  {
    id: 'arcane',
    name: '奥术宇宙',
    summary: '灵气路线：新增 LV~LuV 的魔法机器，灵气喂得越满产量越高',
    effects: [
      '新增「灵气节点」设施（每级一种）：从矿脉抽灵气，灵气是流量、不能囤积',
      '新增「魔法机器」（采矿机 / 发电机 / 制造机，LV~LuV）：不耗电、改吃灵气，同价但产能是电力版的 2.5 倍',
      '灵气充裕度决定产量加成：普通机器最多 +10%、魔法机器最多 +30%（没有魔法机器时不加成）',
      '源质：净化器压污染时副产源质，源质喂满灵气节点才有全额出力（没有源质时只出一半）',
      '污染在这个宇宙里仍然是普通的环境惩罚（-20% / -40%），「污染驱动产出」是深渊宇宙的招牌',
    ],
    implemented: true,
  },
  {
    id: 'abyss',
    name: '深渊宇宙',
    summary: '污染即燃料：污染越高产出越高，但会损伤机器',
    effects: [
      '污染把产出往上推：30% 中性，每低 1 点 -1%、每高 1 点 +1%（0% → 0.7 倍、100% → 1.7 倍）',
      '代价：污染会腐蚀机器，机器会随机损坏停机，要手动维护（发电机与净化器也一样）',
      '新增「腐蚀抑制器」设施（每级一种）：按等级抵消一部分污染点数，压住损坏速率',
    ],
    implemented: true,
  },
  {
    id: 'silicon',
    name: '硅基宇宙',
    summary: '自动化觉醒：AI 接管维护、超频与停机调度',
    effects: [
      '自动维护：故障机器自动修好（可单独开关）',
      '自动超频：按供电率自动升降档（可单独开关）',
      '按优先级停机：缺电时按机型优先级停机，而不是全厂降载（可单独开关）',
      'AI 有 5% 误判率：偶尔做错一次，下一拍自己纠正',
    ],
    implemented: true,
  },
];

const BY_ID = new Map(UNIVERSES.map((universe) => [universe.id, universe]));

export function universeById(id: string): Universe | undefined {
  return BY_ID.get(id as UniverseId);
}
