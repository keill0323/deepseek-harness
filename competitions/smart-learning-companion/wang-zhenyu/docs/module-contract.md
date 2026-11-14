# 个性化建议模块接口

## 输入：RecommendationRequest

```json
{
  "student": { "id": "D01", "class_id": "DC01" },
  "evidence": [
    {
      "record_id": "DR0023",
      "event_id": "D01-N02-Q043",
      "revision": 2,
      "student_id": "D01",
      "node_id": "N02",
      "item_id": "Q043",
      "topic_id": "T03",
      "indicator_id": "T03I1",
      "status": "已评分",
      "score": 1,
      "max_score": 3,
      "answer": "x<-4",
      "steps": "……",
      "point_scores": "Q043P1=1；Q043P2=0；Q043P3=0",
      "source_ref": "DR0023"
    }
  ],
  "questions": {
    "Q043": {
      "material_id": "Q043",
      "topic_id": "T03",
      "indicator_id": "T03I1",
      "type": "解答题",
      "stem": "解不等式……",
      "answer": "x>-4",
      "analysis": "……",
      "max_score": 3
    }
  },
  "focus_indicator": "T03I1"
}
```

字段责任：

- `student`、`evidence`：魏文宇模块的个人统计与证据查询。
- `focus_indicator`、`plan_mode`：纪宏锋模块的诊断结果；也可由后端指定。
- `questions`：题库和课程资料索引。
- `comparisons`：宗博文模块可传入相似同伴与班级参照，但不参与未给出的掌握度推断。

## 输出：LearningPlan

必含字段：

- `plan_id`、`generated_at`、`schema_version`
- `student`
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
3. 任何结论必须带`evidence_ids`或`source_ref`。
4. 学生提示不得包含参考答案或最后结果。
5. 切换学生、范围或题目后，不得复用上一名学生的证据。
6. 生成计划后必须通过`validatePlan()`。
