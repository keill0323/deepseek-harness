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
  qualityScope: 'all', qualitySearch: '', hintStates: new Map(), rosterSearch: '',
}
const vExpanded = new Set()
const vComparisonCache = new Map()
let vToast
let vToastTimer
let vExportMenu
let vExportStatus
let vExportStatusText
let vExportRetry
let vCsvPending = null
let vStudentControls
let vCurrentExport = WORKSPACE
const vExportButtons = []
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

function vSegments(label, choices, selected, change) {
  const field = vSelect(label, choices, selected, change)
  field.wrapper.classList.add('segment-select')
  const group = vEl('div', 'segment-control')
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', label)
  for (const choice of choices) {
    const button = vButton(choice.label, () => change(choice.value), 'segment-button')
    button.setAttribute('aria-pressed', String(choice.value === selected))
    button.dataset.control = `${label}:${choice.value}`
    group.append(button)
  }
  return vEl('div', 'segment-field', group, field.wrapper)
}

function vViewScope() {
  return JSON.stringify([vState.view, vState.student, vState.node, vState.selectedClass, vState.comparisonMode,
    vState.secondStudent, vState.leftClass, vState.rightClass, vState.pairingType, vState.pairingRightNode, vState.planMode])
}

function vLazyDetails(className, label, build, key = label) {
  const details = vEl('details', className, vEl('summary', '', label))
  const stateKey = `${vViewScope()}:${key}`
  details.dataset.disclosureKey = stateKey
  let built = false
  const reveal = () => {
    if (details.open && !built) { details.append(...[build()].flat(Infinity).filter(value => value != null)); built = true }
    if (details.open) vExpanded.add(stateKey)
    else vExpanded.delete(stateKey)
  }
  details.addEventListener('toggle', reveal)
  // Materialize synchronously for keyboard, pointer and restored state alike.
  details.addEventListener('click', event => {
    if (event.target.closest('summary') !== details.firstElementChild) return
    event.preventDefault()
    details.open = !details.open
    reveal()
  })
  details.open = vExpanded.has(stateKey)
  reveal()
  return details
}

function vCachedComparison(kind, scope, calculate) {
  const key = JSON.stringify([kind, scope])
  if (vComparisonCache.has(key)) {
    const value = vComparisonCache.get(key)
    vComparisonCache.delete(key)
    vComparisonCache.set(key, value)
    return value
  }
  const value = calculate()
  vComparisonCache.set(key, value)
  if (vComparisonCache.size > 32) vComparisonCache.delete(vComparisonCache.keys().next().value)
  return value
}

function vFeedback(message) {
  clearTimeout(vToastTimer)
  vToast.textContent = message
  vToast.hidden = false
  vToastTimer = setTimeout(() => { vToast.hidden = true }, 3500)
}

function vStudentLookup() {
  const input = vEl('input', 'search-input')
  input.type = 'search'
  input.placeholder = '查找学生…'
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
      if (!['overview', 'diagnosis', 'plan', 'comparison'].includes(vState.view)) vState.view = 'diagnosis'
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
  return vEl('label', 'field student-search-field', input, choices, status)
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
  return vEl('div', 'metrics', metrics.map(metric => {
    const value = typeof metric.value === 'string' && metric.value.endsWith(' 个百分点')
      ? [metric.value.replace(' 个百分点', ''), vEl('span', 'metric-unit', ' 个百分点')]
      : metric.value
    return vEl('div', 'metric', vEl('span', 'metric-label', metric.label),
      vEl('strong', ['暂无可计分证据', '暂无可比结果'].includes(metric.value) ? 'metric-value metric-empty' : 'metric-value', value),
      metric.detail ? vEl('span', 'metric-detail', metric.detail) : null)
  }))
}

function vTable(columns, rows, emptyMessage = '当前范围没有记录。') {
  if (!rows.length) return vEmpty(emptyMessage)
  const head = vEl('tr', '', columns.map(column => vEl('th', '', column.label)))
  const body = rows.map(row => vEl('tr', '', columns.map(column => vEl('td', '', column.render(row)))))
  return vEl('div', 'table-scroll', vEl('table', 'data-table', vEl('thead', '', head), vEl('tbody', '', body)))
}

function vUpdateExportButtons() {
  for (const button of vExportButtons) {
    button.textContent = `导出${vState.view === 'overview' ? '全部' : '当前'} ${button.dataset.exportFormat.toUpperCase()}`
    button.disabled = !vCurrentExport || (button.dataset.exportFormat === 'csv' && Boolean(vCsvPending))
  }
  for (const button of vMain.querySelectorAll('[data-export-format="csv"]')) button.disabled = Boolean(vCsvPending)
}

function vCsvButton(label, value, filename) {
  const button = vButton(label, () => vDownload(value(), filename()))
  button.dataset.exportFormat = 'csv'
  return button
}

function vSaveDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = vEl('a')
  anchor.href = url
  anchor.download = filename
  try {
    document.body.append(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const kind = filename.endsWith('.html') ? '学生练习页' : filename.endsWith('.csv') ? 'CSV' : 'JSON'
  vFeedback(`已生成 ${kind}，下载已发起`)
}

function vDownloadStudentPage() {
  try {
    const pack = build_student_pack(WORKSPACE, vState.student, vState.node)
    const html = render_student_document(pack, STUDENT_ASSETS)
    const returnFocus = document.activeElement?.closest('.export-menu')?.querySelector('summary')
    for (const menu of document.querySelectorAll('.export-menu[open]')) menu.open = false
    returnFocus?.focus({ preventScroll: true })
    vSaveDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), `${encodeURIComponent(vState.student)}-${encodeURIComponent(vState.node)}-练习.html`)
  } catch (error) {
    vFeedback('学生页未生成，请核对当前学生和测验节点')
  }
}

function vDownloadCsv(value, filename) {
  const job = { worker: null, url: null }
  vCsvPending = job
  vExportStatus.hidden = false
  vExportStatus.dataset.state = 'pending'
  vExportStatusText.textContent = '正在生成 CSV…'
  vExportRetry.hidden = true
  vExportRetry.onclick = null
  vUpdateExportButtons()
  const showError = () => {
    vExportStatus.dataset.state = 'error'
    vExportStatusText.textContent = 'CSV 未生成，请重试'
    vExportRetry.hidden = false
    vExportRetry.onclick = () => vDownload(value, filename)
  }
  const finish = blob => {
    if (vCsvPending !== job) return
    job.worker?.terminate()
    if (job.url) URL.revokeObjectURL(job.url)
    vCsvPending = null
    vUpdateExportButtons()
    if (blob) {
      try {
        vSaveDownload(blob, filename)
      } catch (error) {
        showError()
        return
      }
      vExportStatus.hidden = true
      return
    }
    showError()
  }
  try {
    const source = `${CSV_WORKER_SOURCE}\nself.onmessage = event => {
      try {
        const blob = new Blob([result_to_csv(event.data)], { type: 'text/csv;charset=utf-8' });
        self.postMessage({ ok: true, blob });
      } catch (error) {
        self.postMessage({ ok: false });
      }
    };`
    job.url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    job.worker = new Worker(job.url, { type: 'module' })
    job.worker.onmessage = event => finish(event.data?.ok === true && event.data.blob instanceof Blob ? event.data.blob : null)
    job.worker.onerror = event => { event.preventDefault(); finish(null) }
    job.worker.onmessageerror = () => finish(null)
    job.worker.postMessage(value)
  } catch (error) {
    finish(null)
  }
}

function vDownload(value, filename) {
  if (!value) return
  const csv = filename.endsWith('.csv')
  if (csv && vCsvPending) return
  const returnFocus = document.activeElement === vExportRetry ? vExportMenu.querySelector('summary')
    : document.activeElement?.closest('.export-menu')?.querySelector('summary')
  for (const menu of document.querySelectorAll('.export-menu[open]')) menu.open = false
  returnFocus?.focus({ preventScroll: true })
  if (csv && typeof Worker === 'function' && typeof CSV_WORKER_SOURCE === 'string' && CSV_WORKER_SOURCE) {
    vDownloadCsv(value, filename)
    return
  }
  vSaveDownload(new Blob([csv ? result_to_csv(value) : `${JSON.stringify(value, null, 2)}\n`], { type: csv ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' }), filename)
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
  const trigger = document.activeElement
  const close = () => dialog.close()
  dialog.append(vEl('div', 'dialog-heading', vEl('h2', '', `作答证据 ${id}`), vButton('关闭', close)), record ? vEvidenceBody(record) : vEmpty('报告未包含这条原始记录，不能核对其内容。'))
  dialog.setAttribute('aria-label', `作答证据 ${id}`)
  dialog.addEventListener('close', () => { dialog.remove(); trigger?.focus({ preventScroll: true }) }, { once: true })
  dialog.addEventListener('click', event => { if (event.target === dialog) close() })
  document.body.append(dialog)
  dialog.showModal()
}

function vEvidenceLinks(ids) {
  const unique = [...new Set(ids)]
  const link = id => vButton(id, () => vOpenEvidence(id), 'evidence-link')
  return vEl('div', 'evidence-links', unique.slice(0, 3).map(link), unique.length > 3
    ? vLazyDetails('evidence-overflow', `另 ${unique.length - 3} 条`, () => vEl('div', 'evidence-links', unique.slice(3).map(link)), `evidence:${unique.join('|')}`) : null)
}

function vLimitations(result) {
  if (!result?.limitations?.length) return vEl('span')
  return vEl('details', 'limitations', vEl('summary', '', '适用范围与处理说明'), vEl('ul', '', result.limitations.map(text => vEl('li', '', text))))
}

function vShow(view, student) {
  if (view === vState.view && (!student || student === vState.student)) return
  vState.view = view
  if (student) vState.student = student
  vStudentSelect.value = vState.student
  if (student) vClearStudentSearch()
  vRender({ navigate: true })
}

function vOpenComparison(mode) {
  const classId = vStudents.find(student => student.student_id === vState.student)?.class_id
  vState.comparisonMode = mode
  if (mode === 'classes') {
    vState.leftClass = classId
    vState.rightClass = vWorkspace.classes.find(id => id !== classId) ?? classId
  }
  if (mode === 'students' && vState.secondStudent === vState.student) vState.secondStudent = vStudents.find(student => student.student_id !== vState.student)?.student_id ?? vState.student
  if (mode === 'nodes') vState.pairingType = 'student'
  vShow('comparison')
}

function vOpenCurriculum(indicator) {
  vState.curriculumFocus = indicator
  vState.curriculumReturn = vState.view
  vShow('curriculum')
  const target = [...vMain.querySelectorAll('[data-indicator]')].find(element => element.dataset.indicator === indicator)
  target?.scrollIntoView({ block: 'center', behavior: 'auto' })
  target?.focus({ preventScroll: true })
}

function vFeatureSection(title, className, ...content) {
  const section = vEl('section', `feature-section ${className}`, vEl('div', 'feature-heading', vEl('h3', '', title)), ...content)
  section.setAttribute('aria-label', title)
  return section
}

function vStudentFocus() {
  const item = vCase()
  if (!item) return vEmpty('当前学生没有可用的分析结果')
  const student = vStudents.find(value => value.student_id === vState.student)
  const findings = item.diagnosis.payload.findings
  const finding = ['scoring_review', 'fact', 'inference', 'insufficient_data'].flatMap(category => findings.filter(value => value.category === category && value.finding_type !== 'observed_performance'))[0] ?? findings[0]
  const firstIds = item.plan.payload.delivery?.first_activity_ids
  const activities = firstIds ? item.plan.payload.activities.filter(activity => firstIds.includes(activity.activity_id)) : item.plan.payload.activities
  const activity = activities[0]
  const indicator = finding?.indicator_id ?? activity?.indicator_id
  const curriculum = vWorkspace.curriculum.payload.entries.find(entry => entry.indicator_id === indicator)
  const evidence = finding?.evidence_ids.find(id => vRecords.has(id))
  const categories = { fact: '已有作答事实', inference: '待进一步确认', insufficient_data: '需要补充观察', scoring_review: '评分待复核' }
  const diagnosis = vFeatureSection('诊断定位', 'focus-diagnosis',
    vEl('h4', 'feature-result', finding?.title ?? '暂无可用诊断'),
    vEl('p', 'feature-meta', finding ? categories[finding.category] : '补充记录后再分析'),
    finding?.step_refs.length ? vEl('p', 'finding-step', `定位到第 ${finding.step_refs.join('、')} 步`) : null,
    vEl('div', 'feature-actions', vButton('查看完整诊断', () => vShow('diagnosis')),
      evidence ? vButton('回看作答证据', () => vOpenEvidence(evidence), 'text-button') : null))
  const planButton = vButton('查看练习与提示', () => { vState.planMode = 'student'; vShow('plan') }, 'button button-primary')
  const plan = vFeatureSection('下一步练习', 'feature-primary',
    vEl('h4', 'feature-result', activity?.goal ?? '暂未生成学习活动'),
    vEl('p', 'feature-meta', activity ? `${vKindNames[item.plan.payload.plan_type]} · 本轮 ${activities.length} 项活动` : '请先补充记录或核对诊断'),
    vEl('div', 'feature-actions', planButton,
      vButton('导出独立学生页', vDownloadStudentPage, 'text-button')))
  const course = vFeatureSection('课程与材料依据', 'focus-course',
    vEl('h4', 'feature-result', curriculum?.indicator_description ?? '当前没有匹配的课程指标'),
    curriculum ? vEl('p', 'feature-meta', `${curriculum.indicator_id} · ${curriculum.material_ids.length} 份关联材料`) : null,
    vEl('div', 'feature-actions', vButton(curriculum ? '定位课程要求' : '查看课程索引', () => curriculum ? vOpenCurriculum(curriculum.indicator_id) : vShow('curriculum'), 'text-button')))
  const comparison = item.peers.payload
  const comparable = comparison.left_rate !== null && comparison.right_rate !== null
  const comparisonBody = comparable ? vEl('div', 'comparison-preview', [['本人', comparison.left_rate], ['同班同伴', comparison.right_rate]].map(([label, rate]) => {
    const progress = vEl('progress', 'comparison-bar')
    progress.max = 1
    progress.value = rate
    progress.setAttribute('aria-label', `${label}共同题集得分率`)
    return vEl('div', 'comparison-preview-row', vEl('span', '', label), progress, vEl('span', '', vRate(rate)))
  })) : vEl('p', 'feature-description', '暂无共同有效题，暂不能比较')
  const compare = vFeatureSection('学情比较', 'focus-comparison', comparisonBody,
    vEl('p', 'feature-meta', `共同有效题 ${comparison.shared_item_ids.length} 道 · 同伴已排除本人`),
    vEl('div', 'compare-shortcuts', [['peers', '同伴比较'], ['students', '两名学生'], ['classes', '两个班级'], ['nodes', '跨节点配对']].map(([mode, label]) => {
      const button = vButton(label, () => vOpenComparison(mode), 'text-button')
      button.disabled = mode === 'nodes' && vNodes.length < 2
      if (button.disabled) button.title = '需要两个测验节点'
      return button
    })))
  return vEl('section', 'focus-workspace',
    vEl('div', 'focus-workspace-heading', vEl('h2', '', `${student.student_id} 的学习情况`),
      vEl('span', 'feature-meta', `${student.class_id} · ${vState.node} · ${item.statistics.payload.valid_record_count} 条有效作答`)),
    vEl('div', 'focus-grid', diagnosis, plan, course, compare))
}

function vOverview() {
  vCurrentExport = { ...WORKSPACE, payload: { ...vWorkspace, browser_snapshot: undefined } }
  vMain.append(vEl('div', 'overview-summary',
    vEl('p', '', `全体 ${vStudents.length} 名学生 · ${vWorkspace.classes.length} 个班级 · ${vWorkspace.summary.stat_included_count} 条有效计分`),
    vEl('div', 'feature-actions', vButton('查看本班报告', () => { vState.selectedClass = vStudents.find(student => student.student_id === vState.student).class_id; vShow('classes') }, 'text-button'),
      vButton(`质量复核（${vWorkspace.summary.review_count} 条待核）`, () => { vState.qualityScope = 'all'; vState.qualitySearch = ''; vShow('quality') }, 'text-button'))), vStudentFocus())
  const list = vEl('div', 'student-list')
  const input = vEl('input', 'search-input')
  input.type = 'search'
  input.value = vState.rosterSearch
  input.placeholder = '筛选学生编号或班级'
  input.setAttribute('aria-label', '筛选学生列表')
  const count = vEl('span', 'muted')
  count.setAttribute('role', 'status')
  const render = () => {
    const query = vState.rosterSearch.trim().normalize('NFKC').toLowerCase()
    const students = vStudents.filter(student => `${student.student_id} ${student.class_id}`.toLowerCase().includes(query))
    count.textContent = `${students.length} 名学生`
    list.replaceChildren(vTable([
      { label: '学生', render: student => vEl('div', '', vButton(student.student_id, () => vShow('diagnosis', student.student_id), 'student-link text-button'), vEl('span', 'student-class', student.class_id)) },
      { label: '得分率', render: student => vRate(vWorkspace.cases[vScopeKey(student.student_id, vState.node)].statistics.payload.score_rate) },
      { label: '已观察指标', render: student => vWorkspace.cases[vScopeKey(student.student_id, vState.node)].diagnosis.payload.covered_indicator_ids.length },
      { label: '当前学习安排', render: student => vKindNames[vWorkspace.cases[vScopeKey(student.student_id, vState.node)].plan.payload.plan_type] },
      { label: '操作', render: student => vEl('div', 'row-actions', vButton('查看诊断', () => vShow('diagnosis', student.student_id), 'text-button'), vButton('学习计划', () => vShow('plan', student.student_id), 'text-button')) },
    ], students, '没有匹配的学生'))
  }
  input.addEventListener('input', () => { vState.rosterSearch = input.value; render() })
  const roster = vPanel('学生概况', '', vEl('div', 'roster-controls', input, count), list)
  roster.classList.add('overview-roster')
  vMain.append(roster)
  render()
}

function vStatistics(stats) {
  return vMetrics([
    { label: '有效作答得分率', value: vRate(stats.score_rate), detail: stats.possible_score === null ? '缺记录保持未知' : `${stats.earned_score} / ${stats.possible_score} 分` },
    { label: '有效 / 已有记录', value: `${stats.valid_record_count} / ${stats.record_count}`, detail: '条作答记录' },
    { label: '已观察指标', value: stats.indicators.filter(indicator => indicator.valid_record_count > 0).length, detail: `共 ${stats.indicators.length} 个课程观察指标` },
    { label: '评分待复核', value: stats.review_record_ids.length, detail: '条记录' },
  ])
}

function vDiagnosis() {
  const item = vCase()
  if (!item) return vMain.append(vEmpty('当前对象没有可用的分析结果。'))
  vCurrentExport = item.diagnosis
  const stats = item.statistics.payload
  vMain.append(vStatistics(stats), vEl('div', 'analysis-actions',
    vButton('查看学习计划', () => vShow('plan'), 'button button-primary'),
    vButton('与同伴比较', () => { vState.comparisonMode = 'peers'; vShow('comparison') })))
  const renderFinding = finding => vEl('article', `finding finding-${finding.category}`,
    vEl('div', 'finding-heading', vEl('h3', '', finding.title), vEl('span', 'subtle-code', finding.indicator_id ?? '')),
    vEl('p', 'preserve', finding.description),
    finding.step_refs.length ? vEl('p', 'finding-step', `错误位置：步骤 ${finding.step_refs.join('、')}`) : null,
    vEvidenceLinks(finding.evidence_ids),
    finding.indicator_id ? vButton('对应课程要求', () => vOpenCurriculum(finding.indicator_id), 'text-button feature-course-link') : null,
    finding.material_ids.length || finding.point_refs.length ? vLazyDetails('finding-context', '材料与评分依据', () => vEl('p', '',
      `材料 ${finding.material_ids.join('、') || '未匹配'}；评分点 ${finding.point_refs.join('、') || '未定位'}`), finding.finding_id) : null)
  const observed = item.diagnosis.payload.findings.filter(finding => finding.finding_type === 'observed_performance')
  const categories = [['fact', '需要关注的步骤'], ['inference', '待进一步确认'], ['insufficient_data', '需要补充的观察'], ['scoring_review', '先复核这些记录']]
  for (const [category, title] of categories) {
    const findings = item.diagnosis.payload.findings.filter(finding => finding.category === category && finding.finding_type !== 'observed_performance')
    if (findings.length) vMain.append(vPanel(title, '', vEl('div', 'findings', findings.map(renderFinding))))
  }
  vMain.append(vPanel('学习内容覆盖', '',
    vTable([
      { label: '学习主题', render: row => vWorkspace.curriculum.payload.topics.find(topic => topic.topic_id === row.topic_id)?.name ?? row.topic_id },
      { label: '教学范围', render: row => row.taught ? '本节点已教' : '本节点未教' },
      { label: '有效记录', render: row => row.valid_record_count },
      { label: '得分率', render: row => vRate(row.score_rate) },
    ], stats.topics),
    vLazyDetails('indicator-details', '展开全部观察指标', () => vTable([
      { label: '指标', render: row => `${row.indicator_id} · ${vWorkspace.curriculum.payload.entries.find(entry => entry.indicator_id === row.indicator_id)?.indicator_description ?? ''}` },
      { label: '有效记录', render: row => row.valid_record_count }, { label: '得分率', render: row => vRate(row.score_rate) },
      { label: '依据', render: row => vEvidenceLinks(row.evidence_ids) },
    ], stats.indicators)),
    observed.length ? vLazyDetails('indicator-details', '各指标的已有表现', () => vEl('div', 'findings', observed.map(renderFinding))) : null))
  vMain.append(vLimitations(item.diagnosis))
}

function vStudentPlan(item) {
  const plan = item.plan
  return {
    schema_version: plan.schema_version, generated_at: plan.generated_at, dataset_version: plan.dataset_version, policy_version: plan.policy_version,
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
    }, evidence_ids: [], limitations: ['学生练习清单不包含原始答案、参考答案、解答过程或分点评分。'],
  }
}

function vPlan() {
  const item = vCase()
  if (!item) return vMain.append(vEmpty('当前没有可用计划。'))
  vCurrentExport = item.plan
  vMain.append(vEl('div', 'analysis-actions', vSegments('内容模式', [{ value: 'student', label: '学生提示' }, { value: 'teacher', label: '教师核对' }], vState.planMode ?? 'student', value => { vState.planMode = value; vRender() }),
    vButton('查看诊断依据', () => vShow('diagnosis'))))
  const certaintyNames = { insufficient: '证据不足', provisional: '结论暂定', adequate: '证据较充分' }
  vMain.append(vEl('div', 'plan-intro', vEl('div', '', vEl('h2', '', vKindNames[item.plan.payload.plan_type]),
    vEl('p', 'muted', certaintyNames[item.plan.payload.certainty] ?? '证据不足')),
    vEl('details', 'export-menu', vEl('summary', 'button button-secondary', '导出学生练习'), vEl('div', 'export-menu-content',
    vButton('导出独立学生页', vDownloadStudentPage),
    vButton('导出学生练习清单', () => vDownload(vStudentPlan(item), `${vState.student}-${vState.node}-student-plan.json`), 'button button-primary'),
    vCsvButton('导出学生练习 CSV', () => vStudentPlan(item), () => `${vState.student}-${vState.node}-student-plan.csv`)))))
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
      vEl('p', 'activity-prompt', activity.prompt), questions,
      vEl('p', 'activity-success', `完成标准：${(activity.success_criteria ?? []).join('；')}`),
      vButton('查看课程要求', () => vOpenCurriculum(activity.indicator_id), 'text-button feature-course-link'),
      vLazyDetails('activity-more', '安排依据与调整条件', () => [vEl('p', 'preserve', activity.rationale),
        activity.selection_reason ? vEl('p', '', vSelectionNames[activity.selection_reason] ?? activity.selection_reason) : null,
        vEl('p', '', `材料 ${activity.material_ids.join('、') || '暂未匹配'} · ${activity.indicator_id}`), detail, vEvidenceLinks(activity.evidence_ids)], activity.activity_id))
  }
  if (item.plan.payload.delivery && item.plan.payload.activities.length) vMain.append(vEl('p', 'plan-batch', `本轮 ${firstActivities.length} 项活动`))
  vMain.append(...firstActivities.map(renderActivity))
  if (laterActivities.length) {
    vMain.append(vLazyDetails('plan-followup', `后续学习活动（${laterActivities.length} 项）`, () => [
      vEl('p', 'muted', item.plan.payload.delivery.advance_when), laterActivities.map(renderActivity)]))
  }
  vMain.append(vLimitations(item.plan))
}

function vNodePairing(controls) {
  const otherNodes = vNodes.filter(node => node.node_id !== vState.node)
  controls.append(vSelect('配对对象', [{ value: 'student', label: '当前学生' }, { value: 'class', label: '指定班级' }], vState.pairingType ?? 'student', value => { vState.pairingType = value; vRender() }).wrapper)
  if (vState.pairingType === 'class') controls.append(vSelect('配对班级', vWorkspace.classes.map(id => ({ value: id, label: id })), vState.selectedClass, value => { vState.selectedClass = value; vRender() }).wrapper)
  if (!otherNodes.length) {
    vCurrentExport = null
    vMain.append(vPanel('跨节点观察配对', '至少需要两个测验节点；当前输入只有一个节点，暂无法配对。', controls))
    return
  }
  if (!otherNodes.some(node => node.node_id === vState.pairingRightNode)) vState.pairingRightNode = otherNodes[0].node_id
  controls.append(vSelect('另一测验节点', otherNodes.map(node => ({ value: node.node_id, label: [node.node_id, node.date].filter(Boolean).join(' · ') })), vState.pairingRightNode, value => { vState.pairingRightNode = value; vRender() }).wrapper)
  const subject = vState.pairingType === 'class' ? { class_id: vState.selectedClass } : { student_id: vState.student }
  const scope = { ...subject, left_node_id: vState.node, right_node_id: vState.pairingRightNode }
  const pairingKey = [vState.pairingType === 'class' ? 'class' : 'student', Object.values(subject)[0], vState.node, vState.pairingRightNode].map(encodeURIComponent).join(':')
  const result = vWorkspace.node_pairings[pairingKey] ?? vCachedComparison('nodes', scope, () => inspect_node_pairing(vSnapshot, scope))
  vCurrentExport = result
  const payload = result.payload
  const reasons = {
    item_not_allowed_in_node: '该节点不含此题', topic_not_taught: '该节点尚未教学此主题', no_records: '无作答记录',
    pending_grading: '存在待评分作答', unanswered: '存在未作答记录', quality_excluded: '质量问题待复核，未计入有效观察',
    scoring_review_retained: '语义复核保留原分，仍需核对', no_valid_records: '无有效评分记录',
    node_scope_mismatch: '两个节点的题目或教学范围不一致', missing_valid_observations: '至少一侧缺少有效观察',
    no_common_valid_students: '两侧有效作答来自不同学生，不能配对',
  }
  const sideCell = side => vEl('div', '', `${side.valid_student_ids.length} 人 · ${side.valid_record_count} 条有效 / ${side.record_count} 条记录`,
    side.reason_codes.map(code => vEl('p', 'muted', reasons[code] ?? code)),
    vEvidenceLinks([...new Set([...side.evidence_ids, ...side.quality_record_ids])]))
  vMain.append(controls,
    vEl('p', 'comparison-explain', '同题、同一学生两侧均有有效记录才可配对；不计算跨节点分数差'),
    vMetrics([
      { label: '两节点共同题目', value: payload.shared_allowed_item_ids.length, detail: `题目并集 ${payload.candidate_item_ids.length} 道` },
      { label: '有配对观察的题目', value: payload.paired_item_ids.length, detail: '逐题要求同一学生两侧均有有效记录' },
      { label: '尚不能配对', value: payload.items.length - payload.paired_item_ids.length, detail: '具体原因与记录状态见下表' },
    ]),
    vPanel('可配对题目与不可比原因', '有效人数不等于配对人数；班级只配对逐题共同学生。', vBadge(result.result_status),
      vTable([
        { label: '题目', render: row => vEl('div', '', vEl('strong', '', row.item_id), vEl('p', 'muted', `${row.topic_id} · ${row.indicator_id}`)) },
        { label: payload.left_node_id, render: row => sideCell(row.left) },
        { label: payload.right_node_id, render: row => sideCell(row.right) },
        { label: '配对观察', render: row => row.pairable
          ? vEl('div', '', `可配对 · ${row.paired_student_ids.length} 人`, vEl('p', 'muted', row.paired_student_ids.join('、')))
          : vEl('div', '', '暂不能配对', row.reason_codes.map(code => vEl('p', 'muted', reasons[code] ?? code))) },
      ], payload.items, '两个节点均未提供可用题目，请核对输入题目范围。')),
    vLimitations(result))
}

function vComparison() {
  const controls = vEl('div', 'comparison-controls')
  controls.append(vSegments('比较方式', [{ value: 'peers', label: '个人与同伴' }, { value: 'students', label: '两名学生' }, { value: 'classes', label: '两个班级' }, { value: 'nodes', label: '跨节点观察配对' }], vState.comparisonMode, value => { vState.comparisonMode = value; vRender() }))
  if (vState.comparisonMode === 'nodes') { vNodePairing(controls); return }
  let result
  if (vState.comparisonMode === 'peers') {
    result = vCase().peers
  } else if (vState.comparisonMode === 'students') {
    controls.append(vSelect('右侧学生', vStudents.map(student => ({ value: student.student_id, label: `${student.student_id} · ${student.class_id}` })), vState.secondStudent, value => { vState.secondStudent = value; vRender() }).wrapper)
    const scope = { left_student_id: vState.student, right_student_id: vState.secondStudent, node_id: vState.node }
    result = vCachedComparison('students', scope, () => compare_students(vSnapshot, scope))
  } else {
    for (const [key, label] of [['leftClass', '左侧班级'], ['rightClass', '右侧班级']]) controls.append(vSelect(label, vWorkspace.classes.map(id => ({ value: id, label: id })), vState[key], value => { vState[key] = value; vRender() }).wrapper)
    const scope = { left_class_id: vState.leftClass, right_class_id: vState.rightClass, node_id: vState.node }
    result = vCachedComparison('classes', scope, () => compare_classes(vSnapshot, scope))
  }
  vCurrentExport = result
  vMain.append(controls)
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
  if (payload.quality_record_ids.length) vMain.append(vPanel('范围内评分待复核', '以下记录需要复核，计分与共同题集情况见处理说明。', vEvidenceLinks(payload.quality_record_ids)))
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
  const plan = vWorkspace.class_plans[vScopeKey(vState.selectedClass, vState.node)]
  if (plan) {
    const recommendationsPanel = vPanel('班级教学建议', '',
      vEl('details', 'export-menu class-plan-export', vEl('summary', 'button button-secondary', '导出教学建议'), vEl('div', '',
        vButton('导出班级教学建议', () => vDownload(plan, `${vState.selectedClass}-${vState.node}-teaching-plan.json`)),
        vCsvButton('导出班级建议 CSV', () => plan, () => `${vState.selectedClass}-${vState.node}-teaching-plan.csv`))),
      plan.payload.recommendations.map((recommendation, index) => vLazyDetails('class-recommendation',
      [vEl('span', '', recommendation.goal), vEl('span', 'muted', `${recommendation.student_ids.length} 人`)], () => [
      vEl('p', '', `适用学生：${recommendation.student_ids.join('、')}`),
      vEl('p', '', recommendation.rationale), vEl('ol', '', recommendation.steps.map(step => vEl('li', '', step))),
      vEl('p', 'muted', `可选题目：${recommendation.item_ids.join('、')} · 材料：${recommendation.material_ids.join('、') || '未提供'}`),
      vEl('p', '', `观察：${recommendation.observation}`), vEl('p', '', `调整条件：${recommendation.adjust_when}`),
      vEvidenceLinks(recommendation.evidence_ids)], `recommendation:${index}`)), vLimitations(plan))
    recommendationsPanel.querySelector('.section-heading').append(recommendationsPanel.querySelector('.class-plan-export'))
    vMain.append(recommendationsPanel)
  }
  vMain.append(vPanel('班级学习内容覆盖', '', vTable([
    { label: '主题', render: row => vWorkspace.curriculum.payload.topics.find(topic => topic.topic_id === row.topic_id)?.name ?? row.topic_id },
    { label: '范围', render: row => row.taught ? '本节点已教' : '本节点未教' },
    { label: '有记录人数', render: row => row.observed_student_count },
    { label: '有效记录', render: row => row.valid_record_count },
    { label: '得分率', render: row => vRate(row.score_rate) },
  ], payload.topics)))
  vMain.append(vPanel('逐题与评分点分布', '按有效作答事件计数，另列不同学生人数；缺记录不记零分。', payload.items.map(item => vLazyDetails('material-details', `${item.item_id} · ${item.scored_student_count} 人 / ${item.valid_record_count} 条有效记录 · ${vRate(item.score_rate)}`, () => [
    vEl('p', 'muted', `得分分布：${item.score_distribution.map(value => `${value.score}分 ${value.record_count}条`).join('；') || '暂无已评分样本'}`),
    vTable([{ label: '评分点', render: point => point.point_id }, { label: '有效人数', render: point => point.scored_student_count },
      { label: '得分率', render: point => vRate(point.score_rate) },
      { label: '分布（事件数）', render: point => point.score_distribution.map(value => `${value.score}分 ${value.record_count}条`).join('；') || '暂无样本' },
      { label: '依据', render: point => vEvidenceLinks(point.evidence_ids) }], item.scoring_points)], item.item_id))))
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
  if (vState.curriculumFocus) vMain.append(vEl('div', 'curriculum-context',
    vButton(`返回${vState.curriculumReturn === 'overview' ? '工作台' : vNames[vState.curriculumReturn]}`, () => vShow(vState.curriculumReturn)),
    vEl('span', '', `定位指标：${vState.curriculumFocus}`)))
  vMain.append(vEl('p', 'comparison-explain', '页码来自材料索引，可据此定位原文件'))
  for (const topic of curriculum.payload.topics) {
    const entries = curriculum.payload.entries.filter(entry => entry.topic_id === topic.topic_id)
    vMain.append(vPanel(`${topic.topic_id} · ${topic.name}`, topic.objective,
      vTable([
        { label: '观察指标', render: row => {
          const cell = vEl('div', '', vEl('strong', '', row.indicator_id), vEl('p', '', row.indicator_description))
          cell.dataset.indicator = row.indicator_id
          cell.tabIndex = -1
          return cell
        } },
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
  if (vState.curriculumFocus) {
    const target = [...vMain.querySelectorAll('[data-indicator]')].find(element => element.dataset.indicator === vState.curriculumFocus)
    target?.closest('tr').classList.add('curriculum-focus-row')
  }
}

function vQuality() {
  vMain.append(vMetrics([
    { label: '质量问题记录', value: vWorkspace.quality_records.length, detail: '保留原值；已纠正与待复核分别处理' },
    { label: '修订事件', value: vWorkspace.summary.revised_event_count, detail: '最高版本异常时不会回退旧版' },
    { label: '正常未评分排除', value: vWorkspace.summary.excluded_count, detail: '未评分不是错误作答' },
  ]))
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
      const details = vLazyDetails('quality-record', [vEl('strong', '', record.record_id), vEl('span', '', `${record.student_id} · ${record.item_id} · ${record.node_id}`), vBadge(record.action === 'review' ? 'needs_review' : 'ok')],
        () => [vEl('ul', 'quality-reasons', record.quality_issues.map(issue => vEl('li', '', issue.message))), vEvidenceBody(record)], record.record_id)
      list.append(details)
    }
    const notes = vMain.querySelector('.teacher-notes')
    if (notes) {
      if (notes.open) vExpanded.add(notes.dataset.disclosureKey)
      else vExpanded.delete(notes.dataset.disclosureKey)
      notes.replaceWith(vNotes())
    }
    if (!records.length) list.append(vEmpty(vWorkspace.quality_records.length ? '没有匹配记录，请调整筛选条件。' : '当前快照未检测到待复核记录；这不替代数学过程的人工核验。'))
  }
  const scope = vSelect('复核范围', [{ value: 'all', label: '整个数据快照' }, { value: 'current', label: '当前学生与节点' }], vState.qualityScope, value => { vState.qualityScope = value; renderResults() })
  query.addEventListener('input', () => { vState.qualitySearch = query.value; renderResults() })
  vMain.append(vEl('div', 'quality-controls', scope.wrapper, vEl('label', 'field quality-search', vEl('span', 'field-label', '搜索复核记录'), query),
    vButton('清除筛选', () => { vState.qualityScope = 'all'; vState.qualitySearch = ''; scope.select.value = 'all'; query.value = ''; renderResults() })), count, list)
  renderResults()
}

function vNoteKey() {
  if (vState.view === 'classes') return `classes:${vScopeKey(vState.selectedClass, vState.node)}`
  if (vState.view === 'comparison') return `comparison:${JSON.stringify([vState.comparisonMode, vCurrentExport?.scope])}`
  if (vState.view === 'curriculum') return `curriculum:${vState.node}`
  if (vState.view === 'quality') return `quality:${vState.qualityScope}:${vState.qualityScope === 'current' ? vScopeKey(vState.student, vState.node) : 'all'}`
  return `${vState.view}:${vScopeKey(vState.student, vState.node)}`
}

function vNotes() {
  const key = vNoteKey()
  const textarea = vEl('textarea', 'notes-input')
  textarea.rows = 3
  textarea.placeholder = '记录复核意见或下一次教学安排'
  textarea.setAttribute('aria-label', '本地教师备注')
  textarea.value = vState.notes[key] ?? ''
  textarea.addEventListener('input', () => { vState.notes[key] = textarea.value })
  const details = vEl('details', 'teacher-notes', vEl('summary', '', '教师备注'),
    vEl('div', 'notes-heading', vEl('p', 'muted', '备注仅留在本次浏览器会话，关闭前请导出'),
    vButton('导出备注', () => vDownload({ generated_at: WORKSPACE.generated_at, dataset_version: WORKSPACE.dataset_version, policy_version: WORKSPACE.policy_version,
      kind: 'teacher_notes', changes_facts: false, notes: vState.notes }, 'teacher-notes.json'))), textarea)
  details.dataset.disclosureKey = `notes:${key}`
  details.open = vExpanded.has(details.dataset.disclosureKey)
  return details
}

function vReportInfo() {
  const trigger = document.activeElement?.closest('.export-menu')?.querySelector('summary') ?? document.activeElement
  for (const menu of document.querySelectorAll('.export-menu[open]')) menu.open = false
  const dialog = vEl('dialog', 'report-info')
  dialog.setAttribute('aria-label', '报告信息')
  dialog.append(vEl('div', 'dialog-heading', vEl('h2', '', '报告信息'), vButton('关闭', () => dialog.close())),
    vEl('div', 'report-info-body', vEl('dl', 'evidence-meta',
      vEl('dt', '', '分析时间（UTC）'), vEl('dd', '', WORKSPACE.generated_at),
      vEl('dt', '', '数据版本'), vEl('dd', '', WORKSPACE.dataset_version),
      vEl('dt', '', '规则版本'), vEl('dd', '', WORKSPACE.policy_version)),
      vEl('p', '', WORKSPACE.source_mode === 'fixture' ? '合成演示数据，仅用于开发演示，不能代替正式数据验收。' : '赛事模拟数据，由本地规则分析；模拟结果不能证明真实教学成效。'),
      vEl('p', '', '本页是教师报告，包含原始作答与参考答案。给学生分发时，请使用“导出独立学生页”，只发送对应学生的单个文件。'),
      vLimitations(WORKSPACE)))
  dialog.addEventListener('close', () => { dialog.remove(); trigger?.focus({ preventScroll: true }) }, { once: true })
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close() })
  document.body.append(dialog)
  dialog.showModal()
}

function vExportName(format) {
  const scope = vCurrentExport?.scope ?? {}
  const parts = Object.values(scope).filter(value => ['string', 'number'].includes(typeof value)).map(value => String(value).replace(/[^\p{L}\p{N}._-]/gu, '_'))
  return `${[vState.view, ...parts].join('-')}.${format}`
}

function vRender({ navigate = false } = {}) {
  const active = document.activeElement
  const focus = vMain.contains(active) ? { label: active.getAttribute('aria-label'), control: active.dataset.control } : null
  for (const details of vMain.querySelectorAll('details[data-disclosure-key]')) {
    if (details.open) vExpanded.add(details.dataset.disclosureKey)
    else vExpanded.delete(details.dataset.disclosureKey)
  }
  vPageTitle.textContent = vState.view === 'overview' ? '教师工作台' : vNames[vState.view]
  vNodeDescription.textContent = `${vState.student} · ${vState.node}`
  vStudentControls.hidden = !['overview', 'diagnosis', 'plan', 'comparison', 'quality'].includes(vState.view) || (vState.view === 'comparison' && vState.comparisonMode === 'classes')
  for (const [key, button] of vNavigation) {
    button.classList.toggle('active', key === vState.view)
    if (key === vState.view) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  const main = vMain
  vMain = document.createDocumentFragment()
  vCurrentExport = null
  try {
    const render = { overview: vOverview, diagnosis: vDiagnosis, plan: vPlan, comparison: vComparison, classes: vClasses, curriculum: vCurriculum, quality: vQuality }[vState.view]
    if (!vStudents.length || !vNodes.length) vMain.append(vEmpty('当前快照没有学生或测验节点，请重新导入有效数据。'))
    else render()
    vMain.append(vNotes())
    main.replaceChildren(vMain)
  } finally { vMain = main }
  vUpdateExportButtons()
  if (navigate) {
    window.scrollTo({ top: 0, behavior: 'instant' })
    vPageTitle.focus({ preventScroll: true })
  } else if (focus) {
    const target = [...vMain.querySelectorAll('[aria-label], [data-control]')].find(element =>
      focus.control ? element.dataset.control === focus.control : focus.label && element.getAttribute('aria-label') === focus.label)
    target?.focus({ preventScroll: true })
  }
}

function vStart() {
  const app = document.getElementById('app')
  const nav = vEl('nav', 'navigation')
  nav.setAttribute('aria-label', '报告页面')
  Object.entries(vNames).forEach(([key, label]) => {
    const button = vButton(label, () => {
      if (key === 'curriculum') {
        vState.curriculumFocus = null
        vState.curriculumReturn = null
        if (vState.view === 'curriculum') { vRender({ navigate: true }); return }
      }
      vShow(key)
    }, 'nav-button')
    nav.append(button)
    vNavigation.set(key, button)
  })
  const sidebar = vEl('aside', 'sidebar', vEl('div', 'brand', vEl('strong', '', '智慧学伴')), nav,
    vEl('div', 'sidebar-footer', vButton('报告信息', vReportInfo, 'text-button')))
  const studentField = vSelect('模拟学生', vStudents.map(student => ({ value: student.student_id, label: `${student.student_id} · ${student.class_id}` })), vState.student, value => { vState.student = value; vClearStudentSearch(); vRender() })
  const nodeField = vSelect('测验节点', vNodes.map(node => ({ value: node.node_id, label: [node.node_id, node.date].filter(Boolean).join(' · ') })), vState.node, value => { vState.node = value; vRender() })
  vStudentControls = studentField.wrapper
  vStudentSelect = studentField.select
  vNodeSelect = nodeField.select
  vPageTitle = vEl('h1', '', '总览')
  vPageTitle.tabIndex = -1
  vNodeDescription = vEl('span', 'node-description sr-only')
  for (const format of ['csv', 'json']) {
    const button = vButton(`导出当前 ${format.toUpperCase()}`, () => vDownload(vCurrentExport, vExportName(format)))
    button.dataset.exportFormat = format
    vExportButtons.push(button)
  }
  vExportMenu = vEl('details', 'export-menu', vEl('summary', 'button button-primary', '导出'),
    vEl('div', 'export-menu-content', ...vExportButtons, vButton('打印当前页', () => { vExportMenu.open = false; window.print() }), vButton('报告信息', vReportInfo)))
  const notesButton = vButton('备注', () => {
    const notes = vMain.querySelector('.teacher-notes')
    notes.open = true
    notes.scrollIntoView({ block: 'center', behavior: 'auto' })
    notes.querySelector('textarea').focus({ preventScroll: true })
  })
  vExportStatusText = vEl('span', 'export-status-text')
  vExportRetry = vButton('重试 CSV', () => {}, 'text-button export-retry')
  vExportRetry.hidden = true
  vExportStatus = vEl('div', 'export-status', vExportStatusText, vExportRetry)
  vExportStatus.setAttribute('role', 'status')
  vExportStatus.setAttribute('aria-live', 'polite')
  vExportStatus.hidden = true
  const toolbar = vEl('header', 'workspace-header', vEl('div', 'title-block', vPageTitle), vEl('div', 'page-actions', vExportStatus, notesButton, vExportMenu))
  vMain = vEl('main', 'main-content')
  const source = vEl('span', `data-source-label ${WORKSPACE.source_mode === 'fixture' ? 'source-fixture' : 'source-live'}`, WORKSPACE.source_mode === 'fixture' ? '合成演示数据' : '赛事模拟数据')
  source.setAttribute('aria-label', '数据来源')
  vToast = vEl('div', 'feedback-toast')
  vToast.hidden = true
  vToast.setAttribute('role', 'status')
  app.replaceChildren(vEl('div', 'app-shell', sidebar, vEl('div', 'workspace', toolbar,
    vEl('div', 'context-toolbar', studentField.wrapper, nodeField.wrapper, source, vStudentLookup(), vNodeDescription), vMain)), vToast)
  document.addEventListener('click', event => {
    const inside = event.target.closest?.('.export-menu')
    for (const menu of document.querySelectorAll('.export-menu[open]')) if (menu !== inside) menu.open = false
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const menu = document.querySelector('.export-menu[open]')
      if (menu) { menu.open = false; menu.querySelector('summary').focus() }
    }
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest?.('input,textarea,select,[contenteditable="true"]')) {
      event.preventDefault()
      vStudentSearch.focus()
    }
  })
  vRender()
}

vStart()
