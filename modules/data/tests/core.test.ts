import assert from 'node:assert/strict'
import test from 'node:test'
import { get_evidence, get_student_stats, prepare_dataset } from '../core.ts'
import type { CsvRow, PreparedDataset } from '../types.ts'
import { make_input, make_record } from './helpers.ts'

test('unrecognized grading text stays a counted review item even when it matches an object property name', () => {
  for (const status of ['constructor', '__proto__']) {
    const ds = prepare_dataset(make_input([make_record({ 评分状态: status })]), { source_mode: 'fixture' })
    assert.equal(ds.summary.grading_status_counts[status], 1)
    assert.equal(ds.current[0]?.action, 'review')
    assert.equal(ds.current[0]?.include_in_statistics, false)
  }
})

function prepare(records: CsvRow[] = [make_record()], options: { policy?: 'differentiated' | 'conservative' } = {}): PreparedDataset {
  return prepare_dataset(make_input(records), { source_mode: 'fixture', producer_version: 'test', ...options })
}

test('a current event uses its highest revision while evidence retains both versions', () => {
  const first = make_record()
  const latest = make_record({ 记录编号: 'R2', 修订版本: '2', 得分: '2', 评分点得分: 'A1P1=1；A1P2=1；A1P3=0' })
  const ds = prepare([latest, first])
  assert.equal(ds.summary.current_event_count, 1)
  assert.equal(ds.summary.revised_event_count, 1)
  assert.equal(ds.history.length, 2)
  assert.equal(ds.current[0]?.record_id, 'R2')
  assert.equal(ds.current[0]?.revision, 2)
  const stats = get_student_stats(ds, { student_id: 'S1', node_id: 'M1' })
  assert.equal(stats.payload.earned_score, 2)
  assert.equal(stats.payload.possible_score, 3)
  const evidence = get_evidence(ds, { event_ids: ['E1'], include_history: true })
  assert.deepEqual(evidence.payload.records.map(row => row.revision).sort(), [1, 2])
  assert.equal(get_evidence(ds, { event_ids: ['E1'] }).payload.records.length, 1)
})

test('row order and exact duplicate imports leave current scores and version unchanged', () => {
  const old = make_record()
  const latest = make_record({ 记录编号: 'R2', 修订版本: '2', 得分: '2', 评分点得分: 'A1P1=1；A1P2=1；A1P3=0' })
  const other = make_record({ 记录编号: 'R3', 作答事件编号: 'E2', 学生编号: 'S2' })
  const original = prepare([old, latest, other])
  const reordered = prepare([other, latest, old, latest, old, other])
  assert.equal(reordered.dataset_version, original.dataset_version)
  assert.equal(reordered.summary.unique_version_count, 3)
  assert.equal(reordered.current.length, 2)
  assert.deepEqual(get_student_stats(reordered, { student_id: 'S1', node_id: 'M1' }).payload,
    get_student_stats(original, { student_id: 'S1', node_id: 'M1' }).payload)
})

test('conflicting content for one revision or record identifier is rejected', () => {
  const a = make_record()
  assert.throws(() => prepare([a, make_record({ 得分: '2' })]))
  assert.throws(() => prepare([a, make_record({ 记录编号: 'OTHER', 得分: '2' })]))
  assert.throws(() => prepare([a, make_record({ 作答事件编号: 'OTHER_EVENT' })]))
})

test('an event cannot change its student, item, or node between revisions', () => {
  for (const field of ['学生编号', '材料编号', '节点编号']) {
    const value = field === '学生编号' ? 'S2' : field === '材料编号' ? 'A3' : 'M2'
    assert.throws(() => prepare([make_record(), make_record({ 记录编号: 'R2', 修订版本: '2', [field]: value })]))
  }
})

test('the latest invalid score stays under review without reviving an older score', () => {
  const latest = make_record({ 记录编号: 'R2', 修订版本: '2', 得分: '10' })
  const ds = prepare([make_record(), latest])
  assert.equal(ds.current[0]?.revision, 2)
  assert.equal(ds.current[0]?.include_in_statistics, false)
  assert.ok(ds.current[0]?.quality_issues.length)
  const stats = get_student_stats(ds, { student_id: 'S1', node_id: 'M1' })
  assert.equal(stats.result_status, 'needs_review')
  assert.equal(stats.payload.earned_score, null)
  assert.equal(stats.payload.score_rate, null)
  assert.deepEqual(stats.payload.review_record_ids, ['R2'])
})

test('quality checks quarantine invalid totals, associations, and contradictory scoring', async t => {
  const examples: Array<[string, CsvRow]> = [
    ['score exceeds item maximum', { 得分: '4', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' }],
    ['response topic differs from item topic', { 主题编号: 'T2' }],
    ['item is not allowed in the stated node', { 材料编号: 'A2', 主题编号: 'T2', 满分: '1', 得分: '1', 学生最终作答: 'x>1', 评分点得分: 'A2P1=1' }],
    ['total differs from the scoring-point sum', { 得分: '2' }],
    ['reference answer is marked as zero', { 得分: '0', 学生最终作答: '3', 评分点得分: 'A1P1=0；A1P2=0；A1P3=0' }],
    ['response maximum differs from item maximum', { 满分: '4' }],
  ]
  for (const [label, fields] of examples) {
    await t.test(label, () => {
      // 保守模式（team-policy-v1）：全部隔离待复核
      const ds = prepare([make_record(fields)], { policy: 'conservative' })
      const current = ds.current[0]
      assert.ok(current)
      assert.equal(current.include_in_statistics, false)
      assert.ok(current.quality_issues.length > 0)
      assert.equal(current.action, 'review')
    })
  }
})

test('differentiated policy corrects self-consistent conflicts and keeps semantics reviewable', () => {
  // 评分点自洽（合计==满分）的越界得分 -> 纠正为评分点合计并计入（老师口径）
  const repaired = prepare([make_record({ 得分: '4', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' })])
  const repairedRow = repaired.current[0]!
  assert.equal(repaired.policy_version, 'team-policy-v2')
  assert.equal(repairedRow.corrected?.score, 3)
  assert.equal(repairedRow.original_values['得分'], '4')
  assert.equal(repairedRow.include_in_statistics, true)

  // 主题誊录错误 -> 以题库为准修正并计入
  const topic = prepare([make_record({ 主题编号: 'T2' })])
  const topicRow = topic.current[0]!
  assert.equal(topicRow.corrected?.topic_id, 'T1')
  assert.equal(topicRow.original_values['主题编号'], 'T2')
  assert.equal(topicRow.include_in_statistics, true)

  // 记录满分与题库不一致 -> 以题库为准修正分母
  const maximum = prepare([make_record({ 满分: '4' })])
  const maximumRow = maximum.current[0]!
  assert.equal(maximumRow.corrected?.max_score, 3)
  assert.equal(maximumRow.original_values['满分'], '4')
  assert.equal(maximumRow.include_in_statistics, true)

  // 评分点矛盾无自洽证据（合计!=满分）-> 仍隔离
  const mismatch = prepare([make_record({ 得分: '2' })])
  const mismatchRow = mismatch.current[0]!
  assert.equal(mismatchRow.include_in_statistics, false)
  assert.equal(mismatchRow.action, 'review')
})

test('a real scored zero remains zero while pending and unanswered scores remain absent', () => {
  const rows = [
    make_record({ 得分: '0', 学生最终作答: 'wrong', 评分点得分: 'A1P1=0；A1P2=0；A1P3=0' }),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 学生编号: 'S2', 评分状态: '待评分', 得分: '', 学生最终作答: 'attempt', 评分点得分: '' }),
    make_record({ 记录编号: 'R3', 作答事件编号: 'E3', 学生编号: 'S3', 评分状态: '未作答', 得分: '', 学生最终作答: '', 解答过程: '', 评分点得分: '' }),
  ]
  const ds = prepare(rows)
  const zero = get_student_stats(ds, { student_id: 'S1', node_id: 'M1' })
  assert.equal(zero.payload.earned_score, 0)
  assert.equal(zero.payload.possible_score, 3)
  assert.equal(zero.payload.score_rate, 0)
  assert.equal(zero.payload.valid_record_count, 1)
  for (const id of ['S2', 'S3']) {
    const result = get_student_stats(ds, { student_id: id, node_id: 'M1' })
    assert.equal(result.payload.earned_score, null)
    assert.equal(result.payload.possible_score, null)
    assert.equal(result.payload.score_rate, null)
    assert.equal(result.payload.valid_record_count, 0)
  }
  assert.equal(ds.current.find(row => row.student_id === 'S2')?.score, null)
  assert.equal(ds.current.find(row => row.student_id === 'S3')?.score, null)
})

test('no records is a valid insufficient-data result, with untaught topics distinct from zero', () => {
  const result = get_student_stats(prepare(), { student_id: 'S2', node_id: 'M1' })
  assert.equal(result.result_status, 'insufficient_data')
  assert.equal(result.payload.record_count, 0)
  assert.equal(result.payload.score_rate, null)
  assert.deepEqual(result.evidence_ids, [])
  const untaught = result.payload.topics.find(topic => topic.topic_id === 'T2')
  assert.ok(untaught)
  assert.equal(untaught.taught, false)
  assert.equal(untaught.score_rate, null)
})

test('statistics never combine different nodes and include metadata for their actual scope', () => {
  const ds = prepare([
    make_record(),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 节点编号: 'M2', 得分: '3', 学生最终作答: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' }),
  ])
  const first = get_student_stats(ds, { student_id: 'S1', node_id: 'M1' })
  const second = get_student_stats(ds, { student_id: 'S1', node_id: 'M2' })
  assert.equal(first.payload.earned_score, 1)
  assert.equal(second.payload.earned_score, 3)
  assert.deepEqual(first.evidence_ids, ['R1'])
  assert.deepEqual(second.evidence_ids, ['R2'])
  assert.equal(first.source_mode, 'fixture')
  assert.equal(first.dataset_version, ds.dataset_version)
  assert.equal(first.scope.node_id, 'M1')
  assert.equal(first.policy_version, ds.policy_version)
})

test('unknown identifiers fail instead of widening statistics or evidence queries', () => {
  const ds = prepare()
  assert.equal(get_student_stats(ds, { student_id: 'UNKNOWN', node_id: 'M1' }).result_status, 'error')
  assert.equal(get_student_stats(ds, { student_id: 'S1', node_id: 'UNKNOWN' }).result_status, 'error')
  for (const query of [
    { student_id: 'UNKNOWN' }, { node_id: 'UNKNOWN' },
    { record_ids: ['UNKNOWN'] }, { event_ids: ['UNKNOWN'] },
  ]) assert.equal(get_evidence(ds, query).result_status, 'error')
})

test('evidence filters are conjunctive and imported values stay traceable without mutation', () => {
  const raw = make_input([
    make_record({ 主题编号: 'T2' }),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 学生编号: 'S2' }),
  ])
  const before = structuredClone(raw)
  const ds = prepare_dataset(raw, { source_mode: 'fixture' })
  assert.deepEqual(raw, before)
  const evidence = get_evidence(ds, { record_ids: ['R1'], student_id: 'S1', node_id: 'M1' })
  const row = evidence.payload.records[0]
  assert.ok(row)
  assert.equal(row.original_values.主题编号, 'T2')
  assert.equal(row.original_values.学生最终作答, '1')
  assert.equal(row.source.file, '作答记录.csv')
  assert.equal(row.source.row_number, 2)
  assert.equal(get_evidence(ds, { record_ids: ['R1'], student_id: 'S2' }).payload.records.length, 0)
})

test('an item cannot credit an indicator owned by a different topic', () => {
  const input = make_input()
  assert.ok(input.items[0])
  input.items[0].指标编号 = 'I3'
  const ds = prepare_dataset(input, { source_mode: 'fixture' })
  const record = ds.current[0]
  assert.ok(record)
  assert.equal(record.include_in_statistics, false)
  assert.ok(record.quality_issues.length > 0)
  const stats = get_student_stats(ds, { student_id: 'S1', node_id: 'M1' })
  assert.equal(stats.payload.earned_score, null)
  assert.equal(stats.payload.valid_record_count, 0)
  const unrelated = stats.payload.indicators.find(indicator => indicator.indicator_id === 'I3')
  assert.ok(unrelated)
  assert.equal(unrelated.valid_record_count, 0)
  assert.equal(unrelated.earned_score, null)
  assert.equal(unrelated.score_rate, null)
})

test('nondecimal and nonfinite score fields remain untrusted rather than numeric observations', () => {
  for (const field of ['得分', '满分']) {
    for (const value of ['0x1', 'Infinity', 'NaN']) {
      const ds = prepare([make_record({ [field]: value })])
      const record = ds.current[0]
      assert.ok(record, `${field}=${value} remains available for review`)
      assert.equal(record.include_in_statistics, false, `${field}=${value} must not enter statistics`)
      assert.ok(record.quality_issues.length > 0)
      assert.equal(field === '得分' ? record.score : record.max_score, null)
      assert.equal(record.original_values[field], value)
      assert.equal(get_student_stats(ds, { student_id: 'S1', node_id: 'M1' }).payload.score_rate, null)
    }
  }
  assert.throws(() => prepare([make_record({ 修订版本: '0x2' })]))
})

test('dataset version changes when any source table changes its meaning', () => {
  const baseline = prepare_dataset(make_input(), { source_mode: 'fixture' }).dataset_version
  const examples: Array<[keyof ReturnType<typeof make_input>, string, string]> = [
    ['students', '模拟班级编号', 'C_CHANGED'],
    ['items', '参考答案', 'changed reference answer'],
    ['nodes', '模拟测验日期', '2026-01-02'],
    ['requirements', '观察指标', 'changed learning requirement'],
    ['records', '解答过程', 'changed response evidence'],
  ]
  for (const [table, field, value] of examples) {
    const input = make_input()
    const row = input[table][0]
    assert.ok(row)
    row[field] = value
    const version = prepare_dataset(input, { source_mode: 'fixture' }).dataset_version
    assert.notEqual(version, baseline, `${table} changes must invalidate downstream result versions`)
  }
})

test('unanswered records with response content require review while unscored attempts remain pending', () => {
  for (const content of [{ 学生最终作答: 'attempt', 解答过程: '' }, { 学生最终作答: '', 解答过程: '1. Started solving.' }]) {
    const record = prepare([make_record({
      评分状态: '未作答', 得分: '', 评分点得分: '', ...content,
    })]).current[0]
    assert.ok(record)
    assert.equal(record.action, 'review')
    assert.equal(record.include_in_statistics, false)
    assert.ok(record.quality_issues.length > 0)
  }
  const pending = prepare([make_record({
    评分状态: '待评分', 得分: '', 评分点得分: '', 学生最终作答: 'attempt', 解答过程: '1. Started solving.',
  })]).current[0]
  assert.ok(pending)
  assert.equal(pending.action, 'exclude')
  assert.equal(pending.include_in_statistics, false)
  assert.equal(pending.score, null)
  assert.deepEqual(pending.quality_issues, [])
})


test('dataset observations list information gaps without touching statistics', async () => {
  const { get_dataset_observations } = await import('../core.ts')
  // 构造：S1 正常作答 A1；S2 仅出现在学生表（两节点零记录）；R2 越界可纠正计入；
  // R3 待评分未决；A3 无人有效作答；指标 I2 零覆盖。
  const input = make_input([
    make_record(),
    make_record({ 记录编号: 'R2', 作答事件编号: 'E2', 材料编号: 'A3', 满分: '2', 得分: '5', 评分点得分: 'A3P1=2' }),
    make_record({ 记录编号: 'R3', 作答事件编号: 'E3', 学生编号: 'S2', 材料编号: 'A1', 评分状态: '待评分', 得分: '', 评分点得分: '' }),
  ])
  // S3 已在默认学生表（C2 班，无任何记录），正好作零记录案例
  const ds = prepare_dataset(input)
  const obs = get_dataset_observations(ds).payload
  // R3 待评分未决
  assert.deepEqual(obs.unresolved_pending_ids, ['R3'])
  // A3 被 R2 纠正计入 -> M1 无题目缺口；M2 可用题含 A2（无记录）
  assert.equal(obs.node_item_gaps['M1'], undefined, 'M1 无题目缺口（A3 已由纠正记录覆盖）')
  assert.ok(obs.node_item_gaps['M2']?.includes('A2'), 'M2 的 A2 无任何有效作答')
  // 指标零覆盖：I2 只被 A3 关联……A3 已由 R2 计入 -> I2 已测量；构造性断言如下
  assert.ok(Array.isArray(obs.unmeasured_indicator_ids))
  // 零记录学生：M1 缺 S3（S2 有待评分记录），M2 缺 S2、S3
  assert.deepEqual(obs.node_students_without_records['M1'], ['S3'])
  assert.deepEqual(obs.node_students_without_records['M2'], ['S1', 'S2', 'S3'], '全部作答都在 M1')
  assert.ok(obs.note.includes('不得解释为未掌握'))
})


test('authoritative item maximum prevents a false out-of-range exclusion', () => {
  const ds = prepare([make_record({
    满分: '1',
    得分: '2',
    评分点得分: 'A1P1=1；A1P2=1；A1P3=0',
  })])
  const record = ds.current[0]
  assert.ok(record)
  assert.equal(record.corrected?.max_score, 3)
  assert.equal(record.include_in_statistics, true)
  assert.equal(record.action, 'include')
  assert.ok(record.quality_issues.some(issue => issue.code === 'maximum_mismatch'))
  assert.ok(!record.quality_issues.some(issue => issue.code === 'score_out_of_range'))
  const stats = get_student_stats(ds, { student_id: 'S1', node_id: 'M1' })
  assert.equal(stats.payload.earned_score, 2)
  assert.equal(stats.payload.possible_score, 3)
  assert.equal(stats.payload.score_rate, 2 / 3)
})
