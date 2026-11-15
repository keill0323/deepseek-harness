# 智慧学伴

本作品从课程要求、模拟作答和材料索引生成个人统计、同节点比较、步骤诊断、个性化活动、班级教学建议和本地交互报告。四条业务线共同使用 `team-v1` 结果格式和同一份输入快照，学生提示与教师证据分开展示。目前使用本地统计和规则，不调用远程模型，不声称模拟结果证明真实教学效果。

**数据处置策略（team-policy-v2，默认）**：系统检测异常后差异化处理——主题/满分以题库为准纠正、评分点自洽（合计==满分）的越界得分按评分点合计纠正、答案与参考一致却记零分保留原分并标记复核、无自洽证据的矛盾忽略（隔离待复核）。全部修正显式记录在 `corrected` 字段，`original_values` 恒为原文。`policy: 'conservative'` 可整体退回全隔离旧行为（team-policy-v1）。Python 参考实现（`competition/`，487 项测试）与本 TS 实现已做真实数据跨语言对拍，数字完全一致。

## 快速运行

需要 Node.js 24.9 或更高版本。仅安装业务模块声明的依赖；整个 Harness 仓库的开发依赖不是此本地报告的前提。依赖位置为 `modules/data/node_modules`，不做全局安装。

```powershell
npm ci --prefix modules/data --ignore-scripts --workspaces=false
npm run study:build
npm run study:demo -- --out tmp/study-data/demo-01
```

演示生成器使用自编合成数据，输出标记为 `fixture`，不能用于冒充正式数据验收。双击输出 `report/index.html` 即可离线使用完整界面。文件内包含所需脚本与样式，不需启动 HTTP 服务或连接网络。

## 使用正式资料

在仓库根目录导入主办方提供的资料包。导入和导出均拒绝覆盖既有文件；再次导出时选择新的目录名称。

```powershell
.\modules\data\import-data.ps1 -Archive '你的官方资料包.zip'
npm run study:export -- --data tmp/study-data/input --out tmp/study-data/reports/run-01 --summary-only
```

导出包含本地交互页面 `index.html`、全量结果 `workspace.json`、每名学生每个测验的 `students/*.json`、各班各节点的 `classes/*.json`、班级教学建议 `class-plans/*.json`、字段说明 `fields.json`、自动核验 `acceptance.json` 和完整性标记 `manifest.json`。`manifest.json` 最后写入；没有该文件表示导出未完成。`node modules/app/check-export.ts <导出目录> live` 可重新核对版本、范围、证据、每份子报告与 HTML 的 SHA-256；合成报告将最后的参数改为 `fixture`。缺文件、内容不一致或摘要错误均以非零退出码失败。程序自动核验通过不等于任务书要求的非作者队员真人复验。

赛事原始数据和派生报告保留在被 Git 忽略的 `tmp/study-data` 中，不随代码推送。不要将正式报告上传公网或提供给远程模型。界面展示是本地教师工具，未实现生产环境账户与权限体系。

## 功能

| 模块 | 入口 | 主要结果 |
|---|---|---|
| [数据](data/README.md) | `prepare_dataset`、`get_student_stats`、`get_evidence` | 最新修订、统计、质量问题和原始证据 |
| [比较](comparison/README.md) | `compare_students`、`compare_with_peers`、`analyze_class`、`compare_classes` | 同节点共同题集、同题权重、逐题与评分点分布 |
| [诊断](diagnosis/README.md) | `get_curriculum`、`diagnose_student` | 课程材料索引、具体步骤、事实与证据不足 |
| [指导](guidance/README.md) | `build_learning_plan`、`build_class_plan`、`get_hint` | 个人与班级补弱、解释迁移、补充观察和三级提示 |

报告可切换学生和测验、比较任意两名学生或两个班、查看课程引用和复核队列，点击证据编号可核对原始作答、过程及分点评分。教师备注只记录本人的观察，不改变输入评分或诊断事实。学习计划默认显示学生提示，选择“教师核对”后可展开参考答案、解析和评分依据；学生练习清单导出不包含教师答案和原始作答。整份 HTML、workspace 和学生案例 JSON 仍是教师报告，不能当成学生专用文件分发。

学习计划优先处理能定位到原作答步骤的错误，首轮最多安排3项，其余活动保留在后续阶段，教师核对新作答与实际提示等级后再决定是否进入下一阶段。已有满分记录优先匹配同指标未尝试题；没有新题时要求解释与检验，不把重复填答案当成迁移。

学生搜索支持按 `/` 聚焦、输入编号或班级关键词后按Enter定位；多个匹配时要求进一步选择，不擅自切换对象。质量队列可按当前学生、节点和关键词过滤，导出范围随筛选收窄。提示等级按学生、节点和题目在当前会话内保留，切页后不会丢失；关闭页面不会把这些操作保存为新的学习证据。打印按钮只打印当前页面。

## 统一操作入口

将请求保存为本地 JSON 文件。例如，个人统计请求为 `{"student_id":"D01","node_id":"N02"}`；测验节点必须明确指定。

```powershell
node modules/app/cli.ts run --data tmp/study-data/input --operation get_student_stats --request-file request.json --out tmp/study-data/requests/result-01.json --summary-only
```

`--summary-only` 仅向调用者返回状态、操作名和本地文件路径，完整结果写入本地；单项操作使用该选项时必须指定 `--out`。直接面向本地用户调试时可以省略该选项以打印 JSON。支持的操作见 `node modules/app/cli.ts --help`。未知字段、错误类型、未知编号和超出节点范围的题目会显式失败，不忽略条件后扩大请求。

`modules/app/pipeline.ts` 在结构检查之后，对能严格识别的过程评分矛盾再做一次复核，将相应记录从统一派生视图的统计、比较和建议依据中排除，原始字段不改写。诊断仅识别有限的简单不等式连续变形，不能替代一般数学证明或教师判断。数据层的答案语义复核仍按 `include_in_statistics` 保留原分，不因通用 `scoring_review` 标签再次被排除；所有复核评分均不作为学习活动的成功或薄弱依据。显式纠正后的主题、得分和满分同步用于统计、诊断、比较与指导，原文和纠正记录均可追溯。缺记录和未评分的数值保留 `null`，真实零分保留 `0`。

报告的复合索引先分别对对象编号和节点编号进行百分号编码，再用冒号连接，防止编号本身含冒号时覆盖其他对象。普通 `D01:N02` 形式保持不变。每次分析只复用同快照、同对象的统计和课程索引，不使用跨请求全局缓存。

## Harness 调度

仓库的默认技能发现机制会从当前 Git 项目读取 `.agents/skills`，本项目提供 [study-companion 技能](../.agents/skills/study-companion/SKILL.md)。在现有 `dsh` profile 中打开该仓库，可由技能调用同一套业务 CLI 并交付本地产物路径；框架核心和应用启动方式没有改动。技能要求 `--summary-only`，不把逐条赛事数据和报告详情回传远程模型。已验证本地 CLI 调度入口；尚未完成真实远程模型会话验收。

## 验证与构建

```powershell
npm run study:test
$env:STUDY_DATA_DIR = (Resolve-Path tmp/study-data/input).Path
npm run study:test
```

第一种运行只使用合成输入，私有数据测试明确跳过；第二种补跑真实数据基线及全链路检查。专用 GitHub Actions 工作流在所有分支的相关代码推送、PR 和手动运行时验证合成数据，不下载或上传官方数据。若 PR 没有生成运行记录，可从 Actions 手动选择该 PR 分支运行 Study companion；合并前核对运行的 head SHA 与 PR 最新提交相同。验证包括模块构建、严格类型检查、比较权重、修订归并、异常隔离、引用与版本一致、提示不泄露答案、导出防覆盖及构建后 CLI；它不等同于 Harness 全仓构建或完整模型会话。测试命令同时运行 `competitions/smart-learning-companion/wang-zhenyu/tests` 的指导交付物回归。

macOS/Linux 可运行 `STUDY_DATA_DIR="本地CSV目录" sh modules/verify.sh` 一次完成 Python 参考实现、正式数据管线、跨语言对拍、TypeScript 业务测试及两种来源报告的完整性核验。该入口需要 Python 3 与 pytest；日志和参考输出写入每次独立的临时目录，终端只报告状态与汇总，不打印正式记录。

HTML采用可逆的JSON结构池去重，普通JavaScript在本地恢复完整数据；独立的 `workspace.json` 保持完整机器结果。此方式减少文件体积，但增加编码及恢复工作，不能据文件变小推断浏览器必然更快。可按同一输入测量各阶段耗时；结果只适用于当前机器和数据，不设容易受调度噪声影响的耗时测试阈值。

```powershell
npm run study:benchmark -- --data tmp/study-data/input --iterations 7
```

完整业务产物输出到 `modules/data/lib/companion`，复用数据模块已经安装的运行依赖和编译器，避免重复安装另一套工具链。数据模块自己的入口继续输出到 `modules/data/lib`。这些构建产物均被 Git 忽略。

长期决策、验证记录和剩余事项统一维护在 [项目日志](PROJECT_LOG.md)。正式比赛方案 PDF、演示视频、答辩 PPT 和指定队员真人复验属于参赛交付工作，不能由自动测试冒称完成。
