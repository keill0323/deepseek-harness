import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { is_generated_at } from '../time.ts'
import { make_input, make_record } from './helpers.ts'

const sourceCli = fileURLToPath(new URL('../cli.ts', import.meta.url))
const builtCli = fileURLToPath(new URL('../lib/cli.js', import.meta.url))

function execute(script: string, args: string[]): { status: number | null; output: Record<string, unknown> } {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 15000 })
  assert.ifError(result.error)
  assert.equal(result.stderr, '')
  const parsed: unknown = JSON.parse(result.stdout)
  assert.ok(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
  assert.ok(is_generated_at(Reflect.get(parsed, 'generated_at')))
  return { status: result.status, output: parsed as Record<string, unknown> }
}

test('source CLI returns JSON and a failing exit code for rejected requests', () => {
  const result = execute(sourceCli, ['invalid-command'])
  assert.equal(result.status, 1)
  assert.equal(result.output.result_status, 'error')
  assert.equal(result.output.schema_version, 'team-v1')
  assert.deepEqual(result.output.evidence_ids, [])
})

test('compiled CLI preserves normal pending status and refuses to overwrite JSON exports', {
  skip: existsSync(builtCli) ? false : 'Run the module build to verify the compiled CLI.',
}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'study-data-cli-'))
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  const input = make_input([make_record({ 评分状态: '待评分', 得分: '', 评分点得分: '' })])
  const files = { students: '模拟学生.csv', items: '题目与材料.csv', nodes: '测验节点.csv', requirements: '课程要求.csv', records: '作答记录.csv' } as const
  for (const key of Object.keys(files) as Array<keyof typeof files>) {
    const rows = input[key]
    const headers = Object.keys(rows[0]!)
    const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`
    const text = [headers.map(quote).join(','), ...rows.map(row => headers.map(header => quote(row[header] ?? '')).join(','))].join('\r\n')
    await writeFile(join(directory, files[key]), text, 'utf8')
  }
  const destination = join(directory, 'export.json')
  const args = ['prepare_dataset', '--data', directory, '--fixture', '--out', destination]
  const first = execute(builtCli, args)
  assert.equal(first.status, 0)
  assert.equal(first.output.source_mode, 'fixture')
  assert.equal(first.output.result_status, 'insufficient_data')
  const originalExport = await readFile(destination, 'utf8')
  assert.deepEqual(JSON.parse(originalExport), first.output)
  const duplicate = execute(builtCli, args)
  assert.equal(duplicate.status, 1)
  assert.equal(duplicate.output.result_status, 'error')
  assert.equal(await readFile(destination, 'utf8'), originalExport)
  const invalidOption = execute(builtCli, ['prepare_dataset', '--data', directory, '--student', 'S1'])
  assert.equal(invalidOption.status, 1)
  const missingNode = execute(builtCli, ['get_student_stats', '--data', directory, '--student', 'S1'])
  assert.equal(missingNode.status, 1)
  const unknownRecord = execute(builtCli, ['get_evidence', '--data', directory, '--records', 'MISSING'])
  assert.equal(unknownRecord.status, 1)
  assert.equal(unknownRecord.output.result_status, 'error')
})
