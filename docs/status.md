# 项目现状与操作说明

> 更新：2026-10-30。此文档记录当前有效的操作与约束；版本号以 `package.json` 为准。

## 1. 项目范围

GTNH 主题的本地增量 / 放置游戏，从 ULV 沿 15 级电压发展到 MAX。
正式与隔离预览共用 Vue 3、TypeScript、Pinia、decimal.js、Three.js 与 Vite，均支持电脑和手机。
不自动上传游戏进度、素材、日志或其他本地数据。

当前包含：

- 手动开采与三条镐子升级线，多矿种自动采矿，矿石 / GT 币建造与出售。
- 发电、按需燃料消耗、储能、超频、维护、手动停机、污染与电网取舍。
- LuV 起的算力研究，后期逐机型预付 GT 币投资，再由计算机与研究站推进。
- 裂缝 / MAX 转生、永久星图、工业 / 奥术 / 深渊 / 硅基宇宙、挑战与转生履历。
- 成就、累计统计、音效、主题、开发者工具、离线补算、本地存档与 JSON 导入导出。
- 151 个机型均使用原生立体模型；每个机型独立场地，同型号的全部机器放在一起。支持连续区块地板、原地板预设、逐格自定义，以及 Minecraft 蓝图 / Litematica 投影导入。场地规则、材质范围和备份方式见 `architecture.md`。
- 奥术实体节点、五地区调查、培养队列、A0–A6、普通制造机附魔和可选花园 / 血仪式 / 受控同化；保留原源质与魔法机链，机制见 `arcane-universe-plan.md`。
- 普通重污染事故改为可维护的故障停机；大型硅岩反应堆可单独确认高风险运行，损失局限于该机型。

## 2. 运行与产物

| 命令 / 路径 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run dev:demo` | 启动开发服务器并打开独立演示 `/demo.html` |
| `npm run build:demo` | 类型检查并生成独立演示，不覆盖正式版产物 |
| `node scripts/verify-demo.mjs [URL]` | 独立 Chrome 验证 dev 原生产循环、库存与耗矿、原存档隔离；默认本地 5175 端口 |
| `node scripts/verify-redesign.mjs [URL或HTML路径]` | 独立 Chrome 验证双端奥术操作、付费附魔、风险确认、千台厂区、千节点与 v26 导入 |
| `npm run check:content` | 检查内容定义、引用关系与素材是否齐全 |
| `npm test` | 运行单元和集成测试 |
| `npm run build` | 类型检查、Web 构建及便携打包 |
| `npm run preview` | 在本地预览 Web 构建 |
| `node scripts/verify-factory3d.mjs [HTML路径]` | 独立 Chrome 验证 LV 机型场地、设备定位、购买 / 停机联动、相机缓存、导航及离线入口 |
| `node scripts/verify-grounds.mjs [HTML路径]` | 独立 Chrome 验证千台场地、弹出设置、焦点 / 滚动恢复、逐格编辑、预设与备份往返及跨区块资源占用 |
| `node scripts/verify-terrain-import.mjs [HTML路径]` | 独立 Chrome 验证设置页内三种扩展名导入、关闭取消预览、材质替换、机型隔离、单画布复用及保存恢复；支持正式 / 演示便携入口 |
| `node scripts/verify-multiblock-effects.mjs [HTML路径]` | 独立 Chrome 验证五种多方块动效、开关冻结、停机、百台同型涡轮共享批次及离线入口 |
| `node scripts/verify-page-cache.mjs [HTML路径]` | 独立 Chrome 验证四页缓存、星图位置、日志筛选与未读、实时数据及重置 |
| `node scripts/verify-logs.mjs [HTML路径]` | 独立 Chrome 验证日志操作、筛选、分页、导出内容、刷新恢复及错误提示；截图写入 `outputs/verification/logs/` |
| `npm run floor:data` | 从 `src/scene/factory3d/floor-blueprint.json` 重新生成厂区「预设一」地板数据 |
| `npm run balance` | 只输出简化估算，不覆盖已有实证 |
| `npm run balance -- --verify --arcane --wall-seconds=60 --segments=12 --days=7` | 分段真实推进并生成工业与奥术对照报告，预算与续跑边界见 `balance.md` |
| `npx tsx scripts/arcane-balance.ts --seconds=14400 --seed=20261024 --json` | 固定工业实验起点的同预算真实结算对照，不是从零通关证明 |
| `dist/GTNH-Incremental.html` | 自包含便携游戏，双击打开 |
| `dist/index.html` | 同内容的便携入口 |
| `dist/web/index.html` | 常规 Web 入口，通过本地服务器打开 |
| `dist/GTNH-Incremental-演示.html` | 自包含重规划演示，双击打开 |
| `dist/demo/demo.html` | 演示 Web 入口，通过本地服务器打开 |

存档版本以 src/game/constants.ts 为准（当前 v29）；按电压标识恢复各级资源与等级。旧币、矿、机器和研究保留，新字段逐项清洗；已有研究目标或进度不重复补收投资，不凭空发新实体节点；发电机燃料优先级按机型保存，旧档默认沿用本级矿石。扩展约束见 custom-content.md。

浏览器存档按入口的存储范围隔离；切换文件路径、端口或 Web / 便携入口时，用界面中的 JSON 导入导出迁移进度。
构建不会删除 `dist/web/`。`dist/GTNH-Incremental.html` 是入库产物，其余构建文件按 `.gitignore` 忽略。

素材工具使用用户本机 GTNH 客户端、材质包或开发包；来源与操作见 `scripts/texture-sources.md`。
机器图标使用 `scripts/export-machine-icons.ps1` 从启用 Modernity 的客户端原生导出。厂区地板贴图与原始蓝图位于 `src/scene/factory3d/floor-textures/` 与 `floor-blueprint.json`，来源清单见同目录 `floor-textures.json`。其他常用工具：`scripts/build-veins.py`、
`build-pickaxe-icons.py`、`build-texture-gallery.py`。
3D 机器素材使用 `python -B scripts/extract-factory3d.py --pack "<Modernity-GTNH.zip>"` 提取；逐张来源见生成的 `src/assets/factory3d/manifest.json`。渲染复用项目已有的 `three` 依赖。

### 共用应用与隔离预览

`index.html` 与 `demo.html` 直接使用现有 `src/main.ts` 与 `App.vue`，共用 GameCore、store、页面、公式和内容。日常开发分支为 dev，正式主线为 master。现有能源、转生、自动保存与导入导出均保留，定向改动同时进入两个构建。

- 手动与自动采矿增加真实矿石库存；发电机消耗矿石供电，制造机消耗矿石与电力产出对应等级 GT 币。可以用存矿继续制造，不要求采矿机始终同时运行。
- 建造、出售、矿石与币支付、机型价格、电压解锁、镐子与各宇宙沿用 dev，不合并原有币种或余额，不使用独立演示参数替代。
- 桌面紧凑工作台、手机四入口底栏、可折叠厂区与资源收支查询已接入。设备选择、厂区相机、星图位置、日志筛选与输入随页面缓存保留。
- 设备工作台支持点击机型名称或图标打开独立详情弹窗；详情包含持续旋转的模型预览、状态与核心产出、生产参数、现有操作以及发电机燃料优先级调整。桌面使用左右布局，手机使用上下布局。
- 预览入口使用 `gtnh-dev-preview:` 前缀隔离存档、保存时间、主题、界面偏好、日志、动态效果及场地偏好。正式入口保持原键；不读取、迁移或覆盖正式存档、旧材料演示或废弃单币演示存档。
- 净化器尚未开放时排放为原值的 5%；开放治理能力后恢复原排放。机型研究先投资，供电、计算机与研究站决定进度；切换和刷新不重复付费。
- 离线沿用默认 24 小时加原星图加成，最多 72 小时；与在线共用逐秒结算。补算期间显示居中的进度窗口并锁定主要操作；完成后按实际库存前后差值显示主要增加项，数量按当前视口自适应，超过可见范围的项目可展开。没有库存增加时不弹结果窗口，库存减少只写入日志。原有工业产出、奥术发现 / 作业 / 研究、待处理数、实体节点供能变化及当前暂停原因仍写入离线摘要与日志。

当前测试、内容检查、类型检查与正式构建的结果以最近一次本地验证为准。`verify-factory3d.mjs` 验证设备选择、相机、购买 / 停机、页面缓存及后台停绘。`verify-grounds.mjs` 验证千台设备、场地编辑、预设、备份、刷新恢复及手机布局；`verify-terrain-import.mjs` 验证三种蓝图文件导入、预览取消、材质替换、损坏文件保护和保存恢复；`verify-multiblock-effects.mjs` 验证多方块动效、动态开关和停机状态；`verify-redesign.mjs` 验证奥术双端操作、风险确认、千台厂区、千节点与旧档导入。所有浏览器检查使用独立软件渲染上下文，不读取用户存档，生成物写入 `outputs/verification/`。

Web 与便携入口从零验证手动产矿、矿石建造、存矿供制造、耗矿、断电停产、币支付及主动 LV 突破；仅压缩等待时钟，不注入资源。大规模实验存档只用于检查展示和交互，不能作为主线经济通关证据。验收截图与临时报告见 `outputs/verification/`，不纳入源码或文档目录。

正式与预览统一使用 `scripts/build-game.ts`，为 esbuild 大文件转换设置项目内临时目录，并在打包结束恢复进程环境、清理转换文件，避免 Windows 系统临时目录的文件删除权限问题。

## 3. 权威来源

| 内容 | 唯一来源 |
| --- | --- |
| 现行游戏规则与阶段 | `game-rules.md` |
| 后续重规划需求与执行顺序 | `redesign-plan.md` |
| 奥术新增实体节点的机制与接入边界 | `arcane-universe-plan.md`；执行状态只记在总规划 |
| 模块边界、界面与生命周期约束 | `architecture.md` |
| 公式 | `src/numeric/` |
| 电压、资源与机型内容 | `../src/content/`；自定义操作见 `custom-content.md` |
| 当前数值参数与存档键 / 版本 | `src/game/constants.ts` |
| 转生星图 / 挑战 / 宇宙定义 | `src/game/rebirth.ts`、`challenges.ts`、`universes.ts` |
| 当前版本 | `package.json`；非 master 构建自动加 `-dev` |
| 平衡计算 | `../scripts/balance.ts` 生成的 `balance.md`，不要手改产物 |
| 诊断与日志 | `../src/game/diagnostics.ts`、`log.ts` |
| 素材来源 | `../scripts/texture-sources.md` |
| 浏览器验收产物 | `outputs/verification/`，由独立测试上下文生成，不使用用户存档 |

## 4. 本地数据与操作约束

- 累计资源使用 Decimal，存档中的大数值保存为十进制字符串；场景坐标和动画不能反向写入资源。
- 导入与本地读档共用逐字段清洗和版本校验；导入成功后整体替换，不部分应用。
- 重开一局清除进度，主题和界面偏好保留。设置页中的开发者操作由核心开关控制。
- 矿脉动画使用竖排帧条带，容器必须裁剪；贴图文件通过内容定义的素材键关联，可供多个机型或电压复用。
- 界面、动画和存档的其他约束不在此重复，见 `architecture.md`。

## 5. 开发与后续

- 日常工作在 dev 分支；未经用户明确指示，不自行合并 master、发布或上传项目。
- Git 提交需用户同意；提交前按改动范围验证。高风险改动的回滚点也遵守此规则。
- `game-rules.md` 的玩法规则不随视觉调整改变；用户授权的界面 / 架构改造同步更新对应章节。
- 重规划的唯一执行表、验收缺口和后续起点见 `redesign-plan.md`。已完成范围纳入正式与隔离预览的共用实现，未完成项仍按执行表保留。
- 工业七日逐秒实跑已结束并保留可跨进程续跑的存档，结果与策略边界见 `balance.md`；3–7 天全程节奏尚未证明，首次自动矿也未匹配约五分钟目标，原参数没有为目标被强改。奥术同预算对照已完成一个低压场景，不能宣称全面平衡通过。支架、培养台、花园与祭坛的完整原生图标仍缺，来源边界见 `../scripts/texture-sources.md`。
- 跨周目继承蓝图玩法不采用；升压等待真正的配方系统；机型、资源等内容扩展通过本地 JSON 配置并重新构建生效，操作见 `custom-content.md`。运行中的场地蓝图导入见 `architecture.md`。

视觉验证先在独立浏览器上下文完成，再保存必要的预览图。临时测试脚本、下载和抓帧文件使用完后清理。
