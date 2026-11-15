import assert from 'node:assert/strict'
import test from 'node:test'
import { prepare_dataset } from '../../data/core.ts'
import { make_input, make_record } from '../../data/tests/helpers.ts'
import { inspect_node_pairing } from '../core.ts'

const scope = { student_id: 'S1', left_node_id: 'M1', right_node_id: 'M2' }

test('same-student current observations pair across nodes without reporting score progress', () => {
  const input = make_input([
    make_record({ 得分: '0', 学生最终作答: '0', 评分点得分: 'A1P1=0；A1P2=0；A1P3=0' }),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 节点编号: 'M2' }),
    make_record({ 记录编号: 'R3', 作答事件编号: 'E2', 节点编号: 'M2', 修订版本: '2', 得分: '2', 评分点得分: 'A1P1=1；A1P2=1；A1P3=0' }),
  ])
  const result = inspect_node_pairing(prepare_dataset(input), scope)
  assert.equal(result.result_status, 'ok')
  assert.deepEqual(result.payload.paired_item_ids, ['A1'])
  const pair = result.payload.items[0]!
  assert.deepEqual(pair.paired_student_ids, ['S1'])
  assert.deepEqual(pair.left.evidence_ids, ['R1'])
  assert.deepEqual(pair.right.evidence_ids, ['R3'])
  assert.equal(result.payload.comparable, false)
  assert.equal(result.payload.delta_rate, null)
  assert.ok(result.payload.reason_codes.includes('cross_node_progress_not_established'))
  const repeated = structuredClone(input)
  repeated.records = [...input.records, ...input.records].reverse()
  assert.deepEqual(inspect_node_pairing(prepare_dataset(repeated, { generated_at: result.generated_at }), scope), result)
  const reverse = inspect_node_pairing(prepare_dataset(input), { ...scope, left_node_id: 'M2', right_node_id: 'M1' })
  assert.deepEqual(reverse.payload.paired_item_ids, result.payload.paired_item_ids)
  assert.deepEqual(reverse.payload.items[0]!.left, pair.right)
})

test('class pairing intersects student identities rather than mixing different participants', () => {
  const input = make_input([
    make_record(), make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 学生编号: 'S2', 节点编号: 'M2' }),
  ])
  const request = { class_id: 'C1', left_node_id: 'M1', right_node_id: 'M2' }
  const disjoint = inspect_node_pairing(prepare_dataset(input), request)
  assert.equal(disjoint.result_status, 'insufficient_data')
  assert.deepEqual(disjoint.payload.items[0]!.reason_codes, ['no_common_valid_students'])
  input.records.push(make_record({ 记录编号: 'R3', 作答事件编号: 'E3', 节点编号: 'M2' }))
  const overlap = inspect_node_pairing(prepare_dataset(input), request)
  assert.deepEqual(overlap.payload.items[0]!.paired_student_ids, ['S1'])
  assert.equal(overlap.payload.items[0]!.right.valid_student_ids.length, 2)
})

test('node gaps distinguish untaught content, absent, pending, unanswered and quarantined records', () => {
  const input = make_input([
    make_record({ 评分状态: '待评分', 得分: '', 评分点得分: '' }),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 节点编号: 'M2', 评分状态: '未作答', 得分: '', 学生最终作答: '', 解答过程: '', 评分点得分: '' }),
    make_record({ 记录编号: 'R3', 作答事件编号: 'E3', 材料编号: 'A3', 满分: '2', 评分点得分: 'broken' }),
  ])
  const result = inspect_node_pairing(prepare_dataset(input), scope)
  const [a1, a2, a3] = result.payload.items
  assert.ok(a1!.left.reason_codes.includes('pending_grading'))
  assert.ok(a1!.right.reason_codes.includes('unanswered'))
  assert.ok(a2!.left.reason_codes.includes('item_not_allowed_in_node'))
  assert.ok(a2!.left.reason_codes.includes('topic_not_taught'))
  assert.ok(a2!.right.reason_codes.includes('no_records'))
  assert.ok(a3!.left.reason_codes.includes('quality_excluded'))
  assert.deepEqual(a3!.left.quality_record_ids, ['R3'])
  assert.deepEqual(result.payload.paired_item_ids, [])
  assert.equal(result.result_status, 'needs_review')
})

test('semantic review retains a valid zero while a bad latest revision cannot fall back', () => {
  const input = make_input([
    make_record({ 得分: '0', 学生最终作答: '3', 评分点得分: 'A1P1=0；A1P2=0；A1P3=0' }),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 节点编号: 'M2' }),
  ])
  const retained = inspect_node_pairing(prepare_dataset(input), scope)
  assert.deepEqual(retained.payload.paired_item_ids, ['A1'])
  assert.ok(retained.payload.items[0]!.left.reason_codes.includes('scoring_review_retained'))
  assert.equal(retained.result_status, 'needs_review')
  input.records.push(make_record({ 记录编号: 'R3', 作答事件编号: 'E2', 节点编号: 'M2', 修订版本: '2', 评分点得分: 'broken' }))
  const blocked = inspect_node_pairing(prepare_dataset(input), scope)
  assert.deepEqual(blocked.payload.paired_item_ids, [])
  assert.deepEqual(blocked.payload.items[0]!.right.evidence_ids, [])
  assert.deepEqual(blocked.payload.items[0]!.right.quality_record_ids, ['R3'])
})

test('unknown or identical nodes are errors and disjoint allowed items explain nonpairing', () => {
  const input = make_input()
  for (const request of [{ ...scope, right_node_id: 'missing' }, { ...scope, right_node_id: 'M1' }, { ...scope, student_id: 'missing' }]) {
    const result = inspect_node_pairing(prepare_dataset(input), request)
    assert.equal(result.result_status, 'error')
    assert.deepEqual(result.evidence_ids, [])
  }
  input.nodes[1]!.可用题目编号 = 'A2'
  const disjoint = inspect_node_pairing(prepare_dataset(input), scope)
  assert.ok(disjoint.payload.reason_codes.includes('no_shared_allowed_items'))
  assert.deepEqual(disjoint.payload.paired_item_ids, [])
})
