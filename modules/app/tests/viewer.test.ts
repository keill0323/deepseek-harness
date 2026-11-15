import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { TestContext } from 'node:test'
import { Window } from '../../data/node_modules/happy-dom/lib/index.js'
import type { DatasetInput, ResultEnvelope } from '../../data/types.ts'
import { build_workspace } from '../core.ts'
import { make_demo_input } from '../demo.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { csv_payload } from './csv-helpers.ts'
import { parse_csv } from '../../data/io.ts'
import { make_input, make_record } from '../../data/tests/helpers.ts'
import { result_to_csv } from '../csv.ts'

type DownloadBlob = InstanceType<Window['Blob']>
interface Download { filename: string; blob: DownloadBlob }

async function setup(t: TestContext, input: DatasetInput = make_demo_input(), sourceMode: 'fixture' | 'live' = 'fixture', workerMode?: 'mock' | 'constructor-error') {
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
  let nextBlobId = 0
  const downloads: Download[] = []
  Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: (blob: DownloadBlob) => {
    const key = `blob:offline-test-${++nextBlobId}`
    blobs.set(key, blob)
    return key
  } })
  Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: (url: string) => { blobs.delete(url) } })
  class MockCsvWorker {
    readonly requests: Array<ResultEnvelope<unknown>> = []
    readonly url: string
    terminated = false
    onmessage: ((event: { data: { ok: boolean; blob?: DownloadBlob } }) => void) | null = null
    onerror: ((event: InstanceType<Window['Event']>) => void) | null = null
    onmessageerror: ((event: InstanceType<Window['Event']>) => void) | null = null
    constructor(url: string) {
      if (workerMode === 'constructor-error') throw new Error('This browser cannot start the export worker.')
      this.url = url
      workers.push(this)
    }
    postMessage(value: ResultEnvelope<unknown>): void { this.requests.push(structuredClone(value)) }
    terminate(): void { this.terminated = true }
    succeed(): void {
      const value = this.requests.at(-1)
      assert.ok(value)
      this.onmessage?.({ data: { ok: true, blob: new window.Blob([result_to_csv(value)], { type: 'text/csv;charset=utf-8' }) } })
    }
    fail(): void { this.onmessage?.({ data: { ok: false } }) }
  }
  const workers: MockCsvWorker[] = []
  if (workerMode) Object.defineProperty(window, 'Worker', { configurable: true, value: MockCsvWorker })
  Object.defineProperty(window.HTMLAnchorElement.prototype, 'click', { configurable: true,
    value: function (this: InstanceType<Window['HTMLAnchorElement']>) {
      const blob = blobs.get(this.href)
      assert.ok(blob, 'A download must reference a captured local Blob.')
      downloads.push({ filename: this.download, blob })
    },
  })
  const calls = { students: 0, peers: 0, classes: 0, classAnalysis: 0 }
  Object.defineProperty(window, '__comparisonCalls', { value: calls })
  const [comparison, csv, student, studentViewer, studentCss, viewer] = await Promise.all([
    readFile(new URL('../../data/lib/companion/comparison/core.js', import.meta.url), 'utf8'),
    readFile(new URL('../../data/lib/companion/app/csv.js', import.meta.url), 'utf8'),
    readFile(new URL('../../data/lib/companion/app/student.js', import.meta.url), 'utf8'),
    readFile(new URL('../student-viewer.js', import.meta.url), 'utf8'),
    readFile(new URL('../student-viewer.css', import.meta.url), 'utf8'),
    readFile(new URL('../viewer.js', import.meta.url), 'utf8'),
  ])
  assert.ok(!/^import\s/m.test(comparison), 'The offline report must use its dependency-free comparison artifact.')
  assert.ok(!/^import\s/m.test(student), 'Student-page exports must not load external modules.')
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
  window.eval(`${comparison.replace(/^export\s+/gm, '')}\n${csv.replace(/^export\s+/gm, '')}\n${student.replace(/^export\s+/gm, '')}\n${wrapped}\nconst CSV_WORKER_SOURCE = ${JSON.stringify(csv)};\nconst STUDENT_ASSETS = ${JSON.stringify({ js: studentViewer, css: studentCss })};\nconst WORKSPACE = ${JSON.stringify(workspace)};\n${viewer}`)
  return { window, workspace, downloads, calls, workers, hasBlob: (url: string) => blobs.has(url), networkRequests: () => networkRequests }
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

function expand(window: Window, details: InstanceType<Window['Element']> | null | undefined): void {
  assert.ok(details instanceof window.HTMLDetailsElement)
  details.open = true
  details.dispatchEvent(new window.Event('toggle'))
}

test('node pairing displays gaps and exports the selected student/class and node order', async t => {
  const input = make_input([
    make_record(), make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 节点编号: 'M2' }),
  ])
  const { window, workspace, downloads } = await setup(t, input)
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
    assert.equal(json.generated_at, workspace.generated_at)
    assert.equal(json.payload.kind, mode)
    assert.equal(json.payload.subject_id, mode === 'student' ? 'S1' : 'C2')
    assert.deepEqual(json.payload.paired_item_ids, mode === 'student' ? ['A1'] : [])
    click(window, '导出当前 CSV')
    assert.deepEqual(csv_payload(await downloads.at(-1)!.blob.text()), json.payload)
    assert.ok(parse_csv(await downloads.at(-1)!.blob.text(), 'pairing.csv').every(row => row['generated_at'] === workspace.generated_at))
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
  const statistics = window.document.querySelector('.metrics')?.textContent ?? ''
  assert.ok(statistics.includes('0%'), 'A retained semantic-review zero remains a scored observation.')
  assert.ok(statistics.includes('1 / 1'), 'Semantic review does not remove an otherwise valid record.')
  assert.ok(!mainText(window).includes('待评分与复核项不计分'))
})

test('current CSV matches the selected JSON after comparison and class scope changes', async t => {
  const { window, workspace, downloads } = await setup(t)
  for (const view of ['比较分析', '班级报告', '课程依据', '质量复核']) {
    click(window, view)
    if (view === '比较分析') { choose(window, '比较方式', 'classes'); choose(window, '测验节点', 'CHECK-1') }
    if (view === '班级报告') choose(window, '选择班级', 'GROUP-B')
    click(window, '导出当前 JSON')
    const json = JSON.parse(await downloads.at(-1)!.blob.text())
    assert.equal(json.generated_at, workspace.generated_at)
    click(window, '导出当前 CSV')
    const csv = await downloads.at(-1)!.blob.text()
    assert.equal(downloads.at(-1)!.blob.type, 'text/csv;charset=utf-8')
    assert.deepEqual(csv_payload(csv), json.payload)
    assert.ok(parse_csv(csv, 'download.csv').every(row => row['generated_at'] === workspace.generated_at))
    assert.deepEqual(JSON.parse(parse_csv(csv, 'selected.csv')[0]!['scope_json']!), json.scope)
    if (view === '班级报告') {
      click(window, '导出班级教学建议')
      const plan = JSON.parse(await downloads.at(-1)!.blob.text())
      assert.equal(plan.generated_at, workspace.generated_at)
      click(window, '导出班级建议 CSV')
      assert.deepEqual(csv_payload(await downloads.at(-1)!.blob.text()), plan.payload)
    }
  }
})

test('CSV worker exports the clicked scope while navigation and JSON remain available', async t => {
  const { window, workspace, downloads, workers, hasBlob, networkRequests } = await setup(t, make_demo_input(), 'fixture', 'mock')
  click(window, '班级报告')
  choose(window, '选择班级', 'GROUP-A')
  const csvButton = [...window.document.querySelectorAll('button')].find(button => button.textContent === '导出当前 CSV')
  assert.ok(csvButton)
  csvButton.click()
  assert.equal(workers.length, 1)
  const worker = workers[0]!
  assert.equal(worker.requests.length, 1)
  assert.deepEqual(worker.requests[0], workspace.payload.class_reports['GROUP-A:CHECK-2'])
  assert.equal(hasBlob(worker.url), true)
  assert.equal(downloads.length, 0, 'The main thread must not synchronously build a second CSV.')
  assert.equal(csvButton.disabled, true)
  csvButton.click()
  assert.equal(workers.length, 1, 'Repeated clicks must not start duplicate exports.')
  choose(window, '选择班级', 'GROUP-B')
  assert.equal(csvButton.disabled, true)
  click(window, '学习计划')
  const csvButtons = [...window.document.querySelectorAll('button')].filter(button => button.dataset.exportFormat === 'csv')
  assert.ok(csvButtons.length > 1, 'Pending state also applies to CSV controls created after navigation.')
  assert.ok(csvButtons.every(button => button.disabled))
  click(window, '导出学生练习清单')
  assert.equal(downloads.length, 1, 'JSON remains available while the independent CSV job is running.')
  assert.equal(JSON.parse(await downloads[0]!.blob.text()).scope.student_id, 'DEMO-A')
  worker.succeed()
  assert.equal(downloads.length, 2)
  const csv = downloads[1]!
  assert.equal(csv.blob.type, 'text/csv;charset=utf-8')
  assert.ok(csv.filename.includes('GROUP-A'))
  assert.ok(!csv.filename.includes('GROUP-B'))
  assert.deepEqual(csv_payload(await csv.blob.text()), workspace.payload.class_reports['GROUP-A:CHECK-2']!.payload)
  assert.ok(csvButtons.every(button => !button.disabled))
  assert.equal(worker.terminated, true)
  assert.equal(hasBlob(worker.url), false)
  assert.equal(networkRequests(), 0)
})

test('failed CSV jobs can retry their original scope after the visible selection changes', async t => {
  const { window, workspace, downloads, workers, hasBlob } = await setup(t, make_demo_input(), 'fixture', 'mock')
  click(window, '班级报告')
  choose(window, '选择班级', 'GROUP-A')
  click(window, '导出当前 CSV')
  const failed = workers[0]!
  failed.fail()
  assert.equal(downloads.length, 0)
  assert.equal(failed.terminated, true)
  assert.equal(hasBlob(failed.url), false)
  assert.ok([...window.document.querySelectorAll('button')].filter(button => button.dataset.exportFormat === 'csv').every(button => !button.disabled))
  choose(window, '选择班级', 'GROUP-B')
  click(window, '重试 CSV')
  assert.equal(workers.length, 2)
  assert.deepEqual(workers[1]!.requests[0], workspace.payload.class_reports['GROUP-A:CHECK-2'])
  workers[1]!.succeed()
  assert.equal(downloads.length, 1)
  assert.ok(downloads[0]!.filename.includes('GROUP-A'))
  assert.deepEqual(csv_payload(await downloads[0]!.blob.text()), workspace.payload.class_reports['GROUP-A:CHECK-2']!.payload)
})

test('browser worker errors release pending CSV controls without downloading a partial result', async t => {
  for (const failure of ['constructor-error', 'error', 'messageerror'] as const) {
    await t.test(failure, async subtest => {
      const { window, downloads, workers } = await setup(subtest, make_demo_input(), 'fixture', failure === 'constructor-error' ? failure : 'mock')
      click(window, '导出全部 CSV')
      if (failure !== 'constructor-error') {
        const worker = workers[0]!
        const handler = failure === 'error' ? worker.onerror : worker.onmessageerror
        assert.ok(handler)
        handler(new window.Event(failure, { cancelable: true }))
        assert.equal(worker.terminated, true)
      }
      assert.equal(downloads.length, 0)
      assert.ok([...window.document.querySelectorAll('button')].filter(button => button.dataset.exportFormat === 'csv').every(button => !button.disabled))
      assert.ok([...window.document.querySelectorAll('button')].some(button => button.textContent === '重试 CSV' && !button.disabled))
    })
  }
})

test('student practice CSV uses the same whitelist as JSON even after opening teacher solutions', async t => {
  const { window, workspace, downloads } = await setup(t)
  click(window, '学习计划')
  choose(window, '内容模式', 'teacher')
  click(window, '导出学生练习清单')
  const json = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(json.generated_at, workspace.generated_at)
  click(window, '导出学生练习 CSV')
  const csv = await downloads.at(-1)!.blob.text()
  assert.deepEqual(csv_payload(csv), json.payload)
  assert.ok(parse_csv(csv, 'download.csv').every(row => row['generated_at'] === workspace.generated_at))
  for (const privateValue of ['teacher_solution', 'reference_answer', 'original_values', 'z>-3', 'z<-3', '评分点得分']) assert.ok(!csv.includes(privateValue))
})

test('independent student-page downloads contain only the selected learner and boot without teacher data', async t => {
  const { window, downloads } = await setup(t)
  choose(window, '模拟学生', 'DEMO-B')
  choose(window, '测验节点', 'CHECK-1')
  click(window, '导出独立学生页')
  click(window, '学习计划')
  choose(window, '内容模式', 'teacher')
  choose(window, '模拟学生', 'DEMO-A')
  choose(window, '测验节点', 'CHECK-2')
  assert.ok(mainText(window).includes('z>-3'))
  const action = [...window.document.querySelectorAll('button')].find(button => button.textContent === '导出独立学生页')
  assert.ok(action)
  const menu = action.closest('details')
  assert.ok(menu instanceof window.HTMLDetailsElement)
  expand(window, menu)
  action.focus()
  action.click()
  assert.equal(menu.open, false)
  assert.equal(window.document.activeElement, menu.querySelector('summary'))
  assert.equal(downloads.length, 2)
  for (const [index, selected] of ['DEMO-B', 'DEMO-A'].entries()) {
    const node = index === 0 ? 'CHECK-1' : 'CHECK-2'
    const download = downloads[index]!
    assert.equal(download.filename, `${selected}-${node}-练习.html`)
    assert.equal(download.blob.type, 'text/html;charset=utf-8')
    const html = await download.blob.text()
    const embedded = /<script type="module">const STUDENT_PRACTICE = ([^\n]+);\n/.exec(html)
    assert.ok(embedded)
    const pack = JSON.parse(embedded[1]!)
    assert.equal(pack.student_id, selected)
    assert.equal(pack.node_id, node)
    for (const privateValue of ['DEMO-C', index === 0 ? 'DEMO-A' : 'DEMO-B', 'GROUP-A', 'teacher_solution', 'reference_answer', 'original_values', 'browser_snapshot', 'RECORD-DEMO', 'z>-3', 'z<-3', '评分点得分']) assert.ok(!html.includes(privateValue), `Student HTML must omit ${privateValue}.`)
    const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html)
    assert.ok(script)
    const page = new Window({ settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true, disableJavaScriptFileLoading: true } })
    t.after(async () => { await page.happyDOM.close() })
    const root = page.document.createElement('div')
    root.id = 'student-app'
    page.document.body.append(root)
    page.eval(script[1]!)
    assert.ok(page.document.body.textContent.includes(selected))
    assert.ok(page.document.body.textContent.includes(node))
    assert.equal(page.document.querySelectorAll('nav[aria-label="学习活动"] button').length, pack.activities.length)
    assert.equal(page.document.querySelectorAll('script[src],link[href],iframe,img').length, 0)
  }
})

test('a failed independent student-page projection creates no download and can be retried', async t => {
  const { window, downloads } = await setup(t)
  window.eval("globalThis.__validStudentProjection = build_student_pack; build_student_pack = () => { throw new Error('Unusable student scope') }")
  click(window, '导出独立学生页')
  assert.equal(downloads.length, 0)
  assert.ok(window.document.querySelector('.feedback-toast')?.textContent.includes('学生页未生成'))
  window.eval('build_student_pack = globalThis.__validStudentProjection; delete globalThis.__validStudentProjection')
  click(window, '导出独立学生页')
  assert.equal(downloads.length, 1)
  assert.equal(downloads[0]!.filename, 'DEMO-A-CHECK-2-练习.html')
})

test('offline teacher report navigates seven pages without loading external resources', async t => {
  const { window, networkRequests } = await setup(t)
  const labels = ['总览', '学生诊断', '学习计划', '比较分析', '班级报告', '课程依据', '质量复核']
  assert.equal(window.document.querySelectorAll('nav button').length, 7)
  for (const label of labels) {
    click(window, label)
    assert.equal(window.document.querySelector('h1')?.textContent, label === '总览' ? '教师工作台' : label)
    assert.equal(window.document.querySelectorAll('nav [aria-current="page"]').length, 1)
  }
  assert.equal(window.document.querySelectorAll('script[src],link[href],iframe,img').length, 0)
  assert.equal(networkRequests(), 0)
})

test('report information keeps provenance accessible and restores focus after closing', async t => {
  const { window, workspace } = await setup(t)
  assert.ok(!mainText(window).includes(workspace.generated_at))
  const trigger = [...window.document.querySelectorAll('button')].find(button => button.textContent === '报告信息')
  assert.ok(trigger)
  trigger.focus()
  trigger.click()
  const dialog = window.document.querySelector('dialog[aria-label="报告信息"]')
  assert.ok(dialog instanceof window.HTMLDialogElement)
  assert.equal(dialog.open, true)
  assert.ok(dialog.textContent.includes(workspace.generated_at))
  assert.ok(dialog.textContent.includes(workspace.dataset_version))
  assert.ok(dialog.textContent.includes('分析时间（UTC）'))
  assert.ok(dialog.textContent.includes('不能代替正式数据验收'))
  click(window, '关闭')
  assert.equal(window.document.querySelector('dialog'), null)
  assert.equal(window.document.activeElement, trigger)
})

test('export-menu actions return focus to the visible menu trigger after the menu closes', async t => {
  const { window, workspace, downloads } = await setup(t)
  choose(window, '模拟学生', 'DEMO-C')
  const menu = window.document.querySelector('.export-menu')
  assert.ok(menu instanceof window.HTMLDetailsElement)
  const summary = menu.querySelector('summary')
  assert.ok(summary)
  for (const label of ['报告信息', '导出全部 JSON', '导出全部 CSV']) {
    summary.focus()
    summary.click()
    assert.equal(menu.open, true)
    const action = [...menu.querySelectorAll('button')].find(button => button.textContent === label)
    assert.ok(action)
    action.focus()
    action.click()
    assert.equal(menu.open, false)
    if (label === '报告信息') {
      const dialog = window.document.querySelector('dialog[aria-label="报告信息"]')
      assert.ok(dialog instanceof window.HTMLDialogElement)
      assert.equal(dialog.open, true)
      click(window, '关闭')
      assert.equal(window.document.querySelector('dialog'), null)
    }
    assert.equal(window.document.activeElement, summary, `${label} must not restore focus to its hidden menu button.`)
  }
  assert.equal(downloads.length, 2)
  const all = JSON.parse(await downloads[0]!.blob.text())
  assert.deepEqual(all.payload.students, workspace.payload.students)
  assert.deepEqual(Object.keys(all.payload.cases), Object.keys(workspace.payload.cases))
  assert.deepEqual(csv_payload(await downloads[1]!.blob.text()), all.payload)
  click(window, '学生诊断')
  assert.ok([...window.document.querySelectorAll('button')].some(button => button.textContent === '导出当前 JSON'))
  assert.ok(![...window.document.querySelectorAll('button')].some(button => button.textContent === '导出全部 JSON'))
})

test('page navigation starts at the heading while changing the current scope keeps the scroll position', async t => {
  const { window } = await setup(t)
  window.scrollTo(0, 480)
  click(window, '学生诊断')
  assert.equal(window.scrollY, 0)
  assert.equal(window.document.activeElement, window.document.querySelector('h1'))
  window.scrollTo(0, 320)
  choose(window, '测验节点', 'CHECK-1')
  assert.equal(window.scrollY, 320)
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

test('overview includes every student and opens the selected student from a filtered roster', async t => {
  const input = make_demo_input()
  input.students.push({ ...input.students[0]!, 学生编号: 'DEMO-D' })
  const { window } = await setup(t, input)
  assert.ok([...window.document.querySelectorAll('main button')].some(button => button.textContent === 'DEMO-D'))
  const search = window.document.querySelector('input[aria-label="筛选学生列表"]')
  assert.ok(search instanceof window.HTMLInputElement)
  search.focus()
  search.value = 'demo-d'
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(window.document.activeElement, search)
  const roster = window.document.querySelector('.overview-roster')
  assert.ok(roster?.textContent.includes('DEMO-D'))
  assert.ok(!roster?.textContent.includes('DEMO-A'))
  click(window, 'DEMO-D')
  assert.equal(window.document.querySelector('h1')?.textContent, '学生诊断')
  assert.ok(window.document.querySelector('.node-description')?.textContent.includes('DEMO-D · CHECK-2'))
  assert.ok(mainText(window).includes('暂无可计分证据'))
})

test('teacher workspace previews real findings, activities and common-item comparison for the selected case', async t => {
  const { window, workspace, calls } = await setup(t)
  const current = workspace.payload.cases['DEMO-A:CHECK-2']!
  const diagnosis = window.document.querySelector('section[aria-label="诊断定位"]')
  const practice = window.document.querySelector('section[aria-label="下一步练习"]')
  const comparison = window.document.querySelector('section[aria-label="学情比较"]')
  const finding = current.diagnosis.payload.findings.find(item => item.category === 'fact' && item.finding_type !== 'observed_performance')
  assert.ok(finding)
  assert.ok(diagnosis?.textContent.includes(finding.title))
  assert.ok(practice?.textContent.includes(current.plan.payload.activities[0]!.goal))
  const rates = [...(comparison?.querySelectorAll('progress') ?? [])]
  assert.deepEqual(rates.map(progress => progress.value), [current.peers.payload.left_rate, current.peers.payload.right_rate])
  assert.ok(rates.every(progress => progress.max === 1))
  assert.equal(calls.peers, 0)
  click(window, '回看作答证据')
  const evidence = window.document.querySelector('dialog')
  assert.ok(evidence?.textContent.includes('RECORD-DEMO-A-CHECK-2-EX-C'))
  assert.ok(evidence?.textContent.includes('-4z<12'))
  click(window, '关闭')
  choose(window, '模拟学生', 'DEMO-C')
  const unknown = window.document.querySelector('.focus-workspace')
  assert.ok(unknown?.textContent.includes('DEMO-C'))
  assert.ok(unknown?.textContent.includes('需要补充观察'))
  assert.ok(unknown?.textContent.includes('暂无共同有效题'))
  assert.equal(unknown?.querySelector('progress'), null)
  assert.ok(!unknown?.textContent.includes('定位到第'))
  assert.ok(!unknown?.textContent.includes('0%'))
})

test('workspace shortcuts preserve the chosen student and node and open that student class', async t => {
  const { window, downloads } = await setup(t)
  choose(window, '模拟学生', 'DEMO-C')
  choose(window, '测验节点', 'CHECK-1')
  click(window, '查看完整诊断')
  click(window, '导出当前 JSON')
  let output = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(output.scope.student_id, 'DEMO-C')
  assert.equal(output.scope.node_id, 'CHECK-1')
  click(window, '总览')
  click(window, '查看练习与提示')
  click(window, '导出学生练习清单')
  output = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(output.scope.student_id, 'DEMO-C')
  assert.equal(output.scope.node_id, 'CHECK-1')
  click(window, '总览')
  click(window, '查看本班报告')
  click(window, '导出当前 JSON')
  output = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(output.scope.class_id, 'GROUP-B')
  assert.equal(output.scope.node_id, 'CHECK-1')
})

test('workspace comparison shortcuts choose the intended mode and current student class', async t => {
  const { window, downloads } = await setup(t)
  choose(window, '模拟学生', 'DEMO-C')
  choose(window, '测验节点', 'CHECK-1')
  click(window, '同伴比较')
  click(window, '导出当前 JSON')
  let output = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(output.payload.kind, 'student_peers')
  assert.equal(output.scope.student_id, 'DEMO-C')
  assert.equal(output.scope.node_id, 'CHECK-1')
  click(window, '总览')
  click(window, '两个班级')
  click(window, '导出当前 JSON')
  output = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(output.payload.kind, 'classes')
  assert.equal(output.scope.left_class_id, 'GROUP-B')
  assert.equal(output.scope.right_class_id, 'GROUP-A')
  assert.equal(output.scope.node_id, 'CHECK-1')
  click(window, '总览')
  choose(window, '模拟学生', 'DEMO-B')
  click(window, '两名学生')
  click(window, '导出当前 JSON')
  output = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(output.payload.kind, 'students')
  assert.equal(output.scope.left_student_id, 'DEMO-B')
  assert.notEqual(output.scope.right_student_id, 'DEMO-B')
  assert.equal(output.scope.node_id, 'CHECK-1')
  click(window, '总览')
  click(window, '跨节点配对')
  click(window, '导出当前 JSON')
  output = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(output.payload.kind, 'student')
  assert.equal(output.payload.subject_id, 'DEMO-B')
  assert.equal(output.payload.left_node_id, 'CHECK-1')
  assert.equal(output.payload.right_node_id, 'CHECK-2')
  assert.equal(output.payload.delta_rate, null)
})

test('a single-node workspace does not offer an executable cross-node shortcut', async t => {
  const input = make_demo_input()
  input.nodes = input.nodes.filter(node => node.节点编号 === 'CHECK-1')
  input.records = input.records.filter(record => record.节点编号 === 'CHECK-1')
  const { window } = await setup(t, input)
  const pairing = [...window.document.querySelectorAll('button')].find(button => button.textContent === '跨节点配对')
  assert.ok(pairing)
  assert.equal(pairing.disabled, true)
  assert.ok(pairing.title.includes('两个测验节点'))
})

test('curriculum links locate the matching indicator and return without narrowing the exported curriculum', async t => {
  const { window, workspace, downloads } = await setup(t)
  for (const [page, action, back] of [
    ['总览', '定位课程要求', '返回工作台'],
    ['学生诊断', '对应课程要求', '返回学生诊断'],
    ['学习计划', '查看课程要求', '返回学习计划'],
  ]) {
    click(window, page!)
    click(window, action!)
    assert.equal(window.document.querySelector('h1')?.textContent, '课程依据')
    const indicator = window.document.querySelector('[data-indicator="INE-1"]')
    assert.ok(indicator)
    assert.equal(window.document.activeElement, indicator)
    assert.equal(window.document.querySelectorAll('.curriculum-focus-row').length, 1)
    assert.ok(indicator.closest('tr')?.classList.contains('curriculum-focus-row'))
    assert.equal(window.document.querySelectorAll('[data-indicator]').length, workspace.payload.curriculum.payload.entries.length)
    click(window, '导出当前 JSON')
    assert.deepEqual(JSON.parse(await downloads.at(-1)!.blob.text()), workspace.payload.curriculum)
    click(window, back!)
    assert.equal(window.document.querySelector('h1')?.textContent, page === '总览' ? '教师工作台' : page)
    assert.ok(window.document.querySelector('.node-description')?.textContent.includes('DEMO-A · CHECK-2'))
  }
  click(window, '查看课程要求')
  click(window, '课程依据')
  assert.equal(window.document.querySelector('.curriculum-focus-row'), null)
  assert.equal(window.document.querySelector('.curriculum-context'), null)
})

test('workspace practice shortcut resets teacher solutions and preserves student-safe exports after curriculum navigation', async t => {
  const { window, downloads } = await setup(t)
  click(window, '学习计划')
  choose(window, '内容模式', 'teacher')
  assert.ok(mainText(window).includes('z>-3'))
  click(window, '总览')
  click(window, '查看练习与提示')
  const mode = window.document.querySelector('select[aria-label="内容模式"]')
  assert.ok(mode instanceof window.HTMLSelectElement)
  assert.equal(mode.value, 'student')
  assert.ok(!mainText(window).includes('教师参考答案与评分依据'))
  const question = [...window.document.querySelectorAll('.question')].find(element => element.querySelector('strong')?.textContent === 'EX-C')
  assert.ok(question)
  const hints = [...question.querySelectorAll('button.hint-button')]
  assert.deepEqual(hints.map(button => button.hasAttribute('disabled')), [false, true, true])
  hints[0]!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  const firstHint = question.querySelector('.hint-text')?.textContent
  click(window, '查看课程要求')
  click(window, '返回学习计划')
  const restored = [...window.document.querySelectorAll('.question')].find(element => element.querySelector('strong')?.textContent === 'EX-C')
  assert.equal(restored?.querySelector('.hint-text')?.textContent, firstHint)
  assert.ok(!mainText(window).includes('z>-3'))
  click(window, '导出学生练习清单')
  click(window, '导出学生练习 CSV')
  for (const download of downloads) {
    const content = await download.blob.text()
    for (const privateValue of ['teacher_solution', 'reference_answer', 'original_values', 'z>-3', 'z<-3', '评分点得分']) assert.ok(!content.includes(privateValue))
  }
})

test('comparison controls reuse exported peers and invoke the original algorithms for new scopes', async t => {
  const { window, calls } = await setup(t)
  click(window, '比较分析')
  assert.equal(calls.peers, 0, 'Peer results already belong to this immutable report snapshot.')
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

test('comparison mode buttons stay synchronized with the native selection and exported scope', async t => {
  const { window, downloads } = await setup(t)
  click(window, '比较分析')
  click(window, '两名学生')
  const selection = window.document.querySelector('select[aria-label="比较方式"]')
  assert.ok(selection instanceof window.HTMLSelectElement)
  assert.equal(selection.value, 'students')
  let selected = window.document.querySelector('[role="group"][aria-label="比较方式"] [aria-pressed="true"]')
  assert.equal(selected?.textContent, '两名学生')
  choose(window, '右侧学生', 'DEMO-C')
  click(window, '导出当前 JSON')
  const students = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(students.payload.kind, 'students')
  assert.equal(students.scope.left_student_id, 'DEMO-A')
  assert.equal(students.scope.right_student_id, 'DEMO-C')
  choose(window, '比较方式', 'classes')
  selected = window.document.querySelector('[role="group"][aria-label="比较方式"] [aria-pressed="true"]')
  assert.equal(selected?.textContent, '两个班级')
  click(window, '导出当前 JSON')
  const classes = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(classes.payload.kind, 'classes')
  assert.equal(classes.scope.left_class_id, 'GROUP-A')
  assert.equal(classes.scope.right_class_id, 'GROUP-B')
})

test('revisiting a comparison keeps its result and avoids repeating the same computation', async t => {
  const { window, calls, downloads } = await setup(t)
  click(window, '比较分析')
  choose(window, '比较方式', 'students')
  choose(window, '右侧学生', 'DEMO-B')
  click(window, '导出当前 JSON')
  const first = JSON.parse(await downloads.at(-1)!.blob.text())
  const count = calls.students
  assert.ok(count > 0)
  click(window, '学生诊断')
  click(window, '比较分析')
  assert.equal(calls.students, count)
  click(window, '导出当前 JSON')
  assert.deepEqual(JSON.parse(await downloads.at(-1)!.blob.text()), first)
  choose(window, '右侧学生', 'DEMO-C')
  assert.equal(calls.students, count + 1, 'Changing the compared student must use a distinct scope.')
  choose(window, '右侧学生', 'DEMO-B')
  assert.equal(calls.students, count + 1)
  choose(window, '测验节点', 'CHECK-1')
  assert.equal(calls.students, count + 2, 'Changing the node must not reuse the previous node result.')
})

test('changing an in-page comparison control preserves keyboard focus', async t => {
  const { window } = await setup(t)
  click(window, '比较分析')
  choose(window, '比较方式', 'students')
  const select = window.document.querySelector('select[aria-label="右侧学生"]')
  assert.ok(select instanceof window.HTMLSelectElement)
  select.focus()
  choose(window, '右侧学生', 'DEMO-C')
  const current = window.document.querySelector('select[aria-label="右侧学生"]')
  assert.equal(window.document.activeElement, current)
  assert.equal(current?.getAttribute('aria-label'), '右侧学生')
})

test('class notes remain separate for each class and never change the class result', async t => {
  const { window, workspace, downloads } = await setup(t)
  const original = JSON.stringify(workspace)
  click(window, '班级报告')
  choose(window, '选择班级', 'GROUP-A')
  let textarea = window.document.querySelector('textarea')
  assert.ok(textarea instanceof window.HTMLTextAreaElement)
  textarea.value = 'A 班下次核对独立作答'
  textarea.dispatchEvent(new window.Event('input', { bubbles: true }))
  choose(window, '选择班级', 'GROUP-B')
  textarea = window.document.querySelector('textarea')
  assert.ok(textarea instanceof window.HTMLTextAreaElement)
  assert.equal(textarea.value, '')
  textarea.value = 'B 班补充观察记录'
  textarea.dispatchEvent(new window.Event('input', { bubbles: true }))
  choose(window, '选择班级', 'GROUP-A')
  assert.equal(window.document.querySelector('textarea')?.value, 'A 班下次核对独立作答')
  click(window, '导出备注')
  const exported = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.deepEqual(Object.values(exported.notes).sort(), ['A 班下次核对独立作答', 'B 班补充观察记录'])
  assert.equal(exported.changes_facts, false)
  assert.equal(JSON.stringify(workspace), original)
})

test('evidence dialogs expose the selected raw response and close without changing analysis', async t => {
  const { window, workspace } = await setup(t)
  const before = JSON.stringify(workspace)
  click(window, '学生诊断')
  const trigger = [...window.document.querySelectorAll('button')].find(button => button.textContent === 'RECORD-DEMO-A-CHECK-2-EX-C')
  assert.ok(trigger)
  trigger.focus()
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
  assert.equal(window.document.activeElement, trigger)
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
  const notes = window.document.querySelector('details.teacher-notes')
  assert.ok(notes instanceof window.HTMLDetailsElement)
  assert.equal(notes.open, false)
  click(window, '备注')
  assert.equal(notes.open, true)
  const textarea = window.document.querySelector('textarea')
  assert.ok(textarea)
  assert.equal(window.document.activeElement, textarea)
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
  const restored = window.document.querySelector('details.teacher-notes')
  assert.ok(restored instanceof window.HTMLDetailsElement)
  assert.equal(restored.open, true)
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
  assert.equal(window.document.querySelectorAll('.quality-record .evidence-body').length, 0)
  const record = [...window.document.querySelectorAll('.quality-record')].find(details => details.textContent.includes('REVIEW-A'))
  expand(window, record)
  assert.equal(window.document.querySelectorAll('.quality-record .evidence-body').length, 1)
  assert.ok(record?.textContent.includes('z<-3'))
  assert.ok(record?.textContent.includes('作答记录.csv'))
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

test('quality notes follow the selected queue and retain drafts and disclosure state during search', async t => {
  const { window, workspace, downloads } = await setup(t)
  const original = JSON.stringify(workspace)
  const note = () => {
    const details = window.document.querySelector('details.teacher-notes')
    const textarea = window.document.querySelector('textarea[aria-label="本地教师备注"]')
    assert.ok(details instanceof window.HTMLDetailsElement)
    assert.ok(textarea instanceof window.HTMLTextAreaElement)
    return { details, textarea }
  }
  const write = (value: string) => {
    click(window, '备注')
    const { textarea } = note()
    textarea.value = value
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }))
  }
  click(window, '质量复核')
  write('整个快照：先核对原始评分')
  choose(window, '复核范围', 'current')
  assert.equal(note().textarea.value, '')
  write('当前学生：下次核对不等号方向')
  choose(window, '复核范围', 'all')
  assert.equal(note().textarea.value, '整个快照：先核对原始评分')
  choose(window, '复核范围', 'current')
  assert.equal(note().textarea.value, '当前学生：下次核对不等号方向')
  click(window, '备注')
  const search = window.document.querySelector('input[aria-label="搜索复核记录"]')
  assert.ok(search instanceof window.HTMLInputElement)
  search.focus()
  search.value = 'score_out_of_range'
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(window.document.activeElement, search)
  assert.equal(note().textarea.value, '当前学生：下次核对不等号方向')
  assert.equal(note().details.open, true, 'Searching the queue must preserve an open notes draft.')
  click(window, '清除筛选')
  const scope = window.document.querySelector('select[aria-label="复核范围"]')
  assert.ok(scope instanceof window.HTMLSelectElement)
  assert.equal(scope.value, 'all')
  assert.equal(search.value, '')
  assert.equal(note().textarea.value, '整个快照：先核对原始评分')
  assert.equal(note().details.open, true, 'Clearing filters restores the all-queue note and its open state.')
  click(window, '导出备注')
  const exported = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.deepEqual(Object.values(exported.notes).sort(), ['当前学生：下次核对不等号方向', '整个快照：先核对原始评分'].sort())
  assert.equal(exported.changes_facts, false)
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
  assert.equal(followup.querySelectorAll('.activity').length, 0, 'Later activities are only constructed after the teacher opens them.')
  expand(window, followup)
  assert.equal(followup.querySelectorAll('.activity').length, plan.delivery.follow_up_activity_ids.length)
  click(window, '导出学生练习清单')
  const output = JSON.parse(await downloads[0]!.blob.text())
  assert.deepEqual(output.payload.delivery, plan.delivery)
  assert.deepEqual(output.payload.activities.map((activity: { phase: string }) => activity.phase), plan.activities.map(activity => activity.phase))
})

test('reports clearly separate synthetic demonstrations from official simulated inputs', async t => {
  const fixture = await setup(t)
  assert.equal(fixture.window.document.querySelector('[aria-label="数据来源"]')?.textContent, '合成演示数据')
  click(fixture.window, '报告信息')
  assert.ok(fixture.window.document.querySelector('dialog')?.textContent.includes('不能代替正式数据验收'))
  const live = await setup(t, make_demo_input(), 'live')
  assert.equal(live.window.document.querySelector('[aria-label="数据来源"]')?.textContent, '赛事模拟数据')
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
  const item = [...window.document.querySelectorAll('details')].find(details => details.querySelector('summary')?.textContent.startsWith('EX-C ·'))
  assert.ok(item instanceof window.HTMLDetailsElement)
  assert.equal(item.open, false)
  assert.equal(item.querySelector('table'), null, 'Score-point tables are constructed only when requested.')
  expand(window, item)
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
