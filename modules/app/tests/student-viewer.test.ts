import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { TestContext } from 'node:test'
import { Window } from '../../data/node_modules/happy-dom/lib/index.js'
import { build_workspace } from '../core.ts'
import { make_demo_input } from '../demo.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { build_student_pack } from '../student.ts'
import type { StudentPracticePack } from '../student.ts'

type DownloadBlob = InstanceType<Window['Blob']>
interface Download { filename: string; blob: DownloadBlob }

function practiceFixture(): StudentPracticePack {
  const workspace = build_workspace(prepare_workspace_dataset(make_demo_input(), { source_mode: 'fixture', producer_version: 'student-viewer-test' }))
  return build_student_pack(workspace, 'DEMO-A', 'CHECK-2')
}

async function setup(t: TestContext, practice: StudentPracticePack = practiceFixture()) {
  const window = new Window({ settings: {
    enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true,
    disableJavaScriptFileLoading: true, enableCSSFileLoading: false, enableImageFileLoading: false,
    enableIframePageLoading: false,
    navigation: { disableMainFrameNavigation: true, disableChildFrameNavigation: true, disableChildPageNavigation: true, disableFallbackToSetURL: true },
  } })
  t.after(async () => { await window.happyDOM.close() })
  let networkRequests = 0
  window.fetch = async () => { networkRequests += 1; throw new Error('The student page must work without a network.') }
  for (const storage of ['localStorage', 'sessionStorage']) Object.defineProperty(window, storage, {
    configurable: true, get() { throw new Error('Student drafts must remain in this page session.') },
  })
  const app = window.document.createElement('div')
  app.id = 'student-app'
  window.document.body.append(app)
  const blobs = new Map<string, DownloadBlob>()
  let nextBlobId = 0
  const downloads: Download[] = []
  Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: (blob: DownloadBlob) => {
    const url = `blob:student-test-${++nextBlobId}`
    blobs.set(url, blob)
    return url
  } })
  Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: (url: string) => { blobs.delete(url) } })
  Object.defineProperty(window.HTMLAnchorElement.prototype, 'click', { configurable: true,
    value: function (this: InstanceType<Window['HTMLAnchorElement']>) {
      const blob = blobs.get(this.href)
      assert.ok(blob)
      downloads.push({ filename: this.download, blob })
    },
  })
  const viewer = await readFile(new URL('../student-viewer.js', import.meta.url), 'utf8')
  window.eval(`const STUDENT_PRACTICE = ${JSON.stringify(practice)};\n${viewer}`)
  return { window, practice, downloads, networkRequests: () => networkRequests }
}

function button(window: Window, label: string) {
  const found = [...window.document.querySelectorAll('button')].find(candidate => candidate.textContent?.trim() === label)
  assert.ok(found, `Missing button: ${label}`)
  return found
}

function click(window: Window, label: string): void {
  const found = button(window, label)
  assert.equal(found.disabled, false, `Disabled button: ${label}`)
  found.click()
}

function field(window: Window, label: string) {
  const found = [...window.document.querySelectorAll('textarea')].find(candidate => candidate.getAttribute('aria-label') === label)
  assert.ok(found, `Missing text field: ${label}`)
  return found
}

function fill(window: Window, label: string, value: string): void {
  const found = field(window, label)
  found.value = value
  found.dispatchEvent(new window.Event('input', { bubbles: true }))
}

function openActivity(window: Window, id: string): void {
  const found = [...window.document.querySelectorAll('nav[aria-label="学习活动"] button')].find(candidate => candidate.getAttribute('data-activity-id') === id)
  assert.ok(found instanceof window.HTMLButtonElement)
  found.click()
  assert.equal(window.document.querySelector('nav[aria-label="学习活动"] [aria-current="step"]')?.getAttribute('data-activity-id'), id)
}

test('the offline student page starts with only the chosen learner and no teacher or class data', async t => {
  const { window, practice, networkRequests } = await setup(t)
  const text = window.document.body.textContent
  assert.ok(text.includes('DEMO-A'))
  assert.ok(text.includes('CHECK-2'))
  assert.ok(text.includes(practice.activities[0]!.goal))
  for (const privateValue of ['DEMO-B', 'DEMO-C', 'GROUP-A', 'GROUP-B', 'z>-3', 'z<-3', '参考答案', '评分点得分']) assert.ok(!text.includes(privateValue))
  assert.equal(window.document.querySelectorAll('nav[aria-label="学习活动"] [aria-current="step"]').length, 1)
  assert.equal(window.document.querySelectorAll('script[src],link[href],iframe,img').length, 0)
  assert.equal(networkRequests(), 0)
})

test('student hints reveal in sequence and cannot reveal the answer', async t => {
  const { window, practice } = await setup(t)
  const expected = practice.activities[0]!.questions[0]!.hints
  assert.equal(expected.length, 3)
  const hints = [1, 2, 3].map(level => button(window, `查看提示 ${level}`))
  assert.deepEqual(hints.map(hint => hint.disabled), [false, true, true])
  for (const index of [0, 1, 2]) {
    const hint = button(window, `查看提示 ${index + 1}`)
    assert.equal(hint.disabled, false)
    hint.click()
    assert.equal(button(window, `查看提示 ${index + 1}`).getAttribute('aria-expanded'), 'true')
    assert.ok(window.document.body.textContent.includes(expected[index]!.hint))
    assert.ok(!window.document.body.textContent.includes('z>-3'))
    assert.ok(!window.document.body.textContent.includes('z<-3'))
    if (index < 2) assert.equal(button(window, `查看提示 ${index + 2}`).disabled, false)
  }
})

test('switching activities retains separate answers, notes, self-checks and hint progress', async t => {
  const { window, practice, downloads } = await setup(t)
  const first = practice.activities[0]!
  const second = practice.activities[1]!
  const firstQuestion = first.questions[0]!
  const secondQuestion = second.questions[0]!
  fill(window, `我的作答：${firstQuestion.item_id}`, '先写出每一步，再检查运算方向。')
  fill(window, '本项练习笔记', '需要再解释除法这一步。')
  click(window, '查看提示 1')
  const selfCheck = window.document.querySelector('input[type="checkbox"][data-criterion-index="0"]')
  assert.ok(selfCheck instanceof window.HTMLInputElement)
  selfCheck.click()
  click(window, '标记练习完成')
  openActivity(window, second.activity_id)
  assert.equal(field(window, `我的作答：${secondQuestion.item_id}`).value, '')
  assert.equal(field(window, '本项练习笔记').value, '')
  fill(window, '本项练习笔记', '这是第二项的记录。')
  openActivity(window, first.activity_id)
  assert.equal(field(window, `我的作答：${firstQuestion.item_id}`).value, '先写出每一步，再检查运算方向。')
  assert.equal(field(window, '本项练习笔记').value, '需要再解释除法这一步。')
  assert.equal(button(window, '查看提示 1').getAttribute('aria-expanded'), 'true')
  assert.equal(button(window, '查看提示 2').disabled, false)
  const restoredCheck = window.document.querySelector('input[type="checkbox"][data-criterion-index="0"]')
  assert.ok(restoredCheck instanceof window.HTMLInputElement)
  assert.equal(restoredCheck.checked, true)
  assert.equal(button(window, '改为未完成').getAttribute('aria-pressed'), 'true')
  click(window, '导出学习记录')
  let output = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(output.completion_source, 'student')
  assert.equal(output.activities[0].completed, true)
  assert.equal(output.activities[0].self_checks[0].checked, true)
  assert.equal(output.activities[0].questions[0].hint_level, 1)
  assert.equal(output.activities[1].notes, '这是第二项的记录。')
  click(window, '改为未完成')
  click(window, '导出学习记录')
  output = JSON.parse(await downloads.at(-1)!.blob.text())
  assert.equal(output.activities[0].completed, false)
  assert.equal(output.activities[0].questions[0].notes, '先写出每一步，再检查运算方向。')
  assert.equal(output.activities[0].self_checks[0].checked, true)
  assert.ok(!Object.hasOwn(output.activities[0], 'score'))
  assert.ok(!Object.hasOwn(output.activities[0], 'grading_status'))
})

test('learning-record downloads contain student entries and metadata without teacher data or exercise solutions', async t => {
  const practice = practiceFixture()
  practice.generated_at = '2026-11-14T08:00:00.000Z'
  const { window, downloads } = await setup(t, practice)
  fill(window, '本项练习笔记', '下次再检查方向变化。')
  const beforeExport = Date.now()
  click(window, '导出学习记录')
  const afterExport = Date.now()
  assert.equal(downloads.length, 1)
  const text = await downloads[0]!.blob.text()
  const output = JSON.parse(text)
  assert.equal(output.student_id, 'DEMO-A')
  assert.equal(output.node_id, 'CHECK-2')
  assert.equal(output.generated_at, practice.generated_at, 'Student records must retain the assigned analysis batch time.')
  for (const key of ['dataset_version', 'policy_version', 'producer_version', 'source_mode'] as const) assert.equal(output[key], practice[key])
  assert.equal(new Date(output.exported_at).toISOString(), output.exported_at)
  assert.ok(Date.parse(output.exported_at) >= beforeExport && Date.parse(output.exported_at) <= afterExport)
  assert.notEqual(output.exported_at, output.generated_at)
  assert.equal(output.completion_source, 'student')
  assert.equal(output.activities[0].notes, '下次再检查方向变化。')
  for (const privateValue of ['DEMO-B', 'DEMO-C', 'GROUP-A', 'GROUP-B', 'teacher_solution', 'reference_answer', 'original_values', 'browser_snapshot', 'z>-3', 'z<-3', '评分点得分']) assert.ok(!text.includes(privateValue))
  assert.ok(!Object.hasOwn(output.activities[0].questions[0], 'prompt'))
  assert.ok(!Object.hasOwn(output.activities[0].questions[0], 'hints'))
})

test('empty activities and missing hint levels remain usable without inventing exercises or help', async t => {
  const empty = practiceFixture()
  empty.activities = []
  const emptyPage = await setup(t, empty)
  assert.equal(emptyPage.window.document.querySelectorAll('nav[aria-label="学习活动"] button').length, 0)
  assert.equal(emptyPage.window.document.querySelector('textarea'), null)
  click(emptyPage.window, '导出学习记录')
  assert.deepEqual(JSON.parse(await emptyPage.downloads[0]!.blob.text()).activities, [])
  const incomplete = practiceFixture()
  incomplete.activities[0]!.questions[0]!.hints = incomplete.activities[0]!.questions[0]!.hints.filter(hint => hint.level === 1)
  const partialPage = await setup(t, incomplete)
  click(partialPage.window, '查看提示 1')
  assert.equal(button(partialPage.window, '查看提示 2').disabled, true)
  assert.equal(button(partialPage.window, '查看提示 3').disabled, true)
  const absent = practiceFixture()
  absent.activities[0]!.questions[0]!.hints = []
  const absentPage = await setup(t, absent)
  assert.ok([1, 2, 3].every(level => button(absentPage.window, `查看提示 ${level}`).disabled))
  assert.ok(!absentPage.window.document.body.textContent.includes('z>-3'))
})

test('imported markup and student notes remain literal text without creating executable elements', async t => {
  const practice = practiceFixture()
  const malicious = '<img src="blocked.invalid" onerror="globalThis.__studentMarkup = true">'
  practice.activities[0]!.goal += malicious
  practice.activities[0]!.questions[0]!.prompt += malicious
  const { window, downloads, networkRequests } = await setup(t, practice)
  assert.ok(window.document.body.textContent.includes(malicious))
  assert.equal(window.document.querySelector('img'), null)
  fill(window, '本项练习笔记', malicious)
  click(window, '导出学习记录')
  assert.equal(JSON.parse(await downloads[0]!.blob.text()).activities[0].notes, malicious)
  assert.equal(window.eval('globalThis.__studentMarkup'), undefined)
  assert.equal(networkRequests(), 0)
})

test('reset keeps drafts until explicit confirmation and restores focus when cancelled', async t => {
  const { window, practice, downloads } = await setup(t)
  const firstQuestion = practice.activities[0]!.questions[0]!
  fill(window, `我的作答：${firstQuestion.item_id}`, '仍在推敲，先保存。')
  fill(window, '本项练习笔记', '不要误清空这段。')
  click(window, '查看提示 1')
  click(window, '标记练习完成')
  const reset = button(window, '清空本页记录')
  reset.focus()
  reset.click()
  const dialog = window.document.querySelector('dialog')
  assert.ok(dialog instanceof window.HTMLDialogElement)
  assert.equal(dialog.open, true)
  assert.equal(field(window, '本项练习笔记').value, '不要误清空这段。')
  click(window, '保留记录')
  assert.equal(window.document.activeElement, reset)
  assert.equal(field(window, `我的作答：${firstQuestion.item_id}`).value, '仍在推敲，先保存。')
  assert.equal(button(window, '改为未完成').getAttribute('aria-pressed'), 'true')
  click(window, '清空本页记录')
  click(window, '确认清空')
  assert.equal(field(window, '本项练习笔记').value, '')
  assert.equal(field(window, `我的作答：${firstQuestion.item_id}`).value, '')
  assert.equal(button(window, '标记练习完成').getAttribute('aria-pressed'), 'false')
  assert.equal(button(window, '查看提示 2').disabled, true)
  click(window, '导出学习记录')
  const output = JSON.parse(await downloads[0]!.blob.text())
  assert.ok(output.activities.every((activity: { notes: string; completed: boolean }) => activity.notes === '' && activity.completed === false))
})

test('activity navigation places focus on the new heading and in-place editing retains keyboard focus', async t => {
  const { window, practice } = await setup(t)
  const navigation = [...window.document.querySelectorAll('nav[aria-label="学习活动"] button')]
  assert.ok(navigation.every(control => control instanceof window.HTMLButtonElement && control.tabIndex >= 0))
  openActivity(window, practice.activities[1]!.activity_id)
  assert.equal(window.document.activeElement, window.document.querySelector('.sp-activity-heading h2'))
  assert.equal(window.document.activeElement?.textContent, practice.activities[1]!.goal)
  const notes = field(window, '本项练习笔记')
  notes.focus()
  fill(window, '本项练习笔记', '输入时焦点留在这里。')
  assert.equal(window.document.activeElement, notes)
  const hint = button(window, '查看提示 1')
  hint.focus()
  hint.click()
  assert.equal(window.document.activeElement, hint)
  const complete = button(window, '标记练习完成')
  complete.focus()
  complete.click()
  assert.equal(window.document.activeElement, complete)
  assert.equal(complete.getAttribute('aria-pressed'), 'true')
})
