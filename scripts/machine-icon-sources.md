# 机器图标的来源与合成方式

`src/assets/machines/<机型 id>.png` 不是手画的，而是**从 GTNH 的方块贴图合成出来的**。

## 素材来源

用户本机 Gradle 缓存里的 GTNH GregTech 开发包：

```
~/.gradle/caches/modules-2/files-2.1/com.github.GTNewHorizons/GT5-Unofficial/5.09.51.472/*/GT5-Unofficial-5.09.51.472-dev.jar
```

贴图在 jar 内的 `assets/gregtech/textures/blocks/` 下。

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

图标都小于 Vite 的 4096 字节内联阈值，打包时会被转成 data URL，所以单文件产物依然自包含。
