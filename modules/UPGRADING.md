# 本地报告升级

## study-export-v2 → study-export-v3

用当前版本先执行 `npm run study:build`，再将相同输入重新导出到一个新目录。导出器不覆盖旧文件，旧版教师 HTML 也不会自动获得独立学生端。不要手工修改 manifest 或复制旧学生文件冒充新版本。

v3 新增 `student-pages/*.html`：每份是一个学生、一个测验节点的离线练习页。`manifest.json` 新增 `student_practice_format: "study-student-v1"` 和 `student_pages`，后者逐文件记录 `student_id`、`node_id`、`path`、`sha256`。`check-export` 用当前学生页面资源重新生成期望内容，检查每个范围、完整正文与摘要；缺页、替换、跨范围内容及仅重写摘要的篡改都会失败。页面资源更新后也应重新导出，保持代码与完整性检查器一致。

`workspace.json` 和教师子报告的 `team-v1` 结构、CSV 的 `study-csv-v1` 结构不变。旧的 `study-export-v2` 目录不能通过 v3 的完整性检查。

教师打开 `index.html`，或在其中选择学生和测验节点后点击“导出独立学生页”。向学生只发送其对应的单份 HTML；完整报告目录、workspace 和教师 JSON/CSV 继续由教师保管。该离线交付不提供登录或托管服务的访问控制。

学生页中的作答、笔记、提示进度和完成标记仅在当前页面会话中保存，学生可下载自己的记录 JSON 交回教师。教师需核对这些记录；完成标记不等于答题正确，不会自动写入原数据或修改成绩。
