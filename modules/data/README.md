# 智慧学伴数据模块

本模块为比较、诊断和指导提供本地数据准备、个人统计与证据查询。沿用仓库的 TypeScript 和 ESM，使用 Papa Parse 读取 CSV。它是独立的私有业务模块，不启动 Harness 应用、不调用模型，也不新增服务器。[study-companion 技能](../../.agents/skills/study-companion/SKILL.md)通过统一业务 CLI 调度本模块，模型只接收状态与本地产物路径。

## 运行

要求 Node.js >=24.9。在仓库根目录安装模块本地依赖，然后从官方资料包导入六张 CSV；默认输入和导出都放在被 Git 忽略的 `tmp/study-data` 下。导入脚本拒绝覆盖已有输入，支持含中文及空格的路径。

```powershell
npm ci --prefix modules/data --ignore-scripts --workspaces=false
.\modules\data\import-data.ps1 -Archive '你的资料包路径.zip'
node modules/data/cli.ts prepare_dataset --data tmp/study-data/input
node modules/data/cli.ts get_student_stats --data tmp/study-data/input --student D17 --node N01
node modules/data/cli.ts get_evidence --data tmp/study-data/input --records DR0023 --history
```

`--out tmp/study-data/exports/result.json` 将同一 JSON 写入新文件并输出到标准输出，拒绝覆盖已有文件。`--fixture` 将结果明确标成开发样例。`get_evidence` 支持逗号分隔的 `--records`、`--events`，也支持 `--student`、`--node`，所有筛选条件取交集。未知选项、未知编号、缺表、缺列和格式错误返回 JSON 错误，进程退出码为 1。

## 函数与输出

`io.ts` 的 `load_dataset(directory)` 异步读取五张必需表；`字段说明.csv` 不参与计算。`core.ts` 提供同步的 `prepare_dataset(input, options?)`、`get_student_stats(dataset, { student_id, node_id })` 和 `get_evidence(dataset, query)`。消费者从这些模块直接导入，类型定义见 [types.ts](types.ts)。

统计和证据查询使用 `team-v1` 外壳，包含数据、策略、生产者版本，`source_mode`、`scope`、`result_status`、`payload`、`evidence_ids` 与 `limitations`。统计必须明确指定测验节点，不跨节点汇总。`score_rate` 是 0 到 1 的比例，未知值为 `null`，真实零分保留 `0`。无记录返回 `insufficient_data`，不推断未观察内容的掌握程度。

## 数据策略

按作答事件取最高数值修订版本，同事件的历史版本仍可查询。重复导入完全相同的记录不会增加当前事件数；同一记录编号或同一事件版本存在不同内容时，拒绝整个准备请求，防止不确定的结果进入下游。最新版本异常时按当前策略纠正、复核或隔离，并保留原值；不回退到旧版本。

自动检查引用关系、主题、测验可用题集、分数范围、满分、评分点与总分，以及严格规范化后答案吻合却为零分的情况。它不进行代数等价判定，也不能代替教师审核解答过程。问题记录保留 `original_values`、原始答案步骤、评分点、来源、`quality_issues` 和处理动作。是否计分以 `include_in_statistics` 为准，不能仅凭 `action=review` 判断。

默认 `team-policy-v2` 差异化处置：主题和满分以题库纠正；越界得分只有在评分点合计等于有效满分时才按该合计纠正；答案吻合但记零分的语义冲突在没有其他阻断问题时保留原分计入统计，同时标为 `review`。无法由现有证据解决的结构冲突不计分。纠正值写入 `corrected`，统计读取有效值，`original_values` 不变；系统不自动改换节点。`prepare_dataset(input, { policy: 'conservative' })` 使用 `team-policy-v1`，不纠正异常，复核记录均不计分。

统一业务入口还检查可严格识别的过程评分矛盾，并将这类记录从共享统计视图排除；数据 CLI 单独调用不执行该步骤。正式报告应通过[统一入口](../README.md#统一操作入口)生成。语义复核即使保留原分计入统计，也不能直接作为学习活动中薄弱或成功的依据。

分数接受有限普通十进制数，拒绝十六进制、科学计数法、`NaN` 和 `Infinity`；修订版本必须是十进制正整数字串。评分点定义按源表的一行一个“编号 说明 分值分”读取，作答评分点按“编号=分值”及分号或换行读取；不支持的格式进入复核，不能静默计分。未作答却含答案或过程也进入复核，正常待评分有作答内容不构成异常。

来源 `row_number` 表示表头为第 1 行的 CSV 逻辑行编号，带换行的单元格仍算同一行。`dataset_version` 来自五张表排序去重后的内容摘要，行顺序和完全重复导入不影响版本；原始行位置仍随实际输入顺序变化。

`PreparedDataset` 和所有 `ResultEnvelope` 必须携带 `generated_at`，表示分析批次开始的 UTC 毫秒时间（`YYYY-MM-DDTHH:mm:ss.sssZ`）。默认由准备函数生成，并传递到统计、证据、错误结果及后续模块；独立数据 CLI 的准备摘要和失败结果也带该字段。此时间不进入数据哈希。仅确定性测试或复算可以通过 `PrepareOptions.generated_at` 注入已验证的批次时间，CLI 不接受手工指定时间。统一报告的 JSON/CSV 和旧报告升级方式见[完整入口说明](../README.md#使用正式资料)。

## 验证

根入口仅验证本业务模块，执行顺序为产物构建、严格类型检查、行为测试；它不等同于 Harness 全仓构建或现有 CI。

```powershell
npm run test:study-data
$env:STUDY_DATA_DIR = (Resolve-Path tmp/study-data/input).Path
npm run test:study-data
```

未提供 `STUDY_DATA_DIR` 时，真实数据核验会明确跳过。合成测试不包含原始赛事数据；真实输入与派生导出仅供本次赛事本地使用，不应提交 Git。开发记录和待办统一维护在 [项目日志](../PROJECT_LOG.md)。

本地验收导出位于 `tmp/study-data/exports/`，包含准备摘要、D01/N02、D14/N02、D17/N01、D17/N02 和 D01/Q043 的修订证据。目录不属于 Git 交付；可用上述命令从相同输入重建。自动检查不替代任务书要求的非作者队员真人复验。
