# 自定义内容

内容通过 `src/content/` 中的本地 JSON 配置注册，修改后运行 `npm run build`，再打开新生成的便携游戏。当前不提供游戏内的内容包导入界面。

## 修改入口

| 文件 | 内容 |
| --- | --- |
| `voltages.json` | 电压顺序、显示名、币种、矿石、特效、配色和素材键 |
| `machine-families.json` | 跨电压生成的机器系列、开放范围、名称例外、倍率、贴图合成方式 |
| `machines.json` | 单独机型，例如各类发电机；支持引用已有图标 |
| `rules.json` | 电压与币值递增倍率、研究起点、默认燃料效率、彩虹配色 |
| `types.ts` | 字段与现有机器能力的类型定义 |

`registry.ts` 负责解析和检查内容，玩法、界面及素材生成脚本读取同一个注册结果。基础产量、成本和其他玩法公式继续在 `src/game/constants.ts`、`src/numeric/` 中维护。

## 新增单独机型

在 `machines.json` 数组中添加一个对象即可。下面的机型使用现有制造机功能和组装机图标：

```json
{
  "id": "custom-assembler",
  "name": "定制组装机",
  "voltage": "UMV",
  "category": "machine",
  "block": "single",
  "outputFactor": "2",
  "costFactor": "3",
  "overclockable": true,
  "icon": "c-13"
}
```

`voltage` 填电压 ID。`outputFactor`、`costFactor`、`fuelEfficiency` 等参与大数计算的数值写成字符串。图标文件位于 `src/assets/machines/<icon>.png`；省略 `icon` 时使用机型 ID 寻找文件。

可复用的类别以 `types.ts` 的 `MachineCategory` 为准，现有类别已包含采矿、发电、制币、储电、净化、研究和宇宙设施。`computeRole` 区分计算机与研究站，`requiresUniverse` 设置宇宙条件，`visPowered` 指定灵气驱动。新增已有类别的变体只改配置；新增一种生产规则或结算机制仍需要在玩法模块实现。

## 扩展机器系列

系列的 `id` 是前缀。注册器为范围内的每个电压生成 `<系列 id>-<电压 modelKey>`，例如 `c-13`。

- `fromVoltage` / `toVoltage` 指定包含两端的开放范围；省略时延伸到序列起点 / 终点。
- `voltageInName` 默认开启；关闭后各电压使用相同显示名称。
- `overrides` 按电压 ID 覆盖名称、倍率、图标等字段，例如现有 UMV 组装机名称。
- `icon` 可供整个系列共用；省略时按 `<系列 id>-<电压 textureKey>` 查找图标。
- `texture` 是素材生成配方：`face` 指定 jar / 材质包面片，`source` 指定来源，`draw` 选择现有设施图案，`arcane` 开启奥术染色。直接提供 PNG 图标时可省略生成配方。

## 新增电压

在 `voltages.json` 中所需的位置插入配置。序列以 ULV 开始、MAX 结束，中间档位可扩展。复制相邻档位后：

1. 为 `id` 和 `modelKey` 设置各自唯一的值；`name` 是可选显示名，省略时显示 ID。
2. 修改币种、矿石名称和配色。`color` 使用六位十六进制颜色；MAX 的 `null` 使用规则文件中的彩虹色。
3. 指定 `textureKey` 和 `ore.texture`，可复用已有素材，也可提供新素材。使用原版机壳合成新图标时，`casingVoltage` 可指定借用的原版电压机壳，省略时使用当前 ID。
4. 按需要在机型目录中添加对应发电机，以及该电压的名称或能力例外。

没有设置终点的机器系列、科技树、资源库存、等级上限和终局判断会随电压列表扩展。

| 素材键 | 对应文件 |
| --- | --- |
| `textureKey` | `casings/<key>-side.png`、`casings/<key>-top.png`、`pickaxe/{vajra,drill,blast}-<key>.png` |
| `ore.texture` | `veins/<key>.png`、`veins/base/<key>.png` |
| 机器 `icon` | `machines/<key>.png` |

路径均相对 `src/assets/`。动画矿石的帧信息按素材键写在 `src/assets/veins/meta.json`，静态矿石可不填帧信息。矿石生成脚本读取 `ore.animation` 中的 `jar` 或本地 `file`，并生成这个元数据文件；本地文件路径相对项目根目录。其余素材脚本按相同配置取电压顺序和配色，操作见 `scripts/texture-sources.md`。

`npm run check:content` 检查重复 ID、无效电压引用、非法倍率和缺失素材，构建命令已包含此检查。

## 3D 场景机型

`src/content/scene-machines.json` 定义当前演示电压、机型 ID、原型类、贴图配方和可见台数。机型的名称与类别自动读取同一个内容注册器，修改显示名称不需要在场景再改一份。

增加已有配方支持的单方块机型后，运行 `python -B scripts/extract-factory3d.py --pack "<Modernity-GTNH.zip>"`，再执行 `npm run build`。提取器生成原始贴图与 `src/assets/factory3d/manifest.json`；必需面片缺失会报错。新增贴图族需先在提取器中实现其真实各面配方。当前尚未实现多方块场景，不得将多方块按单方块配方代替。

## 存档与内容身份

`id`、`modelKey` 和机器 ID 是稳定标识。重命名显示文字或调整顺序时保留这些键；素材复用通过 `textureKey`、`ore.texture`、`icon` 指定，不改内容身份。

新存档记录当时的电压 ID 顺序，读取时按 ID 对齐资源、矿脉、历史电压和镐子可采等级。新增档位的资源从零开始，已有机器、超频、停机与研究记录继续跟随原机型 ID。旧存档通过固定的历史顺序迁移，历史迁移规则不能随当前配置重写。

移除存档仍在使用的电压需要明确处理其进度归属；当前读档会报告该电压已移除。修改倍率或电压顺序会影响后续成本、产能和解锁节奏，应使用独立测试存档检验数值。
