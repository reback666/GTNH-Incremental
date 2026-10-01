# 将游戏审查发现的所有问题导出为 Excel 表（只读审查产物，运行本脚本只生成 xlsx）
import sys, os

XLSX_SKILL_DIR = r"C:\Users\29797\.zcode\cli\plugins\cache\zcode-plugins-official\spreadsheets\0.1.7\skills\xlsx"
for sub in [XLSX_SKILL_DIR, os.path.join(XLSX_SKILL_DIR, "templates")]:
    if sub not in sys.path:
        sys.path.insert(0, sub)

from base import (
    FONT_NAME, PRIMARY, ACCENT_POSITIVE, ACCENT_NEGATIVE, ACCENT_WARNING,
    NEUTRAL_600, setup_sheet, style_header_row, style_data_row,
    auto_fit_columns, auto_fit_row_heights, font_caption,
)
from openpyxl import Workbook
from openpyxl.styles import Font

# 编号 | 分类 | 严重度 | 结论 | 问题 | 位置 | 说明
ISSUES = [
    # ── 本轮新发现 ──
    ("N1", "模拟逻辑", "中", "确认", "断电/硅基停机调度期间净化器照常全速净化，断电反而压污染；源质副产照常产出", "core.ts:1029、1469", "purifyPerSecond() 只看 workingCountOf，不看 outage/shed；停电时污染产生归零但净化不归零"),
    ("N2", "模拟逻辑", "中", "确认", "魔法机器停电时照常运转，但污染负载被记 0——运转不计污染，口径自相矛盾", "core.ts:1007-1010 vs 1488-1493", "若停电豁免灵气机器是设计，则污染采样应豁免 visPowered"),
    ("N3", "模拟逻辑", "中", "待确认设计", "发电机恒定满发满烧，富余电力浪费、矿石已烧掉；UI 无任何浪费提示", "core.ts:1359-1375", "发电不看实际需求；需拍板是设计取舍还是疏漏"),
    ("N4", "UI 显示", "中低", "确认", "矿石/GT币 chip 的「产出/消耗」显示额定速率，缺电降载/污染惩罚/灵气不足时与实际不符", "store.ts:1724-1758", "oreRates/coinRates 不乘 ratioDec/污染倍率/灵气倍率，与电能格「上一拍实际」口径不一致"),
    ("N5", "UI 显示", "低", "确认", "机型悬停「卖回一台」退款恒按 GT 币口径显示；矿石支付时实际退矿石（差 100 倍换算）", "store.ts:1231、MachinePanel showTip", "refundOf 默认 payWith='coin'"),
    ("N6", "经济一致性", "低", "不修（拍板）", "工业宇宙下解锁电压/电网只认单一币种钱包，与买机器的跨级结算不一致", "core.ts:canUnlock/canUnlockGrid", "2026-10-01 拍板不修：解锁只认单一钱包是门槛设计，低级币本就不该帮着解锁；严重度低，不影响正常玩"),
    ("N7", "存档健壮性", "低", "确认", "deserialize 不校验数值范围：maxTier 越界、unlockedVeins 缺项/重复、counts 负数/小数都能进状态", "save.ts:139-229", "多数显示位有兜底不会崩，但会出现 T0、负台数等怪状态"),
    ("N8", "代码质量", "低", "确认", "死代码：grid.ts 的 unlockedGrids/isGridUnlocked(id,maxTier)、output.ts 的 lineOutput 应用内无人调用", "grid.ts:81-87、output.ts:44", "core 用自己的 grids 数组版本；lineOutput 仅测试使用"),
    ("N9", "代码质量", "低", "确认", "formatDuration 三份相同副本；日期格式化 stamp() 两份重复", "store.ts:1904、log.ts:216、diagnostics.ts:162 / log.ts:203、diagnostics.ts:149", "应抽成公共 fmtDuration/stamp"),
    ("N10", "代码质量", "低", "确认", "modelsOf() 热路径每次全表 filter（100+ 机型），tick/buildSnapshot 每秒调几十次", "models.ts:298-300", "可预生成 Map<category, models[]>"),
    ("N11", "文案一致性", "极低", "确认", "SettingsPanel 硅基停机说明漏了「腐蚀抑制器」优先级；资源条「T0 矿石」占位名与矿脉面板材料名不统一", "SettingsPanel.vue:95、silicon.ts:14、credit.ts:27", "实际优先级 purifier > abyss > miner > machine > research"),
    ("N12", "代码质量", "低", "确认", "8 个未使用导入：core.ts（isSheddableKind、isGridUnlocked）、store.ts（POLLUTION_HIGH/LOW、RESEARCH_GATE_FROM_TIER、researchRequired）、save.ts、pickaxe.ts、diagnostics.ts 各 1", "多文件", "tsc --noUnusedLocals 检出"),
    # ── 上一轮已确认 ──
    ("O1", "性能/体验", "中", "确认", "无离线收益：存档不存时间戳，boot() 无离线补算", "save.ts:86-137、store.ts:474-483", "增量游戏及格线缺失"),
    ("O2", "数据一致性", "中", "确认", "撤销平行宇宙后 UI 统计不一致：modelsAt/unlockedModels 不过滤宇宙，oreRates/powerStats/kindStats/productionOf 把失效机器算进读数", "core.ts:1124-1131", "tick 的 active 列表有过滤，模拟正确；仅 UI 聚合口径错"),
    ("O3", "存档完整性", "中", "确认", "5 个随机事件计时器（outageSeconds/outageTimer/siphonTimer/mutationTimer/collapseTimer）不存档，重开归零", "save.ts:86-137", "影响小：都是分钟级事件计时器"),
    ("O4", "存档健壮性", "低", "确认（程度修正）", "maxTier/unlockedVeins/playSeconds 3 处无 ?? 兜底；有 try/catch 接住，旧档保留但按新开局进入", "save.ts:155-156、225", "原清单称 6 处且直接崩，实际 3 处且不会白屏；仅损坏存档触发"),
    ("O5", "存档完整性", "低", "确认", "beforeunload 移动端常不触发，最后几秒进度丢（10 秒自动存档兜底，最多丢 10 秒）", "store.ts:735", "iOS/Android 常不触发是平台事实"),
    ("O6", "经济一致性", "低", "不修（拍板）", "卖机不走跨级结算：退款只进单一结算等级钱包，与买的 payAcrossTiers 不对称（退款照发，非越买越亏）", "core.ts:sell", "2026-10-01 拍板不修：退款进结算等级钱包口径简单稳定；严重度低，不影响正常玩"),
    ("O7", "经济一致性", "低", "机制对/方向反", "卖机退款按卖前 countOf 定价：批量卖的退款比对称值略高（不是清单说的偏少），差异约几台价的百分之几，可忽略", "core.ts:1229", "退款总额 = rate×Σprice(1..N)，买入付 Σprice(0..N-1)"),
    ("O8", "数据语义", "低", "确认（程度修正）", "peakTier：v9 以前旧档按 maxTier 低估历史最高；devUnlockTo 会抬高并污染该统计", "save.ts:207、core.ts:525", "仅影响远古存档与 dev 操作"),
    ("O9", "体验/UI", "低", "确认", "dev 资源输入框 type=text 无校验，非法输入静默失败（devAdjustResource 返回 false 无提示）", "SettingsPanel.vue:139、core.ts:545-549", "1e999 会被 Decimal 正常接受，不算失败；dev 专用"),
    ("O10", "性能", "低", "确认（量级修正）", "每秒 1Hz 全量重建快照（十余个遍历函数）；同步 setInterval 存档；20Hz 空轮询兜底；每拍全量成就检查", "store.ts:491、734、731、core.ts:1671", "当前规模下无感，架构上可优化；「卡数百毫秒」夸大"),
    ("O11", "性能", "极低", "确认", "machineColumn 8 类 × 14 级全遍历等「跑满」模式；代价每秒几十次数组遍历", "store.ts:1196、core.ts:713", "无感"),
    ("O12", "代码质量", "极低", "确认", "abyss.ts 用 .times('0.01') 而非 div(100)；全项目 5 处 dec(String(...)) 包装", "abyss.ts:23、store.ts:966/967/1038、core.ts:1416、research.ts:88", "Decimal 下无实际差异，纯风格"),
    ("O13", "测试", "信息", "通过", "31 个测试文件 286 条测试全部通过", "test/", "vitest run，2026-09-30"),
]

SEVERITY_COLOR = {"中": ACCENT_NEGATIVE, "中低": ACCENT_WARNING, "低": NEUTRAL_600, "极低": NEUTRAL_600, "信息": ACCENT_POSITIVE}

wb = Workbook()
ws = wb.active
ws.title = "问题清单"

headers = ["编号", "分类", "严重度", "结论", "问题描述", "位置", "备注 / 修正说明"]
last_col = len(headers) + 1  # B 起

setup_sheet(ws, title="GTNH 增量 · 代码审查问题清单（2026-09-30，只读审查，未修改任何文件）", last_col=last_col)

for col_idx, header in enumerate(headers, start=2):
    ws.cell(row=4, column=col_idx, value=header)
style_header_row(ws, row_num=4, col_start=2, col_end=last_col)

for i, row_data in enumerate(ISSUES):
    row_num = 5 + i
    for col_idx, value in enumerate(row_data, start=2):
        ws.cell(row=row_num, column=col_idx, value=value)
    style_data_row(ws, row_num=row_num, col_start=2, col_end=last_col, row_index=i)
    # 严重度用语义色
    sev_cell = ws.cell(row=row_num, column=4)
    sev_cell.font = Font(name=FONT_NAME, size=11, color=SEVERITY_COLOR.get(sev_cell.value, NEUTRAL_600))
    sev_cell.alignment = sev_cell.alignment.copy(horizontal="center")

# 汇总行
total_row = 5 + len(ISSUES)
ws.cell(row=total_row, column=2, value="合计")
ws.cell(row=total_row, column=3, value=f"模拟逻辑 3 · UI/显示 2 · 经济 3 · 存档 4 · 代码质量 5 · 性能 2 · 文案 1 · 测试 1")
from base import style_total_row
style_total_row(ws, row_num=total_row, col_start=2, col_end=last_col)

# 脚注
note_row = total_row + 2
ws.cell(row=note_row, column=2, value="审查范围：src/ 全部 52 个源文件 + vite.config + scripts + index.html；dist 为 2026-09-27 构建产物。严重度中=建议尽快修，低=择机修，极低=风格/极小影响。").font = font_caption()

ws.freeze_panes = "C5"
auto_fit_columns(ws, min_width=8, max_width=40, header_row=4, data_start_row=5)
auto_fit_row_heights(ws, header_row=4, data_start_row=5)

wb.properties.creator = "Z.ai"
out = r"C:\Users\29797\Documents\ChatGPT\gtnh增量\docs\代码审查问题清单.xlsx"
os.makedirs(os.path.dirname(out), exist_ok=True)
wb.save(out)
print("saved:", out)
