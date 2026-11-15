import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, unlink, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { build_workspace } from '../core.ts'
import { render_report } from '../report.ts'
import { check_export } from '../check-export.ts'
import { make_input } from '../../data/tests/helpers.ts'
import { csv_payload } from './csv-helpers.ts'

const builtCli = fileURLToPath(new URL('../../data/lib/companion/app/cli.js', import.meta.url))

test('source and built CLI execute when launched through a linked modules directory', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'study-linked-cli-'))
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  await symlink(fileURLToPath(new URL('../../', import.meta.url)), join(directory, 'modules'), process.platform === 'win32' ? 'junction' : 'dir')
  for (const entry of ['modules/app/cli.ts', 'modules/data/lib/companion/app/cli.js']) {
    const result = spawnSync(process.execPath, [join(directory, entry), '--help'], { encoding: 'utf8', timeout: 20000 })
    assert.ifError(result.error)
    assert.equal(result.signal, null)
    assert.equal(result.status, 0)
    assert.equal(result.stderr, '')
    assert.match(result.stdout, /智慧学伴完整本地工具/u, 'an exit code of zero must not hide an unexecuted entry point')
  }
})

function run(args: string[]): { status: number | null; output: Record<string, unknown> } {
  const result = spawnSync(process.execPath, [builtCli, ...args], { encoding: 'utf8', timeout: 20000 })
  assert.ifError(result.error)
  assert.equal(result.stderr, '')
  const output: unknown = JSON.parse(result.stdout)
  assert.ok(typeof output === 'object' && output !== null && !Array.isArray(output))
  return { status: result.status, output: output as Record<string, unknown> }
}

test('compiled export and privacy-preserving requests create reviewable local artifacts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'study-complete-cli-'))
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  const input = make_input()
  const files = { students: '模拟学生.csv', items: '题目与材料.csv', nodes: '测验节点.csv', requirements: '课程要求.csv', records: '作答记录.csv' } as const
  const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`
  for (const key of Object.keys(files) as Array<keyof typeof files>) {
    const rows = input[key], headers = Object.keys(rows[0]!)
    await writeFile(join(directory, files[key]), [headers.map(quote).join(','), ...rows.map(row => headers.map(header => quote(row[header] ?? '')).join(','))].join('\r\n'), 'utf8')
  }
  const requestPath = join(directory, 'request.json'), resultPath = join(directory, 'result.json')
  await writeFile(requestPath, JSON.stringify({ student_id: 'S1', node_id: 'M1' }), 'utf8')
  const request = run(['run', '--data', directory, '--operation', 'get_student_stats', '--request-file', requestPath, '--out', resultPath, '--summary-only', '--fixture'])
  assert.equal(request.status, 0)
  assert.deepEqual(Object.keys(request.output).sort(), ['engine', 'operation', 'result_path', 'result_status'])
  assert.ok(!JSON.stringify(request.output).includes('"S1"'))
  const privateResult = JSON.parse(await readFile(resultPath, 'utf8'))
  assert.equal(privateResult.payload.student_id, 'S1')
  assert.equal(privateResult.payload.earned_score, 1)
  const refused = run(['run', '--data', directory, '--operation', 'get_student_stats', '--summary-only'])
  assert.equal(refused.status, 1)
  assert.deepEqual(Object.keys(refused.output).sort(), ['engine', 'error', 'result_status'])
  const exportDirectory = join(directory, 'report')
  const exported = run(['export', '--data', directory, '--out', exportDirectory, '--summary-only', '--fixture'])
  assert.equal(exported.status, 0)
  assert.deepEqual(Object.keys(exported.output).sort(), ['engine', 'manifest_path', 'output_directory', 'report_path', 'result_status'])
  const manifest = JSON.parse(await readFile(join(exportDirectory, 'manifest.json'), 'utf8'))
  assert.equal(manifest.status, 'complete')
  assert.equal(manifest.source_mode, 'fixture')
  const acceptance = JSON.parse(await readFile(join(exportDirectory, 'acceptance.json'), 'utf8'))
  assert.equal(acceptance.status, 'passed')
  assert.equal(acceptance.human_review, 'pending')
  const html = await readFile(join(exportDirectory, 'index.html'), 'utf8')
  assert.ok(html.includes('智慧学伴'))
  assert.ok(html.includes('function compare_students'))
  assert.ok(!/\bfetch\s*\(|https?:\/\//u.test(html))
  assert.equal(run(['export', '--data', directory, '--out', exportDirectory]).status, 1)
  assert.equal(JSON.parse(await readFile(join(exportDirectory, 'manifest.json'), 'utf8')).status, 'complete')
  assert.equal(await check_export(exportDirectory, 'fixture'), true)
  assert.equal(await check_export(exportDirectory, 'live'), false)
  const workspace = JSON.parse(await readFile(join(exportDirectory, 'workspace.json'), 'utf8'))
  const csvPath = join(exportDirectory, 'csv', 'students', 'S1%3AM1', 'statistics.csv')
  const csv = await readFile(csvPath, 'utf8')
  assert.deepEqual(csv_payload(csv), workspace.payload.cases['S1:M1'].statistics.payload)
  assert.ok(manifest.csv_files.includes('csv/students/S1%3AM1/statistics.csv'))
  await writeFile(csvPath, csv.replace('"study-csv-v1"', '"wrong-version"'))
  assert.equal(await check_export(exportDirectory, 'fixture'), false)
  await unlink(csvPath)
  assert.equal(await check_export(exportDirectory, 'fixture'), false)
  await writeFile(csvPath, csv)
  assert.equal(await check_export(exportDirectory, 'fixture'), true)
  const selectedCsv = join(directory, 'selected.csv')
  const csvRequest = ['run', '--data', directory, '--operation', 'get_student_stats', '--request', '{"student_id":"S1","node_id":"M1"}', '--out', selectedCsv, '--format', 'csv', '--summary-only', '--fixture']
  assert.equal(run(csvRequest).status, 0)
  assert.equal(await readFile(selectedCsv, 'utf8'), csv)
  assert.equal(run(csvRequest).status, 1, 'CSV exports must refuse overwriting')
  assert.equal(run(['run', '--data', directory, '--operation', 'get_student_stats', '--format', 'xml', '--summary-only', '--out', selectedCsv]).status, 1)
  await writeFile(join(exportDirectory, 'index.html'), '<!doctype html><html>incomplete</html>')
  assert.equal(await check_export(exportDirectory, 'fixture'), false)
  await writeFile(join(exportDirectory, 'index.html'), html)
  const pairingPath = join(exportDirectory, 'node-pairings', 'student%3AS1%3AM1%3AM2.json')
  const pairing = await readFile(pairingPath, 'utf8')
  const pairingCsv = await readFile(join(exportDirectory, 'csv', 'node-pairings', 'student%3AS1%3AM1%3AM2.csv'), 'utf8')
  assert.deepEqual(csv_payload(pairingCsv), JSON.parse(pairing).payload)
  const pairingRequest = ['run', '--data', directory, '--operation', 'inspect_node_pairing', '--request', '{"student_id":"S1","left_node_id":"M1","right_node_id":"M2"}', '--summary-only', '--fixture']
  const singlePairing = join(directory, 'pairing.csv')
  assert.equal(run([...pairingRequest, '--out', singlePairing, '--format', 'csv']).status, 0)
  assert.equal(await readFile(singlePairing, 'utf8'), pairingCsv)
  await unlink(pairingPath)
  assert.equal(await check_export(exportDirectory, 'fixture'), false)
  await writeFile(pairingPath, pairing)
  assert.equal(await check_export(exportDirectory, 'fixture'), true)
  await unlink(join(exportDirectory, 'class-plans', 'C1%3AM1.json'))
  assert.equal(await check_export(exportDirectory, 'fixture'), false)

})

test('report escapes embedded script delimiters from literal input fields', async () => {
  const input = make_input()
  input.items[0]!['题干或内容'] = '</script><script>globalThis.injected=true</script>'
  const html = await render_report(build_workspace(prepare_workspace_dataset(input, { source_mode: 'fixture' })))
  assert.ok(!html.includes('</script><script>globalThis.injected'))
  assert.ok(html.includes('\\u003c/script\\u003e'))
})
