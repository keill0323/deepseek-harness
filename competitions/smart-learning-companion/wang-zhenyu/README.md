# 王振宇模块：个性化建议与分步辅导

本目录是“智慧学伴”比赛中王振宇负责的独立模块。输入为已清洗的学情证据、题库和课程资料，输出为可执行、可导出、可验收的学习计划。

## 核心能力

- 按作答事件和修订版本归并证据，待评分、未作答不按零分处理。
- 根据已评分证据选择首要辅导指标；证据不足时生成补充观察计划。
- 每份计划连接真实题号、学习卡、教材页码和课标定位。
- 三层学生提示不直接给答案；教师解析单独存放。
- 写明成功标准、观察点、满足/不满足后的调整规则。
- 页面、JSON、CSV共享同一计划对象和统计口径。

## 运行

将赛题“模拟学情数据”目录放在 `private-data/模拟学情数据`，或通过参数指定：

```sh
node scripts/build-deliverable.mjs --data /path/to/模拟学情数据 --out /path/to/output
```

输出包括：

- `演示系统/index.html`
- `成果包/learning_plans_all_students.json`
- `成果包/learning_plans_cases.json`
- `成果包/student_profiles.csv`
- `成果包/plan_steps_cases.csv`
- `成果包/plan_hints_cases.csv`
- `成果包/plan_evidence_cases.csv`
- `成果包/data_quality_report.json`

## 测试

```sh
node --test tests/*.test.mjs
```

## 数据安全

赛题原始数据和包含学生作答的生成结果不得提交到公开仓库。公开代码分支只保留程序、公开课程结构、合成测试和文档。正式提交包中的赛题数据按大赛要求单独交付并在赛后删除。

## 公开演示

仓库中的 `demo/index.html` 默认加载 `demo/data.example.js`，内容全部为合成样例，不包含赛题学生数据。正式演示时运行 `npm run build:real`，生成目录中的 `data.js` 会自动覆盖示例数据。
