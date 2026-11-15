import assert from 'node:assert/strict'
import test from 'node:test'
import { analyze_class } from '../../comparison/core.ts'
import { get_student_stats } from '../../data/core.ts'
import { make_input, make_record } from '../../data/tests/helpers.ts'
import { diagnose_student } from '../../diagnosis/core.ts'
import { build_class_plan } from '../../guidance/class.ts'
import { build_learning_plan } from '../../guidance/core.ts'
import { build_workspace, execute_operation } from '../core.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { verify_workspace } from '../verify.ts'

test('corrected topics and maxima reach statistics, diagnosis, activities and report verification', () => {
  const input = make_input([make_record({ 主题编号: 'T2', 得分: '1', 满分: '1' })])
  const dataset = prepare_workspace_dataset(input, { source_mode: 'fixture' })
  const scope = { student_id: 'S1', node_id: 'M1' }
  const stats = get_student_stats(dataset, scope)
  const group = analyze_class(dataset, { class_id: 'C1', node_id: 'M1' })
  assert.equal(stats.payload.possible_score, 3)
  assert.equal(group.payload.topics.find(topic => topic.topic_id === 'T1')?.earned_score, 1)
  assert.equal(group.payload.topics.find(topic => topic.topic_id === 'T2')?.score_rate, null)
  assert.ok(diagnose_student(dataset, scope).payload.findings.some(finding => finding.finding_type === 'partial_score'))
  const activity = build_learning_plan(dataset, scope).payload.activities.find(activity => activity.indicator_id === 'I1')!
  assert.equal(activity.kind, 'targeted_practice')
  assert.deepEqual(activity.evidence_ids, ['R1'])
  assert.equal(verify_workspace(build_workspace(dataset)).status, 'passed')
  assert.equal(dataset.current[0]?.original_values['满分'], '1')
})

test('corrected full scores do not become partial performance or exceed item distributions', () => {
  const input = make_input([make_record({ 得分: '9', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' })])
  const dataset = prepare_workspace_dataset(input, { source_mode: 'fixture' })
  const scope = { student_id: 'S1', node_id: 'M1' }
  assert.equal(build_learning_plan(dataset, scope).payload.activities.find(activity => activity.indicator_id === 'I1')?.kind, 'extension')
  assert.ok(!diagnose_student(dataset, scope).payload.findings.some(finding => finding.finding_type === 'partial_score'))
  const item = analyze_class(dataset, { class_id: 'C1', node_id: 'M1' }).payload.items[0]!
  assert.deepEqual(item.score_distribution, [{ score: 3, record_count: 1 }])
  assert.ok(item.scoring_points.every(point => point.earned_score === 1 && point.possible_score === 1))
})

test('class point distributions count valid events and preserve unobserved indicators', () => {
  const input = make_input([
    make_record({ 得分: '0', 学生最终作答: 'wrong', 评分点得分: 'A1P1=0；A1P2=0；A1P3=0' }),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 得分: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' }),
    make_record({ 记录编号: 'R3', 作答事件编号: 'E3', 学生编号: 'S2', 评分状态: '待评分', 得分: '', 评分点得分: '' }),
    make_record({ 记录编号: 'R4', 作答事件编号: 'E4', 学生编号: 'S3' }),
  ])
  const report = analyze_class(prepare_workspace_dataset(input), { class_id: 'C1', node_id: 'M1' })
  const item = report.payload.items.find(item => item.item_id === 'A1')!
  assert.equal(item.valid_record_count, 2)
  assert.equal(item.scored_student_count, 1)
  assert.equal(item.observed_student_count, 2)
  assert.deepEqual(item.score_distribution, [{ score: 0, record_count: 1 }, { score: 3, record_count: 1 }])
  assert.deepEqual(item.scoring_points[0]?.score_distribution, [{ score: 0, record_count: 1 }, { score: 1, record_count: 1 }])
  assert.equal(item.scoring_points[0]?.score_rate, 0.5)
  assert.equal(report.payload.items.find(item => item.item_id === 'A3')?.score_rate, null)
  assert.deepEqual(report.payload.needs_observation, [{ student_id: 'S1', indicator_ids: ['I2'] }, { student_id: 'S2', indicator_ids: ['I1', 'I2'] }])
})

test('class guidance separates scored loss, full evidence and observation without using disputed scores', () => {
  const input = make_input([
    make_record(),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 学生编号: 'S2', 得分: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' }),
    make_record({ 记录编号: 'R3', 作答事件编号: 'E3', 学生编号: 'S3', 得分: '0', 学生最终作答: '3', 评分点得分: 'A1P1=0；A1P2=0；A1P3=0' }),
  ])
  input.students[2]!.模拟班级编号 = 'C1'
  const dataset = prepare_workspace_dataset(input)
  const plan = build_class_plan(dataset, { class_id: 'C1', node_id: 'M1' })
  const recommendations = plan.payload.recommendations.filter(item => item.indicator_id === 'I1')
  assert.deepEqual(recommendations.map(item => [item.kind, item.student_ids]), [['targeted_practice', ['S1']], ['observation', ['S3']], ['extension', ['S2']]])
  assert.ok(plan.payload.recommendations.every(item => item.topic_id === 'T1' && item.steps.length && item.observation && item.adjust_when))
  assert.ok(!plan.evidence_ids.includes('R3'))
  assert.equal(execute_operation(dataset, 'build_class_plan', { class_id: 'C1', node_id: 'M1' }).result_status, 'needs_review')
  const wrong = analyze_class(dataset, { class_id: 'C1', node_id: 'M2' })
  assert.equal(build_class_plan(dataset, { class_id: 'C1', node_id: 'M1' }, wrong).result_status, 'error')
  assert.equal(build_class_plan(dataset, { class_id: 'missing', node_id: 'M1' }).result_status, 'error')
})

test('export verification rejects missing teacher content, class plans and foreign or reviewed evidence', () => {
  const input = make_input([make_record(), make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 学生编号: 'S3' })])
  const base = build_workspace(prepare_workspace_dataset(input, { source_mode: 'fixture' }))
  assert.equal(verify_workspace(base).status, 'passed')
  const mutations: Array<(workspace: typeof base) => void> = [
    workspace => { delete workspace.payload.class_plans['C1:M1'] },
    workspace => { workspace.payload.cases['S1:M1']!.teacher_hints = {} },
    workspace => { workspace.payload.cases['S1:M1']!.hints = {} },
    workspace => { workspace.payload.class_plans['C1:M1']!.payload.recommendations[0]!.student_ids = ['S3'] },
    workspace => { workspace.payload.class_plans['C1:M1']!.payload.recommendations[0]!.evidence_ids = ['R2'] },
    workspace => { workspace.payload.class_plans['C1:M1']!.payload.recommendations[0]!.item_ids = ['A2'] },
    workspace => { workspace.payload.browser_snapshot.current[0]!.action = 'review' },
  ]
  for (const mutate of mutations) {
    const copy = structuredClone(base)
    mutate(copy)
    assert.equal(verify_workspace(copy).status, 'failed')
  }
})

test('a new identifier set and reordered inputs still produce consistent complete reports', () => {
  const input = make_input([make_record(), make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 学生编号: 'S2' })])
  const replacements = new Map(['S1', 'S2', 'S3', 'C1', 'C2', 'M1', 'M2', 'T1', 'T2', 'I1', 'I2', 'I3', 'A1', 'A2', 'A3', 'R1', 'R2', 'E1', 'E2'].map(id => [id, `new:${id}`]))
  const renamed = JSON.parse(JSON.stringify(input).replace(/S[123]|C[12]|M[12]|T[12]|I[123]|A[123]|R[12]|E[12]/gu, id => replacements.get(id)!))
  const first = build_workspace(prepare_workspace_dataset(renamed, { source_mode: 'fixture' }))
  for (const rows of Object.values(renamed)) if (Array.isArray(rows)) rows.reverse()
  const second = build_workspace(prepare_workspace_dataset(renamed, { source_mode: 'fixture' }))
  assert.equal(verify_workspace(first).status, 'passed')
  assert.equal(verify_workspace(second).status, 'passed')
  assert.deepEqual(first.payload.class_plans, second.payload.class_plans)
  assert.deepEqual(first.payload.cases, second.payload.cases)
})


test('class recommendations honor whitespace-delimited node scope', () => {
  const input = make_input([])
  const node = input.nodes.find(row => row['节点编号'] === 'M2')!
  node['已教及测量主题'] = 'T1 T2'
  node['可用题目编号'] = 'A1\tA2\nA3'
  const plan = build_class_plan(prepare_workspace_dataset(input), { class_id: 'C1', node_id: 'M2' })
  assert.deepEqual(plan.payload.recommendations.map(entry => entry.indicator_id).sort(), ['I1', 'I2', 'I3'])
  assert.ok(plan.payload.recommendations.every(entry => entry.kind === 'observation'))
})
