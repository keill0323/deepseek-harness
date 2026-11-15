import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { make_input, make_record } from '../../data/tests/helpers.ts'
import { build_workspace } from '../core.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { check_export } from '../check-export.ts'
import { is_generated_at } from '../../data/time.ts'
import { csv_exports, result_to_csv } from '../csv.ts'

const script = fileURLToPath(new URL('../../../competitions/smart-learning-companion/wang-zhenyu/scripts/build-deliverable.mjs', import.meta.url))
function invoke(path: string, args: string[]) {
  const result = spawnSync(process.execPath, [path, ...args], { encoding: 'utf8', timeout: 30000 })
  assert.ifError(result.error)
  assert.equal(result.stderr, '')
  return { status: result.status, output: JSON.parse(result.stdout) as Record<string, unknown> }
}

test('legacy live entry uses the shared policy even for formerly hardcoded record IDs and renamed scopes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'study-legacy-export-'))
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  const input = make_input([
    make_record({ 记录编号: 'DR0685', 作答事件编号: 'EVENT-REVIEW', 得分: '0', 学生最终作答: '3', 评分点得分: 'A1P1=0；A1P2=0；A1P3=0' }),
    make_record({ 记录编号: 'DR0515', 作答事件编号: 'EVENT-SCOPE', 材料编号: 'A2', 主题编号: 'T2', 得分: '1', 满分: '1', 学生最终作答: 'x>1', 解答过程: '', 评分点得分: 'A2P1=1' }),
    make_record({ 记录编号: 'UNLISTED-CONFLICT', 作答事件编号: 'EVENT-CORRECTION', 学生编号: 'S2', 得分: '4', 学生最终作答: '3', 解答过程: '', 评分点得分: 'A1P1=1；A1P2=1；A1P3=1' }),
  ])
  const files = { students: '模拟学生.csv', items: '题目与材料.csv', nodes: '测验节点.csv', requirements: '课程要求.csv', records: '作答记录.csv' } as const
  const contents = new Map<string, string>()
  for (const key of Object.keys(files) as Array<keyof typeof files>) {
    const headers = Object.keys(input[key][0]!)
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
    const content = [headers, ...input[key].map(row => headers.map(header => row[header] ?? ''))].map(row => row.map(quote).join(',')).join('\r\n')
    contents.set(files[key], content)
    await writeFile(join(directory, files[key]), content)
  }
  const dataset = prepare_workspace_dataset(input, { source_mode: 'fixture' })
  assert.equal(dataset.current.find(row => row.record_id === 'DR0685')!.score, 0)
  assert.equal(dataset.current.find(row => row.record_id === 'DR0515')!.node_id, 'M1')
  assert.equal(dataset.current.find(row => row.record_id === 'DR0515')!.include_in_statistics, false)
  assert.equal(dataset.current.find(row => row.record_id === 'UNLISTED-CONFLICT')!.corrected?.score, 3)
  const out = join(directory, 'legacy')
  const result = invoke(script, ['--data', directory, '--out', out, '--fixture'])
  assert.equal(result.status, 0)
  assert.deepEqual(Object.keys(result.output).sort(), ['engine', 'generated_at', 'manifest_path', 'output_directory', 'report_path', 'result_status'])
  const actual = JSON.parse(await readFile(join(out, 'workspace.json'), 'utf8'))
  assert.ok(is_generated_at(actual.generated_at))
  const expected = build_workspace(prepare_workspace_dataset(input, { source_mode: 'fixture', generated_at: actual.generated_at }))
  assert.deepEqual(actual, JSON.parse(JSON.stringify(expected)))
  for (const [name, envelope] of csv_exports(expected)) assert.equal(await readFile(join(out, 'csv', name), 'utf8'), result_to_csv(envelope))
  assert.equal(await check_export(out, 'fixture'), true)
  for (const [name, content] of contents) assert.equal(await readFile(join(directory, name), 'utf8'), content)
  assert.equal(invoke(script, ['--data', directory, '--out', out, '--fixture']).status, 1)
  assert.equal(invoke(script, ['--data', directory, '--out', join(directory, 'bad'), '--generated-at', 'invented']).status, 1)
})

test('legacy example entry produces a complete shared fixture export and refuses to overwrite it', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'study-legacy-example-'))
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  const example = fileURLToPath(new URL('../../../competitions/smart-learning-companion/wang-zhenyu/scripts/build-example.mjs', import.meta.url))
  const out = join(directory, 'example')
  assert.equal(invoke(example, ['--out', out]).status, 0)
  assert.equal(await check_export(join(out, 'report'), 'fixture'), true)
  assert.equal(await check_export(join(out, 'report'), 'live'), false)
  assert.equal(invoke(example, ['--out', out]).status, 1)
})
