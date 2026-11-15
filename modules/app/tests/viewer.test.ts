import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { TestContext } from 'node:test'
import { Window } from '../../data/node_modules/happy-dom/lib/index.js'
import type { DatasetInput } from '../../data/types.ts'
import { build_workspace } from '../core.ts'
import { make_demo_input } from '../demo.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { csv_payload } from './csv-helpers.ts'
import { parse_csv } from '../../data/io.ts'
import { make_input, make_record } from '../../data/tests/helpers.ts'

type DownloadBlob = InstanceType<Window['Blob']>
interface Download { filename: string; blob: DownloadBlob }

async function setup(t: TestContext, input: DatasetInput = make_demo_input(), sourceMode: 'fixture' | 'live' = 'fixture') {
  const workspace = build_workspace(prepare_workspace_dataset(input, { source_mode: sourceMode, producer_version: 'viewer-test' }))
  const window = new Window({
    settings: {
      enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true,
      disableJavaScriptFileLoading: true, enableCSSFileLoading: false, enableImageFileLoading: false,
      enableIframePageLoading: false,
      navigation: { disableMainFrameNavigation: true, disableChildFrameNavigation: true, disableChildPageNavigation: true, disableFallbackToSetURL: true },
    },
  })
  t.after(async () => { await window.happyDOM.close() })
  let networkRequests = 0
  window.fetch = async () => { networkRequests += 1; throw new Error('Offline DOM tests must not contact a network.') }
  const app = window.document.createElement('div')
  app.id = 'app'
  window.document.body.append(app)
  const blobs = new Map<string, DownloadBlob>()
  const downloads: Download[] = []
  Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: (blob: DownloadBlob) => {
    const key = `blob:offline-test-${blobs.size + 1}`
    blobs.set(key, blob)
    return key
  } })
  Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: (url: string) => { blobs.delete(url) } })
  Object.defineProperty(window.HTMLAnchorElement.prototype, 'click', { configurable: true,
    value: function (this: InstanceType<Window['HTMLAnchorElement']>) {
      const blob = blobs.get(this.href)
      assert.ok(blob, 'A download must reference a captured local Blob.')
      downloads.push({ filename: this.download, blob })
    },
  })
  const calls = { students: 0, peers: 0, classes: 0, classAnalysis: 0 }
  Object.defineProperty(window, '__comparisonCalls', { value: calls })
  const [comparison, csv, viewer] = await Promise.all([
    readFile(new URL('../../data/lib/companion/comparison/core.js', import.meta.url), 'utf8'),
    readFile(new URL('../../data/lib/companion/app/csv.js', import.meta.url), 'utf8'),
    readFile(new URL('../viewer.js', import.meta.url), 'utf8'),
  ])
  assert.ok(!/^import\s/m.test(comparison), 'The offline report must use its dependency-free comparison artifact.')
  const wrapped = `
const originalCompareStudents = compare_students;
compare_students = (...args) => { globalThis.__comparisonCalls.students += 1; return originalCompareStudents(...args); };
const originalComparePeers = compare_with_peers;
compare_with_peers = (...args) => { globalThis.__comparisonCalls.peers += 1; return originalComparePeers(...args); };
const originalCompareClasses = compare_classes;
compare_classes = (...args) => { globalThis.__comparisonCalls.classes += 1; return originalCompareClasses(...args); };
const originalClassAnalysis = analyze_class;
analyze_class = (...args) => { globalThis.__comparisonCalls.classAnalysis += 1; return originalClassAnalysis(...args); };
`
  window.eval(`${comparison.replace(/^export\s+/gm, '')}\n${csv.replace(/^export\s+/gm, '')}\n${wrapped}\nconst WORKSPACE = ${JSON.stringify(workspace)};\n${viewer}`)
  return { window, workspace, downloads, calls, networkRequests: () => networkRequests }
}

function click(window: Window, label: string): void {
  const button = [...window.document.querySelectorAll('button')].find(element => element.textContent?.trim() === label
    || (element.classList.contains('nav-button') && element.lastElementChild?.textContent?.trim() === label))
  assert.ok(button, `Missing button: ${label}`)
  assert.equal(button.disabled, false, `Disabled button: ${label}`)
  button.click()
}

function choose(window: Window, label: string, value: string): void {
  const select = [...window.document.querySelectorAll('select')].find(element => element.getAttribute('aria-label') === label)
  assert.ok(select, `Missing select: ${label}`)
  select.value = value
  select.dispatchEvent(new window.Event('change', { bubbles: true }))
}

function mainText(window: Window): string {
  return window.document.querySelector('main')?.textContent ?? ''
}

test('node pairing displays gaps and exports the selected student/class and node order', async t => {
  const input = make_input([
    make_record(), make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 节点编号: 'M2' }),
  ])
  const { window, downloads } = await setup(t, input)
  click(window, '比较分析')
  choose(window, '测验节点', 'M1')
  choose(window, '比较方式', 'nodes')
  assert.ok(mainText(window).includes('可配对 · 1 人'))
  assert.ok(mainText(window).includes('该节点尚未教学此主题'))
  assert.ok(mainText(window).includes('无作答记录'))
  assert.ok(mainText(window).includes('不计算跨节点分数差'))
  for (const mode of ['student', 'class']) {
    choose(window, '配对对象', mode)
    if (mode === 'class') choose(window, '配对班级', 'C2')
    click(window, '导出当前 JSON')
    const json = JSON.parse(await downloads.at(-1)!.blob.text())
    assert.equal(json.payload.kind, mode)
    assert.equal(json.payload.subject_id, mode === 'student' ? 'S1' : 'C2')
    assert.deepEqual(json.payload.paired_item_ids, mode === 'student' ? ['A1'] : [])
    click(window, '导出当前 CSV')
    assert.deepEqual(csv_payload(await downloads.at(-1)!.blob.text()), json.payload)
  }
  choose(window, '配对对象', 'student')
  choose(window, '测验节点', 'M2')
  click(window, '导出当前 JSON')
  const reversed = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.deepEqual(reversed.scope, { student_id: 'S1', left_node_id: 'M2', right_node_id: 'M1' })
  choose(window, '比较方式', 'students')
  assert.ok(!mainText(window).includes('跨节点观察配对S1'))
  click(window, '导出当前 JSON')
  assert.equal(JSON.parse(await downloads.at(-1)!.blob.text()).payload.kind, 'students')
})

test('a single-node report explains the missing pair and disables stale exports', async t => {
  const input = make_input()
  input.nodes = input.nodes.slice(0, 1)
  const { window } = await setup(t, input)
  click(window, '比较分析')
  choose(window, '比较方式', 'nodes')
  assert.ok(mainText(window).includes('至少需要两个测验节点'))
  for (const label of ['导出当前 CSV', '导出当前 JSON']) {
    const button = [...window.document.querySelectorAll('button')].find(item => item.textContent === label)!
    assert.equal(button.disabled, true)
  }
  choose(window, '比较方式', 'peers')
  click(window, '导出当前 JSON')
})

test('comparison review copy agrees with the displayed population and JSON/CSV exports', async t => {
  const input = make_input([
    make_record({ 得分: '0', 学生最终作答: '3', 评分点得分: 'A1P1=0；A1P2=0；A1P3=0' }),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 学生编号: 'S2', 得分: '3', 学生最终作答: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' }),
  ])
  const { window, downloads } = await setup(t, input)
  click(window, '比较分析')
  choose(window, '测验节点', 'M1')
  const retained = '本次范围内有 1 条待复核记录：1 条按有效分值参与比较，0 条未满足计分条件被排除，0 条可计分但不在共同有效题集中。'
  assert.ok(mainText(window).includes(retained))
  assert.ok(mainText(window).includes('以下记录需要复核，计分与共同题集情况见处理说明。'))
  assert.ok(!mainText(window).includes('以下记录未参加比较。'))
  click(window, '导出当前 JSON')
  const json = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.ok(json.evidence_ids.includes('R1'))
  assert.equal(json.payload.left_rate, 0)
  assert.ok(json.limitations.includes(retained))
  click(window, '导出当前 CSV')
  const csv = await downloads.at(-1)!.blob.text()
  assert.deepEqual(JSON.parse(parse_csv(csv, 'review.csv')[0]!['limitations_json']!), json.limitations)
  assert.deepEqual(csv_payload(csv), json.payload)
  choose(window, '比较方式', 'classes')
  assert.ok(mainText(window).includes('本次范围内有 1 条待复核记录：0 条按有效分值参与比较，0 条未满足计分条件被排除，1 条可计分但不在共同有效题集中。'))
  choose(window, '测验节点', 'M2')
  assert.ok(!mainText(window).includes('待复核'))
  click(window, '学生诊断')
  choose(window, '测验节点', 'M1')
  assert.ok(mainText(window).includes('语义复核可保留原分，结构冲突暂不计分'))
  assert.ok(!mainText(window).includes('待评分与复核项不计分'))
})

test('current CSV matches the selected JSON after comparison and class scope changes', async t => {
  const { window, downloads } = await setup(t)
  for (const view of ['比较分析', '班级报告', '课程依据', '质量复核']) {
    click(window, view)
    if (view === '比较分析') { choose(window, '比较方式', 'classes'); choose(window, '测验节点', 'CHECK-1') }
    if (view === '班级报告') choose(window, '选择班级', 'GROUP-B')
    click(window, '导出当前 JSON')
    const json = JSON.parse(await downloads.at(-1)!.blob.text())
    click(window, '导出当前 CSV')
    const csv = await downloads.at(-1)!.blob.text()
    assert.equal(downloads.at(-1)!.blob.type, 'text/csv;charset=utf-8')
    assert.deepEqual(csv_payload(csv), json.payload)
    assert.deepEqual(JSON.parse(parse_csv(csv, 'selected.csv')[0]!['scope_json']!), json.scope)
    if (view === '班级报告') {
      click(window, '导出班级教学建议')
      const plan = JSON.parse(await downloads.at(-1)!.blob.text())
      click(window, '导出班级建议 CSV')
      assert.deepEqual(csv_payload(await downloads.at(-1)!.blob.text()), plan.payload)
    }
  }
})

test('student practice CSV uses the same whitelist as JSON even after opening teacher solutions', async t => {
  const { window, downloads } = await setup(t)
  click(window, '学习计划')
  choose(window, '内容模式', 'teacher')
  click(window, '导出学生练习清单')
  const json = JSON.parse(await downloads.at(-1)!.blob.text())
  click(window, '导出学生练习 CSV')
  const csv = await downloads.at(-1)!.blob.text()
  assert.deepEqual(csv_payload(csv), json.payload)
  for (const privateValue of ['teacher_solution', 'reference_answer', 'original_values', 'z>-3', 'z<-3', '评分点得分']) assert.ok(!csv.includes(privateValue))
})

test('offline teacher report navigates seven pages without loading external resources', async t => {
  const { window, networkRequests } = await setup(t)
  const labels = ['总览', '学生诊断', '学习计划', '比较分析', '班级报告', '课程依据', '质量复核']
  assert.equal(window.document.querySelectorAll('nav button').length, 7)
  for (const label of labels) {
    click(window, label)
    assert.equal(window.document.querySelector('h1')?.textContent, label)
    assert.equal(window.document.querySelectorAll('nav [aria-current="page"]').length, 1)
    assert.ok(mainText(window).includes('教师备注'))
  }
  assert.equal(window.document.querySelectorAll('script[src],link[href],iframe,img').length, 0)
  assert.equal(networkRequests(), 0)
})

test('student and node changes retain an explicit empty-evidence state rather than a zero', async t => {
  const { window } = await setup(t)
  click(window, '学生诊断')
  choose(window, '模拟学生', 'DEMO-C')
  assert.ok(window.document.querySelector('.node-description')?.textContent.includes('DEMO-C · CHECK-2'))
  assert.ok(mainText(window).includes('暂无可计分证据'))
  assert.ok(mainText(window).includes('该学生在指定节点没有作答记录'))
  choose(window, '测验节点', 'CHECK-1')
  assert.ok(window.document.querySelector('.node-description')?.textContent.includes('DEMO-C · CHECK-1'))
  assert.ok(window.document.querySelector('.metrics')?.textContent.includes('100%'))
  assert.ok(mainText(window).includes('本节点未教'))
})

test('comparison controls invoke the original algorithms for peers, students, and classes', async t => {
  const { window, calls } = await setup(t)
  click(window, '比较分析')
  assert.ok(calls.peers > 0)
  assert.ok(mainText(window).includes('-40 个百分点'))
  choose(window, '比较方式', 'students')
  choose(window, '右侧学生', 'DEMO-B')
  assert.ok(calls.students > 0)
  assert.ok(mainText(window).includes('-40 个百分点'))
  choose(window, '比较方式', 'classes')
  assert.ok(calls.classes > 0)
  assert.ok(mainText(window).includes('没有共同有效题'))
  assert.ok(mainText(window).includes('暂无可比结果'))
  choose(window, '测验节点', 'CHECK-1')
  assert.ok(mainText(window).includes('0 个百分点'))
  assert.ok(mainText(window).includes('EX-B'))
  click(window, '班级报告')
  choose(window, '选择班级', 'GROUP-B')
  assert.equal(calls.classAnalysis, 0, 'Class view uses the complete precomputed class report, including rubric distributions.')
  assert.ok(mainText(window).includes('DEMO-C'))
})

test('evidence dialogs expose the selected raw response and close without changing analysis', async t => {
  const { window, workspace } = await setup(t)
  const before = JSON.stringify(workspace)
  click(window, '学生诊断')
  click(window, 'RECORD-DEMO-A-CHECK-2-EX-C')
  const dialog = window.document.querySelector('dialog')
  assert.ok(dialog)
  assert.equal(dialog.open, true)
  assert.ok(dialog.textContent.includes('z<-3'))
  assert.ok(dialog.textContent.includes('-4z<12'))
  assert.ok(dialog.textContent.includes('EX-CP2=0'))
  assert.ok(dialog.textContent.includes('作答记录.csv'))
  click(window, '关闭')
  assert.equal(window.document.querySelector('dialog'), null)
  assert.equal(JSON.stringify(workspace), before)
})

test('progressive student hints unlock in order and student exports omit raw and reference answers', async t => {
  const { window, downloads } = await setup(t)
  click(window, '学习计划')
  const question = [...window.document.querySelectorAll('.question')].find(element => element.querySelector('strong')?.textContent === 'EX-C')
  assert.ok(question)
  const buttons = [...question.querySelectorAll('button')]
  assert.equal(buttons.length, 3)
  assert.deepEqual(buttons.map(button => button.disabled), [false, true, true])
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons[index]!
    assert.equal(button.disabled, false)
    button.click()
    const hint = question.querySelector('.hint-text')?.textContent ?? ''
    assert.ok(hint.length > 0)
    assert.ok(!hint.includes('z>-3'))
    assert.ok(!hint.includes('z<-3'))
    if (index < 2) assert.equal(buttons[index + 1]?.disabled, false)
  }
  click(window, '导出学生练习清单')
  assert.equal(downloads.length, 1)
  assert.equal(downloads[0]?.filename, 'DEMO-A-CHECK-2-student-plan.json')
  const text = await downloads[0]!.blob.text()
  const output = JSON.parse(text)
  assert.equal(output.scope.student_id, 'DEMO-A')
  assert.ok(output.payload.activities.length > 0)
  assert.ok(!text.includes('z>-3'))
  assert.ok(!text.includes('z<-3'))
  assert.ok(!text.includes('original_values'))
  assert.ok(!text.includes('reference_answer'))
  assert.ok(!text.includes('teacher_solution'))
  assert.ok(!text.includes('评分点得分'))
})

test('JSON downloads keep teacher notes separate from statistics and diagnosis facts', async t => {
  const { window, workspace, downloads } = await setup(t)
  const before = JSON.stringify(workspace)
  click(window, '学生诊断')
  const textarea = window.document.querySelector('textarea')
  assert.ok(textarea)
  textarea.value = '教师备注：下次补充独立作答；当前事实保持不变。'
  textarea.dispatchEvent(new window.Event('input', { bubbles: true }))
  click(window, '导出备注')
  const noteExport = JSON.parse(await downloads[0]!.blob.text())
  assert.equal(noteExport.kind, 'teacher_notes')
  assert.equal(noteExport.changes_facts, false)
  assert.equal(noteExport.notes['diagnosis:DEMO-A:CHECK-2'], textarea.value)
  click(window, '导出当前 JSON')
  const diagnosisExport = JSON.parse(await downloads[1]!.blob.text())
  assert.deepEqual(diagnosisExport, workspace.payload.cases['DEMO-A:CHECK-2']!.diagnosis)
  assert.equal(Object.hasOwn(diagnosisExport.payload, 'notes'), false)
  click(window, '总览')
  click(window, '学生诊断')
  assert.equal(window.document.querySelector('textarea')?.value, textarea.value)
  assert.equal(JSON.stringify(workspace), before)
})

test('imported markup stays literal text and does not create active DOM elements', async t => {
  const input = make_demo_input()
  const malicious = '<img src="blocked.invalid" onerror="globalThis.__unexpectedMarkup = true">'
  input.items.find(item => item['材料编号'] === 'EX-C')!['题干或内容'] += malicious
  const { window, networkRequests } = await setup(t, input)
  click(window, '学习计划')
  assert.ok(mainText(window).includes(malicious))
  assert.equal(window.document.querySelector('img'), null)
  assert.equal(window.eval('globalThis.__unexpectedMarkup'), undefined)
  assert.equal(networkRequests(), 0)
})

test('student search supports keyboard lookup without changing ambiguous or missing selections', async t => {
  const { window } = await setup(t)
  click(window, '学生诊断')
  const search = window.document.querySelector('input[aria-label="快速查找学生"]')
  assert.ok(search instanceof window.HTMLInputElement)
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }))
  assert.equal(window.document.activeElement, search)
  search.value = 'demo-c'
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.ok(window.document.querySelector('.search-status')?.textContent.includes('DEMO-C'))
  search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  assert.ok(window.document.querySelector('.node-description')?.textContent.includes('DEMO-C · CHECK-2'))
  assert.ok(mainText(window).includes('暂无可计分证据'))
  search.value = 'group-a'
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  search.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  assert.ok(window.document.querySelector('.search-status')?.textContent.includes('找到 2 名'))
  assert.ok(window.document.querySelector('.node-description')?.textContent.includes('DEMO-C · CHECK-2'))
  search.value = 'missing'
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.ok(window.document.querySelector('.search-status')?.textContent.includes('没有匹配'))
  choose(window, '模拟学生', 'DEMO-B')
  assert.equal(search.value, '')
  assert.equal(window.document.querySelector('.search-status')?.textContent, '')
  const notes = window.document.querySelector('textarea')
  assert.ok(notes)
  notes.focus()
  const slash = new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
  notes.dispatchEvent(slash)
  assert.equal(slash.defaultPrevented, false)
  assert.equal(window.document.activeElement, notes)
})

test('hint progress survives navigation while remaining isolated by student and node', async t => {
  const { window } = await setup(t)
  click(window, '学习计划')
  const question = () => [...window.document.querySelectorAll('.question')].find(element => element.querySelector('strong')?.textContent === 'EX-C')
  let current = question()
  assert.ok(current)
  current.querySelectorAll('button')[0]!.click()
  current.querySelectorAll('button')[1]!.click()
  const shown = current.querySelector('.hint-text')?.textContent
  click(window, '总览')
  click(window, '学习计划')
  current = question()
  assert.ok(current)
  assert.equal(current.querySelector('.hint-text')?.textContent, shown)
  assert.deepEqual([...current.querySelectorAll('button')].map(button => button.disabled), [false, false, false])
  assert.equal(current.querySelector('button.active')?.textContent, '提示 2')
  choose(window, '模拟学生', 'DEMO-B')
  current = question()
  assert.ok(current)
  assert.deepEqual([...current.querySelectorAll('button')].map(button => button.disabled), [false, true, true])
  choose(window, '模拟学生', 'DEMO-A')
  choose(window, '测验节点', 'CHECK-1')
  assert.equal(question(), undefined)
  choose(window, '测验节点', 'CHECK-2')
  assert.equal(question()?.querySelector('.hint-text')?.textContent, shown)
})

test('quality search and scope filters export only the visible queue without changing records', async t => {
  const input = make_demo_input()
  const a = input.records.find(row => row.学生编号 === 'DEMO-A' && row.材料编号 === 'EX-C')!
  const b = input.records.find(row => row.学生编号 === 'DEMO-B' && row.节点编号 === 'CHECK-1' && row.材料编号 === 'EX-B')!
  input.records.push({ ...a, 记录编号: 'REVIEW-A', 作答事件编号: 'REVIEW-EVENT-A', 得分: '9' }, { ...b, 记录编号: 'REVIEW-B', 作答事件编号: 'REVIEW-EVENT-B', 得分: '8' })
  const { window, workspace, downloads } = await setup(t, input)
  const original = JSON.stringify(workspace)
  click(window, '质量复核')
  assert.equal(window.document.querySelectorAll('.quality-record').length, 2)
  choose(window, '复核范围', 'current')
  assert.equal(window.document.querySelectorAll('.quality-record').length, 1)
  assert.ok(window.document.querySelector('.quality-results')?.textContent.includes('REVIEW-A'))
  click(window, '导出当前 JSON')
  const filtered = JSON.parse(await downloads[0]!.blob.text())
  assert.equal(filtered.scope.student_id, 'DEMO-A')
  assert.equal(filtered.payload.filtered_count, 1)
  assert.deepEqual(filtered.evidence_ids, ['REVIEW-A'])
  assert.deepEqual(filtered.payload.quality_records.map((record: { record_id: string }) => record.record_id), ['REVIEW-A'])
  choose(window, '模拟学生', 'DEMO-B')
  assert.equal(window.document.querySelectorAll('.quality-record').length, 0)
  choose(window, '测验节点', 'CHECK-1')
  assert.ok(window.document.querySelector('.quality-results')?.textContent.includes('REVIEW-B'))
  const search = window.document.querySelector('input[aria-label="搜索复核记录"]')
  assert.ok(search instanceof window.HTMLInputElement)
  search.value = 'score_out_of_range'
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(window.document.querySelectorAll('.quality-record').length, 1)
  assert.equal(window.document.activeElement === search, false)
  search.focus()
  search.value = 'does-not-exist'
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(window.document.activeElement, search)
  assert.equal(window.document.querySelectorAll('.quality-record').length, 0)
  assert.ok(mainText(window).includes('没有匹配记录'))
  click(window, '清除筛选')
  assert.equal(window.document.querySelectorAll('.quality-record').length, 2)
  assert.equal(JSON.stringify(workspace), original)
})

test('first-batch activities remain visible while later work is folded and exported with its phase', async t => {
  const input = make_demo_input()
  input.items.push({ ...input.items[0]!, 材料编号: 'EX-D', 指标编号: 'ALG-2', 评分点: 'EX-DP1 正确完成题目 1分' })
  input.requirements.push({ ...input.requirements[0]!, 指标编号: 'ALG-2', 观察指标: '补充观察另一个式子' })
  input.nodes.find(row => row.节点编号 === 'CHECK-2')!.可用题目编号 += '、EX-D'
  const { window, workspace, downloads } = await setup(t, input)
  const plan = workspace.payload.cases['DEMO-A:CHECK-2']!.plan.payload
  assert.ok(plan.activities.length > 3)
  click(window, '学习计划')
  const followup = window.document.querySelector('details.plan-followup')
  assert.ok(followup instanceof window.HTMLDetailsElement)
  assert.equal(followup.open, false)
  assert.equal(window.document.querySelectorAll('main > .activity').length, plan.delivery.first_activity_ids.length)
  assert.equal(followup.querySelectorAll('.activity').length, plan.delivery.follow_up_activity_ids.length)
  click(window, '导出学生练习清单')
  const output = JSON.parse(await downloads[0]!.blob.text())
  assert.deepEqual(output.payload.delivery, plan.delivery)
  assert.deepEqual(output.payload.activities.map((activity: { phase: string }) => activity.phase), plan.activities.map(activity => activity.phase))
})

test('reports clearly separate synthetic demonstrations from official simulated inputs', async t => {
  const fixture = await setup(t)
  assert.equal(fixture.window.document.querySelector('.source-fixture strong')?.textContent, '合成演示数据')
  assert.ok(fixture.window.document.querySelector('.data-source-banner')?.textContent.includes('不能代替正式数据验收'))
  const live = await setup(t, make_demo_input(), 'live')
  assert.equal(live.window.document.querySelector('.source-live strong')?.textContent, '赛事模拟数据')
  assert.equal(live.window.document.querySelector('.source-fixture'), null)
})

test('colon-containing student and node identifiers keep cases and teacher notes distinct', async t => {
  const input = make_demo_input()
  const studentNames: Record<string, string> = { 'DEMO-A': 'A:B', 'DEMO-B': 'A' }
  const nodeNames: Record<string, string> = { 'CHECK-1': 'C', 'CHECK-2': 'B:C' }
  for (const student of input.students) student.学生编号 = studentNames[student.学生编号!] ?? student.学生编号!
  for (const node of input.nodes) node.节点编号 = nodeNames[node.节点编号!]!
  for (const record of input.records) {
    record.学生编号 = studentNames[record.学生编号!] ?? record.学生编号!
    record.节点编号 = nodeNames[record.节点编号!]!
  }
  const { window, downloads } = await setup(t, input)
  click(window, '学生诊断')
  choose(window, '模拟学生', 'A:B')
  choose(window, '测验节点', 'C')
  let notes = window.document.querySelector('textarea')!
  notes.value = '第一个对象的备注'
  notes.dispatchEvent(new window.Event('input', { bubbles: true }))
  choose(window, '模拟学生', 'A')
  choose(window, '测验节点', 'B:C')
  assert.ok(window.document.querySelector('.node-description')?.textContent.includes('A · B:C'))
  notes = window.document.querySelector('textarea')!
  assert.equal(notes.value, '')
  notes.value = '第二个对象的备注'
  notes.dispatchEvent(new window.Event('input', { bubbles: true }))
  click(window, '导出备注')
  const output = JSON.parse(await downloads[0]!.blob.text())
  assert.equal(output.notes['diagnosis:A%3AB:C'], '第一个对象的备注')
  assert.equal(output.notes['diagnosis:A:B%3AC'], '第二个对象的备注')
  choose(window, '模拟学生', 'A:B')
  choose(window, '测验节点', 'C')
  assert.equal(window.document.querySelector('textarea')?.value, '第一个对象的备注')
})

test('teacher solution mode is explicit and never enters the student practice download', async t => {
  const { window, downloads } = await setup(t)
  click(window, '学习计划')
  assert.ok(!mainText(window).includes('教师参考答案与评分依据'))
  choose(window, '内容模式', 'teacher')
  assert.ok(mainText(window).includes('教师参考答案与评分依据'))
  assert.ok(mainText(window).includes('z>-3'))
  click(window, '导出学生练习清单')
  const exported = await downloads.at(-1)!.blob.text()
  assert.ok(!exported.includes('teacher_solution'))
  assert.ok(!exported.includes('reference_answer'))
  assert.ok(!exported.includes('z>-3'))
  choose(window, '内容模式', 'student')
  assert.ok(!mainText(window).includes('教师参考答案与评分依据'))
})

test('class view retains point distributions and exports suggestions for the selected class and node', async t => {
  const { window, downloads } = await setup(t)
  click(window, '班级报告')
  assert.ok(mainText(window).includes('逐题与评分点分布'))
  assert.ok(mainText(window).includes('EX-CP2'))
  assert.ok(mainText(window).includes('班级教学建议'))
  choose(window, '选择班级', 'GROUP-B')
  click(window, '导出班级教学建议')
  const exported = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(exported.payload.class_id, 'GROUP-B')
  assert.equal(exported.payload.node_id, 'CHECK-2')
  assert.ok(exported.payload.recommendations.every((item: { student_ids: string[]; kind: string }) => item.kind === 'observation' && item.student_ids.join() === 'DEMO-C'))
  choose(window, '测验节点', 'CHECK-1')
  assert.ok(!mainText(window).includes('EX-CP2'))
})
