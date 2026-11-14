import assert from 'node:assert/strict'
import test from 'node:test'
import { prepare_dataset } from '../../data/core.ts'
import { make_input, make_record } from '../../data/tests/helpers.ts'
import { diagnose_student, get_curriculum } from '../core.ts'

function inequalityInput(steps = '1. -3y<12。\n2. y<-4。') {
  const input = make_input([make_record({ 学生最终作答: 'y<-4', 解答过程: steps })])
  input.items[0]!['评分点'] = 'A1P1 正确化简 1分\nA1P2 除以负数时反向 1分\nA1P3 写出解集 1分'
  input.items[0]!['参考答案'] = 'y>-4'
  input.requirements[0]!['主题'] = '一元不等式'
  return input
}

test('curriculum entries retain supplied page locations and match actual material identifiers', () => {
  const input = make_input()
  for (const requirement of input.requirements) {
    if (requirement['主题编号'] === 'T1') Object.assign(requirement, { 主题: '代数式与整式运算', '课标文件页／正文页': '4／2', 教材正文页: '测试书10—20', 课标整理编号: 'INDEX-A' })
    else requirement['主题'] = '方程与方程组'
  }
  input.items.push({ 材料编号: 'BOOK-A', 材料类型: '教材', 题干或内容: '整式的加减', 来源或资料文件: 'test-book.pdf' })
  input.items.push({ 材料编号: 'BOOK-B', 材料类型: '教材', 题干或内容: '二元一次方程组', 来源或资料文件: 'other-book.pdf' })
  const indexed = get_curriculum(prepare_dataset(input))
  assert.equal(indexed.result_status, 'ok')
  assert.equal(indexed.payload.entries.length, 3)
  const entry = indexed.payload.entries.find(value => value.indicator_id === 'I1')!
  assert.deepEqual(entry.material_ids, ['BOOK-A'])
  assert.deepEqual(entry.question_ids, ['A1'])
  assert.equal(entry.course_standard.file_page, 4)
  assert.equal(entry.course_standard.printed_page, 2)
  assert.equal(entry.course_standard.verification, 'input_index')
  assert.equal(entry.textbook_pages, '测试书10—20')
  assert.equal(indexed.payload.links.length, 1)
  assert.match(indexed.payload.links[0]!.basis, /教学组织建议/u)
})

test('missing source pages stay null and unknown curriculum topics fail explicitly', () => {
  const ds = prepare_dataset(make_input())
  const known = get_curriculum(ds, { topic_id: 'T1' })
  assert.equal(known.payload.entries.length, 2)
  assert.equal(known.payload.entries[0]!.course_standard.file_page, null)
  assert.equal(known.payload.entries[0]!.course_standard.printed_page, null)
  assert.equal(get_curriculum(ds, { topic_id: 'UNKNOWN' }).result_status, 'error')
})

test('a directly checkable division by a negative number identifies one root error with exact step and point references', () => {
  const ds = prepare_dataset(inequalityInput())
  const diagnosed = diagnose_student(ds, { student_id: 'S1', node_id: 'M1' })
  const errors = diagnosed.payload.findings.filter(finding => finding.finding_type === 'inequality_direction')
  assert.equal(errors.length, 1)
  assert.equal(errors[0]!.category, 'fact')
  assert.deepEqual(errors[0]!.evidence_ids, ['R1'])
  assert.deepEqual(errors[0]!.step_refs, [2])
  assert.deepEqual(errors[0]!.point_refs, ['A1P2'])
  assert.equal(diagnosed.payload.findings.filter(finding => finding.finding_type === 'partial_score').length, 0)
})

test('a latest corrected solution supersedes the former direction error', () => {
  const input = inequalityInput()
  input.records.push(make_record({ 记录编号: 'R2', 修订版本: '2', 得分: '3', 学生最终作答: 'y>-4', 解答过程: '1. -3y<12。\n2. y>-4。', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' }))
  const result = diagnose_student(prepare_dataset(input), { student_id: 'S1', node_id: 'M1' })
  assert.equal(result.payload.findings.some(finding => finding.finding_type === 'inequality_direction'), false)
  assert.deepEqual(result.evidence_ids, ['R2'])
  assert.equal(result.payload.stats.earned_score, 3)
})

test('missing process and a change of variable do not invent a step error', () => {
  for (const steps of ['', '1. -3y<12。\n2. z<-4。']) {
    const diagnosed = diagnose_student(prepare_dataset(inequalityInput(steps)), { student_id: 'S1', node_id: 'M1' })
    assert.equal(diagnosed.payload.findings.some(finding => finding.finding_type === 'inequality_direction'), false)
    const partial = diagnosed.payload.findings.find(finding => finding.finding_type === 'partial_score')!
    assert.ok(partial)
    assert.deepEqual(partial.step_refs, [])
  }
})

test('a directly checkable inequality arithmetic error locates the first invalid transformation', () => {
  const diagnosed = diagnose_student(prepare_dataset(inequalityInput('1. -3y<12。\n2. y<-7。\n3. y<-8。')), { student_id: 'S1', node_id: 'M1' })
  const errors = diagnosed.payload.findings.filter(finding => finding.finding_type === 'inequality_transformation')
  assert.equal(errors.length, 1)
  assert.deepEqual(errors[0]!.step_refs, [2])
  assert.equal(diagnosed.payload.findings.some(finding => finding.finding_type === 'partial_score'), false)
})

test('review records retain their reasons and never become a learner weakness', () => {
  const input = inequalityInput()
  input.records[0]!['得分'] = '4'
  const diagnosed = diagnose_student(prepare_dataset(input), { student_id: 'S1', node_id: 'M1' })
  assert.equal(diagnosed.result_status, 'needs_review')
  const review = diagnosed.payload.findings.filter(finding => finding.category === 'scoring_review')
  assert.equal(review.length, 1)
  assert.deepEqual(review[0]!.evidence_ids, ['R1'])
  assert.equal(diagnosed.payload.findings.some(finding => finding.finding_type === 'inequality_direction'), false)
  assert.equal(diagnosed.payload.stats.score_rate, null)
})

test('an explicit process error awarded its scoring point becomes scoring review rather than a weakness', () => {
  const input = inequalityInput()
  input.records[0]!['得分'] = '3'
  input.records[0]!['评分点得分'] = 'A1P1=1；A1P2=1；A1P3=1'
  const diagnosed = diagnose_student(prepare_dataset(input), { student_id: 'S1', node_id: 'M1' })
  assert.equal(diagnosed.result_status, 'needs_review')
  const error = diagnosed.payload.findings.find(finding => finding.finding_type === 'inequality_direction')!
  assert.equal(error.category, 'scoring_review')
})

test('a full-score process contradiction still requires review when the rubric cannot identify a specific point', () => {
  const input = inequalityInput()
  input.items[0]!['评分点'] = 'A1P1 步骤一 1分\nA1P2 步骤二 1分\nA1P3 步骤三 1分'
  input.records[0]!['得分'] = '3'
  input.records[0]!['评分点得分'] = 'A1P1=1；A1P2=1；A1P3=1'
  const diagnosed = diagnose_student(prepare_dataset(input), { student_id: 'S1', node_id: 'M1' })
  const finding = diagnosed.payload.findings.find(value => value.finding_type === 'inequality_direction')!
  assert.equal(diagnosed.result_status, 'needs_review')
  assert.equal(finding.category, 'scoring_review')
  assert.deepEqual(finding.point_refs, [])
  assert.deepEqual(finding.step_refs, [2])
})

test('unobserved indicators are limited to the stated node and lack of records remains insufficient data', () => {
  const ds = prepare_dataset(make_input())
  const sparse = diagnose_student(ds, { student_id: 'S2', node_id: 'M1' })
  assert.equal(sparse.result_status, 'insufficient_data')
  assert.deepEqual(sparse.payload.covered_indicator_ids, [])
  assert.deepEqual(sparse.payload.unobserved_indicator_ids, ['I1', 'I2'])
  assert.equal(sparse.payload.findings.some(finding => finding.indicator_id === 'I3'), false)
  assert.equal(sparse.payload.stats.earned_score, null)
  assert.equal(diagnose_student(ds, { student_id: 'UNKNOWN', node_id: 'M1' }).result_status, 'error')
  assert.equal(diagnose_student(ds, { student_id: 'S1', node_id: 'UNKNOWN' }).result_status, 'error')
})
