# 同节点学习表现比较

本模块提供个人与个人、个人与同伴、班级摘要、两个班级比较四类函数。输入为数据模块已选最新修订并完成质量检查的 `PreparedDataset`，输出沿用 `team-v1` 外壳，不调用远程模型或服务。

## 函数

- `compare_students(dataset, { left_student_id, right_student_id, node_id, item_ids? })` 比较两名学生。
- `compare_with_peers(dataset, { student_id, node_id, class_id?, item_ids? })` 比较个人与班级同伴，未指定班级时使用学生所属班级，始终先排除本人。
- `analyze_class(dataset, { class_id, node_id })` 返回班级人数、有效作答、分数、主题与指标覆盖、逐个学生摘要、评分状态、复核队列、逐题及评分点得分分布和待观察指标。
- `compare_classes(dataset, { left_class_id, right_class_id, node_id, item_ids? })` 比较两个班级。

测验节点必须明确提供。请求中的学生、班级、节点或题目未知时返回 `error`；显式请求不在该节点允许范围的题目也会报错。省略题目集合时使用节点允许题集，传入空数组则得到空集合，不擅自扩大范围。

## 计算口径

只使用 `include_in_statistics=true` 的当前记录。每题先计算学生平均得分率；同一学生若在同题有多个独立作答事件，先在学生内部平均，避免练习次数改变同伴权重。一侧没有有效样本的题目从双方同时移除，剩余题目组成共同有效题集。每题权重为该题满分除以共同题集总满分，两侧使用完全相同的题目和权重。

输出保留候选题集、共同题集、被移除题及理由、每题双方学生人数和作答次数、均值、权重及记录编号。`left_rate`、`right_rate` 和 `delta_rate` 为 0 到 1 的比例；差值是左侧减右侧，另有 `delta_percentage_points` 表示百分点。没有共同有效题时各得分率为 `null`、`comparable=false`，不能解释为零分。范围内有待复核记录时返回 `needs_review`；是否计分由 `include_in_statistics` 决定，语义复核可保留原分，结构冲突排除。

班级摘要中的总得分率仅描述实际有效样本，可能受到覆盖差异影响；比较两个班级时应使用共同有效题集的 `compare_classes`。缺记录不代表未掌握，未教学主题单独标记，不跨节点宣称学习进步或真实教学效果。

`items` 中的 `score_distribution` 与 `scoring_points` 按有效作答事件计数，同时列出不同学生人数；真实零分为 `0`，无有效样本的得分率为 `null`。分布与共同题集加权比较是不同统计量。`needs_observation` 列出缺少可计分记录的已教、可测指标；它不包含未教学指标，也不代表能力不足。

## 验证

```powershell
node --test modules/comparison/tests/*.test.ts
$env:STUDY_DATA_DIR = (Resolve-Path tmp/study-data/input).Path
node --test modules/comparison/tests/*.test.ts
```

合成测试覆盖同题权重、样本数量差异、本人排除、单侧缺题、质量隔离、未知编号、节点隔离和班级覆盖。真实数据核验仅在指定本地私有输入目录时运行；不提交赛事原始数据或派生导出。整体开发与验收记录见 [项目日志](../PROJECT_LOG.md)。
