import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { build_workspace } from '../core.ts'
import { make_demo_input } from '../demo.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { build_student_pack, render_student_document, STUDENT_PRACTICE_FORMAT } from '../student.ts'
import { load_student_assets, render_student_report } from '../student-report.ts'

const assets = { js: 'globalThis.receivedPack = STUDENT_PRACTICE;', css: 'body { font-family: sans-serif; }' }
const makeWorkspace = () => build_workspace(prepare_workspace_dataset(make_demo_input(), { source_mode: 'fixture', producer_version: 'student-isolation-test' }))

function readEmbeddedPack(html: string): object {
  const script = /<script type="module">([\s\S]*)<\/script>/u.exec(html)?.[1]
  assert.ok(script)
  const context: { receivedPack?: object; injected?: boolean } = {}
  runInNewContext(script, context)
  assert.equal(context.injected, undefined)
  assert.ok(context.receivedPack)
  return JSON.parse(JSON.stringify(context.receivedPack))
}

test('student projection contains only assigned practice fields and independently copied method hints', () => {
  const workspace = makeWorkspace()
  const original = JSON.stringify(workspace)
  const plan = workspace.payload.cases['DEMO-A:CHECK-2']!.plan.payload
  const pack = build_student_pack(workspace, 'DEMO-A', 'CHECK-2')
  assert.equal(pack.format, STUDENT_PRACTICE_FORMAT)
  assert.deepEqual(Object.keys(pack).sort(), ['format', 'schema_version', 'generated_at', 'dataset_version', 'policy_version',
    'producer_version', 'source_mode', 'student_id', 'node_id', 'plan_type', 'certainty', 'delivery', 'activities'].sort())
  for (const field of ['schema_version', 'generated_at', 'dataset_version', 'policy_version', 'producer_version', 'source_mode'] as const) {
    assert.equal(pack[field], workspace[field])
  }
  assert.equal(pack.student_id, 'DEMO-A')
  assert.equal(pack.node_id, 'CHECK-2')
  assert.equal(pack.plan_type, plan.plan_type)
  assert.deepEqual(pack.delivery, { advance_when: plan.delivery.advance_when })
  assert.deepEqual(pack.activities.map(activity => activity.activity_id), plan.activities.map(activity => activity.activity_id))
  assert.deepEqual(pack.activities.flatMap(activity => activity.questions.map(question => question.item_id)), plan.activities.flatMap(activity => [...new Set(activity.item_ids)]))
  for (const activity of pack.activities) {
    assert.deepEqual(Object.keys(activity).sort(), ['activity_id', 'order', 'phase', 'kind', 'goal', 'prompt', 'success_criteria', 'questions'].sort())
    assert.equal(activity.phase, plan.delivery.first_activity_ids.includes(activity.activity_id) ? 'first' : 'later')
    for (const question of activity.questions) {
      assert.deepEqual(Object.keys(question).sort(), ['item_id', 'type', 'prompt', 'options', 'hints'].sort())
      assert.equal(question.prompt, workspace.payload.browser_snapshot.input.items.find(row => row['材料编号'] === question.item_id)!['题干或内容'])
      assert.deepEqual(question.hints.map(hint => hint.level), [1, 2, 3])
      for (const hint of question.hints) assert.deepEqual(Object.keys(hint).sort(), ['hint', 'level'])
    }
  }
  pack.activities[0]!.success_criteria.push('仅修改导出副本')
  pack.activities[0]!.questions[0]!.hints[0]!.hint = '仅修改提示副本'
  assert.equal(JSON.stringify(workspace), original)
})

test('the complete student HTML excludes other learners, unassigned items, source responses and teacher answers', async () => {
  const input = make_demo_input()
  const otherStudent = 'PRIVATE_OTHER_STUDENT_SENTINEL'
  input.students.find(student => student['学生编号'] === 'DEMO-B')!['学生编号'] = otherStudent
  for (const record of input.records) if (record['学生编号'] === 'DEMO-B') record['学生编号'] = otherStudent
  input.items.push({ ...input.items[2]!, 材料编号: 'PRIVATE_UNASSIGNED_ITEM_SENTINEL', 题干或内容: 'PRIVATE_UNASSIGNED_PROMPT_SENTINEL' })
  const workspace = build_workspace(prepare_workspace_dataset(input, { source_mode: 'fixture' }))
  const selected = workspace.payload.cases['DEMO-A:CHECK-2']!
  const sentinels = [otherStudent, 'PRIVATE_UNASSIGNED_ITEM_SENTINEL', 'PRIVATE_UNASSIGNED_PROMPT_SENTINEL',
    'PRIVATE_ORIGINAL_ANSWER_SENTINEL', 'PRIVATE_ORIGINAL_STEPS_SENTINEL', 'PRIVATE_REFERENCE_ANSWER_SENTINEL',
    'PRIVATE_REFERENCE_ANALYSIS_SENTINEL', 'PRIVATE_SCORING_RUBRIC_SENTINEL', 'PRIVATE_TEACHER_SOLUTION_SENTINEL',
    'PRIVATE_RATIONALE_SENTINEL', 'PRIVATE_EXTRA_FIELD_SENTINEL']
  for (const record of workspace.payload.browser_snapshot.current) {
    record.answer = 'PRIVATE_ORIGINAL_ANSWER_SENTINEL'
    record.steps = 'PRIVATE_ORIGINAL_STEPS_SENTINEL'
  }
  for (const row of workspace.payload.browser_snapshot.input.items) Object.assign(row, {
    参考答案: 'PRIVATE_REFERENCE_ANSWER_SENTINEL', 参考解析: 'PRIVATE_REFERENCE_ANALYSIS_SENTINEL', 评分点: 'PRIVATE_SCORING_RUBRIC_SENTINEL',
  })
  for (const hint of Object.values(selected.teacher_hints)) hint.payload.teacher_solution = {
    reference_answer: 'PRIVATE_TEACHER_SOLUTION_SENTINEL', reference_analysis: 'PRIVATE_REFERENCE_ANALYSIS_SENTINEL', scoring_rubric: 'PRIVATE_SCORING_RUBRIC_SENTINEL',
  }
  for (const activity of selected.plan.payload.activities) activity.rationale = 'PRIVATE_RATIONALE_SENTINEL'
  Object.assign(selected.plan.payload, { private_notes: 'PRIVATE_EXTRA_FIELD_SENTINEL' })
  const pack = build_student_pack(workspace, 'DEMO-A', 'CHECK-2')
  const html = render_student_document(pack, assets)
  const studentHtml = await render_student_report(pack)
  assert.ok(html.includes('DEMO-A'))
  assert.ok(html.includes('CHECK-2'))
  assert.ok(pack.activities.some(activity => activity.questions.some(question => question.item_id === 'EX-C')))
  assert.deepEqual(readEmbeddedPack(html), pack)
  for (const document of [html, studentHtml]) {
    for (const sentinel of sentinels) assert.ok(!document.includes(sentinel), `The entire HTML must exclude ${sentinel}.`)
    assert.ok(!document.includes('DEMO-C'))
    for (const field of ['browser_snapshot', 'teacher_hints', 'teacher_solution', 'reference_answer', 'evidence_ids', 'original_values', 'statistics', 'score_rate', 'class_reports']) {
      assert.ok(!document.includes(`"${field}"`), `The entire HTML must exclude the private field ${field}.`)
    }
  }
})

test('student projection refuses unknown or mismatched case, hint, node and batch scopes', () => {
  const workspace = makeWorkspace()
  assert.throws(() => build_student_pack(workspace, 'MISSING', 'CHECK-2'), /学生或测验节点/u)
  assert.throws(() => build_student_pack(workspace, 'DEMO-A', 'MISSING'), /学生或测验节点/u)
  const changes: Array<(value: ReturnType<typeof makeWorkspace>) => void> = [
    value => { value.payload.cases['DEMO-A:CHECK-2'] = value.payload.cases['DEMO-B:CHECK-2']! },
    value => { value.payload.cases['DEMO-A:CHECK-2']!.plan.scope['student_id'] = 'DEMO-B' },
    value => { value.payload.cases['DEMO-A:CHECK-2']!.plan.payload.node_id = 'CHECK-1' },
    value => { value.payload.cases['DEMO-A:CHECK-2']!.plan.generated_at = '2000-01-01T00:00:00.000Z' },
    value => { value.payload.browser_snapshot.dataset_version = 'different-batch' },
    value => { value.payload.cases['DEMO-A:CHECK-2']!.hints['EX-C']![0]!.scope['student_id'] = 'DEMO-B' },
    value => { value.payload.cases['DEMO-A:CHECK-2']!.hints['EX-C']![0]!.payload.node_id = 'CHECK-1' },
    value => { value.payload.cases['DEMO-A:CHECK-2']!.hints['EX-C']![0]!.scope['item_id'] = 'EX-A' },
    value => { value.payload.cases['DEMO-A:CHECK-2']!.hints['EX-C']![0]!.payload.mode = 'teacher' },
    value => { value.payload.cases['DEMO-A:CHECK-2']!.hints['EX-C']![0]!.scope['mode'] = 'teacher' },
    value => { value.payload.cases['DEMO-A:CHECK-2']!.hints['EX-C']![0]!.payload.level = 3 },
    value => { value.payload.cases['DEMO-A:CHECK-2']!.hints['EX-C']![0]!.dataset_version = 'different-batch' },
    value => { value.payload.browser_snapshot.input.nodes.find(node => node['节点编号'] === 'CHECK-2')!['可用题目编号'] = 'EX-A、EX-B' },
    value => { value.payload.browser_snapshot.input.nodes.find(node => node['节点编号'] === 'CHECK-2')!['已教及测量主题'] = 'TOP-A、TOP-B' },
    value => { value.payload.browser_snapshot.input.items.find(item => item['材料编号'] === 'EX-C')!['材料类型'] = '学习卡' },
  ]
  for (const change of changes) {
    const value = structuredClone(workspace)
    change(value)
    assert.throws(() => build_student_pack(value, 'DEMO-A', 'CHECK-2'), /未导出学生练习/u)
  }
})

test('escaped identifiers select separate student/node packs and first/later phases follow assigned delivery', () => {
  const input = make_demo_input()
  const students: Record<string, string> = { 'DEMO-A': 'A:B', 'DEMO-B': 'A' }
  const nodes: Record<string, string> = { 'CHECK-1': 'B:C', 'CHECK-2': 'C' }
  for (const student of input.students) student['学生编号'] = students[student['学生编号']!] ?? student['学生编号']!
  for (const node of input.nodes) node['节点编号'] = nodes[node['节点编号']!]!
  for (const record of input.records) {
    record['学生编号'] = students[record['学生编号']!] ?? record['学生编号']!
    record['节点编号'] = nodes[record['节点编号']!]!
  }
  const workspace = build_workspace(prepare_workspace_dataset(input, { source_mode: 'fixture' }))
  const plan = workspace.payload.cases['A%3AB:C']!.plan.payload
  plan.delivery.first_activity_ids = [plan.activities[0]!.activity_id]
  plan.delivery.follow_up_activity_ids = plan.activities.slice(1).map(activity => activity.activity_id)
  const pack = build_student_pack(workspace, 'A:B', 'C')
  assert.equal(pack.student_id, 'A:B')
  assert.equal(pack.node_id, 'C')
  assert.deepEqual(pack.activities.map(activity => activity.phase), ['first', ...plan.activities.slice(1).map(() => 'later')])
  const other = build_student_pack(workspace, 'A', 'B:C')
  assert.equal(other.student_id, 'A')
  assert.equal(other.node_id, 'B:C')
  assert.ok(other.activities.every(activity => activity.questions.every(question => question.item_id !== 'EX-C')))
})

test('renderer reprojects nested pack fields instead of serializing attached teacher data', () => {
  const workspace = makeWorkspace()
  const pack = build_student_pack(workspace, 'DEMO-A', 'CHECK-2')
  const expected = structuredClone(pack)
  const sentinel = 'PRIVATE_ATTACHED_OBJECT_SENTINEL'
  Object.assign(pack, { workspace, teacher_notes: sentinel })
  Object.assign(pack.delivery, { raw_answer: sentinel })
  Object.assign(pack.activities[0]!, { rationale: sentinel, evidence: workspace.payload.browser_snapshot.current })
  Object.assign(pack.activities[0]!.questions[0]!, { reference_answer: sentinel })
  Object.assign(pack.activities[0]!.questions[0]!.hints[0]!, { teacher_solution: sentinel })
  const html = render_student_document(pack, assets)
  assert.ok(!html.includes(sentinel))
  assert.ok(!html.includes('browser_snapshot'))
  assert.deepEqual(readEmbeddedPack(html), expected)
})

test('inline student data stays literal across script delimiters and Unicode separators', () => {
  const pack = build_student_pack(makeWorkspace(), 'DEMO-A', 'CHECK-2')
  const literal = '</script><script>globalThis.injected=true</script>\u2028\u2029<img src="unexpected.invalid">'
  pack.activities[0]!.questions[0]!.prompt = literal
  pack.activities[0]!.questions[0]!.options = literal
  pack.activities[0]!.questions[0]!.hints[0]!.hint = literal
  const html = render_student_document(pack, assets)
  assert.equal((html.match(/<script\b/gu) ?? []).length, 1)
  assert.equal((html.match(/<\/script>/gu) ?? []).length, 1)
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('\\u003c/script\\u003e'))
  assert.ok(html.includes('\\u2028\\u2029'))
  assert.deepEqual(readEmbeddedPack(html), pack)
  assert.throws(() => render_student_document(pack, { ...assets, js: '</script><script>unexpected()</script>' }), /资源/u)
  assert.throws(() => render_student_document(pack, { ...assets, css: '</style><link href="unexpected.invalid">' }), /资源/u)
  assert.throws(() => render_student_document(pack, { ...assets, js: 'import "unexpected.invalid"' }), /资源/u)
})

test('student assets render the same independent pack without remote resources or teacher runtime', async () => {
  const pack = build_student_pack(makeWorkspace(), 'DEMO-A', 'CHECK-2')
  const loaded = await load_student_assets()
  const html = await render_student_report(pack)
  assert.equal(html, render_student_document(pack, loaded))
  assert.ok(html.includes('id="student-app"'))
  assert.ok(!/<(?:script|link|iframe|img)\b[^>]*(?:src|href)=/iu.test(html))
  assert.ok(!html.includes('const WORKSPACE'))
  assert.ok(!html.includes('DEMO-B'))
  assert.ok(!html.includes('DEMO-C'))
})

test('compiled student projection is dependency-free and safe to inline in a teacher report', async () => {
  const compiled = await readFile(new URL('../../data/lib/companion/app/student.js', import.meta.url), 'utf8')
  assert.ok(!/^import\s/m.test(compiled))
  assert.ok(!/<\/script/iu.test(compiled))
  assert.ok(compiled.includes('function build_student_pack'))
  assert.ok(compiled.includes('function render_student_document'))
})
