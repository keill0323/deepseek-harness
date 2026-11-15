# 个性化建议模块接口

## 输入：RecommendationRequest

```json
{
  "student": { "id": "S01", "class_id": "SC01" },
  "evidence": [
    {
      "record_id": "XR01",
      "event_id": "S01-N02-Q_SAMPLE_01",
      "revision": 2,
      "student_id": "S01",
      "node_id": "N02",
      "item_id": "Q_SAMPLE_01",
      "topic_id": "T03",
      "indicator_id": "T03I1",
      "status": "已评分",
      "score": 1,
      "max_score": 3,
      "answer": "示例作答",
      "steps": "……",
      "point_scores": "Q_SAMPLE_01P1=1；Q_SAMPLE_01P2=0；Q_SAMPLE_01P3=0",
      "source_ref": "XR01"
    }
  ],
  "questions": {
    "Q_SAMPLE_01": {
      "material_id": "Q_SAMPLE_01",
      "topic_id": "T03",
      "indicator_id": "T03I1",
      "type": "解答题",
      "stem": "解不等式……",
      "answer": "示例答案",
      "analysis": "……",
      "max_score": 3
    }
  },
  "target_node_id": "N02",
  "nodes": [
    {
      "node_id": "N02",
      "available_item_ids": ["Q041", "Q_SAMPLE_01", "Q044"]
    }
  ],
  "focus_indicator": "T03I1"
}
```

字段责任：

- `student`、`evidence`：魏文宇模块的个人统计与证据查询。
- `focus_indicator`、`plan_mode`：纪宏锋模块的诊断结果；也可由后端指定。
- `questions`：题库和课程资料索引。
- `target_node_id`：本次计划的目标节点；证据必须全部属于该节点。
- `nodes`：节点可用题集；所有计划题目必须在目标节点范围内。
- `comparisons`：宗博文模块可传入相似同伴与班级参照，但不参与未给出的掌握度推断。

## 输出：LearningPlan

必含字段：

- `plan_id`、`generated_at`、`schema_version`
- `student`
- `target_node_id`
- `plan_kind`：`remediation | consolidation | extension | coverage_probe`
- `certainty`：`insufficient | provisional | adequate`
- `primary_focus`
- `evidence_used`
- `evidence_gaps`
- `material_refs`
- `steps`
- `observation`
- `adjustment_rules`
- `limitations`
- `teacher_explanation`
- `quality_checks`

每一步必须包含：

- `phase`：概念复位、原题复盘、独立练习、迁移与检验或反思。
- `objective`、`student_action`。
- `item_refs`和`material_refs`。
- 三层`hints`：一级激活概念，二级提供下一步操作，三级提供检查策略。
- `success_criteria`。
- `next_if_success`与`next_if_not`。
- 教师解析只放在`teacher_only`或计划级`teacher_explanation`。

## 稳定性要求

1. 同一`event_id`只使用最高修订版本。
2. 待评分与未作答不得进入得分率分母。
3. 证据必须属于请求学生和目标节点。
4. 题目必须存在于题库，且属于目标节点可用题集。
5. 任何结论必须带`evidence_ids`或`source_ref`。
6. 学生提示不得包含参考答案、最后结果或题目所问结论。
7. 切换学生、范围或题目后，不得复用上一名学生的证据。
8. 生成计划后必须使用同一题库和节点上下文通过`validatePlan(plan, context)`。
