# 项目现状（唯一说明文档）

只写当前有效的事实。设计以 `plan.txt` 为准（未经用户同意不改），公式以 `src/numeric/` 为准。

## 1. 项目

GTNH 主题增量游戏：ULV 起步沿 14 级电压做到 MAX。Vue 3 + TypeScript + Vite + Pinia + Three.js，
构建为单个离线 HTML。只支持桌面浏览器（不做手机布局）。版本号读 `package.json` 的 `version`，
非 master 分支构建自动加 `-dev`。日常开发在 dev，master 只在用户明确要求时合并。

## 2. 命令

| 命令 | 作用 |
| --- | --- |
| `npm test` | vitest 全部测试 |
| `npx vue-tsc --noEmit` | 类型检查 |
| `npm run build` | 类型检查 + `vite build` + `scripts/inline-dist.ts` 内联成单文件 |
| `npm run dev` | 开发服务器 |
| `npm run balance` | 重算 `docs/balance.md`（生成物，不手改） |
| `python scripts/build-*.py` | 重新生成贴图（需本机 GTNH 开发包与 1.7.10 `client.jar`，缺失时脚本报错） |

## 3. 架构

- `src/game/core.ts`：纯逻辑与经济（Decimal 40 位精度）；`save.ts` 存档清洗与版本迁移。
- `src/game/store.ts`：Pinia 门面，产出 `snap` 快照给界面；成功操作在 `fx.ts` 总线上 emit
  （`mine`/`build`/`sell`/`repair`/`pickaxe-upgrade`/`research-done`/`voltage-unlock`）。
- `src/rendering/*` + `components/FactoryScene.vue`：Three.js 工业基地与 `ParticleOverlay` 粒子池。
  场景自己读 store，接口 `v-model:selected`（机型 id），带 `data-mode="ready|fallback"`、
  `data-total-machines`、`data-shown-units`、`data-selected`；WebGL 不可用时显示文字摘要。
- 界面外壳 `App.vue`：64px 横向顶栏（`Sidebar.vue`：品牌/电压、三页导航、电网四读数与研究进度，
  电力明细为浮层）+ 占满视口的内容区。键盘 1/2/3 换页（输入框、输入法组合、contenteditable、
  组合键、三维视图内不触发）。
- 工厂页 `pages/FactoryPage.vue`：顶部横向资源带（`ResourceBar.vue`，悬停/聚焦看产入耗出与净变化，
  离线收益横幅，奥术宇宙灵气详情展开）；下方左侧 3D 基地，左下角叠开采 dock（`VeinPanel.vue`，
  固定 DOM，M 键开采），底部污染状态条（`PollutionPanel.vue`，点开看全部机制）；右侧机器控制台
  （`MachinePanel.vue`，自身纵向滚动，只渲染当前类别；与场景双向联动选中机型）。
- `FxLayer.vue`：全屏反馈层。提示文字订阅常驻、最多 5 条、连续挖矿合并为一条；粒子统一用
  `ParticleOverlay`，系统 reduced-motion 实时开关（开启时销毁画布，文字照常）。
- 样式：`style.css`（主题变量、三套皮肤、通用控件）、`style-shell.css`（外壳/顶栏）、
  `style-factory.css`（工厂页）、`style-fx.css`（反馈层）。

## 4. 离线产物

- `dist/GTNH增量.html` 入库，单文件、全部资源内联；`dist/index.html`、`dist/assets` 不入库。
  构建时间戳每次都变，构建后该文件总显示为改动。
- `inline-dist.ts` 会删 `dist/assets`，贴图必须内联为 data URL（`vite.config.ts` 的
  `assetsInlineLimit` 为 4 MB）。

## 5. 约定

- 存档数值存十进制字符串，读档逐字段清洗，越界退默认值。
- 动画贴图为竖排帧条带，容器必须 `overflow: hidden`；贴图文件名必须等于机型 id / `vein-meta` 键。
- 机器类别顺序与按 id 查机型共用 `store.ts` 的 `COLUMN_ORDER`。
- 面向用户文字一律简体中文；脚本需支持中文路径。

## 6. 验证与限制

- 当前工厂界面预览：[1366×768](ui-preview.png) / [1920×1080](ui-preview-2.png)。
- 单元测试覆盖 core/存档/数值/基地布局模型；界面与 3D 场景没有自动化 UI 测试，
  布局、性能与 WebGL 行为需在桌面浏览器（1366×768 与 1920×1080）人工或 Playwright 验收。
- 无头环境可能没有 WebGL，此时场景走 fallback、粒子不创建，这是预期行为。
- 待定的数值手感题见 `plan.txt` 第二十一章。
