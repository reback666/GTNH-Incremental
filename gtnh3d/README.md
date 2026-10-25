# GTNH 3D 自由视图 demo

一个独立的、只读式的 3D 演示：把 GTNH 工厂搬进「所有元素都是方块」的自由视图里。
渲染器是自写的体素网格化器（不使用逐块 `BoxGeometry`，也不引入现成体素引擎），
只依赖 three.js 做 WebGL 管线。

本目录保留独立演示入口，只消费蓝图数据与材质贴图，不改动游戏逻辑。增量游戏设备场地将此处蓝图保留为地板预设，复用地板铺设、贴图集与网格化器；当前场地规则见 `../docs/architecture.md`，机器清单及交互由各自入口维护。

## 快速开始

```powershell
# 在仓库根目录（C:\Users\29797\Documents\ChatGPT\gtnh增量）
npm run build:3d      # 构建单文件 HTML → gtnh3d\dist\GTNH-3D-ULV-LV.html
npm run check:3d      # 语法/导入图检查 + 逻辑烟测（无需浏览器）
npm run verify:3d     # 无头 Chrome 实机渲染 + 截图 + atlas 逐格像素校验
npm run floor:3d      # 用真实贴图导出「顶端表面」对比图 → gtnh3d\dist\floor-top-map.png
```

直接双击 `gtnh3d\dist\GTNH-3D-ULV-LV.html` 即可在浏览器里打开——
贴图与代码全部内联，**不需要本地服务器、不请求任何网络资源**。

## 操作

| 操作 | 按键 |
| --- | --- |
| 转视角 | 鼠标拖拽 |
| 移动 | `W` `A` `S` `D` |
| 升降 | `Space` / `Shift` |
| 加速 | `Ctrl` |
| 调速 / 调轨道距离 | 滚轮 |
| 飞行 / 步行 | `F` |
| 轨道模式 | `O` |
| 复位 | `R` |
| 结构总览 | `G` |
| 雾效开关 | `P` |
| 机器信息 | 点击机器方块 |

点击一台机器会弹出它的 GTNH 信息面板；再点一次切换运行（ACTIVE）贴图。

## 场景内容

| 区域 | 内容 |
| --- | --- |
| 广场地板 | 蓝图 `bp-13476`（7×7 大型地块-混凝土地基）的 160×160×3 数据，按原始坐标保留三层结构，2×2 拼接成 320×320 |
| ULV 机房 | tier-00 基础设施：hull、能源仓（输入/输出）、变压器、电池缓冲（1×1 与 3×3×3）、电池充电机、储物柜、机房地坪 |
| LV 机器厅 | 10 台单方块机器，各带独立地台（见下） |
| 多方块 | 砖高炉 Bricked Blast Furnace，3×3×4，运行时结构校验 |

LV 单方块机器（`gtnh3d/src/machines.js`）：macerator、alloy_smelter、compressor、extractor、
electric_furnace、wiremill、hammer、fluid_heater、fluid_solidifier、ore_washer。

## 地板数据与铺设

蓝图原始文件保存在 `assets/floor-blueprint.json`，来自用户指定的 MCS 蓝图 bp-13476。
`tools/decode-floor.mjs` 是坐标转换的权威实现：源数组按 X 最快、Y 次之、Z 最慢排列，
源索引为 `x + y * 160 + z * 160 * 3`；运行时转换为按层排列的
`x + z * 160 + y * 160 * 160`。构建时自动重新生成 `floor.bin`、调色板和 `src/floor-data.js`。

三层分别是完整地基（25600 块）、绿化与边框（6247 块）、铁活板门（60 块）。
`src/layout.js` 逐块按原高度铺设并重复四次，保留 7×7 方格、中心灯、绿化、道路和黄线。
机器区位于第一个模块的庭院内，避开绿化边框；下方支撑层和广场外围灰色地坪独立铺设。
台阶、楼梯和活板门仍按本 demo 的全立方体规则显示，未增加原版局部几何。

`tools/smoke.mjs` 直接用原始蓝图校验 76800 个坐标，再校验四个模块三层的全部格子，
同时检查横竖各八条网格线和 49 个方格中心灯，防止坐标顺序错误再次产生条纹。
`tools/floor-map.mjs` 导出真实贴图的顶视图，`tools/shot-topdown.mjs` 拍摄浏览器内的地面。

## 关于 ULV 的一个重要事实

GT5U 的 `basicmachine.<name>.tier.NN` 从 `tier.01`（LV）起——**ULV（tier 00）没有任何基础加工机器**，
只有 hull / 电池缓冲 / 充电机 / 总线 / 仓室 / 储物柜这类基础设施。
所以本 demo 的 ULV 区按基础设施呈现，基础加工机器从 LV 层开始。这不是漏做，是核对结果。

## 多方块结构

砖高炉的结构数据写在 `gtnh3d/src/multiblock.js`，来源为 GTNH 中文 wiki（GTNH 2.8.4，2025 年修订）：

- 尺寸 3×3×4（长×宽×高，中空）
- 控制器位于正面中央
- 33 个结构方块 = 32 耐火砖 + 1 控制器；结构内部与顶层中心留空
- 每秒产生 200 点污染（面板中标注）

`validateStructure(world, pattern, origin)` 会逐格比对并返回 PASS/FAIL 与差异清单，
demo 加载时会自检一次；烟测里也会故意破坏一格验证它确实会 FAIL。

> 说明：GT5U 的多方块搭建图案不是常量池字符串，无法从 jar 直接抽取权威图案，
> 因此采用「结构即数据」的方案：图案写进数据文件并标注来源与置信度，不臆造。

## 目录

| 路径 | 说明 |
| --- | --- |
| `src/blocks.js` | 方块规格、面定义、AO 邻域、`BlockWorld` |
| `src/mesher.js` | 体素网格化（可见面剔除 + 方向明暗 + 逐顶点 AO），按 (贴图, emissive) 合批 |
| `src/atlas.js` | 运行时贴图集打包（最近邻，UV 半像素内缩防串色） |
| `src/machines.js` | 机器方块定义与 idle/ACTIVE 两套贴图 |
| `src/multiblock.js` | 多方块结构数据与校验 |
| `src/layout.js` | 场景装配（广场 / ULV 机房 / LV 机器厅 / 多方块） |
| `src/controls.js` | 自由相机（飞行 / 步行 / 轨道三模式） |
| `src/raycast.js` | 体素射线步进（点击拾取） |
| `src/sky.js` | 渐变天穹与雾 |
| `src/hud.js` `src/hud.css` | HUD 与信息面板 |
| `assets/floor-blueprint.json` | 下载的原始 Building Gadgets 蓝图，解码与验证的数据源 |
| `tools/decode-floor.mjs` | 将蓝图 X/Y/Z 顺序转换为运行时 X/Z/Y 分层数据 |
| `src/floor-data.js` | 由 `assets/floor.bin` 生成的地板数据（构建期产物） |
| `assets/floor.bin` | 蓝图解码后的调色板索引网格（160×160×3，三层原样） |
| `assets/tex/` | 16×16 RGBA 方块贴图，清单见 `ASSETS.md` |
| `dist/` | 构建产物与校验截图 |
| `tools/` | 提取器与校验脚本（`smoke` / `verify-render` / `verify-atlas` / `floor-map` / `shot-topdown`） |

## 素材来源与许可

贴图来自本机安装的 **Modernity-GTNH 材质包**（`Modernity-GTNH-9ebdeed-pre.zip`）与
**GT5U 开发包 jar**（GT5-Unofficial 5.09.51.472 / .482），原版方块回退到 1.7.10 客户端 `client.jar`。
逐张 key → 源容器 → 包内路径 → sha256 的完整清单见 [`ASSETS.md`](ASSETS.md)，
机器可读版本见 `tools/extract-report.json`。

这些贴图是 GTNH / GregTech / Modernity 社区素材，**版权归原作者**，
本 demo 仅作本地展示用途，请勿再分发或商用。源码本身与增量游戏工程同许可。

## 已知取舍

- 现代材质包中不存在 `MACHINE_HEATPROOF.png` → `casing-heatproof` 用 `MACHINE_HEATPROOFCASING.png`。
- 全包与 jar 中不存在任何 PRIMITIVEBLASTFURNACE 贴图 → `controller-primitive-blast-furnace` 用
  `MACHINE_CASING_BRICKEDBLASTFURNACE_ACTIVE.png`。
- `em-machine-ulv` 在包与 jar 中都不存在（EM_* 贴图族属于另一台多方块机器），渲染器不引用它。
- 机器缺少 SIDE/TOP 覆盖层时回退到基础外壳贴图——现代材质包本身就没有那些面片，不是贴图错位。
- 地板黑色网格线由蓝图第 0 层的黑色混凝土组成，与白色混凝土处于同一高度。
- 动态贴图（`OVERLAY_*_ACTIVE` 等竖直帧条）统一取第 0 帧，不做动画。
