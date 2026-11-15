(() => {
  'use strict'

  const practice = STUDENT_PRACTICE
  const copy = {
    title: '我的练习', activityNav: '学习活动', first: '本轮练习', later: '后续练习',
    completionProgress: '自行标记完成的练习', skip: '跳到练习内容',
    export: '导出学习记录', reset: '清空本页记录', keep: '保留记录', confirmReset: '确认清空',
    resetTitle: '清空这次练习记录？', resetBody: '作答笔记、已看提示、自查和完成标记都会清空。需要保留时，请先导出学习记录',
    storage: '切换活动会保留记录；关闭或刷新页面前，请导出学习记录',
    selfMarked: '完成由你自己标记，不代表系统评分', empty: '暂时没有分配练习',
    emptyHelp: '请向老师获取新的练习文件', prompt: '练习要求', question: '题目', notes: '本项练习笔记',
    notesPlaceholder: '记下思路、卡住的地方，或下次想问的问题', answer: '我的作答',
    answerPlaceholder: '在这里写下自己的尝试和思路', hints: '分步提示',
    noHints: '本题暂未提供可用提示，可以先写下自己的思路', hintSequence: '先尝试作答，再按顺序查看提示',
    selfCheck: '完成前，自己检查一下', noCriteria: '这项练习没有单独列出自查标准',
    complete: '标记练习完成', incomplete: '改为未完成', done: '已自行标记完成', ongoing: '未完成',
    resetDone: '本页练习记录已清空', exportStarted: '已生成学习记录，请确认文件已保存',
    exportFailed: '学习记录未能导出，请重试；本页记录仍保留', noQuestions: '这项练习不含单独题目，请按照练习要求完成',
    dataFixture: '合成演示数据', dataContest: '赛事模拟数据', next: '下一项练习',
    advance: '后续练习安排',
    scope: (student, node) => `${student} · ${node}`,
    count: (done, total) => `已标记完成 ${done} / ${total} 项`,
    item: (index, total) => `练习 ${index} / ${total}`,
    questionTitle: id => `题目 ${id}`,
    answerLabel: id => `我的作答：${id}`,
    hint: level => `查看提示 ${level}`,
    hintTitle: level => `提示 ${level}`,
    hintOpened: level => `已展开提示 ${level}`,
    selfCheckCount: (done, total) => `已自查 ${done} / ${total} 项`,
    activityLabel: (index, goal) => `练习 ${index}：${goal}`,
  }
  const root = document.getElementById('student-app')
  const activities = [...practice.activities].sort((a, b) => a.order - b.order)
  const states = new Map(activities.map(activity => [activity.activity_id, {
    notes: '', completed: false, selfChecks: activity.success_criteria.map(() => false),
    questions: new Map(activity.questions.map(question => [question.item_id, { notes: '', hintLevel: 0 }])),
  }]))
  let selectedId = activities[0]?.activity_id
  let dirty = false
  const navButtons = new Map()
  const navStatuses = new Map()

  function el(tag, className, ...children) {
    const node = document.createElement(tag)
    if (className) node.className = className
    for (const child of children.flat(Infinity)) {
      if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)))
    }
    return node
  }

  function button(label, className, action) {
    const node = el('button', className, label)
    node.type = 'button'
    node.addEventListener('click', action)
    return node
  }

  const live = el('p', 'sp-feedback')
  live.setAttribute('role', 'status')
  live.setAttribute('aria-live', 'polite')
  function announce(message, isError = false) {
    live.textContent = message
    live.dataset.state = isError ? 'error' : 'success'
  }

  const progressLabel = el('p', 'sp-progress-label')
  const progress = el('progress', 'sp-progress')
  progress.max = Math.max(activities.length, 1)
  progress.setAttribute('aria-label', copy.completionProgress)
  const content = el('main', 'sp-content')
  content.id = 'sp-content'
  content.tabIndex = -1
  const exportButton = button(copy.export, 'sp-button sp-button-secondary', exportRecords)
  exportButton.dataset.action = 'export'
  const resetButton = button(copy.reset, 'sp-text-button', () => {
    resetDialog.showModal()
    keepButton.focus()
  })
  resetButton.dataset.action = 'reset'

  function refreshProgress() {
    const completed = [...states.values()].filter(state => state.completed).length
    progress.value = completed
    progressLabel.textContent = copy.count(completed, activities.length)
    resetButton.disabled = !dirty
    for (const activity of activities) {
      const state = states.get(activity.activity_id)
      const navButton = navButtons.get(activity.activity_id)
      if (activity.activity_id === selectedId) navButton.setAttribute('aria-current', 'step')
      else navButton.removeAttribute('aria-current')
      navStatuses.get(activity.activity_id).textContent = state.completed ? copy.done : copy.ongoing
    }
  }

  function changed() {
    dirty = true
    resetButton.disabled = false
  }

  function renderQuestion(question, state, index) {
    const section = el('section', 'sp-question')
    const title = el('h3', '', copy.questionTitle(question.item_id))
    title.id = `sp-question-${index}`
    section.setAttribute('aria-labelledby', title.id)
    section.append(title, el('p', 'sp-question-text', question.prompt))
    if (question.options) section.append(el('p', 'sp-question-options', question.options))
    const answer = el('textarea', 'sp-textarea')
    answer.id = `sp-answer-${index}`
    answer.rows = 5
    answer.value = state.notes
    answer.placeholder = copy.answerPlaceholder
    answer.dataset.itemId = question.item_id
    answer.setAttribute('aria-label', copy.answerLabel(question.item_id))
    answer.addEventListener('input', () => { state.notes = answer.value; changed() })
    const label = el('label', 'sp-field-label', copy.answer)
    label.htmlFor = answer.id
    section.append(label, answer)

    const hints = new Map(question.hints.map(hint => [hint.level, hint.hint]))
    const hintArea = el('div', 'sp-hints')
    hintArea.append(el('h4', '', copy.hints))
    const hintControls = el('div', 'sp-hint-controls')
    const hintBody = el('div', 'sp-hint-body')
    const hintButtons = []
    const hintBlocks = new Map()
    const revealed = new Set()
    function updateHints() {
      for (const [level, hintButton] of hintButtons) {
        hintButton.disabled = !hints.has(level) || level > state.hintLevel + 1
        hintButton.setAttribute('aria-expanded', String(level <= state.hintLevel))
        if (level <= state.hintLevel && !revealed.has(level)) {
          const block = hintBlocks.get(level)
          block.replaceChildren(el('h5', '', copy.hintTitle(level)), el('p', '', hints.get(level)))
          block.hidden = false
          revealed.add(level)
        }
      }
    }
    for (const level of [1, 2, 3]) {
      const hintButton = button(copy.hint(level), 'sp-button sp-button-secondary', () => {
        if (level <= state.hintLevel || level !== state.hintLevel + 1 || !hints.has(level)) return
        state.hintLevel = level
        changed()
        updateHints()
        announce(copy.hintOpened(level))
      })
      hintButton.dataset.hintLevel = String(level)
      hintButton.setAttribute('aria-controls', `sp-hint-${index}-${level}`)
      const block = el('div', 'sp-hint')
      block.id = `sp-hint-${index}-${level}`
      block.hidden = true
      hintBlocks.set(level, block)
      hintBody.append(block)
      hintButtons.push([level, hintButton])
      hintControls.append(hintButton)
    }
    updateHints()
    hintArea.append(el('p', 'sp-meta', hints.has(1) ? copy.hintSequence : copy.noHints), hintControls, hintBody)
    section.append(hintArea)
    return section
  }

  function selectActivity(activityId, focus = true) {
    selectedId = activityId
    renderActivity()
    refreshProgress()
    if (focus) {
      content.querySelector('h2')?.focus({ preventScroll: true })
      content.scrollIntoView({ block: 'start', behavior: 'auto' })
    }
  }

  function renderActivity() {
    const activity = activities.find(value => value.activity_id === selectedId)
    if (!activity) {
      content.replaceChildren(el('section', 'sp-empty', el('h2', '', copy.empty), el('p', 'sp-meta', copy.emptyHelp)))
      return
    }
    const state = states.get(activity.activity_id)
    const index = activities.indexOf(activity)
    const heading = el('h2', '', activity.goal)
    heading.tabIndex = -1
    const completedLabel = el('span', 'sp-activity-state', state.completed ? copy.done : copy.ongoing)
    completedLabel.dataset.complete = String(state.completed)
    const title = el('header', 'sp-activity-heading',
      el('div', 'sp-heading-meta', el('span', 'sp-meta', copy.item(index + 1, activities.length)), completedLabel), heading)
    const instructions = el('section', 'sp-instructions', el('h3', '', copy.prompt), el('p', 'sp-preserve', activity.prompt))
    const questions = el('div', 'sp-questions', activity.questions.map((question, questionIndex) => renderQuestion(question, state.questions.get(question.item_id), questionIndex)))
    if (!activity.questions.length) questions.append(el('p', 'sp-meta', copy.noQuestions))
    const notes = el('textarea', 'sp-textarea sp-activity-notes')
    notes.id = 'sp-activity-notes'
    notes.rows = 3
    notes.value = state.notes
    notes.placeholder = copy.notesPlaceholder
    notes.setAttribute('aria-label', copy.notes)
    notes.addEventListener('input', () => { state.notes = notes.value; changed() })
    const notesLabel = el('label', 'sp-field-label', copy.notes)
    notesLabel.htmlFor = notes.id
    const notesSection = el('section', 'sp-notes-section', notesLabel, notes)
    const checks = el('fieldset', 'sp-self-check', el('legend', '', copy.selfCheck))
    const checkCount = el('span', 'sp-meta')
    const updateCheckCount = () => { checkCount.textContent = copy.selfCheckCount(state.selfChecks.filter(Boolean).length, state.selfChecks.length) }
    updateCheckCount()
    for (const [criterionIndex, criterion] of activity.success_criteria.entries()) {
      const checkbox = el('input', '')
      checkbox.type = 'checkbox'
      checkbox.checked = state.selfChecks[criterionIndex]
      checkbox.dataset.criterionIndex = String(criterionIndex)
      checkbox.addEventListener('change', () => { state.selfChecks[criterionIndex] = checkbox.checked; changed(); updateCheckCount() })
      checks.append(el('label', 'sp-check-row', checkbox, el('span', '', criterion)))
    }
    if (!activity.success_criteria.length) checks.append(el('p', 'sp-meta', copy.noCriteria))
    else checks.append(checkCount)
    const completionButton = button(state.completed ? copy.incomplete : copy.complete, 'sp-button sp-button-primary', () => {
      state.completed = !state.completed
      changed()
      completionButton.textContent = state.completed ? copy.incomplete : copy.complete
      completionButton.setAttribute('aria-pressed', String(state.completed))
      completedLabel.textContent = state.completed ? copy.done : copy.ongoing
      completedLabel.dataset.complete = String(state.completed)
      refreshProgress()
      announce(state.completed ? copy.done : copy.ongoing)
    })
    completionButton.dataset.action = 'toggle-complete'
    completionButton.setAttribute('aria-pressed', String(state.completed))
    const footer = el('footer', 'sp-activity-footer', el('div', 'sp-completion', completionButton, el('p', 'sp-meta', copy.selfMarked)))
    if (index < activities.length - 1) footer.append(button(copy.next, 'sp-text-button', () => selectActivity(activities[index + 1].activity_id)))
    content.replaceChildren(title, instructions, questions, notesSection, checks, footer)
  }

  function exportRecords() {
    const record = {
      format: 'study-student-record-v1', schema_version: practice.schema_version,
      generated_at: practice.generated_at, exported_at: new Date().toISOString(),
      dataset_version: practice.dataset_version, policy_version: practice.policy_version,
      producer_version: practice.producer_version, source_mode: practice.source_mode,
      student_id: practice.student_id, node_id: practice.node_id,
      completion_source: 'student', activities: activities.map(activity => {
        const state = states.get(activity.activity_id)
        return {
          activity_id: activity.activity_id, notes: state.notes, completed: state.completed,
          self_checks: state.selfChecks.map((checked, criterion_index) => ({ criterion_index, checked })),
          questions: activity.questions.map(question => {
            const questionState = state.questions.get(question.item_id)
            return { item_id: question.item_id, notes: questionState.notes, hint_level: questionState.hintLevel }
          }),
        }
      }),
    }
    let url
    let link
    try {
      url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json;charset=utf-8' }))
      link = el('a', '')
      link.href = url
      const name = `${practice.student_id}-${practice.node_id}`.replace(/[^\p{L}\p{N}._-]/gu, '_')
      link.download = `${name}-learning-record.json`
      link.hidden = true
      document.body.append(link)
      link.click()
      announce(copy.exportStarted)
    } catch (error) {
      announce(copy.exportFailed, true)
    } finally {
      link?.remove()
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }

  const resetDialog = el('dialog', 'sp-reset-dialog')
  resetDialog.setAttribute('aria-labelledby', 'sp-reset-title')
  resetDialog.setAttribute('aria-describedby', 'sp-reset-description')
  const resetTitle = el('h2', '', copy.resetTitle)
  resetTitle.id = 'sp-reset-title'
  const resetDescription = el('p', '', copy.resetBody)
  resetDescription.id = 'sp-reset-description'
  function closeReset() { resetDialog.close(); resetButton.focus() }
  const keepButton = button(copy.keep, 'sp-button sp-button-secondary', closeReset)
  keepButton.dataset.action = 'cancel-reset'
  const confirmButton = button(copy.confirmReset, 'sp-button sp-button-danger', () => {
    for (const state of states.values()) {
      state.notes = ''
      state.completed = false
      state.selfChecks.fill(false)
      for (const question of state.questions.values()) { question.notes = ''; question.hintLevel = 0 }
    }
    dirty = false
    resetDialog.close()
    renderActivity()
    refreshProgress()
    content.querySelector('h2')?.focus({ preventScroll: true })
    announce(copy.resetDone)
  })
  confirmButton.dataset.action = 'confirm-reset'
  resetDialog.addEventListener('cancel', () => { resetButton.focus() })
  resetDialog.addEventListener('click', event => { if (event.target === resetDialog) closeReset() })
  resetDialog.append(resetTitle, resetDescription, el('div', 'sp-dialog-actions', keepButton, confirmButton))

  const nav = el('nav', 'sp-activity-nav')
  nav.setAttribute('aria-label', copy.activityNav)
  for (const [phase, label] of [['first', copy.first], ['later', copy.later]]) {
    const phaseActivities = activities.filter(activity => activity.phase === phase)
    if (!phaseActivities.length) continue
    const group = el('section', 'sp-nav-group', el('h2', '', label))
    for (const activity of phaseActivities) {
      const index = activities.indexOf(activity)
      const navStatus = el('span', 'sp-nav-status')
      const navButton = button('', 'sp-nav-button', () => selectActivity(activity.activity_id))
      navButton.dataset.activityId = activity.activity_id
      navButton.setAttribute('aria-label', copy.activityLabel(index + 1, activity.goal))
      navButton.append(el('span', 'sp-nav-number', String(index + 1).padStart(2, '0')), el('span', 'sp-nav-copy', el('span', '', activity.goal), navStatus))
      navButtons.set(activity.activity_id, navButton)
      navStatuses.set(activity.activity_id, navStatus)
      group.append(navButton)
    }
    nav.append(group)
  }
  const source = el('span', 'sp-source', practice.source_mode === 'fixture' ? copy.dataFixture : copy.dataContest)
  source.dataset.source = practice.source_mode
  const header = el('header', 'sp-header', el('div', 'sp-title', el('h1', '', copy.title), el('div', 'sp-scope', el('span', '', copy.scope(practice.student_id, practice.node_id)), source)), exportButton)
  const sidebar = el('aside', 'sp-sidebar', el('div', 'sp-progress-summary', progressLabel, progress), nav)
  if (practice.delivery.advance_when && activities.some(activity => activity.phase === 'later')) sidebar.append(el('details', 'sp-advance', el('summary', '', copy.advance), el('p', '', practice.delivery.advance_when)))
  const skip = el('a', 'sp-skip-link', copy.skip)
  skip.href = '#sp-content'
  const footer = el('footer', 'sp-page-footer', el('p', '', copy.storage), resetButton)
  root.replaceChildren(skip, header, el('div', 'sp-layout', sidebar, content), footer, live, resetDialog)
  renderActivity()
  refreshProgress()
})()
