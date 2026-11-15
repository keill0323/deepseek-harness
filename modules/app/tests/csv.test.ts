import assert from 'node:assert/strict'
import test from 'node:test'
import { parse_csv } from '../../data/io.ts'
import { make_input, make_record } from '../../data/tests/helpers.ts'
import { make_result } from '../../shared/result.ts'
import { compare_students, compare_classes, compare_with_peers } from '../../comparison/core.ts'
import { build_workspace } from '../core.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { csv_exports, result_to_csv } from '../csv.ts'
import { csv_payload } from './csv-helpers.ts'

test('CSV round trips zero, null, empty strings, nested records and literal spreadsheet text', () => {
  const dataset = prepare_workspace_dataset(make_input(), { source_mode: 'fixture' })
  const payload = { zero: 0, unknown: null, blank: '', negative: -0.5, id: '001', literal: 'null', note: '甲,"乙"\r\n第二行',
    formula: '=1+2', spaced: ' \t@SUM(1)', quoted: "'=already literal", flag: false, 'a/b~c': [{ x: 0 }, null, '', [false, 2]], empty: [], object: {} }
  const result = make_result(dataset, { student_id: '001', node_id: 'M1' }, payload)
  const text = result_to_csv(result)
  assert.equal(text.charCodeAt(0), 0xfeff)
  assert.deepEqual(csv_payload(text), payload)
  const rows = parse_csv(text, 'roundtrip.csv')
  assert.equal(rows[0]!['value/formula'], "'=1+2")
  assert.equal(rows[0]!['value/negative'], '-0.5')
  assert.equal(rows[0]!['value/zero'], '0')
  assert.equal(rows[0]!['value/unknown'], 'null')
  assert.equal(rows[0]!['value/blank'], '')
  assert.deepEqual(JSON.parse(rows[0]!['scope_json']!), result.scope)
  assert.ok(rows.every(row => row['dataset_version'] === result.dataset_version))
  assert.throws(() => result_to_csv(make_result(dataset, {}, { invalid: Infinity })), /非有限/)
})

test('CSV comparisons preserve shared weights, self exclusion, sample counts and incomparable nulls', () => {
  const dataset = prepare_workspace_dataset(make_input([
    make_record({ 得分: '0', 评分点得分: 'A1P1=0；A1P2=0；A1P3=0' }),
    make_record({ 记录编号: 'OTHER', 作答事件编号: 'OTHER-E', 学生编号: 'S2', 得分: '3', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1', 学生最终作答: '3' }),
  ]), { source_mode: 'fixture' })
  const peers = compare_with_peers(dataset, { student_id: 'S1', node_id: 'M1' })
  assert.equal(peers.payload.left_rate, 0)
  assert.equal(peers.payload.right_rate, 1)
  assert.equal(peers.payload.exclude_self, true)
  assert.equal(peers.payload.items[0]!.right_count, 1)
  const comparisons = [peers, compare_students(dataset, { left_student_id: 'S1', right_student_id: 'S2', node_id: 'M1' }),
    compare_classes(dataset, { left_class_id: 'C1', right_class_id: 'C2', node_id: 'M1' })]
  assert.equal(comparisons[2]!.payload.comparable, false)
  assert.equal(comparisons[2]!.payload.right_rate, null)
  for (const result of comparisons) assert.deepEqual(csv_payload(result_to_csv(result)), result.payload)
})

test('every report CSV preserves the existing scoped JSON including point distributions and plans', () => {
  const workspace = build_workspace(prepare_workspace_dataset(make_input(), { source_mode: 'fixture' }))
  const before = JSON.stringify(workspace)
  const files = csv_exports(workspace)
  assert.equal(files.length, 3 + 3 * 2 * 5 + 2 * 2 * 2 + (3 + 2))
  assert.equal(new Set(files.map(([name]) => name)).size, files.length)
  for (const [, entry] of files) assert.deepEqual(csv_payload(result_to_csv(entry)), JSON.parse(JSON.stringify(entry.payload)))
  assert.equal(JSON.stringify(workspace), before)
})
