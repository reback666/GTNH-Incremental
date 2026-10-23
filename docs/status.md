# 项目现状与操作说明

> 更新：2026-10-23。此文档记录当前有效的操作与约束；版本号以 `package.json` 为准。

## 1. 项目范围

GTNH 主题的本地增量 / 放置游戏，从 ULV 沿 15 级电压发展到 MAX。
使用 Vue 3、TypeScript、Pinia、decimal.js 与 Vite，仅面向桌面浏览器。
不自动上传游戏进度、素材、日志或其他本地数据。

当前包含：

- 手动开采与三条镐子升级线，多矿种自动采矿，矿石 / GT 币建造与出售。
- 发电、按需燃料消耗、储能、超频、维护、手动停机、污染与电网取舍。
- LuV 起的算力研究，后期逐机型研究门控。
- 裂缝 / MAX 转生、永久星图、工业 / 奥术 / 深渊 / 硅基宇宙、挑战与转生履历。
- 成就、累计统计、音效、主题、开发者工具、离线补算、本地存档与 JSON 导入导出。
- LV 方块 3D 主厂区，含六种工业机器、蓝图地板、自由相机及演示 / 实际数量切换；具体约束见 `architecture.md`。

## 2. 运行与产物

| 命令 / 路径 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run check:content` | 检查内容定义、引用关系与素材是否齐全 |
| `npm test` | 运行单元和集成测试 |
| `npm run build` | 类型检查、Web 构建及便携打包 |
| `npm run preview` | 在本地预览 Web 构建 |
| `node scripts/verify-factory3d.mjs [HTML路径]` | 独立 Chrome 验证 LV 场景、购买 / 停机联动、相机、导航及离线入口 |
| `node scripts/verify-page-cache.mjs [HTML路径]` | 独立 Chrome 验证四页缓存、星图位置、日志筛选与未读、实时数据及重置 |
| `node scripts/verify-logs.mjs [HTML路径]` | 独立 Chrome 验证日志操作、筛选、分页、导出内容、刷新恢复及错误提示；更新 `docs/log-panel.png` |
| `npm run balance` | 重新生成平衡报告 |
| `dist/GTNH增量.html` | 自包含便携游戏，双击打开 |
| `dist/index.html` | 同内容的便携入口 |
| `dist/web/index.html` | 常规 Web 入口，通过本地服务器打开 |

存档版本以 `src/game/constants.ts` 为准；旧档迁移后，新档按电压标识恢复资源和等级；扩展约束见 `custom-content.md`。

浏览器存档按入口的存储范围隔离；切换文件路径、端口或 Web / 便携入口时，用界面中的 JSON 导入导出迁移进度。
构建不会删除 `dist/web/`。`dist/GTNH增量.html` 是入库产物，其余构建文件按 `.gitignore` 忽略。

素材工具使用用户本机 GTNH 客户端、材质包或开发包；来源与操作见 `scripts/texture-sources.md`。
机器图标使用 `scripts/export-machine-icons.ps1` 从启用 Modernity 的客户端原生导出。其他常用工具：`scripts/build-veins.py`、
`build-pickaxe-icons.py`、`build-scene-casings.py`、`build-texture-gallery.py`。
3D 机器素材使用 `python -B scripts/extract-factory3d.py --pack "<Modernity-GTNH.zip>"` 提取；逐张来源见生成的 `src/assets/factory3d/manifest.json`。渲染复用项目已有的 `three` 依赖。

## 3. 权威来源

| 内容 | 唯一来源 |
| --- | --- |
| 现行游戏规则与阶段 | `plan.txt` |
| 后续重规划需求与执行顺序 | `docs/redesign-plan.md` |
| 模块边界、界面与生命周期约束 | `docs/architecture.md` |
| 公式 | `src/numeric/` |
| 电压、资源与机型内容 | `src/content/`；自定义操作见 `docs/custom-content.md` |
| 当前数值参数与存档键 / 版本 | `src/game/constants.ts` |
| 转生星图 / 挑战 / 宇宙定义 | `src/game/rebirth.ts`、`challenges.ts`、`universes.ts` |
| 当前版本 | `package.json`；非 master 构建自动加 `-dev` |
| 平衡计算 | `scripts/balance.ts` 生成的 `docs/balance.md`，不要手改产物 |
| 诊断与日志 | `src/game/diagnostics.ts`、`log.ts` |
| 素材来源 | `scripts/texture-sources.md` |
| 厂区预览 | `outputs/factory3d-lv/`，由独立测试上下文生成，不使用用户存档 |

## 4. 本地数据与操作约束

- 累计资源使用 Decimal，存档中的大数值保存为十进制字符串；场景坐标和动画不能反向写入资源。
- 导入与本地读档共用逐字段清洗和版本校验；导入成功后整体替换，不部分应用。
- 重开一局清除进度，主题和界面偏好保留。设置页中的开发者操作由核心开关控制。
- 矿脉动画使用竖排帧条带，容器必须裁剪；贴图文件通过内容定义的素材键关联，可供多个机型或电压复用。
- 界面、动画和存档的其他约束不在此重复，见 `architecture.md`。

## 5. 开发与后续

- 日常工作在 dev 分支；未经用户明确指示，不自行合并 master、发布或上传项目。
- Git 提交需用户同意；提交前按改动范围验证。高风险改动的回滚点也遵守此规则。
- `plan.txt` 的玩法规则不随视觉调整改变；用户授权的界面 / 架构改造同步更新对应章节。
- 后续玩法与画面重规划的执行顺序、已确认边界和待确认项见 `redesign-plan.md`；仍在规划阶段，不作为已经实现的功能。
- 跨周目继承蓝图玩法不采用；升压等待真正的配方系统；自定义内容通过本地 JSON 配置并重新构建生效，操作见 `custom-content.md`。

视觉验证先在独立浏览器上下文完成，再保存必要的预览图。临时测试脚本、下载和抓帧文件使用完后清理。
