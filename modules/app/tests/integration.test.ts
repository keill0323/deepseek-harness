import assert from 'node:assert/strict'
import test from 'node:test'
import { get_student_stats, prepare_dataset } from '../../data/core.ts'
import { load_dataset } from '../../data/io.ts'
import type { DatasetInput, ResultEnvelope } from '../../data/types.ts'
import { make_input, make_record } from '../../data/tests/helpers.ts'
import { build_workspace, execute_operation } from '../core.ts'
import type { WorkspacePayload } from '../core.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { verify_workspace } from '../verify.ts'
import { scope_key } from '../../shared/result.ts'
import { diagnose_student, get_curriculum } from '../../diagnosis/core.ts'

function ordinary_input(): DatasetInput {
  return make_input([
    make_record(),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 学生编号: 'S2', 得分: '2', 评分点得分: 'A1P1=1；A1P2=1；A1P3=0' }),
    make_record({ 记录编号: 'R3', 作答事件编号: 'E3', 学生编号: 'S3', 得分: '3', 学生最终作答: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' }),
  ])
}

function assert_versions(result: ResultEnvelope<unknown>, reference: ResultEnvelope<unknown>): void {
  for (const key of ['schema_version', 'dataset_version', 'policy_version', 'producer_version', 'source_mode', 'generated_at'] as const) {
    assert.equal(result[key], reference[key], `Inconsistent ${key}`)
  }
}

test('scoped statistics and curriculum can be reused without changing diagnosis or crossing objects', () => {
  const ds = prepare_workspace_dataset(ordinary_input(), { source_mode: 'fixture' })
  const scope = { student_id: 'S1', node_id: 'M1' }
  const statistics = get_student_stats(ds, scope)
  const curriculum = get_curriculum(ds)
  assert.deepEqual(diagnose_student(ds, scope, { statistics, curriculum }), diagnose_student(ds, scope))
  for (const context of [
    { statistics: get_student_stats(ds, { student_id: 'S2', node_id: 'M1' }), curriculum },
    { statistics: { ...statistics, dataset_version: 'other' }, curriculum },
    { statistics, curriculum: get_curriculum(ds, { topic_id: 'T1' }) },
  ]) {
    const rejected = diagnose_student(ds, scope, context)
    assert.equal(rejected.result_status, 'error')
    assert.equal(rejected.payload.stats.student_id, 'S1')
    assert.equal(rejected.payload.stats.node_id, 'M1')
    assert.equal(rejected.payload.stats.earned_score, 1)
    assert.deepEqual(rejected.payload.curriculum, [])
  }
})

test('opaque identifiers containing separators retain every distinct student and class case', () => {
  const input = make_input()
  input.students[0]!.学生编号 = 'A:B'
  input.students[1]!.学生编号 = 'A'
  input.students[0]!.模拟班级编号 = 'A:B'
  input.students[1]!.模拟班级编号 = 'A:B'
  input.students[2]!.模拟班级编号 = 'A'
  input.nodes[0]!.节点编号 = 'C'
  input.nodes[1]!.节点编号 = 'B:C'
  input.records[0]!.学生编号 = 'A:B'
  input.records[0]!.节点编号 = 'C'
  const workspace = build_workspace(prepare_workspace_dataset(input, { source_mode: 'fixture' }))
  assert.equal(Object.keys(workspace.payload.cases).length, 6)
  assert.equal(Object.keys(workspace.payload.class_reports).length, 4)
  assert.notEqual(scope_key('A:B', 'C'), scope_key('A', 'B:C'))
  assert.equal(workspace.payload.cases[scope_key('A:B', 'C')]?.statistics.payload.earned_score, 1)
  assert.equal(workspace.payload.cases[scope_key('A', 'B:C')]?.statistics.payload.score_rate, null)
  assert.equal(verify_workspace(workspace).status, 'passed')
})

test('report verification rejects missing cases and valid references from the wrong learning indicator', () => {
  const base = build_workspace(prepare_workspace_dataset(ordinary_input(), { source_mode: 'fixture' }))
  const mutations: Array<(copy: ResultEnvelope<WorkspacePayload>) => void> = [
    copy => { delete copy.payload.cases['S1:M1'] },
    copy => { delete copy.payload.class_reports['C1:M1'] },
    copy => { copy.payload.cases['S1:M1']!.plan.payload.activities[0]!.item_ids = ['A3'] },
    copy => { const hint = Object.values(copy.payload.cases['S1:M1']!.hints)[0]![0]!; hint.payload.item_id = 'A3' },
    copy => { copy.payload.class_reports['invented'] = copy.payload.class_reports['C1:M1']!; delete copy.payload.class_reports['C1:M1'] },
    copy => { copy.payload.cases['S1:M1']!.plan.payload.delivery.first_activity_ids = [] },
    copy => { copy.payload.cases['S1:M1']!.plan.payload.activities[0]!.phase = 'follow_up' },
    copy => { copy.payload.cases['S1:M1']!.plan.payload.activities[0]!.finding_ids = ['invented-finding'] },
    copy => { copy.payload.cases['S1:M1']!.plan.payload.activities.push(copy.payload.cases['S1:M1']!.plan.payload.activities[0]!) },
  ]
  for (const mutate of mutations) {
    const copy = structuredClone(base)
    mutate(copy)
    assert.equal(verify_workspace(copy).status, 'failed')
  }
})

test('the unified dispatcher rejects unknown fields, identifiers, and invalid request values', () => {
  const ds = prepare_workspace_dataset(ordinary_input(), { source_mode: 'fixture' })
  const requests: Array<[string, Record<string, unknown>]> = [
    ['unknown_operation', {}],
    ['get_student_stats', { student_id: 'S1', node_id: 'M1', ignored_field: true }],
    ['get_student_stats', { student_id: 'S1' }],
    ['get_student_stats', { student_id: 1, node_id: 'M1' }],
    ['get_student_stats', { student_id: 'UNKNOWN', node_id: 'M1' }],
    ['diagnose_student', { student_id: 'S1', node_id: 'UNKNOWN' }],
    ['build_learning_plan', { student_id: 'UNKNOWN', node_id: 'M1' }],
    ['get_curriculum', { topic_id: 'UNKNOWN' }],
    ['get_evidence', { include_history: true }],
    ['get_evidence', { record_ids: ['UNKNOWN'] }],
    ['get_evidence', { record_ids: ['R1'], include_history: 'true' }],
    ['compare_students', { left_student_id: 'S1', right_student_id: 'S2', node_id: 'M1', item_ids: ['UNKNOWN'] }],
    ['compare_with_peers', { student_id: 'S1', node_id: 'M1', item_ids: 'A1' }],
    ['analyze_class', { class_id: 'UNKNOWN', node_id: 'M1' }],
    ['compare_classes', { left_class_id: 'C1', right_class_id: 'UNKNOWN', node_id: 'M1' }],
    ['get_hint', { student_id: 'S1', node_id: 'M1', item_id: 'A1', level: '1' }],
    ['get_hint', { student_id: 'S1', node_id: 'M1', item_id: 'A1', level: 1, mode: 'invalid' }],
  ]
  for (const [operation, request] of requests) {
    const output = execute_operation(ds, operation, request)
    assert.equal(output.result_status, 'error', `${operation}: ${JSON.stringify(request)}`)
    assert.equal(output.dataset_version, ds.dataset_version)
    assert.ok(output.limitations.length > 0)
  }
})

test('all operations preserve one snapshot and explicit object-node scopes', () => {
  const ds = prepare_workspace_dataset(ordinary_input(), { source_mode: 'fixture', producer_version: 'integration-test' })
  const workspace = build_workspace(ds)
  const requests: Array<[string, Record<string, unknown>]> = [
    ['get_student_stats', { student_id: 'S1', node_id: 'M1' }],
    ['diagnose_student', { student_id: 'S1', node_id: 'M1' }],
    ['build_learning_plan', { student_id: 'S1', node_id: 'M1' }],
    ['get_curriculum', {}],
    ['get_evidence', { student_id: 'S1', node_id: 'M1' }],
    ['compare_students', { left_student_id: 'S1', right_student_id: 'S2', node_id: 'M1' }],
    ['compare_with_peers', { student_id: 'S1', node_id: 'M1' }],
    ['analyze_class', { class_id: 'C1', node_id: 'M1' }],
    ['compare_classes', { left_class_id: 'C1', right_class_id: 'C2', node_id: 'M1' }],
    ['get_hint', { student_id: 'S1', node_id: 'M1', item_id: 'A1', level: 1 }],
    ['workspace', {}],
  ]
  for (const [operation, request] of requests) {
    const output = execute_operation(ds, operation, request)
    assert.notEqual(output.result_status, 'error', operation)
    assert_versions(output, workspace)
    if ('node_id' in request) assert.equal(output.scope.node_id, 'M1')
    if ('student_id' in request) assert.equal(output.scope.student_id, 'S1')
  }
  assert.equal(Object.keys(workspace.payload.cases).length, 6)
  assert.equal(Object.keys(workspace.payload.class_reports).length, 4)
  for (const [key, entry] of Object.entries(workspace.payload.cases)) {
    const [studentId, nodeId] = key.split(':')
    for (const output of [entry.statistics, entry.diagnosis, entry.plan, entry.peers, ...Object.values(entry.hints).flat()]) {
      assert_versions(output, workspace)
      assert.equal(output.scope.student_id, studentId)
      assert.equal(output.scope.node_id, nodeId)
    }
  }
  assert.equal(verify_workspace(workspace).status, 'passed')
  assert.equal(verify_workspace(workspace).human_review, 'pending')
})

test('process-scoring review propagates through statistics, comparisons, diagnosis, and plans', () => {
  const input = make_input([
    make_record({ 得分: '3', 学生最终作答: 'x<-4', 解答过程: '1. -2x<8。\n2. x<-4。', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' }),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 学生编号: 'S2', 得分: '3', 学生最终作答: 'x>-4', 解答过程: '1. -2x<8。\n2. x>-4。', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' }),
  ])
  Object.assign(input.items[0]!, { 题干或内容: '-2x<8', 参考答案: 'x>-4' })
  const original = structuredClone(input)
  assert.equal(prepare_dataset(input).current.find(row => row.record_id === 'R1')?.include_in_statistics, true)
  const ds = prepare_workspace_dataset(input, { source_mode: 'fixture' })
  assert.deepEqual(input, original)
  const reviewed = ds.current.find(row => row.record_id === 'R1')
  assert.ok(reviewed)
  assert.equal(reviewed.action, 'review')
  assert.equal(reviewed.include_in_statistics, false)
  assert.equal(reviewed.original_values.得分, '3')
  assert.ok(reviewed.quality_issues.some(issue => issue.code === 'semantic_scoring_review'))
  assert.equal(ds.summary.review_count, 1)
  assert.equal(ds.summary.included_count, 1)
  const workspace = build_workspace(ds)
  assert.equal(workspace.result_status, 'needs_review')
  const student = workspace.payload.cases['S1:M1']!
  assert.equal(student.statistics.result_status, 'needs_review')
  assert.equal(student.statistics.payload.valid_record_count, 0)
  assert.equal(student.statistics.payload.earned_score, null)
  assert.equal(student.diagnosis.result_status, 'needs_review')
  assert.ok(student.diagnosis.payload.findings.some(finding => finding.category === 'scoring_review'))
  assert.ok(!student.diagnosis.payload.findings.some(finding => finding.category === 'fact' && finding.evidence_ids.includes('R1')))
  assert.equal(student.peers.result_status, 'needs_review')
  assert.equal(student.peers.payload.comparable, false)
  assert.equal(student.peers.payload.left_rate, null)
  assert.equal(student.plan.result_status, 'needs_review')
  assert.equal(student.plan.payload.plan_type, 'observation')
  assert.ok(student.plan.payload.activities.every(activity => !activity.evidence_ids.includes('R1')))
  assert.equal(workspace.payload.class_reports['C1:M1']?.payload.earned_score, 3)
  assert.equal(workspace.payload.class_reports['C1:M1']?.payload.review_count, 1)
  assert.equal(verify_workspace(workspace).status, 'passed')
})

test('export verification rejects mismatched metadata, scope, and invented references', () => {
  const base = build_workspace(prepare_workspace_dataset(ordinary_input(), { source_mode: 'fixture' }))
  const mutations: Array<[string, (copy: ResultEnvelope<WorkspacePayload>) => void]> = [
    ['module version mismatch', copy => { copy.payload.cases['S1:M1']!.plan.dataset_version = 'other-snapshot' }],
    ['diagnosis scope mismatch', copy => { copy.payload.cases['S1:M1']!.diagnosis.scope.student_id = 'S2' }],
    ['plan node mismatch', copy => { copy.payload.cases['S1:M1']!.plan.scope.node_id = 'M2' }],
    ['missing envelope evidence', copy => { copy.payload.cases['S1:M1']!.statistics.evidence_ids.push('NOT_A_RECORD') }],
    ['missing activity material', copy => { copy.payload.cases['S1:M1']!.plan.payload.activities[0]!.material_ids.push('NOT_A_MATERIAL') }],
    ['other student activity evidence', copy => { copy.payload.cases['S1:M1']!.plan.payload.activities[0]!.evidence_ids = ['R2'] }],
    ['missing curriculum material', copy => { copy.payload.curriculum.payload.entries[0]!.material_ids.push('NOT_A_MATERIAL') }],
    ['missing curriculum question', copy => { copy.payload.curriculum.payload.entries[0]!.question_ids.push('NOT_A_QUESTION') }],
    ['hint scope mismatch', copy => { Object.values(copy.payload.cases['S1:M1']!.hints)[0]![0]!.scope.node_id = 'M2' }],
  ]
  for (const [label, mutate] of mutations) {
    const copy = structuredClone(base)
    mutate(copy)
    const verification = verify_workspace(copy)
    assert.equal(verification.status, 'failed', label)
    assert.ok(verification.errors.length > 0, label)
    assert.equal(verification.human_review, 'pending')
  }
})

test('the official local snapshot builds all cases and class reports with complete valid references', {
  skip: process.env.STUDY_DATA_DIR ? false : 'Set STUDY_DATA_DIR for private official-input integration checks.',
}, async () => {
  const ds = prepare_workspace_dataset(await load_dataset(process.env.STUDY_DATA_DIR!), { source_mode: 'live' })
  const workspace = build_workspace(ds)
  assert.equal(workspace.result_status, 'needs_review')
  assert.equal(workspace.source_mode, 'live')
  assert.equal(workspace.payload.students.length, 40)
  assert.equal(workspace.payload.nodes.length, 2)
  assert.equal(Object.keys(workspace.payload.cases).length, 80)
  assert.equal(Object.keys(workspace.payload.class_reports).length, 4)
  assert.equal(workspace.payload.curriculum.payload.entries.length, 9)
  assert.equal(workspace.payload.quality_records.length, 6)
  assert.deepEqual(workspace.payload.quality_records.map(row => row.record_id).sort(), ['DR0081', 'DR0133', 'DR0361', 'DR0515', 'DR0535', 'DR0685'])
  assert.equal(workspace.payload.cases['D01:N02']?.plan.payload.plan_type, 'targeted_practice')
  assert.equal(workspace.payload.cases['D14:N02']?.plan.payload.plan_type, 'extension')
  assert.equal(workspace.payload.cases['D17:N01']?.plan.payload.plan_type, 'observation')
  assert.equal(workspace.payload.cases['D17:N02']?.plan.payload.plan_type, 'observation')
  assert.equal(workspace.payload.cases['D17:N01']?.statistics.payload.earned_score, 8)
  assert.equal(workspace.payload.cases['D17:N02']?.statistics.payload.score_rate, null)
  for (const [key, entry] of Object.entries(workspace.payload.cases)) {
    const nodeId = entry.statistics.scope.node_id
    const node = ds.input.nodes.find(row => row.节点编号 === nodeId)!
    const allowed = new Set(node.可用题目编号!.split('、'))
    for (const activity of entry.plan.payload.activities) {
      assert.ok(activity.item_ids.every(id => allowed.has(id)), key)
      assert.ok(activity.item_ids.every(id => ds.input.items.some(item => item.材料编号 === id)), key)
      assert.ok(activity.material_ids.every(id => ds.input.items.some(item => item.材料编号 === id)), key)
      assert.ok(activity.evidence_ids.every(id => ds.current.some(record => record.record_id === id && record.include_in_statistics)), key)
    }
    for (const [itemId, hints] of Object.entries(entry.hints)) {
      assert.equal(hints.length, 3, key)
      const answer = ds.input.items.find(item => item.材料编号 === itemId)?.参考答案 ?? ''
      for (const hint of hints) {
        assert.equal(hint.payload.mode, 'student', key)
        assert.ok(!('teacher_solution' in hint.payload), key)
        if (answer !== '') assert.ok(!hint.payload.hint.includes(answer), `${key}/${itemId}`)
        assert_versions(hint, workspace)
      }
    }
  }
  const verification = verify_workspace(workspace)
  assert.equal(verification.status, 'passed', verification.errors.join('\n'))
  assert.equal(verification.human_review, 'pending')
})
