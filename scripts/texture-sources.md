# 贴图来源：机器图标与矿脉

机器图标由启用 Modernity 的 GTNH 客户端原生导出；矿脉与界面皮肤从游戏贴图提取或合成。各自的来源和重跑方式见对应章节。

## GTNH 标志

左上角 `src/assets/gtnh-logo.png` 来自本机 PrismLauncher 的 `icons/gtnh_icon.png`，与 GTNH 2.8.4 实例内同名图标一致；仅裁去透明边缘，保留原图颜色与比例。构建时内联到便携 HTML。

## GUI 皮肤（面板 / 插槽 / 按钮 / 页签 / 进度条）

UI 重设计（2026-10-04 拍板「GT 机器 GUI 深度复刻 + 贴图+CSS 混合」）后，界面骨架
也从 GT 自己的 GUI 贴图来，`src/assets/gui/` 下：

| 产物 | 来源（jar 内路径 `assets/gregtech/textures/gui/`） | 用途 |
|---|---|---|
| `panel-light.png` | `background/singleblock_default.png`（176×166） | 亮灰主题的面板底（border-image 切片） |
| `panel-steel.png` | `background/steel.png` | 蓝钢灰面板底 |
| `panel-dark.png` | steel.png 压暗派生 | 暗色主题面板底：底色压到 0.36、高光只压到 0.72，保住凸起语法 |
| `panel-popup.png` | `background/popup.png`（195×136） | 对话框底（裂缝弹窗等） |
| `text-field.png` | `background/text_field.png`（142×28） | 黑芯凹槽输入框 |
| `slot-item.png` / `slot-dark.png` | `slot/item_standard.png` / `slot/dark_gray.png`（18×18） | 插槽式资源格 |
| `btn.png` / `btn-pressed.png` / `btn-disabled.png` | `button/standard*.png`（18×18） | 按钮三态底 |
| `tab-cover*.png` | `tab/cover_normal` / `cover_highlight` / `cover_disabled` | 页签（cover 是 GT 机器 GUI 的盖板页签） |
| `tab-title.png` | `tab/title_dark.png` | 面板标题条 |
| `arrow-empty.png` | `progressbar/arrow.png` 上帧（20×18） | 箭头进度条空底 |
| `arrow-fill-t1..15.png` | 同上下帧按电压色染色 | 进度填充：15 级电压色（由 `src/content/voltages.json` 派生），MAX 横向彩虹；染色方式与镐子爆破线同族（亮度转灰阶乘色、暗部 0.3 保底） |
| `glow-blue.png` / `glow-rainbow.png` | TecTech `background/blue_glow.png` / `rainbow_glow.png` | 辉光点缀（转生页 / MAX 级） |

生成脚本：`python scripts/build-gui-skins.py`，预览图 `docs/gui-skins.png`。
这些是**骨架贴图**：交互态（悬停微光、电压色叠加）和布局仍由 CSS 管。


## 素材来源

用户本机 Gradle 缓存里的 GTNH GregTech 开发包：

```
~/.gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/5.09.51.472/*/GT5-Unofficial-5.09.51.472-dev.jar
```

贴图在 jar 内的 `assets/gregtech/textures/` 下。

## 机器图标

`src/assets/machines/<素材键>.png` 是 64×64 透明 PNG，由本机 GTNH 2.8.4、GregTech 5.09.51.482 在启用 Modernity 后直接渲染。
完整图标的物品编号、名称、材质包清单与扩展机型复用关系，以 `scripts/native-icons/manifest.json` 为唯一来源。

导出调用现有 NEI `GuiItemIconDumper.drawItems()` 和 `screenshot()`，实际绘制由游戏的 `GuiContainerManager.drawItem()` 完成。
脚本只裁取原生导出器的 64×64 物品格，不自行投影方块面、不叠面片、不染色或添加标记。
多方块机器使用物品栏中的控制器图标，不使用 wiki 整机缩略图。

游戏没有对应原版物品的自定义电压和设施，直接复用清单中记录的真实物品图标；同一物品只渲染一次，各档拷贝相同 PNG。
例如魔法采矿机采用奥术钻探机，魔法制造机采用奥术装配室，腐蚀抑制器采用咒波洗涤器。等级区分由界面文字承担。

### 重新导出

需要已启用相同材质包、完成加载的本机 GTNH 客户端与 JDK 17 或更高版本；不需要进入存档，也不读取或修改世界、背包、账户和游戏配置。

```powershell
./scripts/export-machine-icons.ps1 -GameProcessId <javaw进程号> -JavaHome '<JDK目录>'
```

加 `-Catalog` 可列出游戏注册的机器和神秘时代相关物品，供维护物品映射时检查。中间文件写入 `.tmp-blueprint/native-icons/`，导出后原生 PNG 拷贝到机器素材目录。
工具源代码位于 `scripts/native-icons/InventoryIcons.java`，仅通过本机 Attach 调用运行中客户端。

## 矿脉贴图

`src/assets/veins/tN.png` 是**竖排的帧条带**（宽 32，每帧高 32），界面用 CSS `steps()` 逐帧切换，
和 Minecraft 的动画贴图同一套机制。文件名由 `ore.texture` 决定，帧信息在 `src/assets/veins/meta.json` 中按素材键记录。层级照抄原版的矿石方块：

```
石头底 + 染料色染过的矿石斑点 + 动画叠加层（ore_OVERLAY.png 的多帧）
```

石头与斑点的形状沿用 `src/assets/veins/base/tN.png`（已验收的静态图标），
动画只对原版确实带动画的材料生效，帧顺序与每帧 tick 数取自贴图自带的 `.mcmeta`：

| 等级 | 材料 | 动画来源 | 帧数 × 每帧 |
|---|---|---|---|
| T9 | 宇宙中子素 | `CUSTOM/cosmicneutronium/ore_OVERLAY.png` | 3 帧 × 3 tick |
| T10 | 无尽 | `CUSTOM/infinity/block1.png` | 31 帧 × 3 tick |
| T11 | 龙芯 | `CUSTOM/draconium/ore_OVERLAY.png`（10 帧来回播成 18 帧） | 18 帧 × 4 tick |
| T14 | 时空 | `CUSTOM/spacetime/block1.png` | 113 帧 × 3 tick |

T12 为 UMV 的超时空金属，按 `MaterialsUEVplus.TranscendentMetal` 的 RGB 50/50/50 重绘静态斑点。
T13 海珀珍沿用 `scripts/textures/hypogen-coil.png` 中的 Modernity-GTNH UXV 线圈能量流，119 帧、每帧 50ms。

`src/assets/veins/fx/` 是原版特殊渲染用的光晕贴图，界面用 CSS mask 上色：
无尽用 `HALO.png`（图标外扩 10/16 的方形暗光晕 + 60% 透明度的脉动重影），
宇宙中子素用 `HALO_FUZZY.png`（8 帧毛边白光晕，白色 30% 透明）。
这两条都对应原版 `InfinityRenderer` 与 `CosmicNeutroniumRenderer` 里的实际参数。

同一目录下的 `destroy.png` 是挖矿时的石头碎裂贴图：原版客户端里挖方块的 10 级破坏贴图
（`destroy_stage_0..9`，从最浅的裂纹到最深），竖排成条带，一次点击从第 0 级播到第 9 级再淡出。
素材来自开发环境缓存的原版客户端：

```
~/.gradle/caches/retro_futura_gradle/mc-vanilla/1.7.10/client.jar
```

按 16×16 一格 56px 画，和矿脉 2×2 方块的尺度对得上。

重新生成矿脉：`python -B scripts/build-veins.py`（默认从 Gradle 缓存查找 jar，可用 `--jar` 指定）。它会按 `ore.texture` 重写矿脉 PNG、`fx/*.png` 与 `src/assets/veins/meta.json`。

## 镐子图标（金刚杵）

`src/assets/pickaxe/` 下是镐子三条升级线的图标，每条线 15 张：

```
线          文件前缀        素材
金刚杵      vajra-<等级>    用户材质包（Modernity-GTNH）的金刚杵本体贴图
                            scripts/textures/vajra-base.png（16×256，16 帧动画条带）
连锁采集    drill-<等级>    assets/ic2/textures/items/itemToolDrill.png（32×32，电动钻头）
连锁爆破    blast-<等级>    assets/ic2/textures/items/itemDynamite.png（16×16，炸药）

脚本：python scripts/build-pickaxe-icons.py（drill/blast 读 IC2 jar）
产物：32×32 或竖排动画条带；预览图 docs/pickaxe-tiers.png
```

**金刚杵全线是动画**：本体按材质包 mcmeta 的序列流动（33 拍 × 50ms：停 4 拍 → 1..15 → 14..1
往复），发光曲线随等级换电压色——只动高饱和像素（曲线 ≥0.35 饱和度）、保留每帧明度呼吸；
换色会把目标等级色的**明度**也乘进去（有的等级色只差明度，只换色相会撞档）。
图标输出 32×1056 条带，界面元数据 `pickaxeStripMeta`，文件映射使用电压配置的 `textureKey`。
满级曲线改用无尽矿石的流动色（毕业 = 无尽材质）。
**材质包里的 itemVajraCore.png 不要用**——那是 Gravisuite 版金刚杵的电量指示层
（100% 蓝芯 / 0% 红芯），与电压等级无关（2026-10-03 用户指正，曾误合上去过）。

**采集（drill）**：机体保持 IC2 原版不上色，只有右上角的金属钻头随等级换电压色。
blast 1~14 级：原图本身是彩色的，机器那套淡染（`TINT_STRENGTH = 0.2`）用在它身上
几乎看不出等级差别，所以先按感知亮度把原图转成明暗，再乘上该等级的电压色（暗部有 0.45
的亮度保底）。配色取自 `gtnh_tiers.py`。**满级（15）是无尽矿石材质的流动动画**（2026-10-03
用户拍板，先后否掉 MAX 横向彩虹 / 世界崩解之镐光谱 / 静态矿石斑点三版）：输出 32×992 的
竖排 31 帧条带，颜色只取矿石斑点自身（饱和度 ≥ 0.2，灰白石底不参与，空格由同帧多源 BFS
取最近斑点色），帧节奏 150ms/帧与矿脉一致。连锁采集满级钻头同一套流动规则（机体不上色）。

界面里三条线按**各自升了多少次**上色（`pickaxeIconTier`）。
分母取各条升级线在 MAX 时的总次数，上限定义见 `src/numeric/pickaxe.ts`，
所以金刚杵一级一档、连锁采集一级约两档、连锁爆破两左右一档。
**分母不能用「当前电压给的机会数」** —— 那个数在前期很小（ULV 时金刚杵只有 1 次），
升一次就是 100%，图标会直接跳成满级材质。

## 打包约定

图标和矿脉条带一律内联进便携 HTML（`vite.config.ts` 把 `assetsInlineLimit` 提到 4 MB），
`scripts/inline-dist.ts` 内联脚本与样式并保留 Web 目录；新素材必须确认便携入口没有外部文件依赖。


## 原生 3D 主厂区

151 个 GT 机型的六面材质、运行覆盖层和发光覆盖层从本机运行中的客户端导出，原始材质由已启用资源包与模组 jar 提供；多方块结构由原 StructureLib 定义逐格展开，含控制器、机壳和仓口。可复现导出源为 `scripts/native-models/ModelProbe.java`、`capture.py`、`capture.json`、`structures.json` 与 `build-models.py`，生成清单为 `src/assets/factory3d/native-manifest.json`。

奥术钻机、奥术装配器和通量洗涤器使用原模组 Java/OBJ 网格；灵气节点使用原生节点动态图集和加法混合光效。导出脚本为 `scripts/native-models/custom-models.py`，运行时清单为 `src/assets/factory3d/custom-manifest.json`。

生成命令：`python -B scripts/extract-factory3d.py --pack "<Modernity-GTNH.zip>"`。输出保留原始 PNG 条带，运行时按 mcmeta 合成机壳与覆盖层。厂区地板的原三层蓝图与材质来源见 `gtnh3d/ASSETS.md`，铺设约束见 `gtnh3d/README.md`。

## 奥术实体与辅助设施

新增实体节点复用已有完整原生物品图标 `src/assets/machines/n-1.png`，其登记身份为 `Thaumcraft:blockAiry`、元数据 `0`，以 `scripts/native-icons/manifest.json` 为依据。该图标只表示灵气节点，不冒充节点稳定器或其他辅助设施。

支架、培养台、花园和祭坛当前使用文字及真实状态展示，尚缺确切物品映射与启用 Modernity 后的完整原生渲染图标。已有机器图标、模组原始面贴图或相近方块不能当作四项素材已经完成；补齐时沿用 `export-machine-icons.ps1` 的客户端物品渲染流程，不拼贴、不重绘。

本机已核对的实例为 `D:\Prism\PrismLauncher\instances\GT_New_Horizons_2.8.4_Java_17-25\.minecraft`，Modernity 包位于其 `resourcepacks/Modernity-GTNH-9ebdeed-pre.zip`。路径是本地提取来源，不是游戏运行依赖；游戏所需已导出素材仍内联至便携 HTML。

## 旧等距场景机壳素材

`src/assets/casings/<textureKey>-side.png` 与 `<textureKey>-top.png` 由 `build-scene-casings.py` 从本机 GT5-Unofficial 开发包的 `iconsets/MACHINE_<voltage>_SIDE/TOP.png` 提取。
文件名由电压配置的 `textureKey` 决定，原版机壳电压可由 `casingVoltage` 指定。
染色复用 `gtnh_tiers.py`；缺少独立顶面的等级使用同级侧面。这些素材保留在素材目录中，当前 3D 主厂区不使用它们。
