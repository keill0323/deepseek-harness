import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { get_student_stats } from '../../data/core.ts'
import { load_dataset } from '../../data/io.ts'
import { diagnose_student } from '../../diagnosis/core.ts'
import { build_learning_plan } from '../../guidance/core.ts'
import { make_demo_input } from '../demo.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'

test('public demo provides contrasting learners without released competition identifiers or page claims', () => {
  const input = make_demo_input()
  assert.equal(input.students.length, 3)
  assert.equal(new Set(input.students.map(student => student['模拟班级编号'])).size, 2)
  assert.equal(input.nodes.length, 2)
  assert.equal(input.requirements.length, 3)
  assert.ok(!JSON.stringify(input).includes('DR0023'))
  assert.ok(input.requirements.every(row => row['课标文件页／正文页'] === ''))
  const dataset = prepare_workspace_dataset(input, { source_mode: 'fixture' })
  const partial = diagnose_student(dataset, { student_id: 'DEMO-A', node_id: 'CHECK-2' })
  const direction = partial.payload.findings.find(finding => finding.finding_type === 'inequality_direction')!
  assert.ok(direction)
  assert.equal(direction.category, 'fact')
  assert.deepEqual(direction.step_refs, [2])
  assert.deepEqual(direction.point_refs, ['EX-CP2'])
  assert.equal(build_learning_plan(dataset, { student_id: 'DEMO-A', node_id: 'CHECK-2' }).payload.plan_type, 'targeted_practice')
  const strong = get_student_stats(dataset, { student_id: 'DEMO-B', node_id: 'CHECK-2' })
  assert.equal(strong.payload.earned_score, 5)
  assert.equal(strong.payload.possible_score, 5)
  assert.equal(build_learning_plan(dataset, { student_id: 'DEMO-B', node_id: 'CHECK-2' }).payload.plan_type, 'extension')
  const sparse = get_student_stats(dataset, { student_id: 'DEMO-C', node_id: 'CHECK-2' })
  assert.equal(sparse.result_status, 'insufficient_data')
  assert.equal(sparse.payload.earned_score, null)
  assert.equal(build_learning_plan(dataset, { student_id: 'DEMO-C', node_id: 'CHECK-2' }).payload.plan_type, 'observation')
})

test('demo CLI writes quoted multiline CSV and a fixture report without overwriting existing output', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'study-public-demo-'))
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  const destination = join(directory, 'new-demo')
  const script = fileURLToPath(new URL('../demo.ts', import.meta.url))
  const execute = () => spawnSync(process.execPath, [script, '--out', destination], { encoding: 'utf8', timeout: 30000 })
  const first = execute()
  assert.ifError(first.error)
  assert.equal(first.stderr, '')
  assert.equal(first.status, 0, first.stdout)
  const response = JSON.parse(first.stdout)
  assert.equal(response.engine, 'local_rules')
  assert.deepEqual(Object.keys(response).sort(), ['engine', 'generated_at', 'manifest_path', 'output_directory', 'report_path', 'result_status'])
  const loaded = await load_dataset(join(destination, 'input'))
  assert.deepEqual(loaded, make_demo_input())
  const manifest = JSON.parse(await readFile(join(destination, 'report', 'manifest.json'), 'utf8'))
  assert.equal(manifest.generated_at, response.generated_at)
  assert.match(manifest.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  assert.equal(manifest.status, 'complete')
  assert.equal(manifest.source_mode, 'fixture')
  const acceptance = JSON.parse(await readFile(join(destination, 'report', 'acceptance.json'), 'utf8'))
  assert.equal(acceptance.status, 'passed')
  const marker = join(destination, 'preserve.txt')
  await writeFile(marker, 'existing output', 'utf8')
  const duplicate = execute()
  assert.equal(duplicate.status, 1)
  assert.equal(JSON.parse(duplicate.stdout).result_status, 'error')
  assert.equal(await readFile(marker, 'utf8'), 'existing output')
})
