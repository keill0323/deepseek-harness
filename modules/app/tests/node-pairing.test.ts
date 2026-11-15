import assert from 'node:assert/strict'
import test from 'node:test'
import { make_input } from '../../data/tests/helpers.ts'
import { prepare_dataset } from '../../data/core.ts'
import { build_workspace, execute_operation } from '../core.ts'
import { verify_workspace } from '../verify.ts'

test('node pairing is a callable observation result even when no responses can be paired', () => {
  const result = execute_operation(prepare_dataset(make_input(), { source_mode: 'fixture' }), 'inspect_node_pairing', {
    student_id: 'S1', left_node_id: 'M1', right_node_id: 'M2',
  })
  assert.equal(result.result_status, 'insufficient_data')
  assert.equal(result.scope.student_id, 'S1')
})

test('node pairing rejects missing, mixed or broadened request scopes', () => {
  const ds = prepare_dataset(make_input())
  for (const request of [
    { left_node_id: 'M1', right_node_id: 'M2' },
    { student_id: 'S1', class_id: 'C1', left_node_id: 'M1', right_node_id: 'M2' },
    { student_id: 'S1', left_node_id: 'M1' },
    { student_id: 'S1', left_node_id: 'M1', right_node_id: 'M2', node_id: 'M1' },
  ]) assert.equal(execute_operation(ds, 'inspect_node_pairing', request).result_status, 'error')
})

test('complete reports include every subject-node pair and reject missing or altered pairing evidence', () => {
  const input = make_input()
  const workspace = build_workspace(prepare_dataset(input, { source_mode: 'fixture' }))
  assert.equal(Object.keys(workspace.payload.node_pairings).length, 5)
  assert.equal(verify_workspace(workspace).status, 'passed')
  const missing = structuredClone(workspace)
  delete missing.payload.node_pairings['student:S1:M1:M2']
  assert.equal(verify_workspace(missing).status, 'failed')
  const corrupted = structuredClone(workspace)
  corrupted.payload.node_pairings['student:S1:M1:M2']!.payload.items[0]!.paired_student_ids = ['S2']
  assert.equal(verify_workspace(corrupted).status, 'failed')
  const wrongReason = structuredClone(workspace)
  wrongReason.payload.node_pairings['student:S1:M1:M2']!.payload.items[0]!.right.reason_codes = []
  assert.equal(verify_workspace(wrongReason).status, 'failed')
  input.nodes = input.nodes.slice(0, 1)
  const single = build_workspace(prepare_dataset(input, { source_mode: 'fixture' }))
  assert.deepEqual(Object.keys(single.payload.node_pairings), [])
  assert.equal(verify_workspace(single).status, 'passed')
})
