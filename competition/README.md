# 智慧学伴 · competition 目录（四人协作）

本目录承载"智慧学伴"赛题（学情诊断与个性化学习智能体）的全部赛题代码，
与仓库其余部分（DeepSeek Harness 本体）互不影响。

## 分工与模块地图（对应《四人24小时开发任务与验收书》）

| 成员 | 开发主责 | 目录 / 入口 |
| --- | --- | --- |
| 魏文宇 | 数据处理与个人统计 | `src/study_companion/`（本模块，见下） |
| 宗博文 | 对比与班级分析 | 消费 `stats.class_node_stats(exclude_students=...)` |
| 纪宏锋 | 课程资料与学习诊断 | 消费 `evidence.query(...)` + `题目与材料` 表 |
| 王振宇 | 个性化建议与分步辅导 | 消费 `stats.student_node_stats(...)` + 覆盖表 |

`shared/` 为共同资产（T+2h 冻结）：`shared/contracts/` 是模块间输入输出
契约样例，`shared/fixtures/synthetic/` 是无真实数据也能联调的合成数据。

## 魏文宇模块：study_companion

- **load** 六表加载与字段映射（结构校验、引用完整性）
- **clean** 统一清洗入口（全队唯一）：版本归并 + 异常识别与处置
- **quality** 质量报告：归并摘要、异常清单（处置 + 依据）
- **stats** 个人统计：有效题数 / 各状态数量 / 主题与指标得分 / 班级汇总
- **coverage** 覆盖与范围：无记录 ≠ 未掌握，节点不混比
- **evidence** 证据查询：按学生 / 题目 / 记录 / 指标，含全部历史版本
- **pdf_text / sourcecheck** 出处核验：纯标准库 PDF 中文抽取（ToUnicode/CID），教材条目×切片章节互证、引用存在性、课标页数结构核验（验收项"无虚构内容"）
- **leads** 步骤诊断线索：末步结论与最终作答的矛盾筛查（供诊断模块，
  归一化含 NFKC/句读/单位/检验行；定位为线索，不影响统计口径）
- **pipeline / cli** 全流程编排与命令行

### 统计口径（务必全队一致）

1. **版本归并**：同一作答事件只保留最高修订版本；旧版本进 `history` 可查。
2. **异常处置**（每条都有依据，见 `quality_report.json`）：
   - 主题与题库不一致 → 以题库为准修正（corrected，保留原文）
   - 得分超满分 / 总分与评分点合计矛盾 → 隔离（excluded，不进统计）
   - 材料超出节点可用范围 → 不改节点、隔离
   - 答案与参考答案一致却记 0 分 → 保留原分 + 语义复核标记
3. **状态区别**：待评分、未作答、无记录分别计数；零分（0/1 → 0.0）与
   尚未教学（`未教学（本节点未测量）`）严格区分。
4. **分母**：得分率分母 = 计入统计的已评分记录满分之和。

### 快速开始

```sh
# 1) 放数据：把赛题包 4_赛题数据/模拟学情数据/*.csv 复制到 data/raw/
#    （或 export STUDY_COMPANION_DATA_DIR=/path/to/模拟学情数据）
cd competition

# 2) 自检（验收口径：806 行 -> 799 事件；6 条已知冲突全部识别）
python3 -m study_companion check            # 需 PYTHONPATH=src（见下）

# 3) 全流程产物 -> outputs/（字段映射、当前有效记录、质量报告含数据观察、统计、覆盖、样例、_meta.json 数据指纹）
PYTHONPATH=src python3 -m study_companion pipeline

# 4) 常用查询
# 命令示例用合成 ID（E/EC/EN/QX 系列）；真实数据 ID 同样用法，样例见本机 outputs/samples/
PYTHONPATH=src python3 -m study_companion stats --student E01 [--node EN01] [--json]
PYTHONPATH=src python3 -m study_companion class --class EC01 --node EN02 --exclude E01
PYTHONPATH=src python3 -m study_companion evidence --question QX02
PYTHONPATH=src python3 -m study_companion evidence --student E05 --node EN02

# 5) 测试（无需真实数据，使用合成 fixtures）
python3 -m pytest tests/
```

Python ≥ 3.9，仅标准库；`pytest` 仅测试需要。**通用路径是
`PYTHONPATH=src`（全部文档与测试按此写）**；另附标准打包元数据，
pip ≥ 22 的环境可选 `pip install -e competition/`（旧 pip 如 21
不支持，已实测，用 PYTHONPATH 即可）。

### 队友怎么接（统一清洗入口）

```python
import sys; sys.path.insert(0, "competition/src")
from study_companion.load import load_all
from study_companion.clean import build_valid_records

dataset = load_all("competition/data/raw")          # 或环境变量指定
clean = build_valid_records(dataset)                 # 唯一清洗入口
for vr in clean.valid_records:                       # 当前有效记录
    ...  # vr.record.* 原始字段；vr.effective_theme/effective_score/stats_flag
```

不要重复实现清洗；发现口径问题找魏文宇改 `clean.py` 一处。

## 数据安全（重要）

- 仓库是**公开**仓库；赛题规则：赛事数据仅限本次大赛使用，**不得外传**。
- 因此 `data/raw/` 与 `outputs/` 均已 gitignore：真实数据与其衍生产物
  只留在本机，不上 GitHub。
- 代码、测试、`shared/fixtures/synthetic/`（自造 E/X 系列编号）、
  `shared/contracts/`（合成数据生成的样例）可安全入库。
- 需要给队友传真实样例时走队内渠道（微信等），不走仓库。

## 开发规范（防再犯）

- **启用 pre-push 钩子**（克隆后执行一次）：`git config core.hooksPath .githooks`
  —— competition 测试不绿会直接拒绝推送（历史上发生过三次带红推送，机制根治）。
- README 的测试计数有守卫测试盯着：改测试数不同步文档，测试直接挂。

## 测试与验收自检

```sh
python3 -m pytest tests/            # 487 项：固定样例 86 + 随机性质测试 401
```

- `tests/test_acceptance.py` 逐条对应验收书检查项（版本归并、异常处理、
  状态区别、统计复算、比较口径、覆盖与范围、通用性）。
- `tests/test_properties.py` **随机性质测试**：200 套随机数据集 x 2 种
  处置模式（差异化处置 / 保守全隔离）与 `tests/reference_impl.py`
  （按验收书条文独立实现的预言机，不依赖被测代码）逐记录、逐统计、
  逐覆盖全量对拍，并校验核心不变量：无损归并、全局总量守恒、隔离无
  有效得分、覆盖自洽、处置幂等。核心逻辑不依赖"我造的例子"，
  对任意契约内数据成立。
- **处置决定（已定）**：默认为**差异化处置**——系统检测异常后，评分点
  自洽（合计==满分）的得分矛盾**纠正**为评分点合计，无自洽证据的**忽略**
  （隔离待人工复核）。依据老师 2026-11-14 说明：此类数据交由系统检测
  并处理（忽略/纠正）。`--isolate-all` 可退回保守全隔离模式（参数在
  子命令前后均可）；质量报告"处置策略"字段自动记录所用模式。

真实数据自检（本机运行）：

```sh
PYTHONPATH=src python3 -m study_companion check
# 期望：806 行 -> 799 事件（7 条 v2 归并不重复计数）；
# 异常 6 条 = 主题不一致1 + 评分点矛盾1 + 得分超满分2 + 节点范围外1 + 语义复核1
#（具体记录编号以 check 本机输出为准，不入库）；状态分布 已评分790/待评分4/未作答5
```
