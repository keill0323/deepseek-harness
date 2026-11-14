import assert from 'node:assert/strict'
import test from 'node:test'
import { prepare_dataset } from '../../data/core.ts'
import { make_input, make_record } from '../../data/tests/helpers.ts'
import type { CsvRow } from '../../data/types.ts'
import { diagnose_student } from '../core.ts'

const transformationTypes = new Set(['equation_transformation', 'expression_transformation', 'inequality_transformation', 'inequality_direction'])

function diagnose(question: string, steps: string, options: { topic?: string; record?: CsvRow; rubric?: string } = {}) {
  const input = make_input([make_record({ 学生最终作答: '待教师核对', 解答过程: steps, ...options.record })])
  Object.assign(input.items[0]!, {
    题干或内容: question,
    评分点: options.rubric ?? 'A1P1 抄写原式 1分\nA1P2 正确变形 1分\nA1P3 得出结果 1分',
  })
  input.requirements[0]!.主题 = options.topic ?? '方程与方程组'
  return diagnose_student(prepare_dataset(input, { source_mode: 'fixture' }), { student_id: 'S1', node_id: 'M1' })
}

test('an equation error identifies the first changed solution set and does not repeat its consequence', () => {
  const result = diagnose('解方程2x+3=7', '1. 2x+3=7。\n2. 2x=10。\n3. x=5。')
  const errors = result.payload.findings.filter(finding => transformationTypes.has(finding.finding_type))
  assert.equal(errors.length, 1)
  assert.equal(errors[0]!.finding_type, 'equation_transformation')
  assert.equal(errors[0]!.category, 'fact')
  assert.deepEqual(errors[0]!.step_refs, [2])
  assert.deepEqual(errors[0]!.evidence_ids, ['R1'])
  assert.equal(errors[0]!.item_id, 'A1')
  assert.equal(result.payload.findings.some(finding => finding.finding_type === 'partial_score'), false)
})

test('polynomial simplification diagnoses sign, like-term and order-of-operations errors', () => {
  const cases = [
    { question: '化简-(2x-3)+x', steps: '1. -(2x-3)+x。\n2. -2x-3+x。\n3. -x-3。' },
    { question: '化简2x+3x', steps: '1. 2x+3x。\n2. 6x。' },
    { question: '计算2+3*4', steps: '1. 2+3*4。\n2. 20。' },
  ]
  for (const entry of cases) {
    const result = diagnose(entry.question, entry.steps, { topic: '代数式与整式运算' })
    const errors = result.payload.findings.filter(finding => transformationTypes.has(finding.finding_type))
    assert.equal(errors.length, 1, entry.question)
    assert.equal(errors[0]!.finding_type, 'expression_transformation', entry.question)
    assert.equal(errors[0]!.category, 'fact', entry.question)
    assert.deepEqual(errors[0]!.step_refs, [2], entry.question)
  }
})

test('inequalities diagnose incorrect endpoints as well as a missing reversal', () => {
  const cases = [
    { question: '解不等式2x+3<7', steps: '1. 2x+3<7。\n2. 2x<10。\n3. x<5。', type: 'inequality_transformation' },
    { question: '解不等式-3y<12', steps: '1. -3y<12。\n2. y<-4。', type: 'inequality_direction' },
  ]
  for (const entry of cases) {
    const result = diagnose(entry.question, entry.steps, { topic: '不等式与不等式组' })
    const errors = result.payload.findings.filter(finding => transformationTypes.has(finding.finding_type))
    assert.equal(errors.length, 1, entry.question)
    assert.equal(errors[0]!.finding_type, entry.type, entry.question)
    assert.deepEqual(errors[0]!.step_refs, [2], entry.question)
  }
})

test('correct equation, expression and inequality transformations do not trigger scoring review', () => {
  const cases = [
    { question: '解方程2x+3=7', steps: '1. 2x+3=7。\n2. 2x=4。\n3. x=2。' },
    { question: '化简-(2x-3)+x', steps: '1. -(2x-3)+x。\n2. -2x+3+x。\n3. -x+3。' },
    { question: '解不等式-3y<12', steps: '1. -3y<12。\n2. y>-4。' },
  ]
  for (const entry of cases) {
    const result = diagnose(entry.question, entry.steps, { record: { 得分: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' } })
    assert.equal(result.result_status, 'ok', entry.question)
    assert.equal(result.payload.findings.some(finding => transformationTypes.has(finding.finding_type)), false, entry.question)
    assert.equal(result.payload.findings.some(finding => finding.category === 'scoring_review'), false, entry.question)
  }
})

test('an awarded unrelated point does not turn a confirmed transformation error into a scoring conflict', () => {
  const result = diagnose('解方程2x+3=7', '1. 2x+3=7。\n2. 2x=10。\n3. x=5。', {
    rubric: 'A1P1 正确抄写题目 1分\nA1P2 正确移项变形 1分\nA1P3 求得最终结果 1分',
  })
  const error = result.payload.findings.find(finding => finding.finding_type === 'equation_transformation')
  assert.ok(error)
  assert.equal(error.category, 'fact')
  assert.equal(error.point_refs.includes('A1P1'), false)
  assert.equal(result.result_status, 'ok')
})

test('full credit for a demonstrably changed equation requests scoring review', () => {
  const result = diagnose('解方程2x+3=7', '1. 2x+3=7。\n2. 2x=10。\n3. x=5。', {
    record: { 得分: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' },
  })
  const error = result.payload.findings.find(finding => finding.finding_type === 'equation_transformation')
  assert.ok(error)
  assert.equal(error.category, 'scoring_review')
  assert.deepEqual(error.step_refs, [2])
  assert.equal(result.result_status, 'needs_review')
})

test('a quoted incorrect solution in a judgement task is not attributed to the student', () => {
  const result = diagnose('某同学将-3y<12变形成y<-4，判断是否正确并说明理由。',
    '1. -3y<12。\n2. y<-4。\n3. 上述解法不正确，除以负数应反向，应为y>-4。', {
      record: { 学生最终作答: '不正确，除以负数应反向', 得分: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' },
    })
  assert.equal(result.result_status, 'ok')
  assert.equal(result.payload.findings.some(finding => finding.category === 'scoring_review'), false)
  assert.equal(result.payload.findings.some(finding => transformationTypes.has(finding.finding_type)), false)
  assert.ok(result.payload.findings.some(finding => finding.finding_type === 'step_analysis_unavailable' && finding.category === 'inference'))
})

test('unhandled syntax and variable division report a tool limitation rather than a student error', () => {
  for (const steps of ['1. x/x=1。\n2. 1=1。', '1. sin(x)=0。\n2. x=0。']) {
    const result = diagnose('核对以下运算过程', steps, { record: { 得分: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' } })
    assert.equal(result.result_status, 'ok', steps)
    assert.equal(result.payload.findings.some(finding => transformationTypes.has(finding.finding_type)), false, steps)
    assert.equal(result.payload.findings.some(finding => finding.category === 'scoring_review'), false, steps)
    const unavailable = result.payload.findings.find(finding => finding.finding_type === 'step_analysis_unavailable')
    assert.ok(unavailable, steps)
    assert.equal(unavailable.category, 'inference', steps)
    assert.deepEqual(unavailable.evidence_ids, ['R1'], steps)
    assert.deepEqual(unavailable.step_refs, [], steps)
  }
})

test('missing process remains a missing source observation rather than an unsupported transformation', () => {
  const result = diagnose('解方程2x+3=7', '')
  const partial = result.payload.findings.find(finding => finding.finding_type === 'partial_score')
  assert.ok(partial)
  assert.match(partial.description, /未提供解答过程/u)
  assert.deepEqual(partial.step_refs, [])
  assert.equal(result.payload.findings.some(finding => finding.finding_type === 'step_analysis_unavailable'), false)
})

test('equivalent transformations do not erase partial credit or establish that the final answer was copied correctly', () => {
  const result = diagnose('解方程2x+3=7', '1. 2x+3=7。\n2. 2x=4。\n3. x=2。', {
    record: { 学生最终作答: 'x=5' },
  })
  assert.equal(result.payload.stats.earned_score, 1)
  assert.equal(result.payload.findings.some(finding => transformationTypes.has(finding.finding_type)), false)
  const partial = result.payload.findings.find(finding => finding.finding_type === 'partial_score')
  assert.ok(partial)
  assert.equal(partial.category, 'fact')
  assert.deepEqual(partial.step_refs, [])
  assert.ok(!JSON.stringify(result.payload.findings).includes('全部掌握'))
})

test('successive independent conditions in a system are not treated as equivalent transformations of one condition', () => {
  const cases = [
    { question: '解方程组：x+y=3，x-y=1。', steps: '1. x+y=3。\n2. x-y=1。\n3. x=2。\n4. y=1。' },
    { question: '解不等式组：x>1，x<3。', steps: '1. x>1。\n2. x<3。\n3. 1<x<3。' },
  ]
  for (const entry of cases) {
    const result = diagnose(entry.question, entry.steps, { record: { 得分: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' } })
    assert.equal(result.result_status, 'ok', entry.question)
    assert.equal(result.payload.findings.some(finding => transformationTypes.has(finding.finding_type)), false, entry.question)
    assert.equal(result.payload.findings.some(finding => finding.category === 'scoring_review'), false, entry.question)
    assert.equal(result.payload.stats.earned_score, 3, entry.question)
  }
})
