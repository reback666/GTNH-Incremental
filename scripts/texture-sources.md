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
| 多方块发电机 | `iconsets/LARGETURBINE_<ST/SS/TU/TI/ADVGAS/NEW>_ACTIVE1.png`，取 16×64 竖条的最上一格 |
| 各级采矿机 | `basicmachines/miner/OVERLAY_FRONT.png` |
| 各级制造机 | `basicmachines/macerator/OVERLAY_FRONT.png` |

机壳按机型的电压等级取，所以同一面片在不同等级下颜色不同、能区分开。

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
| T13 | 龙芯 | `CUSTOM/draconium/ore_OVERLAY.png`（10 帧来回播成 18 帧） | 18 帧 × 4 tick |

`src/assets/veins/fx/` 是原版特殊渲染用的光晕贴图，界面用 CSS mask 上色：
无尽用 `HALO.png`（图标外扩 10/16 的方形暗光晕 + 60% 透明度的脉动重影），
宇宙中子素用 `HALO_FUZZY.png`（8 帧毛边白光晕，白色 30% 透明）。
这两条都对应原版 `InfinityRenderer` 与 `CosmicNeutroniumRenderer` 里的实际参数。

重新生成：`python scripts/build-veins.py`（默认从 gradle 缓存里找 jar，可用 `--jar` 指定）。
它会重写 `src/assets/veins/t*.png`、`fx/*.png` 与 `src/game/vein-meta.ts`。

## 打包约定

图标和矿脉条带一律内联进单个 HTML（`vite.config.ts` 把 `assetsInlineLimit` 提到 4 MB），
因为 `scripts/inline-dist.ts` 打包后会删掉 `assets/` 目录 —— 超过阈值的贴图会变成打不开的外部文件。
