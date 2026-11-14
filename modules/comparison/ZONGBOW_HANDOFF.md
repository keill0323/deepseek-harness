# 宗博文：对比与班级分析模块交付说明

## 负责范围

本分支承接任务书中第二位成员宗博文负责的“对比与班级分析”工作，基于魏文宇已完成并合入 `master` 的数据准备结果开展计算。

模块位置：`modules/comparison/`。

## 已交付能力

- `compare_students`：按知识节点比较两名学生，输出得分率、差值与领先方。
- `compare_with_peers`：将目标学生与同班同学逐人比较。
- `analyze_class`：输出班级节点掌握情况、薄弱节点与学生汇总。
- `compare_classes`：比较两个班级在各知识节点上的得分率和差值。
- CLI 已通过 `apps/study-assistant/src/index.ts` 暴露对应操作，可直接参与前后端联调。

## 计算口径

1. 仅对有效记录求和，忽略无效作答。
2. 节点得分率按 `earned / possible` 计算；分母为零时返回 `null`，不伪造结果。
3. 两对象均有可比数据时才计算差值与领先方。
4. 班级薄弱节点依据模块参数中的阈值判定。
5. 输出保留数据质量信息，便于定位“记录不足、暂不能确定”的场景。

## 输入与输出

输入使用数据模块提供的 `PreparedDataset`，核心字段包括学生、班级、知识节点、有效得分和满分。

输出为结构化 JSON，可供报告模块、前端图表和演示脚本直接消费。

## 验收入口

在仓库根目录运行：

```bash
node --test modules/comparison/tests/*.test.ts
npm run study:test
```

全模块复验可运行：

```bash
bash modules/verify.sh
```

## 交付归属

- 负责人：宗博文
- GitHub：`zongbow`
- 分支：`zongbow-comparison`
- 基线：`master`
