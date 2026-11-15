import assert from 'node:assert/strict'
import test from 'node:test'
import { make_input } from '../../data/tests/helpers.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { build_workspace } from '../core.ts'
import { csv_exports, result_to_csv } from '../csv.ts'
import { parse_csv } from '../../data/io.ts'
import { is_generated_at } from '../../data/time.ts'
import { get_evidence, get_student_stats, prepare_dataset } from '../../data/core.ts'
import { verify_workspace } from '../verify.ts'
import { diagnose_student, get_curriculum } from '../../diagnosis/core.ts'
import { build_learning_plan, get_hint } from '../../guidance/core.ts'
import { analyze_class, compare_students, inspect_node_pairing } from '../../comparison/core.ts'
import { build_class_plan } from '../../guidance/class.ts'

const FIRST = '2026-11-14T10:00:00.000Z'
const NEXT = '2026-11-14T10:01:00.000Z'

test('canonical timestamps reject missing values, impossible dates, offsets and lost precision', () => {
  for (const value of [undefined, null, 0, '', 'not-a-date', '2026-02-30T00:00:00.000Z', '2026-11-14T10:00:00Z', '2026-11-14T10:00:00.000+00:00', '2026-11-14', '2026-11-14T24:00:00.000Z']) {
    assert.equal(is_generated_at(value), false)
    if (typeof value === 'string') assert.throws(() => prepare_dataset(make_input(), { generated_at: value }), /generated_at/)
  }
  assert.equal(is_generated_at('2024-02-29T23:59:59.999Z'), true)
})

test('a fresh analysis timestamp changes no source version, scoring or generated business content', () => {
  const input = make_input()
  const first = build_workspace(prepare_workspace_dataset(input, { generated_at: FIRST }))
  const next = build_workspace(prepare_workspace_dataset(input, { generated_at: NEXT }))
  assert.notEqual(first.generated_at, next.generated_at)
  assert.equal(first.dataset_version, next.dataset_version)
  const withoutTime = (value: unknown) => JSON.parse(JSON.stringify(value, (key, entry: unknown) => key === 'generated_at' ? undefined : entry))
  assert.deepEqual(withoutTime(next), withoutTime(first))
})

test('error and insufficient-data results retain the prepared batch time', () => {
  const dataset = prepare_workspace_dataset(make_input(), { generated_at: FIRST })
  const scope = { student_id: 'MISSING', node_id: 'M1' }
  const results = [get_student_stats(dataset, scope), get_evidence(dataset, { record_ids: ['MISSING'] }),
    diagnose_student(dataset, scope), build_learning_plan(dataset, scope), get_hint(dataset, { ...scope, item_id: 'A1', level: 1 }),
    compare_students(dataset, { left_student_id: 'MISSING', right_student_id: 'S1', node_id: 'M1' }),
    inspect_node_pairing(dataset, { student_id: 'MISSING', left_node_id: 'M1', right_node_id: 'M2' }),
    analyze_class(dataset, { class_id: 'MISSING', node_id: 'M1' }), build_class_plan(dataset, { class_id: 'MISSING', node_id: 'M1' }),
    get_student_stats(dataset, { student_id: 'S3', node_id: 'M2' })]
  assert.ok(results.some(result => result.result_status === 'insufficient_data'))
  assert.ok(results.some(result => result.result_status === 'error'))
  for (const result of results) assert.equal(result.generated_at, FIRST)
})

test('reused diagnosis, statistics, curriculum and class analysis cannot cross batches', () => {
  const first = prepare_workspace_dataset(make_input(), { generated_at: FIRST })
  const next = prepare_workspace_dataset(make_input(), { generated_at: NEXT })
  const scope = { student_id: 'S1', node_id: 'M1' }, group = { class_id: 'C1', node_id: 'M1' }
  assert.equal(diagnose_student(next, scope, { statistics: get_student_stats(first, scope) }).result_status, 'error')
  assert.equal(diagnose_student(next, scope, { curriculum: get_curriculum(first) }).result_status, 'error')
  assert.equal(build_learning_plan(next, scope, diagnose_student(first, scope)).result_status, 'error')
  assert.equal(build_learning_plan(next, scope, undefined, get_student_stats(first, scope)).result_status, 'error')
  assert.equal(build_class_plan(next, group, analyze_class(first, group)).result_status, 'error')
})

test('report verification rejects missing timestamps everywhere and a mismatched timestamp in any result', () => {
  const base = build_workspace(prepare_workspace_dataset(make_input(), { generated_at: FIRST }))
  const missing = JSON.parse(JSON.stringify(base, (key, value: unknown) => key === 'generated_at' ? undefined : value))
  assert.equal(verify_workspace(missing).status, 'failed')
  assert.ok(verify_workspace(missing).errors.some(error => error.includes('generated_at')))
  const targets: Array<Record<string, unknown>> = []
  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') return
    if ('schema_version' in value) targets.push(value as Record<string, unknown>)
    for (const child of Object.values(value)) collect(child)
  }
  collect(base)
  for (const result of targets) {
    for (const timestamp of [undefined, '2026-02-30T00:00:00.000Z', NEXT]) {
      result['generated_at'] = timestamp
      assert.equal(verify_workspace(base).status, 'failed')
    }
    result['generated_at'] = FIRST
  }
  assert.equal(verify_workspace(base).status, 'passed')
})

test('one analysis batch carries its UTC generation time through every result and CSV row', () => {
  const start = Date.now()
  const dataset = prepare_workspace_dataset(make_input(), { source_mode: 'fixture' })
  const workspace = build_workspace(dataset)
  const end = Date.now()
  const timestamp = Reflect.get(workspace, 'generated_at')
  assert.equal(typeof timestamp, 'string')
  assert.ok(Date.parse(timestamp) >= start && Date.parse(timestamp) <= end)
  let count = 0
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return
    if ('schema_version' in value) {
      assert.equal(Reflect.get(value, 'generated_at'), timestamp)
      count += 1
    }
    for (const child of Object.values(value)) visit(child)
  }
  visit(workspace)
  assert.ok(count > 20)
  for (const [, entry] of csv_exports(workspace)) {
    assert.ok(parse_csv(result_to_csv(entry), 'fixture.csv').every(row => row['generated_at'] === timestamp))
  }
})
