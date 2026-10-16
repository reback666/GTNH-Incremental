# 项目现状与操作说明

> 更新：2026-10-11。此文档记录当前有效的操作与约束；版本号以 `package.json` 为准。

## 1. 项目范围

GTNH 主题的本地增量 / 放置游戏，从 ULV 沿 14 级电压发展到 MAX。
使用 Vue 3、TypeScript、Pinia、decimal.js 与 Vite，仅面向桌面浏览器。
不自动上传游戏进度、素材、日志或其他本地数据。

当前包含：

- 手动开采与三条镐子升级线，多矿种自动采矿，矿石 / GT 币建造与出售。
- 发电、按需燃料消耗、储能、超频、维护、手动停机、污染与电网取舍。
- LuV 起的算力研究，后期逐机型研究门控。
- 裂缝 / MAX 转生、永久星图、工业 / 奥术 / 深渊 / 硅基宇宙、挑战与转生履历。
- 成就、累计统计、音效、主题、开发者工具、离线补算、本地存档与 JSON 导入导出。
- 可交互的实时厂区，设备与生产流动画；具体界面和模块约束见 `architecture.md`。

## 2. 运行与产物

| 命令 / 路径 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm test` | 运行单元和集成测试 |
| `npm run build` | 类型检查、Web 构建及便携打包 |
| `npm run preview` | 在本地预览 Web 构建 |
| `npm run balance` | 重新生成平衡报告 |
| `dist/GTNH增量.html` | 自包含便携游戏，双击打开 |
| `dist/index.html` | 同内容的便携入口 |
| `dist/web/index.html` | 常规 Web 入口，通过本地服务器打开 |

浏览器存档按入口的存储范围隔离；切换文件路径、端口或 Web / 便携入口时，用界面中的 JSON 导入导出迁移进度。
构建不会删除 `dist/web/`。`dist/GTNH增量.html` 是入库产物，其余构建文件按 `.gitignore` 忽略。

素材工具需要用户本机 GTNH 开发包和原版客户端；来源与合成方式见 `scripts/texture-sources.md`。
常用工具：`scripts/build-veins.py`、`build-machine-icons.py`、`build-facility-icons.py`、
`build-pickaxe-icons.py`、`build-scene-casings.py`、`build-texture-gallery.py`。

## 3. 权威来源

| 内容 | 唯一来源 |
| --- | --- |
| 游戏规则、阶段与待定设计 | `plan.txt` |
| 模块边界、界面与生命周期约束 | `docs/architecture.md` |
| 公式 | `src/numeric/` |
| 机型目录 | `src/game/models.ts` |
| 当前数值参数与存档键 / 版本 | `src/game/constants.ts` |
| 转生星图 / 挑战 / 宇宙定义 | `src/game/rebirth.ts`、`challenges.ts`、`universes.ts` |
| 当前版本 | `package.json`；非 master 构建自动加 `-dev` |
| 平衡计算 | `scripts/balance.ts` 生成的 `docs/balance.md`，不要手改产物 |
| 诊断与日志 | `src/game/diagnostics.ts`、`log.ts` |
| 素材来源 | `scripts/texture-sources.md` |
| 厂区预览 | `docs/factory-overview.png`（暗钢）与 `docs/factory-overview-light.png`（亮灰），用独立测试进度演示，不是用户存档 |

## 4. 本地数据与操作约束

- 累计资源使用 Decimal，存档中的大数值保存为十进制字符串；场景坐标和动画不能反向写入资源。
- 导入与本地读档共用逐字段清洗和版本校验；导入成功后整体替换，不部分应用。
- 重开一局清除进度，主题和界面偏好保留。设置页中的开发者操作由核心开关控制。
- 矿脉动画使用竖排帧条带，容器必须裁剪；贴图文件名必须与机型 / 元数据标识一致。
- 界面、动画和存档的其他约束不在此重复，见 `architecture.md`。

## 5. 开发与后续

- 日常工作在 dev 分支；未经用户明确指示，不自行合并 master、发布或上传项目。
- Git 提交需用户同意；提交前按改动范围验证。高风险改动的回滚点也遵守此规则。
- `plan.txt` 的玩法规则不随视觉调整改变；用户授权的界面 / 架构改造同步更新对应章节。
- 当前没有自动推进其他新玩法的排期。数值手感、制造机变体、多矿种比例与多方块代价等待定项以 `plan.txt` 第二十一章为准。
- 蓝图方案不采用；升压等待真正的配方系统；自定义内容接口仍未实现。

视觉验证先在独立浏览器上下文完成，再保存必要的预览图。临时测试脚本、下载和抓帧文件使用完后清理。
