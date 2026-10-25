# gtnh3d 素材清单（ASSETS.md）

> **本文件由 `gtnh3d/tools/extract-assets.py` 自动生成，请勿手工编辑。**

> 重新生成：`python gtnh3d/tools/extract-assets.py`　
校验：`python gtnh3d/tools/extract-assets.py --check`


## 1. 概述

- 用途：gtnh3d 渲染器按 key 静态引用 `gtnh3d/assets/tex/<key>.png`；**key 名即文件名**，必须与渲染器一致。
- 输出规格：`16x16` RGBA PNG；最近邻抽像素（`Image.NEAREST`），不做模糊插值；动态贴图取第 0 帧；保留 alpha。
- 源素材**只读**，运行期不修改/删除资源包与 jar。
- 源容器（按优先级从高到低，同一路径先命中者胜出）：
  1. `modernity-zip`：`D:\Prism\PrismLauncher\instances\GT_New_Horizons_2.8.4_Java_17-25\.minecraft\resourcepacks\Modernity-GTNH-9ebdeed-pre.zip`
  2. `vanilla-jar`：`C:\Users\29797\.gradle\caches\retro_futura_gradle\mc-vanilla\1.7.10\client.jar`
- 幂等：脚本可重复执行；产物内容不变时不会重写，且**无时间戳**，重复运行输出字节一致（sha256 见报告 JSON）。
- 机器可读副本：`gtnh3d/tools/extract-report.json`。

## 2. 统计

| 项 | 值 |
| --- | --- |
| key 总数 | 131 |
| 成功抽取 | **130** |
| 缺失 | 1 |
| 动态贴图（取第 0 帧） | 19 |
| 源尺寸分布 | 16x16 × 111 个，16x64 × 8 个，16x96 × 4 个，16x80 × 3 个，16x512 × 1 个，16x144 × 1 个，16x32 × 1 个，16x48 × 1 个 |

## 3. key 清单

### 3.1 分段索引

| 段 | 说明 | key 数 |
| --- | --- | --- |
| A | A 段 · 机器层 / 机壳 / 覆盖层 / 控制器（渲染器静态 import，必需） | 36 |
| B-floor | B 段 · 地板贴图（floor-<材质>） | 16 |
| B-overlay | B 段 · 机器功能覆盖层（overlay-<machine>-<face>[-active]） | 46 |
| C | C 段 · 多方块 / 装饰 | 9 |
| D | D 段 · 自动化 / 储能 / 杂项（可选） | 23（+1 缺失） |

### 3.2 A 段 · 机器层 / 机壳 / 覆盖层 / 控制器（渲染器静态 import，必需）

| key | 输出文件 | 源容器 | 包内路径 | 源尺寸 | 输出 | 字节 | sha256(12) | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `machine-ulv-side` | `assets/tex/machine-ulv-side.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_ULV_SIDE.png` | 16x16 | 16x16 | 421 | `bc18b617c831` |  |
| `machine-lv-side` | `assets/tex/machine-lv-side.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_LV_SIDE.png` | 16x16 | 16x16 | 308 | `f44d3d324b37` |  |
| `machine-ulv-top` | `assets/tex/machine-ulv-top.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_ULV_TOP.png` | 16x16 | 16x16 | 421 | `bc18b617c831` |  |
| `machine-lv-top` | `assets/tex/machine-lv-top.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_LV_TOP.png` | 16x16 | 16x16 | 308 | `f44d3d324b37` |  |
| `machine-ulv-bottom` | `assets/tex/machine-ulv-bottom.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_ULV_BOTTOM.png` | 16x16 | 16x16 | 421 | `bc18b617c831` |  |
| `machine-lv-bottom` | `assets/tex/machine-lv-bottom.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_LV_BOTTOM.png` | 16x16 | 16x16 | 269 | `6fa1dc524231` |  |
| `casing-ulv` | `assets/tex/casing-ulv.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png` | 16x16 | 16x16 | 360 | `0db66be5d73a` | 分级机壳（GT5U MACHINE_CASINGS）：miscutils iconsets/TieredHulls/CASING_<TIER>.png |
| `casing-lv` | `assets/tex/casing-lv.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_LV.png` | 16x16 | 16x16 | 281 | `9ca54fae3e4c` | 分级机壳（GT5U MACHINE_CASINGS）：miscutils iconsets/TieredHulls/CASING_<TIER>.png |
| `casing-mv` | `assets/tex/casing-mv.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_MV.png` | 16x16 | 16x16 | 344 | `99cf66002969` | 分级机壳（GT5U MACHINE_CASINGS）：miscutils iconsets/TieredHulls/CASING_<TIER>.png |
| `casing-hv` | `assets/tex/casing-hv.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_HV.png` | 16x16 | 16x16 | 409 | `964dfdfd7acd` | 分级机壳（GT5U MACHINE_CASINGS）：miscutils iconsets/TieredHulls/CASING_<TIER>.png |
| `casing-ev` | `assets/tex/casing-ev.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_EV.png` | 16x16 | 16x16 | 391 | `77c5713a96b2` | 分级机壳（GT5U MACHINE_CASINGS）：miscutils iconsets/TieredHulls/CASING_<TIER>.png |
| `casing-iv` | `assets/tex/casing-iv.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_IV.png` | 16x16 | 16x16 | 408 | `cba58cceffe6` | 分级机壳（GT5U MACHINE_CASINGS）：miscutils iconsets/TieredHulls/CASING_<TIER>.png |
| `casing-luv` | `assets/tex/casing-luv.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_LuV.png` | 16x16 | 16x16 | 360 | `3dca95d25541` | 分级机壳（GT5U MACHINE_CASINGS）：miscutils iconsets/TieredHulls/CASING_<TIER>.png |
| `casing-zpm` | `assets/tex/casing-zpm.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ZPM.png` | 16x16 | 16x16 | 407 | `f528046f9893` | 分级机壳（GT5U MACHINE_CASINGS）：miscutils iconsets/TieredHulls/CASING_<TIER>.png |
| `casing-uv` | `assets/tex/casing-uv.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_UV.png` | 16x16 | 16x16 | 423 | `6d202afa209c` | 分级机壳（GT5U MACHINE_CASINGS）：miscutils iconsets/TieredHulls/CASING_<TIER>.png |
| `hull-ulv-side` | `assets/tex/hull-ulv-side.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png` | 16x16 | 16x16 | 360 | `0db66be5d73a` | ULV 机壳块（HULL_* 不存在）；Lead 确认：包内与 jar 内均无 HULL_ULV_*，用 TieredHulls/CASING_ULV.png 填这 3 个 key |
| `hull-ulv-top` | `assets/tex/hull-ulv-top.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png` | 16x16 | 16x16 | 360 | `0db66be5d73a` | ULV 机壳块（HULL_* 不存在）；Lead 确认：包内与 jar 内均无 HULL_ULV_*，用 TieredHulls/CASING_ULV.png 填这 3 个 key |
| `hull-ulv-bottom` | `assets/tex/hull-ulv-bottom.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png` | 16x16 | 16x16 | 360 | `0db66be5d73a` | ULV 机壳块（HULL_* 不存在）；Lead 确认：包内与 jar 内均无 HULL_ULV_*，用 TieredHulls/CASING_ULV.png 填这 3 个 key |
| `overlay-energy-in` | `assets/tex/overlay-energy-in.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_IN.png` | 16x16 | 16x16 | 232 | `14886dddd912` | 基础档（无分级后缀） |
| `overlay-energy-out` | `assets/tex/overlay-energy-out.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_OUT.png` | 16x16 | 16x16 | 234 | `b49946d12140` | 基础档（无分级后缀） |
| `overlay-energy-in-2a` | `assets/tex/overlay-energy-in-2a.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_IN_MULTI_2A.png` | 16x16 | 16x16 | 269 | `6c34d1e0499a` | 非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in\|out>[-<A>A]） |
| `overlay-energy-out-2a` | `assets/tex/overlay-energy-out-2a.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_OUT_MULTI_2A.png` | 16x16 | 16x16 | 307 | `967bf78f51d6` | 非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in\|out>[-<A>A]） |
| `overlay-energy-in-4a` | `assets/tex/overlay-energy-in-4a.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_IN_MULTI_4A.png` | 16x16 | 16x16 | 242 | `63705593bc1a` | 非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in\|out>[-<A>A]） |
| `overlay-energy-out-4a` | `assets/tex/overlay-energy-out-4a.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_OUT_MULTI_4A.png` | 16x16 | 16x16 | 231 | `bec1c71cd45e` | 非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in\|out>[-<A>A]） |
| `overlay-energy-in-16a` | `assets/tex/overlay-energy-in-16a.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_IN_MULTI_16A.png` | 16x16 | 16x16 | 367 | `f7286610416a` | 非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in\|out>[-<A>A]） |
| `overlay-energy-out-16a` | `assets/tex/overlay-energy-out-16a.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_OUT_MULTI_16A.png` | 16x16 | 16x16 | 342 | `96b41f343471` | 非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in\|out>[-<A>A]） |
| `overlay-heat` | `assets/tex/overlay-heat.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_FRONT_HEAT_EXCHANGER.png` | 16x16 | 16x16 | 341 | `65ee56dd8092` | Lead 指定 |
| `overlay-void` | `assets/tex/overlay-void.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/VOID.png` | 16x16 | 16x16 | 75 | `a901afae7bdb` | Lead 指定 |
| `overlay-contamination` | `assets/tex/overlay-contamination.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/POLLUTOR.png` | 16x64 | 16x16 | 371 | `7c98c85f3a7a` | Lead 指定；动态贴图→第 0 帧；已裁帧 |
| `water-still` | `assets/tex/water-still.png` | modernity-zip | `assets/minecraft/textures/blocks/water_still.png` | 16x512 | 16x16 | 369 | `693dedd6d709` | 流体方块（水）静帧；动态贴图（竖直帧条），取第 0 帧；动态贴图→第 0 帧；已裁帧 |
| `casing-bricked-blast-furnace` | `assets/tex/casing-bricked-blast-furnace.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_CASING_BRICKEDBLASTFURNACE_INACTIVE.png` | 16x16 | 16x16 | 410 | `d6e1bcacb27f` | 砖砌高炉外壳（INACTIVE = 未工作态） |
| `casing-bricked-blast-furnace-active` | `assets/tex/casing-bricked-blast-furnace-active.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_CASING_BRICKEDBLASTFURNACE_ACTIVE.png` | 16x16 | 16x16 | 538 | `bde5e121834b` | 砖砌高炉外壳（ACTIVE = 工作态） |
| `casing-heatproof` | `assets/tex/casing-heatproof.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_HEATPROOFCASING.png` | 16x16 | 16x16 | 370 | `16bdb0d9393e` | 耐热外壳；回退：包内无 MACHINE_HEATPROOF.png，改用 MACHINE_HEATPROOFCASING.png（Lead 已确认二选一） |
| `controller-coke-oven` | `assets/tex/controller-coke-oven.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/controllerFaces/cokeOven.png` | 16x16 | 16x16 | 578 | `089fea580130` | 焦炉控制器正面（miscutils controllerFaces） |
| `controller-coke-oven-active` | `assets/tex/controller-coke-oven-active.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/controllerFaces/cokeOvenActive.png` | 16x64 | 16x16 | 574 | `ddc9cfd7a91d` | 焦炉控制器正面（工作态）；动态贴图→第 0 帧；已裁帧 |
| `controller-primitive-blast-furnace` | `assets/tex/controller-primitive-blast-furnace.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_CASING_BRICKEDBLASTFURNACE_ACTIVE.png` | 16x16 | 16x16 | 538 | `bde5e121834b` | 原始高炉控制器；回退（Lead 指定）：包内不存在任何 PRIMITIVEBLASTFURNACE 贴图，改用砖砌高炉砖外壳 ACTIVE 版 |

### 3.3 B 段 · 地板贴图（floor-<材质>）

| key | 输出文件 | 源容器 | 包内路径 | 源尺寸 | 输出 | 字节 | sha256(12) | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `floor-white-concrete` | `assets/tex/floor-white-concrete.png` | modernity-zip | `assets/minecraft/textures/blocks/white_concrete.png` | 16x16 | 16x16 | 293 | `f65bcac1f45e` |  |
| `floor-pink-concrete` | `assets/tex/floor-pink-concrete.png` | modernity-zip | `assets/minecraft/textures/blocks/pink_concrete.png` | 16x16 | 16x16 | 218 | `66431c251d44` | 独立设备场地的默认区块边框 |
| `floor-gray-concrete` | `assets/tex/floor-gray-concrete.png` | modernity-zip | `assets/minecraft/textures/blocks/gray_concrete.png` | 16x16 | 16x16 | 221 | `7c993e22ed2c` |  |
| `floor-black-concrete` | `assets/tex/floor-black-concrete.png` | modernity-zip | `assets/minecraft/textures/blocks/black_concrete.png` | 16x16 | 16x16 | 290 | `670113efe948` |  |
| `floor-cyan-terracotta` | `assets/tex/floor-cyan-terracotta.png` | modernity-zip | `assets/minecraft/textures/blocks/hardened_clay_stained_cyan.png` | 16x16 | 16x16 | 470 | `c33bfaecb6b3` | 1.7.10 无 cyan_terracotta，用同名色系染色硬化粘土 |
| `floor-yellow-terracotta` | `assets/tex/floor-yellow-terracotta.png` | modernity-zip | `assets/minecraft/textures/blocks/hardened_clay_stained_yellow.png` | 16x16 | 16x16 | 491 | `febd87ad4d2e` | 1.7.10 无 yellow_terracotta，用同名色系染色硬化粘土 |
| `floor-moss-block` | `assets/tex/floor-moss-block.png` | modernity-zip | `assets/minecraft/textures/blocks/moss_block.png` | 16x16 | 16x16 | 586 | `65fccb3073d3` | 1.7.10 无 moss_block，取自 Modernity 包 |
| `floor-grass-block` | `assets/tex/floor-grass-block.png` | modernity-zip | `assets/minecraft/textures/blocks/grass_top.png` | 16x16 | 16x16 | 826 | `10be03356cf8` | 1.7.10 grass_block 顶面 = grass_top |
| `floor-bricks` | `assets/tex/floor-bricks.png` | modernity-zip | `assets/minecraft/textures/blocks/brick.png` | 16x16 | 16x16 | 452 | `10d54de67dce` | 1.7.10 bricks 方块贴图 = brick |
| `floor-iron-trapdoor` | `assets/tex/floor-iron-trapdoor.png` | modernity-zip | `assets/minecraft/textures/blocks/iron_trapdoor.png` | 16x16 | 16x16 | 264 | `053aea816baa` |  |
| `floor-verdant-froglight` | `assets/tex/floor-verdant-froglight.png` | modernity-zip | `assets/minecraft/textures/blocks/sea_lantern.png` | 16x80 | 16x16 | 685 | `94efc8ad7156` | 现代 froglight 不存在；Lead 允许 sea_lantern / glowstone 任选；动态贴图→第 0 帧；已裁帧 |
| `floor-pearlescent-froglight` | `assets/tex/floor-pearlescent-froglight.png` | modernity-zip | `assets/minecraft/textures/blocks/glowstone.png` | 16x16 | 16x16 | 811 | `dafaae5bc16c` | 现代 froglight 不存在；与 verdant 取不同源以便视觉可区分（Lead 允许二选一） |
| `floor-polished-diorite` | `assets/tex/floor-polished-diorite.png` | modernity-zip | `assets/minecraft/textures/blocks/polished_diorite.png` | 16x16 | 16x16 | 478 | `bec518245cc2` | 1.7.10 无 polished_diorite（包内自带现代贴图） |
| `floor-polished-granite` | `assets/tex/floor-polished-granite.png` | modernity-zip | `assets/minecraft/textures/blocks/polished_granite.png` | 16x16 | 16x16 | 492 | `d32e42e34902` | 1.7.10 无 polished_granite（包内自带现代贴图） |
| `floor-polished-andesite-slab` | `assets/tex/floor-polished-andesite-slab.png` | modernity-zip | `assets/minecraft/textures/blocks/polished_andesite.png` | 16x16 | 16x16 | 479 | `9cf8a532f173` | 包内无 polished_andesite_slab；用同色磨制安山岩（备选 stone_slab_side.png） |
| `floor-smooth-quartz-slab` | `assets/tex/floor-smooth-quartz-slab.png` | modernity-zip | `assets/minecraft/textures/blocks/quartz_block_side.png` | 16x16 | 16x16 | 251 | `abf78eb4c9da` | Lead 指定：包内无 quartz_slab / smooth_quartz_slab，用石英方块侧面（备选 quartz_block_bottom.png） |
| `floor-polished-diorite-stairs` | `assets/tex/floor-polished-diorite-stairs.png` | modernity-zip | `assets/minecraft/textures/blocks/polished_diorite.png` | 16x16 | 16x16 | 478 | `bec518245cc2` | 蓝图仅 56 格，阶梯细节可忽略；用同色磨制闪长岩 |

### 3.4 B 段 · 机器功能覆盖层（overlay-<machine>-<face>[-active]）

| key | 输出文件 | 源容器 | 包内路径 | 源尺寸 | 输出 | 字节 | sha256(12) | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `overlay-macerator-front` | `assets/tex/overlay-macerator-front.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/macerator/OVERLAY_FRONT.png` | 16x16 | 16x16 | 226 | `76eb2f508ca3` | basicmachines/macerator/OVERLAY_FRONT.png |
| `overlay-macerator-front-active` | `assets/tex/overlay-macerator-front-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/macerator/OVERLAY_FRONT_ACTIVE.png` | 16x96 | 16x16 | 302 | `322770f87c41` | basicmachines/macerator/OVERLAY_FRONT_ACTIVE.png（动态贴图取第 0 帧）；动态贴图→第 0 帧；已裁帧 |
| `overlay-macerator-top` | `assets/tex/overlay-macerator-top.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/macerator/OVERLAY_TOP.png` | 16x16 | 16x16 | 196 | `2f16404123c9` | basicmachines/macerator/OVERLAY_TOP.png |
| `overlay-macerator-top-active` | `assets/tex/overlay-macerator-top-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/macerator/OVERLAY_TOP_ACTIVE.png` | 16x64 | 16x16 | 196 | `2f16404123c9` | basicmachines/macerator/OVERLAY_TOP_ACTIVE.png（动态贴图取第 0 帧）；动态贴图→第 0 帧；已裁帧 |
| `overlay-alloy-smelter-bottom` | `assets/tex/overlay-alloy-smelter-bottom.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/alloy_smelter/OVERLAY_BOTTOM.png` | 16x16 | 16x16 | 75 | `a901afae7bdb` | basicmachines/alloy_smelter/OVERLAY_BOTTOM.png |
| `overlay-alloy-smelter-bottom-active` | `assets/tex/overlay-alloy-smelter-bottom-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/alloy_smelter/OVERLAY_BOTTOM_ACTIVE.png` | 16x16 | 16x16 | 75 | `a901afae7bdb` | basicmachines/alloy_smelter/OVERLAY_BOTTOM_ACTIVE.png（动态贴图取第 0 帧） |
| `overlay-alloy-smelter-front` | `assets/tex/overlay-alloy-smelter-front.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/alloy_smelter/OVERLAY_FRONT.png` | 16x16 | 16x16 | 195 | `b8de7ce6b94a` | basicmachines/alloy_smelter/OVERLAY_FRONT.png |
| `overlay-alloy-smelter-front-active` | `assets/tex/overlay-alloy-smelter-front-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/alloy_smelter/OVERLAY_FRONT_ACTIVE.png` | 16x16 | 16x16 | 243 | `7a1868ceee98` | basicmachines/alloy_smelter/OVERLAY_FRONT_ACTIVE.png（动态贴图取第 0 帧） |
| `overlay-alloy-smelter-side` | `assets/tex/overlay-alloy-smelter-side.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/alloy_smelter/OVERLAY_SIDE.png` | 16x16 | 16x16 | 75 | `a901afae7bdb` | basicmachines/alloy_smelter/OVERLAY_SIDE.png |
| `overlay-alloy-smelter-side-active` | `assets/tex/overlay-alloy-smelter-side-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/alloy_smelter/OVERLAY_SIDE_ACTIVE.png` | 16x16 | 16x16 | 75 | `a901afae7bdb` | basicmachines/alloy_smelter/OVERLAY_SIDE_ACTIVE.png（动态贴图取第 0 帧） |
| `overlay-alloy-smelter-top` | `assets/tex/overlay-alloy-smelter-top.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/alloy_smelter/OVERLAY_TOP.png` | 16x16 | 16x16 | 75 | `a901afae7bdb` | basicmachines/alloy_smelter/OVERLAY_TOP.png |
| `overlay-alloy-smelter-top-active` | `assets/tex/overlay-alloy-smelter-top-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/alloy_smelter/OVERLAY_TOP_ACTIVE.png` | 16x16 | 16x16 | 75 | `a901afae7bdb` | basicmachines/alloy_smelter/OVERLAY_TOP_ACTIVE.png（动态贴图取第 0 帧） |
| `overlay-compressor-front` | `assets/tex/overlay-compressor-front.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/compressor/OVERLAY_FRONT.png` | 16x16 | 16x16 | 185 | `bb27608f2cdd` | basicmachines/compressor/OVERLAY_FRONT.png |
| `overlay-compressor-front-active` | `assets/tex/overlay-compressor-front-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/compressor/OVERLAY_FRONT_ACTIVE.png` | 16x144 | 16x16 | 185 | `bb27608f2cdd` | basicmachines/compressor/OVERLAY_FRONT_ACTIVE.png（动态贴图取第 0 帧）；动态贴图→第 0 帧；已裁帧 |
| `overlay-compressor-side` | `assets/tex/overlay-compressor-side.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/compressor/OVERLAY_SIDE.png` | 16x16 | 16x16 | 215 | `062a41c98981` | basicmachines/compressor/OVERLAY_SIDE.png |
| `overlay-compressor-side-active` | `assets/tex/overlay-compressor-side-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/compressor/OVERLAY_SIDE_ACTIVE.png` | 16x32 | 16x16 | 215 | `062a41c98981` | basicmachines/compressor/OVERLAY_SIDE_ACTIVE.png（动态贴图取第 0 帧）；动态贴图→第 0 帧；已裁帧 |
| `overlay-compressor-top` | `assets/tex/overlay-compressor-top.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/compressor/OVERLAY_TOP.png` | 16x16 | 16x16 | 75 | `a901afae7bdb` | basicmachines/compressor/OVERLAY_TOP.png |
| `overlay-compressor-top-active` | `assets/tex/overlay-compressor-top-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/compressor/OVERLAY_TOP_ACTIVE.png` | 16x16 | 16x16 | 75 | `a901afae7bdb` | basicmachines/compressor/OVERLAY_TOP_ACTIVE.png（动态贴图取第 0 帧） |
| `overlay-extractor-front` | `assets/tex/overlay-extractor-front.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/extractor/OVERLAY_FRONT.png` | 16x16 | 16x16 | 203 | `ed4a0f2a7f6c` | basicmachines/extractor/OVERLAY_FRONT.png |
| `overlay-extractor-front-active` | `assets/tex/overlay-extractor-front-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/extractor/OVERLAY_FRONT_ACTIVE.png` | 16x80 | 16x16 | 289 | `e682652c68d7` | basicmachines/extractor/OVERLAY_FRONT_ACTIVE.png（动态贴图取第 0 帧）；动态贴图→第 0 帧；已裁帧 |
| `overlay-extractor-side` | `assets/tex/overlay-extractor-side.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/extractor/OVERLAY_SIDE.png` | 16x16 | 16x16 | 159 | `34e1fd06dddb` | basicmachines/extractor/OVERLAY_SIDE.png |
| `overlay-extractor-side-active` | `assets/tex/overlay-extractor-side-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/extractor/OVERLAY_SIDE_ACTIVE.png` | 16x16 | 16x16 | 166 | `41f71af3fce4` | basicmachines/extractor/OVERLAY_SIDE_ACTIVE.png（动态贴图取第 0 帧） |
| `overlay-extractor-top` | `assets/tex/overlay-extractor-top.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/extractor/OVERLAY_TOP.png` | 16x16 | 16x16 | 149 | `f510800d6219` | basicmachines/extractor/OVERLAY_TOP.png |
| `overlay-extractor-top-active` | `assets/tex/overlay-extractor-top-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/extractor/OVERLAY_TOP_ACTIVE.png` | 16x16 | 16x16 | 178 | `99be8639aeed` | basicmachines/extractor/OVERLAY_TOP_ACTIVE.png（动态贴图取第 0 帧） |
| `overlay-electric-furnace-front` | `assets/tex/overlay-electric-furnace-front.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/electric_furnace/OVERLAY_FRONT.png` | 16x16 | 16x16 | 192 | `ca1db16bbeaf` | basicmachines/electric_furnace/OVERLAY_FRONT.png |
| `overlay-electric-furnace-front-active` | `assets/tex/overlay-electric-furnace-front-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/electric_furnace/OVERLAY_FRONT_ACTIVE.png` | 16x16 | 16x16 | 245 | `b69a055b1b68` | basicmachines/electric_furnace/OVERLAY_FRONT_ACTIVE.png（动态贴图取第 0 帧） |
| `overlay-wiremill-front` | `assets/tex/overlay-wiremill-front.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/wiremill/OVERLAY_FRONT.png` | 16x16 | 16x16 | 195 | `1eacd73aa7f1` | basicmachines/wiremill/OVERLAY_FRONT.png |
| `overlay-wiremill-front-active` | `assets/tex/overlay-wiremill-front-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/wiremill/OVERLAY_FRONT_ACTIVE.png` | 16x48 | 16x16 | 296 | `57d2adeb7829` | basicmachines/wiremill/OVERLAY_FRONT_ACTIVE.png（动态贴图取第 0 帧）；动态贴图→第 0 帧；已裁帧 |
| `overlay-wiremill-side` | `assets/tex/overlay-wiremill-side.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/wiremill/OVERLAY_SIDE.png` | 16x16 | 16x16 | 144 | `b5f2dd07bee0` | basicmachines/wiremill/OVERLAY_SIDE.png |
| `overlay-wiremill-side-active` | `assets/tex/overlay-wiremill-side-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/wiremill/OVERLAY_SIDE_ACTIVE.png` | 16x16 | 16x16 | 153 | `5d2dc99090cf` | basicmachines/wiremill/OVERLAY_SIDE_ACTIVE.png（动态贴图取第 0 帧） |
| `overlay-wiremill-top` | `assets/tex/overlay-wiremill-top.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/wiremill/OVERLAY_TOP.png` | 16x16 | 16x16 | 293 | `d45cd3a96135` | basicmachines/wiremill/OVERLAY_TOP.png |
| `overlay-wiremill-top-active` | `assets/tex/overlay-wiremill-top-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/wiremill/OVERLAY_TOP_ACTIVE.png` | 16x16 | 16x16 | 332 | `e6903e2eef6d` | basicmachines/wiremill/OVERLAY_TOP_ACTIVE.png（动态贴图取第 0 帧） |
| `overlay-hammer-front` | `assets/tex/overlay-hammer-front.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/hammer/OVERLAY_FRONT.png` | 16x16 | 16x16 | 201 | `bef2c6afc2f4` | basicmachines/hammer/OVERLAY_FRONT.png |
| `overlay-hammer-front-active` | `assets/tex/overlay-hammer-front-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/hammer/OVERLAY_FRONT_ACTIVE.png` | 16x80 | 16x16 | 201 | `bef2c6afc2f4` | basicmachines/hammer/OVERLAY_FRONT_ACTIVE.png（动态贴图取第 0 帧）；动态贴图→第 0 帧；已裁帧 |
| `overlay-fluid-heater-front` | `assets/tex/overlay-fluid-heater-front.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/fluid_heater/OVERLAY_FRONT.png` | 16x16 | 16x16 | 220 | `be797d37c28e` | basicmachines/fluid_heater/OVERLAY_FRONT.png |
| `overlay-fluid-heater-front-active` | `assets/tex/overlay-fluid-heater-front-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/fluid_heater/OVERLAY_FRONT_ACTIVE.png` | 16x96 | 16x16 | 323 | `0cd0ff38eb33` | basicmachines/fluid_heater/OVERLAY_FRONT_ACTIVE.png（动态贴图取第 0 帧）；动态贴图→第 0 帧；已裁帧 |
| `overlay-fluid-heater-side` | `assets/tex/overlay-fluid-heater-side.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/fluid_heater/OVERLAY_SIDE.png` | 16x16 | 16x16 | 146 | `eee909f05a27` | basicmachines/fluid_heater/OVERLAY_SIDE.png |
| `overlay-fluid-heater-side-active` | `assets/tex/overlay-fluid-heater-side-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/fluid_heater/OVERLAY_SIDE_ACTIVE.png` | 16x16 | 16x16 | 150 | `51c2fc8c8bee` | basicmachines/fluid_heater/OVERLAY_SIDE_ACTIVE.png（动态贴图取第 0 帧） |
| `overlay-fluid-heater-top` | `assets/tex/overlay-fluid-heater-top.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/fluid_heater/OVERLAY_TOP.png` | 16x16 | 16x16 | 149 | `f510800d6219` | basicmachines/fluid_heater/OVERLAY_TOP.png |
| `overlay-fluid-heater-top-active` | `assets/tex/overlay-fluid-heater-top-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/fluid_heater/OVERLAY_TOP_ACTIVE.png` | 16x16 | 16x16 | 185 | `97792a63e5e3` | basicmachines/fluid_heater/OVERLAY_TOP_ACTIVE.png（动态贴图取第 0 帧） |
| `overlay-fluid-solidifier-front` | `assets/tex/overlay-fluid-solidifier-front.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/fluid_solidifier/OVERLAY_FRONT.png` | 16x16 | 16x16 | 202 | `824547cb0763` | basicmachines/fluid_solidifier/OVERLAY_FRONT.png |
| `overlay-fluid-solidifier-front-active` | `assets/tex/overlay-fluid-solidifier-front-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/fluid_solidifier/OVERLAY_FRONT_ACTIVE.png` | 16x96 | 16x16 | 293 | `c86762c5a069` | basicmachines/fluid_solidifier/OVERLAY_FRONT_ACTIVE.png（动态贴图取第 0 帧）；动态贴图→第 0 帧；已裁帧 |
| `overlay-ore-washer-front` | `assets/tex/overlay-ore-washer-front.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/ore_washer/OVERLAY_FRONT.png` | 16x16 | 16x16 | 186 | `a605350ff92c` | basicmachines/ore_washer/OVERLAY_FRONT.png |
| `overlay-ore-washer-front-active` | `assets/tex/overlay-ore-washer-front-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/ore_washer/OVERLAY_FRONT_ACTIVE.png` | 16x96 | 16x16 | 235 | `4c169f95f090` | basicmachines/ore_washer/OVERLAY_FRONT_ACTIVE.png（动态贴图取第 0 帧）；动态贴图→第 0 帧；已裁帧 |
| `overlay-ore-washer-side` | `assets/tex/overlay-ore-washer-side.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/ore_washer/OVERLAY_SIDE.png` | 16x16 | 16x16 | 137 | `321f33f9eaf2` | basicmachines/ore_washer/OVERLAY_SIDE.png |
| `overlay-ore-washer-side-active` | `assets/tex/overlay-ore-washer-side-active.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/ore_washer/OVERLAY_SIDE_ACTIVE.png` | 16x16 | 16x16 | 137 | `321f33f9eaf2` | basicmachines/ore_washer/OVERLAY_SIDE_ACTIVE.png（动态贴图取第 0 帧） |

### 3.5 C 段 · 多方块 / 装饰

| key | 输出文件 | 源容器 | 包内路径 | 源尺寸 | 输出 | 字节 | sha256(12) | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `multiblock-bronze-firebox` | `assets/tex/multiblock-bronze-firebox.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_CASING_FIREBOX_BRONZE.png` | 16x16 | 16x16 | 423 | `3a17fd9e6bfd` |  |
| `multiblock-bronze-plated-brick` | `assets/tex/multiblock-bronze-plated-brick.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_BRONZEPLATEDBRICKS.png` | 16x16 | 16x16 | 462 | `a73d7e7db7c5` |  |
| `multiblock-coke-oven-brick` | `assets/tex/multiblock-coke-oven-brick.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_CASING_BRICKEDBLASTFURNACE_INACTIVE.png` | 16x16 | 16x16 | 410 | `d6e1bcacb27f` | 近似：GT5U 无 COKEOVEN 外壳名，焦炉砖最接近砖砌高炉外壳 INACTIVE |
| `multiblock-heat-proof-casing` | `assets/tex/multiblock-heat-proof-casing.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_HEATPROOFCASING.png` | 16x16 | 16x16 | 370 | `16bdb0d9393e` |  |
| `multiblock-solid-steel-casing` | `assets/tex/multiblock-solid-steel-casing.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_CASING_SOLID_STEEL.png` | 16x16 | 16x16 | 425 | `1f032e237619` |  |
| `multiblock-steel-firebox` | `assets/tex/multiblock-steel-firebox.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_CASING_FIREBOX_STEEL.png` | 16x16 | 16x16 | 390 | `8e82082b5019` |  |
| `multiblock-steel-plated` | `assets/tex/multiblock-steel-plated.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_STEELBRICKS_SIDE.png` | 16x16 | 16x16 | 403 | `1ba55f0a5d58` | 近似：包内无 STEELPLATED 名；用钢砖外壳族 MACHINE_STEELBRICKS_{SIDE,TOP,BOTTOM} 的 SIDE |
| `multiblock-blast-furnace-casing` | `assets/tex/multiblock-blast-furnace-casing.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/MACHINE_BRONZEBLASTFURNACE.png` | 16x16 | 16x16 | 410 | `d6e1bcacb27f` | 近似：用青铜高炉外壳（砖砌外壳已分配给 coke-oven-brick） |
| `multiblock-boiler-casing` | `assets/tex/multiblock-boiler-casing.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/BOILER_FRONT.png` | 16x16 | 16x16 | 129 | `1ed2ba5b4658` | 近似：包内无 BOILER_CASING，用锅炉正面 BOILER_FRONT |

### 3.6 D 段 · 自动化 / 储能 / 杂项（可选）

| key | 输出文件 | 源容器 | 包内路径 | 源尺寸 | 输出 | 字节 | sha256(12) | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `automation-chest-buffer-ulv` | `assets/tex/automation-chest-buffer-ulv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_CHESTBUFFER.png` | 16x64 | 16x16 | 437 | `d0b5f56686b1` | GT5U 的 AUTOMATION_CHESTBUFFER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用；动态贴图→第 0 帧；已裁帧 |
| `automation-chest-buffer-lv` | `assets/tex/automation-chest-buffer-lv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_CHESTBUFFER.png` | 16x64 | 16x16 | 437 | `d0b5f56686b1` | GT5U 的 AUTOMATION_CHESTBUFFER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用；动态贴图→第 0 帧；已裁帧 |
| `automation-filter-ulv` | `assets/tex/automation-filter-ulv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_FILTER.png` | 16x16 | 16x16 | 427 | `b68e015c91e1` | GT5U 的 AUTOMATION_FILTER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用 |
| `automation-filter-lv` | `assets/tex/automation-filter-lv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_FILTER.png` | 16x16 | 16x16 | 427 | `b68e015c91e1` | GT5U 的 AUTOMATION_FILTER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用 |
| `automation-item-distributor-ulv` | `assets/tex/automation-item-distributor-ulv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_ITEMDISTRIBUTOR.png` | 16x16 | 16x16 | 440 | `d3755d60855e` | GT5U 的 AUTOMATION_ITEMDISTRIBUTOR 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用 |
| `automation-item-distributor-lv` | `assets/tex/automation-item-distributor-lv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_ITEMDISTRIBUTOR.png` | 16x16 | 16x16 | 440 | `d3755d60855e` | GT5U 的 AUTOMATION_ITEMDISTRIBUTOR 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用 |
| `automation-recipe-filter-ulv` | `assets/tex/automation-recipe-filter-ulv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_RECIPEFILTER.png` | 16x16 | 16x16 | 404 | `f02c2128fc6c` | GT5U 的 AUTOMATION_RECIPEFILTER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用 |
| `automation-recipe-filter-lv` | `assets/tex/automation-recipe-filter-lv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_RECIPEFILTER.png` | 16x16 | 16x16 | 404 | `f02c2128fc6c` | GT5U 的 AUTOMATION_RECIPEFILTER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用 |
| `automation-regulator-ulv` | `assets/tex/automation-regulator-ulv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_REGULATOR.png` | 16x16 | 16x16 | 438 | `b8a91527b529` | GT5U 的 AUTOMATION_REGULATOR 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用 |
| `automation-regulator-lv` | `assets/tex/automation-regulator-lv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_REGULATOR.png` | 16x16 | 16x16 | 438 | `b8a91527b529` | GT5U 的 AUTOMATION_REGULATOR 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用 |
| `automation-super-buffer-ulv` | `assets/tex/automation-super-buffer-ulv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_SUPERBUFFER.png` | 16x64 | 16x16 | 435 | `009ec4183069` | GT5U 的 AUTOMATION_SUPERBUFFER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用；动态贴图→第 0 帧；已裁帧 |
| `automation-super-buffer-lv` | `assets/tex/automation-super-buffer-lv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_SUPERBUFFER.png` | 16x64 | 16x16 | 435 | `009ec4183069` | GT5U 的 AUTOMATION_SUPERBUFFER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用；动态贴图→第 0 帧；已裁帧 |
| `automation-type-filter-ulv` | `assets/tex/automation-type-filter-ulv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_TYPEFILTER.png` | 16x16 | 16x16 | 427 | `b68e015c91e1` | GT5U 的 AUTOMATION_TYPEFILTER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用 |
| `automation-type-filter-lv` | `assets/tex/automation-type-filter-lv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/AUTOMATION_TYPEFILTER.png` | 16x16 | 16x16 | 427 | `b68e015c91e1` | GT5U 的 AUTOMATION_TYPEFILTER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用 |
| `battery-buffer-1by1-ulv` | `assets/tex/battery-buffer-1by1-ulv.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png` | 16x16 | 16x16 | 360 | `0db66be5d73a` | 电池缓冲器 1x1；MTEBuffer.class 只引用 MACHINE_CASINGS + OVERLAY_BUTTON_*/OVERLAY_PIPE_OUT，该机器无专属整机贴图；按真实渲染落盘为 ULV 机壳 |
| `battery-buffer-2by2-ulv` | `assets/tex/battery-buffer-2by2-ulv.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png` | 16x16 | 16x16 | 360 | `0db66be5d73a` | 电池缓冲器 2x2；同上：无专属贴图，落盘为 ULV 机壳（BATTERY_BUFFER_2_BY_2_ULV 仅为注册 ID） |
| `charger-4by4-ulv` | `assets/tex/charger-4by4-ulv.png` | modernity-zip | `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png` | 16x16 | 16x16 | 360 | `0db66be5d73a` | 充电器 4x4；MTECharger.class 无任何 iconsets 常量 -> 渲染 = 分级机壳；按真实渲染落盘为 ULV 机壳 |
| `turbo-charger-4by4-ulv` | `assets/tex/turbo-charger-4by4-ulv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_OUT_MULTI_16A_ULV.png` | 16x16 | 16x16 | 335 | `9d0c2284889c` | 涡轮充电器 4x4；MTETurboCharger.class 引用 MACHINE_CASINGS + OVERLAYS_ENERGY_OUT_MULTI_16A，故正面取 ULV 的 16A 输出覆盖层 |
| `energy-buffer-1by1-ulv` | `assets/tex/energy-buffer-1by1-ulv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_OUT_MULTI_BUFFER_ULV.png` | 16x16 | 16x16 | 375 | `f4bbdec50b66` | GT++ 储能缓冲器 1x1；GT++ 储能缓冲（MTEHatchDynamoBuffer.class）引用 OVERLAYS_ENERGY_OUT_MULTI_BUFFER |
| `locker-ulv` | `assets/tex/locker-ulv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_LOCKER.png` | 16x16 | 16x16 | 497 | `a848090dc201` | 储物柜；MTELocker.class 引用 BlockIcons.LOCKERS(OVERLAY_LOCKER_000..013) 与 OVERLAY_LOCKER |
| `super-tank-ulv` | `assets/tex/super-tank-ulv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_STANK.png` | 16x64 | 16x16 | 233 | `0758c8891e38` | 超级储罐；BlockIcons.OVERLAY_STANK（super tank）；无整机贴图，取该机器覆盖层；动态贴图→第 0 帧；已裁帧 |
| `gtfuidtank-ulv` | `assets/tex/gtfuidtank-ulv.png` | modernity-zip | `assets/gregtech/textures/blocks/iconsets/OVERLAY_SIDE_FLUIDTANK.png` | 16x16 | 16x16 | 174 | `fdc9f1955161` | GT++ 分级流体储罐；GT++ MTETieredTank.class 引用 MACHINE_CASINGS + OVERLAY_SIDE_FLUIDTANK/OVERLAY_TOP_FLUIDTANK |
| `simple-washer` | `assets/tex/simple-washer.png` | modernity-zip | `assets/gregtech/textures/blocks/basicmachines/simple_washer/OVERLAY_FRONT.png` | 16x16 | 16x16 | 186 | `a605350ff92c` | 简易洗矿机；GT5U 机器目录 basicmachines/simple_washer 的正面覆盖层（另有 OVERLAY_FRONT_STEAM_WASHER 蒸汽变体） |

## 4. 缺失 key（无法从任一源解析）

| key | 段 | 已尝试路径 | 说明 |
| --- | --- | --- | --- |
| `em-machine-ulv` | D | （未给出候选路径） | 缺失：包内与 jar 内均无 EM_MACHINE_* 贴图，且无 class 引用 EM_MACHINE 常量 |

## 5. 回退与近似说明

以下 key 并非「同名精确命中」，已在清单备注中逐条标注，供 Lead 复核：

1. `hull-ulv-side` → `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png`：Lead 确认：包内与 jar 内均无 HULL_ULV_*，用 TieredHulls/CASING_ULV.png 填这 3 个 key
2. `hull-ulv-top` → `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png`：Lead 确认：包内与 jar 内均无 HULL_ULV_*，用 TieredHulls/CASING_ULV.png 填这 3 个 key
3. `hull-ulv-bottom` → `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png`：Lead 确认：包内与 jar 内均无 HULL_ULV_*，用 TieredHulls/CASING_ULV.png 填这 3 个 key
4. `overlay-energy-in-2a` → `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_IN_MULTI_2A.png`：非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in|out>[-<A>A]）
5. `overlay-energy-out-2a` → `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_OUT_MULTI_2A.png`：非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in|out>[-<A>A]）
6. `overlay-energy-in-4a` → `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_IN_MULTI_4A.png`：非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in|out>[-<A>A]）
7. `overlay-energy-out-4a` → `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_OUT_MULTI_4A.png`：非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in|out>[-<A>A]）
8. `overlay-energy-in-16a` → `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_IN_MULTI_16A.png`：非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in|out>[-<A>A]）
9. `overlay-energy-out-16a` → `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_OUT_MULTI_16A.png`：非分级安培后缀变体（task spec 第 23 行 overlay-energy-<in|out>[-<A>A]）
10. `water-still` → `assets/minecraft/textures/blocks/water_still.png`：动态贴图（竖直帧条），取第 0 帧
11. `casing-heatproof` → `assets/gregtech/textures/blocks/iconsets/MACHINE_HEATPROOFCASING.png`：回退：包内无 MACHINE_HEATPROOF.png，改用 MACHINE_HEATPROOFCASING.png（Lead 已确认二选一）
12. `controller-primitive-blast-furnace` → `assets/gregtech/textures/blocks/iconsets/MACHINE_CASING_BRICKEDBLASTFURNACE_ACTIVE.png`：回退（Lead 指定）：包内不存在任何 PRIMITIVEBLASTFURNACE 贴图，改用砖砌高炉砖外壳 ACTIVE 版
13. `floor-cyan-terracotta` → `assets/minecraft/textures/blocks/hardened_clay_stained_cyan.png`：1.7.10 无 cyan_terracotta，用同名色系染色硬化粘土
14. `floor-yellow-terracotta` → `assets/minecraft/textures/blocks/hardened_clay_stained_yellow.png`：1.7.10 无 yellow_terracotta，用同名色系染色硬化粘土
15. `floor-verdant-froglight` → `assets/minecraft/textures/blocks/sea_lantern.png`：现代 froglight 不存在；Lead 允许 sea_lantern / glowstone 任选
16. `floor-pearlescent-froglight` → `assets/minecraft/textures/blocks/glowstone.png`：现代 froglight 不存在；与 verdant 取不同源以便视觉可区分（Lead 允许二选一）
17. `floor-polished-andesite-slab` → `assets/minecraft/textures/blocks/polished_andesite.png`：包内无 polished_andesite_slab；用同色磨制安山岩（备选 stone_slab_side.png）
18. `floor-smooth-quartz-slab` → `assets/minecraft/textures/blocks/quartz_block_side.png`：Lead 指定：包内无 quartz_slab / smooth_quartz_slab，用石英方块侧面（备选 quartz_block_bottom.png）
19. `floor-polished-diorite-stairs` → `assets/minecraft/textures/blocks/polished_diorite.png`：蓝图仅 56 格，阶梯细节可忽略；用同色磨制闪长岩
20. `multiblock-coke-oven-brick` → `assets/gregtech/textures/blocks/iconsets/MACHINE_CASING_BRICKEDBLASTFURNACE_INACTIVE.png`：近似：GT5U 无 COKEOVEN 外壳名，焦炉砖最接近砖砌高炉外壳 INACTIVE
21. `multiblock-steel-plated` → `assets/gregtech/textures/blocks/iconsets/MACHINE_STEELBRICKS_SIDE.png`：近似：包内无 STEELPLATED 名；用钢砖外壳族 MACHINE_STEELBRICKS_{SIDE,TOP,BOTTOM} 的 SIDE
22. `multiblock-blast-furnace-casing` → `assets/gregtech/textures/blocks/iconsets/MACHINE_BRONZEBLASTFURNACE.png`：近似：用青铜高炉外壳（砖砌外壳已分配给 coke-oven-brick）
23. `multiblock-boiler-casing` → `assets/gregtech/textures/blocks/iconsets/BOILER_FRONT.png`：近似：包内无 BOILER_CASING，用锅炉正面 BOILER_FRONT
24. `automation-chest-buffer-ulv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_CHESTBUFFER.png`：GT5U 的 AUTOMATION_CHESTBUFFER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
25. `automation-chest-buffer-lv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_CHESTBUFFER.png`：GT5U 的 AUTOMATION_CHESTBUFFER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
26. `automation-filter-ulv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_FILTER.png`：GT5U 的 AUTOMATION_FILTER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
27. `automation-filter-lv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_FILTER.png`：GT5U 的 AUTOMATION_FILTER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
28. `automation-item-distributor-ulv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_ITEMDISTRIBUTOR.png`：GT5U 的 AUTOMATION_ITEMDISTRIBUTOR 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
29. `automation-item-distributor-lv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_ITEMDISTRIBUTOR.png`：GT5U 的 AUTOMATION_ITEMDISTRIBUTOR 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
30. `automation-recipe-filter-ulv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_RECIPEFILTER.png`：GT5U 的 AUTOMATION_RECIPEFILTER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
31. `automation-recipe-filter-lv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_RECIPEFILTER.png`：GT5U 的 AUTOMATION_RECIPEFILTER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
32. `automation-regulator-ulv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_REGULATOR.png`：GT5U 的 AUTOMATION_REGULATOR 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
33. `automation-regulator-lv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_REGULATOR.png`：GT5U 的 AUTOMATION_REGULATOR 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
34. `automation-super-buffer-ulv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_SUPERBUFFER.png`：GT5U 的 AUTOMATION_SUPERBUFFER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
35. `automation-super-buffer-lv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_SUPERBUFFER.png`：GT5U 的 AUTOMATION_SUPERBUFFER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
36. `automation-type-filter-ulv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_TYPEFILTER.png`：GT5U 的 AUTOMATION_TYPEFILTER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
37. `automation-type-filter-lv` → `assets/gregtech/textures/blocks/iconsets/AUTOMATION_TYPEFILTER.png`：GT5U 的 AUTOMATION_TYPEFILTER 为 tier-agnostic 单贴图（无分级变体），ULV/LV 共用
38. `battery-buffer-1by1-ulv` → `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png`：MTEBuffer.class 只引用 MACHINE_CASINGS + OVERLAY_BUTTON_*/OVERLAY_PIPE_OUT，该机器无专属整机贴图；按真实渲染落盘为 ULV 机壳
39. `battery-buffer-2by2-ulv` → `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png`：同上：无专属贴图，落盘为 ULV 机壳（BATTERY_BUFFER_2_BY_2_ULV 仅为注册 ID）
40. `charger-4by4-ulv` → `assets/miscutils/textures/blocks/iconsets/TieredHulls/CASING_ULV.png`：MTECharger.class 无任何 iconsets 常量 -> 渲染 = 分级机壳；按真实渲染落盘为 ULV 机壳
41. `turbo-charger-4by4-ulv` → `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_OUT_MULTI_16A_ULV.png`：MTETurboCharger.class 引用 MACHINE_CASINGS + OVERLAYS_ENERGY_OUT_MULTI_16A，故正面取 ULV 的 16A 输出覆盖层
42. `energy-buffer-1by1-ulv` → `assets/gregtech/textures/blocks/iconsets/OVERLAY_ENERGY_OUT_MULTI_BUFFER_ULV.png`：GT++ 储能缓冲（MTEHatchDynamoBuffer.class）引用 OVERLAYS_ENERGY_OUT_MULTI_BUFFER
43. `locker-ulv` → `assets/gregtech/textures/blocks/iconsets/OVERLAY_LOCKER.png`：MTELocker.class 引用 BlockIcons.LOCKERS(OVERLAY_LOCKER_000..013) 与 OVERLAY_LOCKER
44. `super-tank-ulv` → `assets/gregtech/textures/blocks/iconsets/OVERLAY_STANK.png`：BlockIcons.OVERLAY_STANK（super tank）；无整机贴图，取该机器覆盖层
45. `gtfuidtank-ulv` → `assets/gregtech/textures/blocks/iconsets/OVERLAY_SIDE_FLUIDTANK.png`：GT++ MTETieredTank.class 引用 MACHINE_CASINGS + OVERLAY_SIDE_FLUIDTANK/OVERLAY_TOP_FLUIDTANK
46. `simple-washer` → `assets/gregtech/textures/blocks/basicmachines/simple_washer/OVERLAY_FRONT.png`：GT5U 机器目录 basicmachines/simple_washer 的正面覆盖层（另有 OVERLAY_FRONT_STEAM_WASHER 蒸汽变体）

其它通用回退规则：
- 1.7.10 不存在的现代方块贴图，一律回退到**同色系 1.7.10 贴图**或包内自带现代贴图，逐条记录于上表。
- 非方形贴图（竖直帧条）裁第 0 帧后再最近邻降到 16x16。
- 源与输出同为 16x16 的贴图不重采样，直接落盘。

## 6. GT5U 机器贴图装配规格

下表用于说明「哪些机器有专属整机贴图、哪些是外壳+覆盖层拼装」，
以便渲染器在缺少某一 face 时按规则回退（结论均由 `javap` 级常量池扫描 + 包内文件清单实测得出）。

| 机器 / 部件 | 是否有专属整机贴图 | 实际装配规则（证据） |
| --- | --- | --- |
| 机器外壳层 `machine-<tier>-<face>` | 有 | `gregtech iconsets/MACHINE_<TIER>_{SIDE,TOP,BOTTOM}.png`（ULV/LV 两档） |
| 分级机壳 `casing-<tier>` | 有 | `miscutils iconsets/TieredHulls/CASING_<TIER>.png`（ULV…UV 共 9 档 + MAX）。包内**没有** `MACHINE_CASING_<TIER>.png`，也**没有** `HULL_<TIER>_*` |
| 机器功能层 `overlay-<machine>-<face>[-active]` | 有 | `basicmachines/<machine>/OVERLAY_<FACE>.png` / `OVERLAY_<FACE>_ACTIVE.png`（仅少数机器有 SIDE/TOP/BOTTOM，缺的 face 由渲染器用机器外壳回退） |
| 电池缓冲器 `BATTERY_BUFFER_<n>_BY_<n>_<TIER>` | 无 | `MTEBuffer.class` 只引用 `MACHINE_CASINGS` + `OVERLAY_BUTTON_*` + `OVERLAY_PIPE_OUT` → 渲染 = 分级机壳 + 按钮覆盖层 |
| 充电器 `BATTERY_CHARGER_4_BY_4_<TIER>` | 无 | `MTECharger.class` 无任何 iconsets 常量 → 渲染 = 分级机壳 |
| 涡轮充电器 `MTETurboCharger` | 无 | `MTETurboCharger.class` 引用 `MACHINE_CASINGS` + `OVERLAYS_ENERGY_OUT_MULTI_16A` → 机壳 + `OVERLAY_ENERGY_OUT_MULTI_16A_<TIER>` |
| GT++ 储能缓冲 `Energy_Buffer_1by1_ULV` | 无 | `gtPlusPlus MTEHatchDynamoBuffer.class` 引用 `OVERLAYS_ENERGY_OUT_MULTI_BUFFER` |
| 储物柜 `LOCKER_<TIER>` | 有 | `MTELocker.class` 引用 `BlockIcons.LOCKERS`（`OVERLAY_LOCKER_000..013`）与 `OVERLAY_LOCKER` |
| GT++ 分级流体储罐 `GTFluidTank_<TIER>` | 无 | `gtPlusPlus MTETieredTank.class` 引用 `MACHINE_CASINGS` + `OVERLAY_SIDE_FLUIDTANK` / `OVERLAY_TOP_FLUIDTANK` |
| 超级储罐 | 覆盖层 | `BlockIcons.OVERLAY_STANK`（+`_GLOW`）；无整机贴图 |
| 量子储罐 / Yotta 流体罐 | 覆盖层 | `MTEDigitalTankBase` / `MTEYottaFluidTank` 引用 `OVERLAY_QTANK`（+`_GLOW`） |
| 简易洗矿机 `SimpleDustWasher_<TIER>` | 覆盖层 | GT5U 机器目录 `basicmachines/simple_washer/`（`OVERLAY_{FRONT,SIDE,TOP,BOTTOM}[_ACTIVE]`）；蒸汽变体为 `OVERLAY_FRONT_STEAM_WASHER` |
| 自动化机器（过滤器/调节器/超级缓冲…） | 有（tier 无关） | `MTERecipeFilter`→`AUTOMATION_RECIPEFILTER`、`MTERegulator`→`AUTOMATION_REGULATOR`、`MTESuperBuffer`→`AUTOMATION_SUPERBUFFER` 等；`ITEM_FILTER_<TIER>` / `CHEST_BUFFER_<TIER>` / `VOLTAGE_REGULATOR_<TIER>` / `ITEM_DISTRIBUTOR_<TIER>` / `TYPE_FILTER_<TIER>` **仅为注册 ID**，无专属贴图，均复用 `AUTOMATION_*` 单贴图 |
| 多方块 `multiblock-<name>` | 部分 | 见第 3 节 C 段备注；GT5U 多方块多为「外壳 + 控制器正面覆盖层」拼装，`multiblock-*` 取其实体外壳贴图 |
| `EM_MACHINE_ULV` | **不存在** | 包内与 jar 内均无 `EM_MACHINE_*`；`EM_*` 贴图族（`EM_CASING` / `EM_CONTROLLER` / `EM_FIELD_*` …）属于另一台多方块机器，不可映射 |

## 7. 复现命令

```powershell
python gtnh3d/tools/extract-assets.py            # 抽取 + 生成 ASSETS.md / report.json
python gtnh3d/tools/extract-assets.py --dry-run  # 只解析不落盘
python gtnh3d/tools/extract-assets.py --check    # 校验产物（16x16 RGBA + sha256 一致）
```
