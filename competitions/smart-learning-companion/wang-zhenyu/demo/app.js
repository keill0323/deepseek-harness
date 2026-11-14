/* 智慧学伴 · 王振宇模块交互层。所有内容来自 data.js，不访问网络。 */
(() => {
  const data = window.SMART_LEARNING_DATA;
  if (!data) {
    document.body.innerHTML = '<main style="padding:40px;font-family:sans-serif">缺少 data.js，请先运行构建脚本。</main>';
    return;
  }
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fmtPct = (value) => value == null ? '暂无证据' : value.toFixed(1) + '%';
  const planKindLabel = { remediation: '强化补救', consolidation: '巩固学习', extension: '迁移提升', coverage_probe: '补充观察' };
  const certaintyLabel = { insufficient: '证据不足', provisional: '结论暂定', adequate: '证据较充分' };
  const caseMeta = data.case_meta ?? Object.fromEntries(Object.keys(data.cases).map((id) => [id, { type: '代表案例', tag: '学习计划', note: data.cases[id].summary }]));

  function showView(name, studentId) {
    $$('.view').forEach((view) => view.classList.remove('active'));
    const target = $('#view-' + name);
    if (target) target.classList.add('active');
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === name && (!studentId || item.dataset.student === studentId)));
    if (name === 'case' && studentId) renderCase(studentId);
    if (name === 'students') renderStudents();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderCaseNav() {
    const holder = $('#case-nav');
    if (!holder) return;
    holder.innerHTML = Object.keys(data.cases).map((id) => {
      const meta = caseMeta[id] ?? { type: '代表案例', tag: '学习计划' };
      return '<button class="nav-item" data-view="case" data-student="' + esc(id) + '">' + esc(id) + ' · ' + esc(meta.tag) + '</button>';
    }).join('');
    $$('#case-nav .nav-item').forEach((item) => item.addEventListener('click', () => showView(item.dataset.view, item.dataset.student)));
  }

  function renderOverview() {
    const graded = data.student_profiles.reduce((sum, student) => sum + student.graded, 0);
    const records = data.student_profiles.reduce((sum, student) => sum + student.records, 0);
    const earned = data.student_profiles.reduce((sum, student) => sum + student.earned, 0);
    const possible = data.student_profiles.reduce((sum, student) => sum + student.possible, 0);
    const pending = data.student_profiles.reduce((sum, student) => sum + student.pending, 0);
    const unanswered = data.student_profiles.reduce((sum, student) => sum + student.unanswered, 0);
    const rate = possible ? (earned / possible * 100).toFixed(1) + '%' : '暂无';
    $('#hero-rate').textContent = rate;
    $('#hero-detail').textContent = graded + '条已评分事件 / ' + earned + '分 / ' + possible + '分';
    $('#insight-text').textContent = data.is_synthetic ? '当前为公开合成演示。正式运行时，本区域会依据真实证据展示模块判断。' : '数据中多处出现：过程已写出、结论未核对，或提示后能完成但无法独立说明依据。计划把“检查动作”设为独立成功标准。';
    $('#quality-summary').innerHTML = [
      [data.is_synthetic ? '合成演示' : (data.data_quality_summary?.raw_rows ?? records) + ' → ' + (data.data_quality_summary?.event_count ?? records), data.is_synthetic ? '不含赛题原始学生数据。' : '原始记录归并为作答事件，保留' + (data.data_quality_summary?.revision_count ?? 0) + '条修订。'],
      [data.data_quality_summary?.anomalies ?? data.anomaly_log.length, '已知冲突登记原值、处理动作和依据。'],
      [pending + ' / ' + unanswered, '待评分与未作答单列，不当作零分。'],
      [data.student_profiles.length, '学生画像仅基于其有效证据，不用班级均值代填。']
    ].map(([value, note]) => '<div><b>' + esc(value) + '</b><span>' + esc(note) + '</span></div>').join('');
    const classCounts = data.student_profiles.reduce((counts, student) => { counts[student.class_id] = (counts[student.class_id] || 0) + 1; return counts; }, {});
    const classNote = Object.entries(classCounts).map(([id, count]) => id + ' ' + count + '人').join('，');
    $('#overview-metrics').innerHTML = [
      [data.student_profiles.length, '模拟学生', classNote],
      [Object.keys(data.question_bank ?? {}).length, data.is_synthetic ? '合成示例题目' : '真实题目', data.is_synthetic ? '仅用于公开演示' : '3个主题，每个主题18题'],
      [graded, '已评分事件', '待评分、未作答另行列示'],
      [rate, '有效得分率', earned + ' / ' + possible + ' 分']
    ].map(([value, label, note]) => '<article class="metric-card"><b>' + esc(value) + '</b><span><strong>' + esc(label) + '</strong><br>' + esc(note) + '</span></article>').join('');
    const sorted = [...data.indicator_stats].sort((a, b) => a.rate - b.rate);
    $('#indicator-bars').innerHTML = sorted.map((item) => '<div class="bar-row"><span class="bar-label">' + esc(item.key) + '</span><span class="bar-track"><span class="bar-fill ' + (item.rate < 50 ? 'low' : '') + '" style="width:' + Math.max(2, item.rate) + '%"></span></span><span class="bar-value">' + fmtPct(item.rate) + '</span></div>').join('');
    $('#data-version').textContent = '数据版本 ' + data.generated_at.slice(0, 10);
    $('#case-source').textContent = data.is_synthetic ? '公开合成示例' : '任务书指定';
    $('#footer-version').textContent = Object.values(data.cases)[0]?.schema_version ?? '1.0.0';
    $('#case-cards').innerHTML = Object.entries(caseMeta).map(([id, meta]) => {
      const plan = data.cases[id];
      const student = data.student_profiles.find((item) => item.student_id === id);
      return '<button class="case-card" data-case="' + id + '"><span class="case-type">' + esc(meta.type) + ' · ' + esc(meta.tag) + '</span><span class="student"><strong>' + esc(id) + '</strong><span class="badge">' + fmtPct(student.score_rate) + '</span></span><p>' + esc(meta.note) + '</p></button>';
    }).join('');
    $$('.case-card').forEach((card) => card.addEventListener('click', () => showView('case', card.dataset.case)));
  }

  function materialMarkup(refs) {
    if (!refs?.length) return '';
    return '<div class="refs">' + refs.map((ref) => '<span class="ref">' + esc(ref.type || '材料') + ' · ' + esc(ref.id) + (ref.location ? ' · ' + esc(ref.location) : '') + '</span>').join('') + '</div>';
  }

  function teacherMarkup(items) {
    if (!items?.length) return '';
    return items.map((item) => '<details class="teacher-box"><summary>教师解析 · ' + esc(item.item_id) + '</summary><p>' + esc(item.stem) + '</p><p class="teacher-answer">参考答案：' + esc(item.answer) + '</p><p>' + esc(item.analysis) + '</p><p>' + esc(item.note) + '</p></details>').join('');
  }

  function stepMarkup(step) {
    const refs = (step.item_refs ?? []).map((id) => '<span class="ref">题目 · ' + esc(id) + '</span>').concat((step.material_refs ?? []).map((ref) => '<span class="ref">' + esc(ref.type) + ' · ' + esc(ref.id) + '</span>'));
    const hints = (step.hints ?? []).map((hint) => '<details class="hint"><summary><span>第' + esc(hint.level) + '层提示 · ' + esc(hint.purpose) + '</span><span>展开</span></summary><p>' + esc(hint.text) + '</p></details>').join('');
    const success = (step.success_criteria ?? []).map((value) => '<span>' + esc(value) + '</span>').join('');
    return '<article class="step-card"><div class="step-top"><span class="step-no">' + esc(step.step_no) + '</span><div class="step-meta"><strong>' + esc(step.phase) + '</strong><span>' + esc(step.objective) + '</span></div></div><p>' + esc(step.student_action) + '</p><div class="refs">' + refs.join('') + '</div>' + (hints ? '<div class="hints">' + hints + '</div>' : '') + (success ? '<div class="success">' + success + '</div>' : '') + teacherMarkup(step.teacher_only) + '</article>';
  }

  function evidenceMarkup(plan) {
    return (plan.evidence_used ?? []).map((item) => {
      const q = data.question_bank[item.item_id];
      const ratio = item.max_score ? item.score / item.max_score : null;
      return '<div class="evidence-item"><div class="evidence-top"><b>' + esc(item.source_ref) + ' · ' + esc(item.item_id) + '</b><span class="score-chip">' + esc(item.score) + ' / ' + esc(item.max_score) + '</span></div><p>' + esc(q?.stem ?? '') + '</p><div class="answer-line">学生作答：' + esc(item.answer || '未作答') + (item.point_scores ? '<br>评分点：' + esc(item.point_scores) : '') + '</div>' + (ratio === 0 ? '<p>该记录为可核查的零分证据。</p>' : '') + '</div>';
    }).join('') || '<div class="empty">该案例暂无已评分证据，属于补充观察计划。</div>';
  }

  function adjustMarkup(rules) {
    return '<div class="adjust-list">' + rules.map((rule) => '<div class="adjust-item"><b>' + esc(rule.id) + ' · IF</b><p>' + esc(rule.condition) + '</p><b>THEN</b><p>' + esc(rule.action) + '</p></div>').join('') + '</div>';
  }

  function renderCase(studentId) {
    const plan = data.cases[studentId];
    if (!plan) {
      $('#case-content').innerHTML = '<div class="empty">没有该学生案例。</div>';
      return;
    }
    const student = data.student_profiles.find((item) => item.student_id === studentId);
    const meta = caseMeta[studentId];
    const focus = plan.primary_focus;
    $('#page-title').textContent = studentId + ' · 个性化学习计划';
    const focusName = focus ? focus.indicator_id + ' ' + focus.indicator_name : '补充观察：T02I1 / T03I1';
    const summary = '<section class="case-head"><article class="student-hero"><span class="kicker" style="color:#86d8b5">CASE / ' + esc(meta.type) + '</span><h2>' + esc(studentId) + '</h2><p>' + esc(meta.note) + '</p><div class="badge-row"><span class="badge">' + esc(student.class_id) + '</span><span class="badge">' + esc(plan.plan_kind === 'coverage_probe' ? certaintyLabel.insufficient : certaintyLabel[plan.certainty]) + '</span><span class="badge">' + esc(planKindLabel[plan.plan_kind]) + '</span></div></article><article class="panel summary-panel"><span class="summary-label">已评分证据得分率</span><span class="rate">' + fmtPct(student.score_rate) + '</span><p>' + esc(student.graded) + ' 条已评分记录 · ' + esc(student.earned) + '/' + esc(student.possible) + ' 分</p><div class="focus-box"><span class="summary-label">本次首要关注</span><br><b>' + esc(focusName) + '</b><br><span class="summary-label">' + esc(plan.summary) + '</span></div></article></section>';
    $('#case-content').innerHTML = summary + '<div class="case-layout"><section class="plan-section">' + plan.steps.map(stepMarkup).join('') + '</section><aside class="side-stack"><article class="panel"><div class="panel-head"><div><span class="kicker">证据链</span><h3>本计划使用的记录</h3></div><span class="caption">' + esc(plan.evidence_used.length) + ' 条</span></div>' + evidenceMarkup(plan) + '<button class="ghost-button" id="export-plan" style="margin-top:14px;width:100%">导出本计划 JSON</button></article><article class="panel"><span class="kicker">材料与出处</span><h3>学习材料</h3>' + materialMarkup(plan.material_refs) + '<div class="focus-box"><span class="summary-label">观察点</span><br>' + plan.observation.map(esc).join('；') + '</div></article><article class="panel"><span class="kicker">调整规则</span><h3>根据表现怎么改</h3>' + adjustMarkup(plan.adjustment_rules) + '</article><article class="panel"><span class="kicker">适用范围</span><h3>已知限制</h3><ul class="limitations">' + plan.limitations.map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul></article></aside></div>';
    $('#export-plan').addEventListener('click', () => downloadPlan(plan));
  }

  function downloadPlan(plan) {
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = plan.plan_id + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast('学习计划已导出');
  }

  function renderStudents() {
    const term = $('#student-search').value.trim().toLowerCase();
    const rows = data.student_profiles.map((student) => {
      const plan = data.all_plans.find((item) => item.student.id === student.student_id);
      return { student, plan };
    }).filter(({ student, plan }) => {
      const haystack = (student.student_id + ' ' + student.class_id + ' ' + (plan.primary_focus?.indicator_id ?? '补充观察') + ' ' + (plan.primary_focus?.indicator_name ?? '')).toLowerCase();
      return !term || haystack.includes(term);
    });
    $('#student-table').innerHTML = rows.map(({ student, plan }) => '<tr><td><b>' + esc(student.student_id) + '</b></td><td>' + esc(student.class_id) + '</td><td>' + esc(student.graded) + ' / ' + esc(student.records) + '</td><td><b>' + fmtPct(student.score_rate) + '</b></td><td>' + esc(student.topic_count) + '/3</td><td>' + esc(plan.primary_focus ? plan.primary_focus.indicator_id + ' · ' + plan.primary_focus.indicator_name : '补充观察') + '</td><td><button class="link-button" data-open-student="' + esc(student.student_id) + '">查看计划</button></td></tr>').join('') || '<tr><td colspan="7" class="empty">没有匹配的学生。</td></tr>';
    $$('#student-table [data-open-student]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.openStudent;
      if (!data.cases[id]) { toast(id + ' 的完整计划已写入JSON成果包，演示页保留任务书指定的三案例。'); return; }
      showView('case', id);
    }));
  }

  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  try {
    renderCaseNav();
    $$('.nav-item').forEach((item) => item.addEventListener('click', () => showView(item.dataset.view, item.dataset.student)));
    $('#student-search').addEventListener('input', renderStudents);
    $('#print-button').addEventListener('click', () => window.print());
    renderOverview();
    renderStudents();
    showView('overview');
  } catch (error) {
    console.error(error);
    document.body.dataset.runtimeError = error.message;
    const notice = document.createElement('div');
    notice.className = 'toast show';
    notice.textContent = '演示初始化失败：' + error.message;
    document.body.appendChild(notice);
  }
})();
