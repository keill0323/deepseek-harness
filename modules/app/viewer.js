/* Local teacher report. Imported text is always rendered as text nodes. */
const vWorkspace = WORKSPACE.payload
const vSnapshot = vWorkspace.browser_snapshot
const vStudents = vWorkspace.students
const vNodes = vWorkspace.nodes
const vItems = new Map(vSnapshot.input.items.map(item => [item['材料编号'], item]))
const vRecords = new Map(vSnapshot.current.map(record => [record.record_id, record]))
const vNames = { overview: '总览', diagnosis: '学生诊断', plan: '学习计划', comparison: '比较分析', classes: '班级报告', curriculum: '课程依据', quality: '质量复核' }
const vStatusNames = { ok: '已完成', insufficient_data: '证据不足', needs_review: '需复核', error: '操作未完成' }
const vKindNames = { targeted_practice: '针对练习', observation: '补充观察', extension: '解释与迁移', blocked: '暂未生成' }
const vSelectionNames = { diagnosed_error: '优先核对已定位的错误步骤', partial_score: '针对已有失分安排练习', unattempted_item: '选择同指标尚未尝试的题目', explanation_check: '用解释与检验确认已观察表现' }
const vState = {
  view: 'overview', student: vStudents.find(student => student.student_id === 'D01')?.student_id ?? vStudents[0]?.student_id ?? '',
  node: vNodes.at(-1)?.node_id ?? '', comparisonMode: 'peers', secondStudent: vStudents[1]?.student_id ?? vStudents[0]?.student_id ?? '',
  leftClass: vWorkspace.classes[0] ?? '', rightClass: vWorkspace.classes[1] ?? vWorkspace.classes[0] ?? '',
  selectedClass: vWorkspace.classes[0] ?? '', notes: Object.create(null),
  qualityScope: 'all', qualitySearch: '', hintStates: new Map(),
}
let vCurrentExport = WORKSPACE
let vMain
let vPageTitle
let vNodeDescription
let vStudentSelect
let vNodeSelect
let vStudentSearch
let vStudentSearchStatus
const vNavigation = new Map()

function vEl(tag, className = '', ...children) {
  const element = document.createElement(tag)
  if (className) element.className = className
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined) continue
    element.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return element
}

function vButton(label, action, className = 'button button-secondary') {
  const button = vEl('button', className, label)
  button.type = 'button'
  button.addEventListener('click', action)
  return button
}

function vSelect(label, choices, selected, change) {
  const select = vEl('select', 'select')
  select.setAttribute('aria-label', label)
  for (const choice of choices) {
    const option = vEl('option', '', choice.label)
    option.value = choice.value
    option.selected = choice.value === selected
    select.append(option)
  }
  select.addEventListener('change', () => change(select.value))
  return { wrapper: vEl('label', 'field', vEl('span', 'field-label', label), select), select }
}

function vStudentLookup() {
  const input = vEl('input', 'search-input')
  input.type = 'search'
  input.placeholder = '编号或班级，Enter 定位'
  input.setAttribute('aria-label', '快速查找学生')
  input.setAttribute('list', 'student-search-options')
  input.autocomplete = 'off'
  const choices = vEl('datalist')
  choices.id = 'student-search-options'
  for (const student of vStudents) {
    const option = vEl('option')
    option.value = student.student_id
    option.label = student.class_id
    choices.append(option)
  }
  const status = vEl('span', 'search-status')
  status.id = 'student-search-status'
  input.setAttribute('aria-describedby', status.id)
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  const search = select => {
    const query = input.value.trim().normalize('NFKC').toLowerCase()
    if (!query) { status.textContent = ''; return }
    const exact = vStudents.find(student => student.student_id.normalize('NFKC').toLowerCase() === query)
    const matches = vStudents.filter(student => `${student.student_id} ${student.class_id}`.normalize('NFKC').toLowerCase().includes(query))
    const found = exact ?? (matches.length === 1 ? matches[0] : null)
    status.textContent = found ? `按 Enter 查看 ${found.student_id}` : matches.length ? `找到 ${matches.length} 名，请继续输入编号` : '没有匹配的学生'
    if (select && found) {
      vState.student = found.student_id
      vStudentSelect.value = found.student_id
      status.textContent = `已选择 ${found.student_id}`
      vRender()
    }
  }
  input.addEventListener('input', () => search(false))
  input.addEventListener('change', () => { if (vStudents.some(student => student.student_id === input.value)) search(true) })
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); search(true) }
    else if (event.key === 'Escape') { input.value = ''; status.textContent = '' }
  })
  vStudentSearch = input
  vStudentSearchStatus = status
  return vEl('label', 'field student-search-field', vEl('span', 'field-label', '快速查找学生 · /'), input, choices, status)
}

function vClearStudentSearch() {
  vStudentSearch.value = ''
  vStudentSearchStatus.textContent = ''
}

function vFormat(value, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : Number(value).toFixed(digits).replace(/\.0$/, '')
}

function vRate(value) {
  return value === null || value === undefined ? '暂无可计分证据' : `${vFormat(value * 100)}%`
}

function vBadge(status) {
  return vEl('span', `status status-${status}`, vStatusNames[status] ?? status)
}

function vPanel(title, description, ...content) {
  return vEl('section', 'panel', vEl('div', 'section-heading', vEl('h2', '', title), description ? vEl('p', 'muted', description) : null), ...content)
}

function vEmpty(message) {
  return vEl('div', 'empty-state', vEl('span', 'empty-mark', '·'), vEl('p', '', message))
}

function vMetrics(metrics) {
  return vEl('div', 'metrics', metrics.map(metric => vEl('div', 'metric', vEl('span', 'metric-label', metric.label), vEl('strong', 'metric-value', metric.value), metric.detail ? vEl('span', 'metric-detail', metric.detail) : null)))
}

function vTable(columns, rows, emptyMessage = '当前范围没有记录。') {
  if (!rows.length) return vEmpty(emptyMessage)
  const head = vEl('tr', '', columns.map(column => vEl('th', '', column.label)))
  const body = rows.map(row => vEl('tr', '', columns.map(column => vEl('td', '', column.render(row)))))
  return vEl('div', 'table-scroll', vEl('table', 'data-table', vEl('thead', '', head), vEl('tbody', '', body)))
}

function vDownload(value, filename) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json;charset=utf-8' }))
  const anchor = vEl('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function vCase() {
  return vWorkspace.cases[vScopeKey(vState.student, vState.node)]
}

function vScopeKey(entity, node) {
  return `${encodeURIComponent(entity)}:${encodeURIComponent(node)}`
}

function vEvidenceBody(record) {
  const issues = record.quality_issues.map(issue => vEl('li', '', issue.message))
  return vEl('div', 'evidence-body',
    vEl('p', 'notice', '教师证据视图包含原始模拟作答。它不属于学生提示，也不提供生产环境身份认证。'),
    vEl('dl', 'evidence-meta',
      vEl('dt', '', '学生 / 题目 / 节点'), vEl('dd', '', `${record.student_id} / ${record.item_id} / ${record.node_id}`),
      vEl('dt', '', '作答事件 / 修订'), vEl('dd', '', `${record.event_id} / v${record.revision}`),
      vEl('dt', '', '原始评分 / 统计处理'), vEl('dd', '', `${record.grading_status} · ${record.score ?? '未知'} / ${record.max_score ?? '未知'} · ${record.include_in_statistics ? '纳入统计' : '未纳入统计'}`),
      vEl('dt', '', '生效主题 / 得分 / 满分'), vEl('dd', '', `${record.corrected?.topic_id ?? record.topic_id} · ${record.corrected?.score ?? record.score ?? '未知'} / ${record.corrected?.max_score ?? record.max_score ?? '未知'}`),
      vEl('dt', '', '来源'), vEl('dd', '', `${record.source.file} · 第 ${record.source.row_number} 条逻辑行`)),
    vEl('h3', '', '题目'), vEl('p', 'preserve', vItems.get(record.item_id)?.['题干或内容'] ?? '题目正文未随报告提供。'),
    vEl('h3', '', '原始最终作答'), vEl('pre', 'evidence-text', record.answer || '未提供'),
    vEl('h3', '', '原始解答过程'), vEl('pre', 'evidence-text', record.steps || '未提供，不能编造步骤错误。'),
    vEl('h3', '', '原始分点评分'), vEl('pre', 'evidence-text', record.point_scores || '未提供'),
    issues.length ? vEl('div', 'review-note', vEl('strong', '', '质量问题与处理依据'), vEl('ul', '', issues)) : null)
}

function vOpenEvidence(id) {
  const record = vRecords.get(id)
  const dialog = vEl('dialog', 'evidence-dialog')
  const close = () => dialog.close()
  dialog.append(vEl('div', 'dialog-heading', vEl('h2', '', `作答证据 ${id}`), vButton('关闭', close)), record ? vEvidenceBody(record) : vEmpty('报告未包含这条原始记录，不能核对其内容。'))
  dialog.addEventListener('close', () => dialog.remove(), { once: true })
  dialog.addEventListener('click', event => { if (event.target === dialog) close() })
  document.body.append(dialog)
  dialog.showModal()
}

function vEvidenceLinks(ids) {
  return vEl('div', 'evidence-links', [...new Set(ids)].map(id => vButton(id, () => vOpenEvidence(id), 'evidence-link')))
}

function vLimitations(result) {
  if (!result?.limitations?.length) return vEl('span')
  return vEl('details', 'limitations', vEl('summary', '', '适用范围与处理说明'), vEl('ul', '', result.limitations.map(text => vEl('li', '', text))))
}

function vShow(view, student) {
  vState.view = view
  if (student) vState.student = student
  vStudentSelect.value = vState.student
  if (student) vClearStudentSearch()
  vRender()
}

function vOverview() {
  vCurrentExport = { ...WORKSPACE, payload: { ...vWorkspace, browser_snapshot: undefined } }
  vMain.append(vMetrics([
    { label: '模拟学生', value: vStudents.length, detail: `${vWorkspace.classes.length} 个模拟班级` },
    { label: '当前作答事件', value: vWorkspace.summary.current_event_count, detail: `${vWorkspace.summary.raw_record_count} 行原始记录，先选最高修订` },
    { label: '有效计分记录', value: vWorkspace.summary.stat_included_count, detail: '实际进入统计的当前记录' },
    { label: '等待复核', value: vWorkspace.summary.review_count, detail: '复核标记；结构冲突项暂不计分' },
  ]))
  const preferred = ['D01', 'D14', 'D17'].filter(id => vStudents.some(student => student.student_id === id))
  const representatives = [...new Set([...preferred, ...vStudents.map(student => student.student_id)])].slice(0, 3)
  vMain.append(vPanel('从一个学习问题开始', '切换学生和测验节点，沿着表现、诊断、学习活动查看依据。',
    vEl('div', 'case-grid', representatives.map(id => {
      const item = vWorkspace.cases[vScopeKey(id, vState.node)]
      const stats = item.statistics.payload
      return vEl('article', 'case-card', vEl('div', 'case-heading', vEl('h3', '', id), vBadge(item.diagnosis.result_status)),
        vEl('p', 'case-score', vRate(stats.score_rate)), vEl('p', 'muted', `${stats.valid_record_count} 条有效记录 · ${item.diagnosis.payload.covered_indicator_ids.length} 个已观察指标`),
        vEl('p', 'case-description', `${vKindNames[item.plan.payload.plan_type]}；结论仅适用于当前节点已观察的内容。`),
        vButton('查看诊断', () => vShow('diagnosis', id), 'button button-primary'))
    }))))
  vMain.append(vPanel('三个任务，一条依据链', '每一步都能回到课程索引、原始记录和具体学习材料。',
    vEl('div', 'workflow', [
      ['01', '理解学科', `梳理主题、${vWorkspace.curriculum.payload.entries.length}个观察指标、课标页码与相关教材。`, 'curriculum'],
      ['02', '理解学生', '区分已观察事实、有限推断、证据不足和评分待复核。', 'diagnosis'],
      ['03', '理解教学', '把建议落实为练习、提示、观察与调整条件。', 'plan'],
    ].map(([number, title, description, view]) => vEl('article', 'workflow-step', vEl('span', 'step-number', number), vEl('h3', '', title), vEl('p', 'muted', description), vButton('打开', () => vShow(view), 'text-button'))))))
  vMain.append(vEl('p', 'page-note', '本报告全部由同一数据快照生成。模拟记录用于核验任务质量，不能据此证明真实教学成效。'))
}

function vStatistics(stats) {
  return vMetrics([
    { label: '有效作答得分率', value: vRate(stats.score_rate), detail: stats.possible_score === null ? '缺记录保持未知' : `${stats.earned_score} / ${stats.possible_score} 分` },
    { label: '有效 / 已有记录', value: `${stats.valid_record_count} / ${stats.record_count}`, detail: '待评分与复核项不计分' },
    { label: '已观察指标', value: stats.indicators.filter(indicator => indicator.valid_record_count > 0).length, detail: `共 ${stats.indicators.length} 个课程观察指标` },
    { label: '评分待复核', value: stats.review_record_ids.length, detail: '不由疑点推断知识漏洞' },
  ])
}

function vDiagnosis() {
  const item = vCase()
  if (!item) return vMain.append(vEmpty('当前对象没有可用的分析结果。'))
  vCurrentExport = item.diagnosis
  const stats = item.statistics.payload
  vMain.append(vStatistics(stats))
  vMain.append(vPanel('主题与指标覆盖', '得分率只描述已有有效作答；无记录和未教学分别显示。',
    vTable([
      { label: '学习主题', render: row => `${vWorkspace.curriculum.payload.topics.find(topic => topic.topic_id === row.topic_id)?.name ?? row.topic_id}` },
      { label: '教学范围', render: row => row.taught ? '本节点已教' : '本节点未教' },
      { label: '有效记录', render: row => row.valid_record_count },
      { label: '得分率', render: row => vRate(row.score_rate) },
    ], stats.topics),
    vEl('details', 'indicator-details', vEl('summary', '', '展开全部观察指标'), vTable([
      { label: '指标', render: row => `${row.indicator_id} · ${vWorkspace.curriculum.payload.entries.find(entry => entry.indicator_id === row.indicator_id)?.indicator_description ?? ''}` },
      { label: '有效记录', render: row => row.valid_record_count }, { label: '得分率', render: row => vRate(row.score_rate) },
      { label: '依据', render: row => vEvidenceLinks(row.evidence_ids) },
    ], stats.indicators))))
  const categories = [['fact', '已观察事实', '可由评分、步骤或统计直接核对'], ['inference', '有限推断', '保留适用范围，供教师判断'], ['insufficient_data', '证据不足', '安排补充观察，暂不判断未掌握'], ['scoring_review', '评分待复核', '先核对记录，不形成薄弱点结论']]
  for (const [category, title, description] of categories) {
    const findings = item.diagnosis.payload.findings.filter(finding => finding.category === category)
    vMain.append(vPanel(title, description, findings.length ? vEl('div', 'findings', findings.map(finding => vEl('article', `finding finding-${category}`,
      vEl('div', 'finding-heading', vEl('h3', '', finding.title), vEl('span', 'subtle-code', finding.indicator_id ?? '')),
      vEl('p', 'preserve', finding.description),
      finding.step_refs.length ? vEl('p', 'muted', `步骤 ${finding.step_refs.join('、')} · 评分点 ${finding.point_refs.join('、') || '未定位'}`) : null,
      finding.material_ids.length ? vEl('p', 'muted', `相关材料 ${finding.material_ids.join('、')}`) : null,
      vEvidenceLinks(finding.evidence_ids)))) : vEmpty('当前没有这一类结论。')))
  }
  vMain.append(vLimitations(item.diagnosis))
}

function vStudentPlan(item) {
  const plan = item.plan
  return {
    schema_version: plan.schema_version, dataset_version: plan.dataset_version, policy_version: plan.policy_version,
    producer_version: plan.producer_version, source_mode: plan.source_mode, scope: plan.scope,
    result_status: plan.result_status, payload: {
      student_id: plan.payload.student_id, node_id: plan.payload.node_id, plan_type: plan.payload.plan_type,
      certainty: plan.payload.certainty, summary: plan.payload.summary, evidence_gaps: plan.payload.evidence_gaps,
      ...(plan.payload.delivery ? { delivery: plan.payload.delivery } : {}),
      activities: plan.payload.activities.map(activity => ({
        activity_id: activity.activity_id, order: activity.order, kind: activity.kind, goal: activity.goal,
        ...(activity.phase ? { phase: activity.phase } : {}),
        ...(activity.selection_reason ? { selection_reason: activity.selection_reason } : {}),
        indicator_id: activity.indicator_id, topic_id: activity.topic_id, item_ids: activity.item_ids, material_ids: activity.material_ids,
        prompt: activity.prompt, observation: activity.observation, adjust_when: activity.adjust_when,
        success_criteria: activity.success_criteria, next_if_success: activity.next_if_success, next_if_not: activity.next_if_not,
        hints: Object.fromEntries(activity.item_ids.map(id => [id, (item.hints[id] ?? []).map(hint => ({ level: hint.payload.level, hint: hint.payload.hint }))])),
      })),
    }, limitations: ['学生练习清单不包含原始答案、参考答案、解答过程或分点评分。'],
  }
}

function vPlan() {
  const item = vCase()
  if (!item) return vMain.append(vEmpty('当前没有可用计划。'))
  vCurrentExport = item.plan
  vMain.append(vSelect('内容模式', [{ value: 'student', label: '学生提示' }, { value: 'teacher', label: '教师核对' }], vState.planMode ?? 'student', value => { vState.planMode = value; vRender() }).wrapper)
  const certaintyNames = { insufficient: '证据不足', provisional: '结论暂定', adequate: '证据较充分' }
  vMain.append(vEl('div', 'plan-intro', vEl('div', '', vEl('p', 'eyebrow', '当前建议类型'), vEl('h2', '', vKindNames[item.plan.payload.plan_type]),
    vEl('p', 'muted', `证据状态：${certaintyNames[item.plan.payload.certainty] ?? '证据不足'} · ${item.plan.payload.summary ?? '本地规则根据当前节点已有记录生成。'}`),
    item.plan.payload.evidence_gaps?.length ? vEl('p', 'muted', `补充观察：${item.plan.payload.evidence_gaps.map(gap => gap.indicator_id).join('、')}`) : null),
    vButton('导出学生练习清单', () => vDownload(vStudentPlan(item), `${vState.student}-${vState.node}-student-plan.json`), 'button button-primary')))
  if (!item.plan.payload.activities.length) vMain.append(vEmpty('诊断未完成或缺少合适材料，暂未生成活动。请先查看处理说明。'))
  const firstIds = new Set(item.plan.payload.delivery?.first_activity_ids ?? item.plan.payload.activities.map(activity => activity.activity_id))
  const firstActivities = item.plan.payload.activities.filter(activity => firstIds.has(activity.activity_id))
  const laterActivities = item.plan.payload.activities.filter(activity => !firstIds.has(activity.activity_id))
  const renderActivity = activity => {
    const questions = activity.item_ids.map(id => {
      const question = vItems.get(id)
      const hints = item.hints[id] ?? []
      const hintKey = JSON.stringify([vState.student, vState.node, id])
      const hintState = vState.hintStates.get(hintKey) ?? { revealed: 0, selected: 0 }
      const shownHint = hints.find(value => value.payload.level === hintState.selected)
      const hintText = vEl('p', 'hint-text', shownHint?.payload.hint || '先独立尝试，需要帮助时再逐级查看提示。')
      const controls = vEl('div', 'hint-controls')
      for (const level of [1, 2, 3]) {
        const button = vButton(`提示 ${level}`, () => {
          const hint = hints.find(value => value.payload.level === level)
          hintText.textContent = hint?.payload.hint || '本级提示暂不可用，请教师补充。'
          hintState.revealed = Math.max(hintState.revealed, level)
          hintState.selected = level
          vState.hintStates.set(hintKey, hintState)
          for (const control of controls.children) control.disabled = Number(control.dataset.level) > hintState.revealed + 1
          for (const control of controls.children) control.classList.toggle('active', Number(control.dataset.level) === level)
        }, 'hint-button')
        button.dataset.level = String(level)
        button.disabled = level > hintState.revealed + 1
        button.classList.toggle('active', hintState.selected === level)
        controls.append(button)
      }
      return vEl('div', 'question', vEl('div', 'question-heading', vEl('strong', '', id), vEl('span', 'muted', question?.['题型'] ?? '学习练习')),
        vEl('p', 'question-text preserve', question?.['题干或内容'] ?? '题目正文未随报告提供。'),
        question?.['选项'] ? vEl('p', 'preserve muted', question['选项']) : null,
        controls, hintText,
        vState.planMode === 'teacher' ? vEl('details', 'material-details', vEl('summary', '', '教师参考答案与评分依据'),
          vEl('p', 'notice', '仅供教师核对；学生练习清单不包含以下内容。'),
          vEl('h3', '', '参考答案'), vEl('p', 'preserve', item.teacher_hints[id]?.payload.teacher_solution?.reference_answer || '未提供'),
          vEl('h3', '', '参考解析'), vEl('p', 'preserve', item.teacher_hints[id]?.payload.teacher_solution?.reference_analysis || '未提供'),
          vEl('h3', '', '评分依据'), vEl('p', 'preserve', item.teacher_hints[id]?.payload.teacher_solution?.scoring_rubric || '未提供')) : null)
    })
    const detail = vEl('dl', 'activity-details',
      vEl('dt', '', '完成标准'), vEl('dd', '', (activity.success_criteria ?? []).join('；')),
      vEl('dt', '', '观察什么'), vEl('dd', '', activity.observation),
      vEl('dt', '', '达成后'), vEl('dd', '', activity.next_if_success ?? '减少提示并进入同指标变式。'),
      vEl('dt', '', '未达成'), vEl('dd', '', activity.next_if_not ?? '保留新证据并由教师调整。'),
      vEl('dt', '', '何时调整'), vEl('dd', '', activity.adjust_when))
    return vEl('section', 'panel activity', vEl('div', 'activity-heading', vEl('span', 'activity-number', String(activity.order).padStart(2, '0')),
      vEl('div', '', vEl('span', 'eyebrow', vKindNames[activity.kind]), vEl('h2', '', activity.goal))),
      vEl('p', 'preserve', activity.rationale), activity.selection_reason ? vEl('p', 'selection-reason', vSelectionNames[activity.selection_reason] ?? '依据当前学习需求选择') : null,
      vEl('p', 'activity-prompt', activity.prompt), questions,
      vEl('p', 'muted', `学习材料 ${activity.material_ids.join('、') || '暂未匹配'} · 指标 ${activity.indicator_id}`), detail, vEvidenceLinks(activity.evidence_ids))
  }
  if (item.plan.payload.delivery && item.plan.payload.activities.length) vMain.append(vEl('p', 'notice', `本轮先完成 ${firstActivities.length} 项活动。${item.plan.payload.delivery.advance_when}`))
  vMain.append(...firstActivities.map(renderActivity))
  if (laterActivities.length) {
    vMain.append(vEl('details', 'plan-followup', vEl('summary', '', `后续学习活动（${laterActivities.length} 项）`),
      vEl('p', 'muted', '保留完整后续安排，完成本轮观察后再由教师决定进入下一阶段。'), laterActivities.map(renderActivity)))
  }
  vMain.append(vLimitations(item.plan))
}

function vComparison() {
  const controls = vEl('div', 'comparison-controls')
  controls.append(vSelect('比较方式', [{ value: 'peers', label: '个人与同伴' }, { value: 'students', label: '两名学生' }, { value: 'classes', label: '两个班级' }], vState.comparisonMode, value => { vState.comparisonMode = value; vRender() }).wrapper)
  let result
  if (vState.comparisonMode === 'peers') {
    result = compare_with_peers(vSnapshot, { student_id: vState.student, node_id: vState.node })
    controls.append(vEl('p', 'muted comparison-explain', '以顶部选中的学生为左侧，右侧同班同伴先排除本人。'))
  } else if (vState.comparisonMode === 'students') {
    controls.append(vSelect('右侧学生', vStudents.map(student => ({ value: student.student_id, label: `${student.student_id} · ${student.class_id}` })), vState.secondStudent, value => { vState.secondStudent = value; vRender() }).wrapper)
    result = compare_students(vSnapshot, { left_student_id: vState.student, right_student_id: vState.secondStudent, node_id: vState.node })
  } else {
    for (const [key, label] of [['leftClass', '左侧班级'], ['rightClass', '右侧班级']]) controls.append(vSelect(label, vWorkspace.classes.map(id => ({ value: id, label: id })), vState[key], value => { vState[key] = value; vRender() }).wrapper)
    result = compare_classes(vSnapshot, { left_class_id: vState.leftClass, right_class_id: vState.rightClass, node_id: vState.node })
  }
  vCurrentExport = result
  vMain.append(vPanel('在相同题目上比较', '仅使用同一测验节点的共同有效题，双方按相同满分权重计算。', controls))
  const payload = result.payload
  vMain.append(vMetrics([
    { label: `左侧 · ${payload.left_label}`, value: vRate(payload.left_rate), detail: '共同题集加权得分率' },
    { label: `右侧 · ${payload.right_label}`, value: vRate(payload.right_rate), detail: payload.exclude_self ? '同伴已排除本人' : '共同题集加权得分率' },
    { label: '左侧减右侧', value: payload.delta_percentage_points === null ? '暂无可比结果' : `${payload.delta_percentage_points > 0 ? '+' : ''}${vFormat(payload.delta_percentage_points)} 个百分点`, detail: '分数差不代表因果或学习进步' },
    { label: '共同有效题', value: `${payload.shared_item_ids.length} / ${payload.candidate_item_ids.length}`, detail: `${payload.excluded_items.length} 题因样本不足移除` },
  ]))
  vMain.append(vPanel('逐题计算与依据', '先在题内平均学生得分率，再按题目满分占比加权。', vBadge(result.result_status),
    vTable([
      { label: '题目 / 权重', render: row => vEl('div', '', vEl('strong', '', row.item_id), vEl('p', 'muted', `${row.max_score} 分 · 权重 ${vFormat(row.weight * 100)}%`)) },
      { label: '左侧', render: row => `${vRate(row.left_mean_rate)} · ${row.left_count} 人` },
      { label: '右侧', render: row => `${vRate(row.right_mean_rate)} · ${row.right_count} 人` },
      { label: '作答依据', render: row => vEl('div', '', vEvidenceLinks(row.left_evidence_ids), vEvidenceLinks(row.right_evidence_ids)) },
    ], payload.items, '没有共同有效题，保留未知结果。补充两侧同题有效作答后再比较。')))
  const reasonNames = { no_valid_left_sample: '左侧无有效样本', no_valid_right_sample: '右侧无有效样本' }
  if (payload.excluded_items.length) vMain.append(vEl('details', 'limitations', vEl('summary', '', `查看 ${payload.excluded_items.length} 道移除题目及理由`),
    vTable([{ label: '题目', render: row => row.item_id }, { label: '移除理由', render: row => row.reason_codes.map(reason => reasonNames[reason] ?? reason).join('；') }], payload.excluded_items)))
  if (payload.quality_record_ids.length) vMain.append(vPanel('范围内评分待复核', '以下记录未参加比较。', vEvidenceLinks(payload.quality_record_ids)))
  vMain.append(vLimitations(result))
}

function vClasses() {
  const control = vSelect('选择班级', vWorkspace.classes.map(id => ({ value: id, label: id })), vState.selectedClass, value => { vState.selectedClass = value; vRender() })
  const result = vWorkspace.class_reports[vScopeKey(vState.selectedClass, vState.node)]
  const payload = result.payload
  vCurrentExport = result
  vMain.append(vEl('p', 'print-scope', `班级 ${vState.selectedClass} · 测验节点 ${vState.node}`))
  vMain.append(vEl('div', 'inline-controls', control.wrapper, vBadge(result.result_status)))
  vMain.append(vMetrics([
    { label: '班级人数', value: payload.student_count, detail: `${payload.observed_student_count} 人有记录` },
    { label: '已有有效作答得分率', value: vRate(payload.score_rate), detail: '仅描述实际样本，班间请用比较页' },
    { label: '有效作答记录', value: payload.valid_record_count, detail: `${payload.review_count} 条待复核` },
    { label: '有效题目覆盖', value: vRate(payload.coverage.item_coverage_rate), detail: `${payload.coverage.valid_item_count} / ${payload.coverage.available_item_count} 道节点允许题` },
  ]))
  vMain.append(vPanel('班级学习内容覆盖', '未教学与未观察保持分开。', vTable([
    { label: '主题', render: row => vWorkspace.curriculum.payload.topics.find(topic => topic.topic_id === row.topic_id)?.name ?? row.topic_id },
    { label: '范围', render: row => row.taught ? '本节点已教' : '本节点未教' },
    { label: '有记录人数', render: row => row.observed_student_count },
    { label: '有效记录', render: row => row.valid_record_count },
    { label: '得分率', render: row => vRate(row.score_rate) },
  ], payload.topics)))
  vMain.append(vPanel('逐题与评分点分布', '按有效作答事件计数，另列不同学生人数；缺记录不记零分。', payload.items.map(item => vEl('details', 'material-details',
    vEl('summary', '', `${item.item_id} · ${item.scored_student_count} 人 / ${item.valid_record_count} 条有效记录 · ${vRate(item.score_rate)}`),
    vEl('p', 'muted', `得分分布：${item.score_distribution.map(value => `${value.score}分 ${value.record_count}条`).join('；') || '暂无已评分样本'}`),
    vTable([{ label: '评分点', render: point => point.point_id }, { label: '有效人数', render: point => point.scored_student_count },
      { label: '得分率', render: point => vRate(point.score_rate) },
      { label: '分布（事件数）', render: point => point.score_distribution.map(value => `${value.score}分 ${value.record_count}条`).join('；') || '暂无样本' },
      { label: '依据', render: point => vEvidenceLinks(point.evidence_ids) }], item.scoring_points)))))
  const plan = vWorkspace.class_plans[vScopeKey(vState.selectedClass, vState.node)]
  if (plan) {
    vMain.append(vPanel('班级教学建议', '按指标与已有证据分组，不作全班能力排名。', plan.payload.recommendations.map(recommendation => vEl('section', 'question',
      vEl('h3', '', recommendation.goal), vEl('p', '', `适用学生：${recommendation.student_ids.join('、')}`),
      vEl('p', '', recommendation.rationale), vEl('ol', '', recommendation.steps.map(step => vEl('li', '', step))),
      vEl('p', 'muted', `可选题目：${recommendation.item_ids.join('、')} · 材料：${recommendation.material_ids.join('、') || '未提供'}`),
      vEl('p', '', `观察：${recommendation.observation}`), vEl('p', '', `调整条件：${recommendation.adjust_when}`),
      vEvidenceLinks(recommendation.evidence_ids)))))
    vMain.append(vButton('导出班级教学建议', () => vDownload(plan, `${vState.selectedClass}-${vState.node}-teaching-plan.json`)), vLimitations(plan))
  }
  vMain.append(vPanel('学生记录概况', '点击学生查看其诊断，空记录保持未知。', vTable([
    { label: '学生', render: row => vButton(row.student_id, () => vShow('diagnosis', row.student_id), 'text-button') },
    { label: '有效 / 已有记录', render: row => `${row.valid_record_count} / ${row.record_count}` },
    { label: '得分率', render: row => vRate(row.score_rate) }, { label: '待复核', render: row => row.review_count },
  ], payload.student_summaries)))
  if (payload.quality_record_ids.length) vMain.append(vPanel('本班复核队列', '请先核对评分和引用，再更新结论。', vEvidenceLinks(payload.quality_record_ids)))
  vMain.append(vLimitations(result))
}

function vCurriculum() {
  const curriculum = vWorkspace.curriculum
  vCurrentExport = curriculum
  vMain.append(vEl('p', 'notice', '课程页码来自输入索引。这里展示材料定位，不声称已经逐页核验 PDF 内容。'))
  for (const topic of curriculum.payload.topics) {
    const entries = curriculum.payload.entries.filter(entry => entry.topic_id === topic.topic_id)
    vMain.append(vPanel(`${topic.topic_id} · ${topic.name}`, topic.objective,
      vTable([
        { label: '观察指标', render: row => vEl('div', '', vEl('strong', '', row.indicator_id), vEl('p', '', row.indicator_description)) },
        { label: '课程标准定位', render: row => vEl('div', '', row.course_standard.file, vEl('p', 'muted', `文件第 ${row.course_standard.file_page ?? '未提供'} 页 / 正文第 ${row.course_standard.printed_page ?? '未提供'} 页`), vEl('span', 'index-label', '输入索引')) },
        { label: '教材与材料', render: row => vEl('div', '', row.textbook_pages ?? '页段未提供', vEl('p', 'muted', row.material_ids.join('、') || '未匹配')) },
        { label: '关联题目', render: row => row.question_ids.join('、') || '未匹配' },
      ], entries),
      vEl('details', 'material-details', vEl('summary', '', '查看相关学习材料'),
        vEl('div', 'material-list', [...new Map(entries.flatMap(entry => entry.materials).map(material => [material.material_id, material])).values()].map(material => vEl('article', '',
          vEl('h3', '', `${material.material_id} · ${material.type}`), vEl('p', 'preserve', material.title), vEl('p', 'muted', material.source_file ?? '未提供源文件名')))))))
  }
  if (curriculum.payload.links.length) vMain.append(vPanel('内容之间的必要联系', '以下为教学组织建议，先后顺序可由教师结合任务调整。', curriculum.payload.links.map(link => vEl('p', '', `${link.from_topic_id} → ${link.to_topic_id}：${link.basis}`))))
  vMain.append(vLimitations(curriculum))
}

function vQuality() {
  vMain.append(vMetrics([
    { label: '质量问题记录', value: vWorkspace.quality_records.length, detail: '保留原值；已纠正与待复核分别处理' },
    { label: '修订事件', value: vWorkspace.summary.revised_event_count, detail: '最高版本异常时不会回退旧版' },
    { label: '正常未评分排除', value: vWorkspace.summary.excluded_count, detail: '未评分不是错误作答' },
  ]))
  vMain.append(vEl('p', 'notice', '上方计数为完整快照。下方可筛选当前学生与节点，或按记录、题目和问题原因查找；筛选不改变评分。'))
  const list = vEl('div', 'quality-results')
  const count = vEl('p', 'quality-result-count')
  count.setAttribute('role', 'status')
  count.setAttribute('aria-live', 'polite')
  const query = vEl('input', 'search-input')
  query.type = 'search'
  query.value = vState.qualitySearch
  query.placeholder = '记录、学生、题目或复核原因'
  query.setAttribute('aria-label', '搜索复核记录')
  const renderResults = () => {
    const text = vState.qualitySearch.trim().normalize('NFKC').toLowerCase()
    const records = vWorkspace.quality_records.filter(record => {
      if (vState.qualityScope === 'current' && (record.student_id !== vState.student || record.node_id !== vState.node)) return false
      return !text || `${record.record_id} ${record.event_id} ${record.student_id} ${record.item_id} ${record.node_id} ${record.quality_issues.map(issue => `${issue.code} ${issue.message}`).join(' ')}`.normalize('NFKC').toLowerCase().includes(text)
    })
    vCurrentExport = { ...WORKSPACE, evidence_ids: records.map(record => record.record_id), scope: { quality_scope: vState.qualityScope, search: vState.qualitySearch,
      ...(vState.qualityScope === 'current' ? { student_id: vState.student, node_id: vState.node } : {}) },
      payload: { quality_records: records, summary: vWorkspace.summary, filtered_count: records.length } }
    count.textContent = `显示 ${records.length} / ${vWorkspace.quality_records.length} 条质量问题记录 · ${vState.qualityScope === 'current' ? `${vState.student} / ${vState.node}` : '整个数据快照'}${vState.qualitySearch.trim() ? ` · 查找“${vState.qualitySearch.trim()}”` : ''}`
    list.replaceChildren()
    for (const record of records) {
    const details = vEl('details', 'quality-record', vEl('summary', '', vEl('strong', '', record.record_id), vEl('span', '', `${record.student_id} · ${record.item_id} · ${record.node_id}`), vBadge(record.action === 'review' ? 'needs_review' : 'ok')),
      vEl('ul', 'quality-reasons', record.quality_issues.map(issue => vEl('li', '', issue.message))), vEvidenceBody(record))
      list.append(details)
    }
    if (!records.length) list.append(vEmpty(vWorkspace.quality_records.length ? '没有匹配记录，请调整筛选条件。' : '当前快照未检测到待复核记录；这不替代数学过程的人工核验。'))
  }
  const scope = vSelect('复核范围', [{ value: 'all', label: '整个数据快照' }, { value: 'current', label: '当前学生与节点' }], vState.qualityScope, value => { vState.qualityScope = value; renderResults() })
  query.addEventListener('input', () => { vState.qualitySearch = query.value; renderResults() })
  vMain.append(vEl('div', 'quality-controls', scope.wrapper, vEl('label', 'field quality-search', vEl('span', 'field-label', '搜索复核记录'), query),
    vButton('清除筛选', () => { vState.qualityScope = 'all'; vState.qualitySearch = ''; scope.select.value = 'all'; query.value = ''; renderResults() })), count, list)
  renderResults()
}

function vNotes() {
  const key = `${vState.view}:${vScopeKey(vState.student, vState.node)}`
  const textarea = vEl('textarea', 'notes-input')
  textarea.rows = 3
  textarea.placeholder = '记录需要复核的依据、讲解调整或下一次观察；不会修改已有统计和诊断。'
  textarea.setAttribute('aria-label', '本地教师备注')
  textarea.value = vState.notes[key] ?? ''
  textarea.addEventListener('input', () => { vState.notes[key] = textarea.value })
  return vEl('section', 'teacher-notes', vEl('div', 'notes-heading', vEl('h2', '', '教师备注'),
    vButton('导出备注', () => vDownload({ dataset_version: WORKSPACE.dataset_version, policy_version: WORKSPACE.policy_version,
      kind: 'teacher_notes', changes_facts: false, notes: vState.notes }, 'teacher-notes.json'))),
    vEl('p', 'muted', '仅保留在当前浏览器会话，关闭页面前请导出。备注与分析事实分开保存。'), textarea)
}

function vRender() {
  vPageTitle.textContent = vNames[vState.view]
  vNodeDescription.textContent = `${vState.student} · ${vState.node}　${vNodes.find(node => node.node_id === vState.node)?.description ?? ''}`
  for (const [key, button] of vNavigation) {
    button.classList.toggle('active', key === vState.view)
    if (key === vState.view) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  vMain.replaceChildren()
  const render = { overview: vOverview, diagnosis: vDiagnosis, plan: vPlan, comparison: vComparison, classes: vClasses, curriculum: vCurriculum, quality: vQuality }[vState.view]
  if (!vStudents.length || !vNodes.length) vMain.append(vEmpty('当前快照没有学生或测验节点，请重新导入有效数据。'))
  else render()
  vMain.append(vNotes())
}

function vStart() {
  const app = document.getElementById('app')
  const nav = vEl('nav', 'navigation')
  nav.setAttribute('aria-label', '报告页面')
  const navMarks = ['总', '诊', '学', '比', '班', '课', '核']
  Object.entries(vNames).forEach(([key, label], index) => {
    const button = vButton('', () => vShow(key), 'nav-button')
    button.append(vEl('span', 'nav-mark', navMarks[index]), vEl('span', '', label))
    nav.append(button)
    vNavigation.set(key, button)
  })
  const version = vEl('code', 'version-code', WORKSPACE.dataset_version.replace('sha256:', '').slice(0, 12))
  version.title = WORKSPACE.dataset_version
  const sidebar = vEl('aside', 'sidebar', vEl('div', 'brand', vEl('span', 'brand-mark', '学'), vEl('div', '', vEl('strong', '', '智慧学伴'), vEl('span', 'brand-subtitle', '学习有依据'))),
    nav, vEl('div', 'sidebar-footer', vEl('span', 'local-dot', '本地规则分析'), vEl('p', '', '同一快照 · 可追溯依据'), version))
  const studentField = vSelect('模拟学生', vStudents.map(student => ({ value: student.student_id, label: `${student.student_id} · ${student.class_id}` })), vState.student, value => { vState.student = value; vClearStudentSearch(); vRender() })
  const nodeField = vSelect('测验节点', vNodes.map(node => ({ value: node.node_id, label: `${node.node_id} · ${node.date}` })), vState.node, value => { vState.node = value; vRender() })
  vStudentSelect = studentField.select
  vNodeSelect = nodeField.select
  vNodeSelect.setAttribute('aria-label', '测验节点')
  vPageTitle = vEl('h1', '', '总览')
  vNodeDescription = vEl('p', 'node-description')
  const toolbar = vEl('header', 'topbar', vEl('div', 'title-block', vEl('p', 'eyebrow', '教师工作台 · 本地报告'), vPageTitle),
    vEl('div', 'toolbar-controls', vStudentLookup(), studentField.wrapper, nodeField.wrapper,
      vButton('打印当前页', () => window.print()), vButton('导出当前 JSON', () => vDownload(vCurrentExport, `${vState.view}-${vState.student}-${vState.node}.json`), 'button button-primary')))
  vMain = vEl('main', 'main-content')
  const fixture = WORKSPACE.source_mode === 'fixture'
  const source = vEl('div', `data-source-banner ${fixture ? 'source-fixture' : 'source-live'}`,
    vEl('strong', '', fixture ? '合成演示数据' : '赛事模拟数据'),
    vEl('span', '', fixture ? '仅用于开发演示，不能代替正式数据验收。' : '本地分析结果；需复核的记录已隔离，不能据此证明真实教学成效。'))
  source.setAttribute('aria-label', '数据来源')
  app.replaceChildren(vEl('div', 'app-shell', sidebar, vEl('div', 'workspace', toolbar, source, vEl('div', 'context-strip', vNodeDescription, vEl('span', 'source-label', '本地教师视图')), vMain)))
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest?.('input,textarea,select,[contenteditable="true"]')) {
      event.preventDefault()
      vStudentSearch.focus()
    }
  })
  vRender()
}

vStart()
