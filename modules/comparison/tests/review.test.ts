import assert from 'node:assert/strict'
import test from 'node:test'
import { prepare_dataset } from '../../data/core.ts'
import { make_input, make_record } from '../../data/tests/helpers.ts'
import { compare_classes, compare_students, compare_with_peers } from '../core.ts'

function reviewInput() {
  return make_input([
    make_record({ 得分: '0', 学生最终作答: '3', 评分点得分: 'A1P1=0；A1P2=0；A1P3=0' }),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 学生编号: 'S2', 得分: '3', 学生最终作答: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' }),
    make_record({ 记录编号: 'R3', 作答事件编号: 'E3', 学生编号: 'S3', 得分: '3', 学生最终作答: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' }),
    make_record({ 记录编号: 'R4', 作答事件编号: 'E4', 得分: '99' }),
    make_record({ 记录编号: 'R5', 作答事件编号: 'E5', 材料编号: 'A3', 得分: '0', 满分: '2', 学生最终作答: 'a', 评分点得分: 'A3P1=0' }),
  ])
}

test('review explanations distinguish used, blocked and unshared records in all comparison modes', () => {
  const dataset = prepare_dataset(reviewInput(), { source_mode: 'fixture' })
  const results = [
    compare_students(dataset, { left_student_id: 'S1', right_student_id: 'S2', node_id: 'M1' }),
    compare_with_peers(dataset, { student_id: 'S1', node_id: 'M1' }),
    compare_classes(dataset, { left_class_id: 'C1', right_class_id: 'C2', node_id: 'M1' }),
  ]
  for (const response of results) {
    assert.equal(response.result_status, 'needs_review')
    assert.deepEqual(response.payload.quality_record_ids, ['R1', 'R4', 'R5'])
    assert.deepEqual(response.payload.shared_item_ids, ['A1'])
    assert.ok(response.evidence_ids.includes('R1'), 'the reviewed zero score remains a comparison sample')
    assert.ok(!response.evidence_ids.includes('R4'), 'a structurally invalid score is excluded')
    assert.ok(!response.evidence_ids.includes('R5'), 'an eligible score still needs a shared item')
    assert.ok(response.limitations.includes('本次范围内有 3 条待复核记录：1 条按有效分值参与比较，1 条未满足计分条件被排除，1 条可计分但不在共同有效题集中。'))
    assert.ok(response.limitations.includes('比较仅限同一节点的共同有效题集，缺少有效样本不补零，允许计分的真实零分保留。'))
  }
  assert.equal(results[0]!.payload.left_rate, 0)
  assert.equal(results[1]!.payload.left_rate, 0)
  assert.equal(results[2]!.payload.left_rate, 0.5)
  for (const response of results) assert.equal(response.payload.right_rate, 1)
})

test('the review explanation follows the active scoring policy and selected item scope', () => {
  const input = reviewInput()
  input.records = input.records.filter(row => ['R1', 'R2', 'R5'].includes(row['记录编号']!))
  const scope = { student_id: 'S1', node_id: 'M1', item_ids: ['A1'] }
  const retained = compare_with_peers(prepare_dataset(input), scope)
  assert.deepEqual(retained.payload.quality_record_ids, ['R1'])
  assert.equal(retained.payload.left_rate, 0)
  assert.ok(retained.limitations.includes('本次范围内有 1 条待复核记录：1 条按有效分值参与比较，0 条未满足计分条件被排除，0 条可计分但不在共同有效题集中。'))
  const excluded = compare_with_peers(prepare_dataset(input, { policy: 'conservative' }), scope)
  assert.deepEqual(excluded.payload.quality_record_ids, ['R1'])
  assert.equal(excluded.payload.comparable, false)
  assert.equal(excluded.payload.left_rate, null)
  assert.deepEqual(excluded.evidence_ids, [])
  assert.ok(excluded.limitations.includes('本次范围内有 1 条待复核记录：0 条按有效分值参与比较，1 条未满足计分条件被排除，0 条可计分但不在共同有效题集中。'))
})

test('eligible review records are not described as participating when peers have no matching item', () => {
  const input = reviewInput()
  input.records = input.records.filter(row => row['记录编号'] === 'R1')
  const response = compare_with_peers(prepare_dataset(input), { student_id: 'S1', node_id: 'M1' })
  assert.equal(response.payload.comparable, false)
  assert.equal(response.payload.left_rate, null)
  assert.deepEqual(response.evidence_ids, [])
  assert.ok(response.limitations.includes('本次范围内有 1 条待复核记录：0 条按有效分值参与比较，0 条未满足计分条件被排除，1 条可计分但不在共同有效题集中。'))
})

test('reviews outside the selected node do not create a review warning', () => {
  const response = compare_with_peers(prepare_dataset(reviewInput()), { student_id: 'S1', node_id: 'M2' })
  assert.equal(response.result_status, 'insufficient_data')
  assert.deepEqual(response.payload.quality_record_ids, [])
  assert.ok(response.limitations.every(text => !text.includes('待复核')))
})
