import assert from 'node:assert/strict'
import test from 'node:test'
import { prepare_dataset } from '../../data/core.ts'
import { make_input, make_record } from '../../data/tests/helpers.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'

test('data-layer semantic review remains statistic-eligible through the app pipeline', () => {
  const input = make_input([make_record({
    得分: '0',
    学生最终作答: '1',
    解答过程: '1. 得到结果1。',
    评分点得分: 'A1P1=0；A1P2=0；A1P3=0',
  })])

  const prepared = prepare_dataset(input, { source_mode: 'fixture' })
  const original = prepared.current.find(record => record.record_id === 'R1')
  assert.ok(original)
  assert.equal(original.include_in_statistics, true)
  assert.equal(original.action, 'review')
  assert.ok(original.quality_issues.some(issue => issue.code === 'answer_score_conflict'))

  const workspaceDataset = prepare_workspace_dataset(input, { source_mode: 'fixture' })
  const preserved = workspaceDataset.current.find(record => record.record_id === 'R1')
  assert.ok(preserved)
  assert.equal(preserved.include_in_statistics, true, 'semantic review must stay in the statistics population')
  assert.equal(preserved.action, 'review')
  assert.equal(workspaceDataset.summary.included_count, 0)
  assert.equal(workspaceDataset.summary.stat_included_count, 1)
  assert.ok(preserved.quality_issues.some(issue => issue.code === 'answer_score_conflict'))
  assert.ok(!preserved.quality_issues.some(issue => issue.code === 'semantic_scoring_review'))
})
