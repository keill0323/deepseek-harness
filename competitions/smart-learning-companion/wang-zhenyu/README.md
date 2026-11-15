# 个性化建议与分步辅导入口

正式运行复用仓库 `modules/` 的数据准备、诊断、指导与报告导出。旧脚本不再读取并改写另一套得分或节点，也不按固定学生、题目、记录编号分派正式计划。数据策略、状态、证据和版本以 [统一运行说明](../../../modules/README.md) 为准。

## 运行

需要 Node.js 24.9 或以上；在仓库根目录安装业务依赖并构建一次：

```sh
npm ci --prefix modules/data --ignore-scripts --workspaces=false
npm run study:build
node competitions/smart-learning-companion/wang-zhenyu/scripts/build-deliverable.mjs --data 本地CSV目录 --out tmp/study-data/guidance-run-01 --summary-only
node competitions/smart-learning-companion/wang-zhenyu/scripts/build-example.mjs --out tmp/study-data/guidance-example-01
```

原 `npm run build` 与 `npm run build:real` 命令仍指向兼容入口，可通过 `-- --data ... --out ...` 传参。真实入口默认从模块的 `private-data/模拟学情数据` 读取，输出到 `generated`；样例默认输出到 `generated-example`。所有输出目录必须尚不存在；输入文件只读。正式入口始终只回传状态和本地路径，测试时可用 `--fixture` 明确标记合成数据。

## 输出迁移

真实入口在指定目录生成 `index.html`、`workspace.json`、`students/`、`classes/`、`class-plans/`、`csv/`、`fields.json`、`acceptance.json` 和 `manifest.json`。样例入口在指定目录生成合成 `input/` 与相同布局的 `report/`。CSV 与 JSON 来自同一个结果对象，学生与班级范围包括所有输入节点，不再只导出固定三个学生。页面可选择任意输入学生、班级和节点。

导出格式为 `study-export-v2`，保留统一 `team-v1` 业务接口。旧的 `成果包/*.csv`、`learning_plans_cases.json`、`demo/data.js` 和 `--generated-at` 参数已经退出正式入口；使用者应迁移到标准目录和字段，不可把旧输出与新页面混用。可用 `node modules/app/check-export.ts <报告目录> live|fixture` 核对 JSON、CSV、版本、范围、证据及 HTML 完整性。

`src/recommendation-engine.mjs`、旧 `demo/` 及此前的验收文档保留为历史模块记录；它们不再被两个运行脚本调用，不代表当前版本的正式验收结果。完整教师报告及质量 CSV 包含本地证据，不得当作学生练习文件发放。学生练习下载使用页面专用的 JSON/CSV 白名单入口。

## 验证与真人复验

仓库根目录 `npm run study:test` 验证主线与兼容入口，覆盖固定旧编号不再触发特殊改分、任意输入编号、节点不被迁移、逐字段 CSV/JSON 一致、拒绝覆盖和完整性检查。正式数据与跨语言对拍使用 `STUDY_DATA_DIR=本地CSV目录 sh modules/verify.sh`，不向模型输出正式记录。

验收书指定纪宏锋复验本模块的三类建议、数学与资料引用、三级提示不泄题、教师内容区分及调整条件；王振宇复验课程与诊断模块。当前自动记录的 `human_review` 保留 `pending`，不代填签字。队员需针对最终合并提交记录预期、实际、证据、结果；参与某项修复的人不能独自复验该项。
