# 贴图来源：机器图标与矿脉

界面里的机器图标和矿脉贴图都不是手画的，全部从 GTNH 的贴图合成，脚本可重跑。

## 素材来源

用户本机 Gradle 缓存里的 GTNH GregTech 开发包：

```
~/.gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/5.09.51.472/*/GT5-Unofficial-5.09.51.472-dev.jar
```

贴图在 jar 内的 `assets/gregtech/textures/` 下。

## 机器图标

`src/assets/machines/<机型 id>.png` 不是手画的，而是**从 GTNH 的方块贴图合成出来的**。

## 合成方式

GT 的机器不是一张整图，而是「**机壳 + 功能面片**」两层叠出来的。按同样方式合成：

```
底层：iconsets/MACHINE_<电压>_SIDE.png      按电压等级着色的机壳，14 级全都有
面片：该机器的 SIDE / OVERLAY_* / LARGETURBINE_* 贴图，叠在上面
```

输出 16×16，再以最近邻放大到 32×32（保持像素硬边）。

## 机型 → 面片对照

| 机型 | 面片 |
|---|---|
| 原始发电机、各级蒸汽轮机 | `iconsets/STEAM_TURBINE_SIDE.png` |
| 各级内燃发电机 | `iconsets/DIESEL_GENERATOR_TOP.png` |
| 各级燃气轮机 | `iconsets/GAS_TURBINE_SIDE.png` |
| 各级等离子发电机 | 等离子发电机没有独立贴图，暂借 `basicmachines/chemical_reactor/OVERLAY_FRONT.png` |
| 各级采矿机 | `basicmachines/miner/OVERLAY_FRONT.png` |
| 各级制造机 | `basicmachines/macerator/OVERLAY_FRONT.png` |
| 各级计算机 | `iconsets/EM_COMPUTER.png` 的最上一格（原图是 5 帧竖排条带） |
| 各级研究站 | `iconsets/OVERLAY_FRONT_RESEARCH_COMPLETER.png` |

机壳按机型的电压等级取，所以同一面片在不同等级下颜色不同、能区分开。

**机壳必须按电压染色。** GT 的 `MACHINE_<电压>_SIDE.png` 本身是灰度图，
游戏里由 GT 在运行时按电压上色 —— 同一张面片在 LV 和 UV 下颜色差得很远。
离线的图标脚本必须自己补上这一步，否则各等级只差亮度、根本分不清
（这正是之前踩过的坑：14 级采矿机 / 制造机看起来几乎一样）。

染色表在 `scripts/gtnh_tiers.py`，取自 GTNH 中文 wiki「电力」页面里按等级上色的表，
与 GT 自己的能量仓口贴图一致（MV 橙、HV 金）；MAX 在 GT 里是彩虹，这里按横向彩虹上色。

| 等级 | 主色 | | 等级 | 主色 |
|---|---|---|---|---|
| ULV | `#FF5555` | | ZPM | `#00CED1` |
| LV | `#778899` | | UV | `#008000` |
| MV | `#FF8C00` | | UHV | `#8B0000` |
| HV | `#FFD700` | | UEV | `#8B008B` |
| EV | `#696969` | | UIV | `#0000CD` |
| IV | `#4169E1` | | UXV | `#AA0000` |
| LuV | `#FF00FF` | | MAX | 彩虹 |

生成脚本：`python scripts/build-machine-icons.py`（采矿机 / 制造机 / 单方块发电机）、
`python scripts/build-facility-icons.py`（存电装置 / 净化器 / 计算机 / 研究站）。
两个脚本都从 `gtnh_tiers.py` 取染色，所以各等级的图标颜色是一致的。

**多方块机器不在这张表里** —— 它们是整套结构，图标直接用 wiki 上的整机渲染图，见下一节。

## 已知不足

· 这是**正面视图**，不像 GTNH 里 NEI 那样是 3D 方块渲染。
· 等离子发电机的面片是借来的，不是它自己的贴图。
· 制造机的机型还没定（计划书第二十一章），所以 14 级现在共用同一个面片，只有机壳颜色不同。

## 重新生成

需要那台装了 GTNH 开发环境的机器。步骤：

1. 用 `System.IO.Compression` 从 jar 解出上表里的贴图
2. 在浏览器里用 canvas 按「机壳 → 面片」顺序绘制到 16×16，再最近邻放大到 32×32
3. 以机型 id 命名写回 `src/assets/machines/`

## 矿脉贴图

`src/assets/veins/tN.png` 是**竖排的帧条带**（宽 32，每帧高 32），界面用 CSS `steps()` 逐帧切换，
和 Minecraft 的动画贴图同一套机制。层级照抄原版的矿石方块：

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
| T13 | 时空 | `CUSTOM/spacetime/block1.png` | 113 帧 × 3 tick |

T12 海珀珍没有原版贴图可用（它的材质定义在 GT++，颜色取自
`gtPlusPlus.core.material.MaterialsElements$STANDALONE` 里的 `HYPOGEN`：RGBA {220, 120, 75, 2}），
所以按材料色重绘斑点，保留原有明暗。

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

## 设施图标（存电装置、净化器、计算机、研究站）

四个前缀都是「机壳 + 面片」合成的，机壳统一用 `iconsets/MACHINE_<电压>_SIDE.png`：

| 前缀 | 设施 | 面片 | 开放等级 |
|---|---|---|---|
| `b-<等级>` | 存电装置 | 自己画的电池图案（GT 的储电箱贴图不在开发包里） | MV（tier 3） |
| `p-<等级>` | 净化器 | 自己画的过滤塔图案 | MV（tier 3） |
| `x-<等级>` | 计算机 | `iconsets/EM_COMPUTER.png` | LuV（tier 7） |
| `r-<等级>` | 研究站 | `iconsets/OVERLAY_FRONT_RESEARCH_COMPLETER.png` | LuV（tier 7） |

生成脚本：`python scripts/build-facility-icons.py`，开放等级与 `models.ts`、`numeric/research.ts` 对齐。

## 多方块机器图标（wiki 整机图）

多方块机器在 GTNH 里是**整套结构**，用单方块的「机壳 + 面片」拼出来不像它本来的样子。
所以这类机器的图标改成直接裁用 GTNH 中文 wiki 上的整机渲染图（透明底，多为 256×256）：

```
素材：src/assets/multiblocks/<机型 id>.png（wiki 原图；过大的先缩到 512 长边）
产物：src/assets/machines/<机型 id>.png（32×32，裁掉透明边后按比例缩放）
脚本：python scripts/build-multiblock-icons.py
```

| 机型 | wiki 文件 |
|---|---|
| 大型蒸汽涡轮（HV） | `大型蒸汽涡轮.png` |
| 大型燃气涡轮（EV） | `大型燃气涡轮.png` |
| 特大高压蒸汽涡轮（IV） | `特大高压蒸汽涡轮.png` |
| 特大燃气涡轮（LuV） | `特大燃气涡轮.png` |
| 大型等离子涡轮（ZPM） | `大型等离子涡轮.png` |
| 特大等离子涡轮（UV） | `特大等离子涡轮.png` |
| 大型硅岩反应堆（UHV） | `大型硅岩反应堆.png` |
| 衰变发电机（UEV） | `衰变发电机.png` |
| 戴森云地面单元（UIV） | `戴森云地面单元.png` |
| 湮灭发电机（UXV） | `湮灭发电机.png` |
| 黑洞发电机（MAX） | `亚稳态黑洞遏制场结构导出.png` |

取图说明：

· 中文 wiki 的条目名和图片名都按上面写，图片走 `api.php?action=query&prop=imageinfo` 拿原始 URL
· 「黑洞发电机」在 wiki 上没有同名条目，「亚稳态黑洞遏制场」是同一套黑洞机器的结构图，
  暂借来做图标
· 衰变发电机与湮灭发电机两张原图都是 TecTech 的深蓝结构，缩到 32×32 后差异不大
  （1024 个像素里差 119 个）—— 面板上有机器名，能区分；想更醒目可以换图

已知不足：整机图是渲染图，不是像素画，缩到 32×32 后是柔和的缩略图，
和单方块机型的像素风图标不是一种画法。

重新生成：`python scripts/build-veins.py`（默认从 gradle 缓存里找 jar，可用 `--jar` 指定）。
它会重写 `src/assets/veins/t*.png`、`fx/*.png` 与 `src/game/vein-meta.ts`。

## 打包约定

图标和矿脉条带一律内联进单个 HTML（`vite.config.ts` 把 `assetsInlineLimit` 提到 4 MB），
因为 `scripts/inline-dist.ts` 打包后会删掉 `assets/` 目录 —— 超过阈值的贴图会变成打不开的外部文件。
