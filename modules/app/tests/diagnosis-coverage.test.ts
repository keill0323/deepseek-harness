import assert from 'node:assert/strict'
import test from 'node:test'
import { get_student_stats, prepare_dataset } from '../../data/core.ts'
import { make_input, make_record } from '../../data/tests/helpers.ts'
import { diagnose_student } from '../../diagnosis/core.ts'
import { build_learning_plan } from '../../guidance/core.ts'
import { build_workspace } from '../core.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { verify_workspace } from '../verify.ts'

function equationInput(fullCredit = false) {
  const input = make_input([make_record({
    解答过程: '1. 2x+3=7。\n2. 2x=10。\n3. x=5。', 学生最终作答: 'x=5',
    得分: fullCredit ? '3' : '1', 评分点得分: fullCredit ? 'A1P1=1；A1P2=1；A1P3=1' : 'A1P1=1；A1P2=0；A1P3=0',
  })])
  Object.assign(input.items[0]!, {
    题干或内容: '解方程2x+3=7', 参考答案: 'x=2',
    评分点: 'A1P1 正确抄写原方程 1分\nA1P2 正确移项 1分\nA1P3 求解 1分',
  })
  input.requirements[0]!.主题 = '方程与方程组'
  return input
}

test('a diagnosed equation error reaches the learning activity with its actual evidence and step', () => {
  const input = equationInput()
  const dataset = prepare_workspace_dataset(input, { source_mode: 'fixture' })
  const scope = { student_id: 'S1', node_id: 'M1' }
  const diagnosis = diagnose_student(dataset, scope)
  const finding = diagnosis.payload.findings.find(entry => entry.finding_type === 'equation_transformation')
  assert.ok(finding)
  assert.equal(dataset.current[0]!.include_in_statistics, true)
  assert.equal(finding.category, 'fact')
  const plan = build_learning_plan(dataset, scope, diagnosis)
  const activity = plan.payload.activities.find(entry => entry.selection_reason === 'diagnosed_error')
  assert.ok(activity)
  assert.deepEqual(activity.item_ids, ['A1'])
  assert.deepEqual(activity.evidence_ids, ['R1'])
  assert.deepEqual(activity.finding_ids, [finding.finding_id])
  assert.match(activity.goal, /第2步/u)
  assert.equal(verify_workspace(build_workspace(dataset)).status, 'passed')
})

test('a full-score mathematical contradiction is isolated throughout statistics, plans and report verification', () => {
  const input = equationInput(true)
  const original = structuredClone(input)
  assert.equal(prepare_dataset(input).current[0]!.include_in_statistics, true)
  const dataset = prepare_workspace_dataset(input, { source_mode: 'fixture' })
  const record = dataset.current[0]!
  assert.equal(record.action, 'review')
  assert.equal(record.include_in_statistics, false)
  assert.ok(record.quality_issues.some(issue => issue.code === 'semantic_scoring_review'))
  assert.ok(record.quality_issues.some(issue => issue.code === 'semantic_scoring_review' && /第2步/u.test(issue.message)))
  assert.equal(record.score, 3)
  assert.deepEqual(input, original)
  const scope = { student_id: 'S1', node_id: 'M1' }
  const statistics = get_student_stats(dataset, scope)
  assert.equal(statistics.payload.earned_score, null)
  assert.deepEqual(statistics.payload.review_record_ids, ['R1'])
  const plan = build_learning_plan(dataset, scope)
  assert.equal(plan.payload.plan_type, 'observation')
  assert.ok(plan.payload.activities.every(activity => !activity.evidence_ids.includes('R1')))
  const workspace = build_workspace(dataset)
  assert.equal(workspace.payload.quality_records.length, 1)
  assert.equal(verify_workspace(workspace).status, 'passed')
})

test('quoted errors and unhandled domain restrictions never isolate otherwise valid scores', () => {
  const cases = [
    { question: '某同学将-3y<12写成y<-4，判断是否正确并说明理由。', steps: '1. -3y<12。\n2. y<-4。\n3. 不正确，除以负数应反向。', answer: '不正确' },
    { question: '在x不为0时化简x/x', steps: '1. x/x。\n2. 1。', answer: '1' },
    { question: '某商品成本为12元，售价为x元。要求每件至少获利3元，且售价不超过20元，求售价x的取值范围。', steps: '1. x-12>=3，x>=15。\n2. x<=20。\n3. 15<=x<=20。', answer: '15<=x<=20' },
  ]
  for (const entry of cases) {
    const input = equationInput(true)
    Object.assign(input.items[0]!, { 题干或内容: entry.question, 参考答案: entry.answer })
    Object.assign(input.records[0]!, { 解答过程: entry.steps, 学生最终作答: entry.answer })
    const dataset = prepare_workspace_dataset(input, { source_mode: 'fixture' })
    assert.equal(dataset.current[0]!.action, 'include', entry.question)
    assert.equal(dataset.current[0]!.include_in_statistics, true, entry.question)
    assert.equal(get_student_stats(dataset, { student_id: 'S1', node_id: 'M1' }).payload.earned_score, 3, entry.question)
    assert.equal(dataset.summary.review_count, 0, entry.question)
    assert.equal(verify_workspace(build_workspace(dataset)).status, 'passed', entry.question)
  }
})

test('a corrected revision removes an older mathematical error from the shared workspace', () => {
  const input = equationInput(true)
  input.records.push(make_record({
    记录编号: 'R2', 修订版本: '2', 得分: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1',
    解答过程: '1. 2x+3=7。\n2. 2x=4。\n3. x=2。', 学生最终作答: 'x=2',
  }))
  const dataset = prepare_workspace_dataset(input, { source_mode: 'fixture' })
  assert.equal(dataset.current.length, 1)
  assert.equal(dataset.current[0]!.record_id, 'R2')
  assert.equal(dataset.current[0]!.include_in_statistics, true)
  assert.equal(dataset.history.length, 2)
  assert.equal(dataset.summary.review_count, 0)
  const diagnosis = diagnose_student(dataset, { student_id: 'S1', node_id: 'M1' })
  assert.deepEqual(diagnosis.evidence_ids, ['R2'])
  assert.equal(diagnosis.payload.findings.some(finding => finding.finding_type === 'equation_transformation'), false)
})

test('unsupported process with partial credit stays a score-based activity without a fabricated diagnosed step', () => {
  const input = equationInput()
  Object.assign(input.items[0]!, { 题干或内容: '在x不为0时化简x/x', 参考答案: '1' })
  Object.assign(input.records[0]!, { 解答过程: '1. x/x。\n2. 1。', 学生最终作答: '1' })
  const dataset = prepare_workspace_dataset(input, { source_mode: 'fixture' })
  const scope = { student_id: 'S1', node_id: 'M1' }
  const diagnosis = diagnose_student(dataset, scope)
  const unavailable = diagnosis.payload.findings.find(finding => finding.finding_type === 'step_analysis_unavailable')
  assert.ok(unavailable)
  const plan = build_learning_plan(dataset, scope, diagnosis)
  const activity = plan.payload.activities.find(entry => entry.item_ids.includes('A1'))
  assert.ok(activity)
  assert.equal(activity.selection_reason, 'partial_score')
  assert.equal(activity.finding_ids.includes(unavailable.finding_id), false)
  assert.equal(dataset.current[0]!.include_in_statistics, true)
})
