import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { verify_harness_events, verify_harness_result } from '../harness.ts'
import { execute_operation } from '../core.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { make_demo_input } from '../demo.ts'

test('Harness result replay accepts the observed batch time but rejects stale times and changed business fields', () => {
  const generated_at = '2026-11-14T10:00:00.500Z'
  const dataset = prepare_workspace_dataset(make_demo_input(), { source_mode: 'fixture', generated_at })
  const start = Date.parse('2026-11-14T10:00:00.000Z'), end = start + 1000
  const requests = {
    get_student_stats: { student_id: 'DEMO-A', node_id: 'CHECK-2' },
    compare_students: { left_student_id: 'DEMO-A', right_student_id: 'DEMO-B', node_id: 'CHECK-2' },
    diagnose_student: { student_id: 'DEMO-A', node_id: 'CHECK-2' },
    build_learning_plan: { student_id: 'DEMO-A', node_id: 'CHECK-2' },
  }
  for (const [operation, request] of Object.entries(requests)) {
    const actual = JSON.parse(JSON.stringify(execute_operation(dataset, operation, request)))
    assert.doesNotThrow(() => verify_harness_result(actual, operation, request, start, end))
    for (const bad of [undefined, 'invalid', '2026-02-30T10:00:00.000Z', new Date(start - 1).toISOString(), new Date(end + 1).toISOString()]) {
      assert.throws(() => verify_harness_result({ ...actual, generated_at: bad }, operation, request, start, end), /OPERATION_TIMESTAMP_INVALID/)
    }
    assert.throws(() => verify_harness_result({ ...actual, payload: {} }, operation, request, start, end), /OPERATION_RESULT_MISMATCH/)
    assert.throws(() => verify_harness_result({ ...actual, evidence_ids: [] }, operation, request, start, end), /OPERATION_RESULT_MISMATCH/)
  }
})

// Hand-authored validator inputs, not evidence of a real model or Harness run.
function fixture() {
  const operations = ['get_student_stats', 'compare_students', 'diagnose_student', 'build_learning_plan']
  const stream: Array<Record<string, unknown>> = [
    { type: 'session', sessionId: 'session-test' },
    { type: 'tool_call', callId: 'skill-1', tool: 'skill', input: { name: 'study-companion' } },
    { type: 'tool_result', callId: 'skill-1', status: 'completed', result: '{"name":"study-companion"}' },
    ...operations.flatMap(operation => [
      { type: 'tool_call', callId: operation, tool: 'bash', input: { command: `node modules/app/cli.ts run --operation ${operation} --fixture --summary-only` } },
      { type: 'tool_result', callId: operation, status: 'completed', result: 'summary' },
    ]),
    { type: 'tool_call', callId: 'export', tool: 'bash', input: { command: 'node modules/app/cli.ts export --fixture --summary-only' } },
    { type: 'tool_result', callId: 'export', status: 'completed', result: 'summary' },
    { type: 'final', sessionId: 'session-test', reason: { kind: 'completed' }, text: 'tmp/study-data/report/index.html' },
  ]
  const persisted: Array<Record<string, unknown>> = [
    { type: 'session', id: 'session-test' },
    { type: 'user/message', data: { content: [] } },
    { type: 'user/message', data: { source: { kind: 'skill-catalog', entries: [{ name: 'study-companion' }] } } },
    { type: 'turn/end', data: { reason: { kind: 'completed' } } },
  ]
  return { stream, persisted }
}

test('Harness verifier requires discovery, a linked successful skill load, all operations and durable completion', () => {
  const { stream, persisted } = fixture()
  assert.equal(verify_harness_events(stream, persisted, 0), 'session-test')
  assert.throws(() => verify_harness_events(stream, persisted, 1), /SESSION_NOT_COMPLETED/)
  assert.throws(() => verify_harness_events(stream, persisted, null), /SESSION_NOT_COMPLETED/)
  assert.throws(() => verify_harness_events([stream[0], stream.at(-1)], persisted, 0), /SKILL_NOT_LOADED/)
})

test('a plausible final answer cannot substitute for discovery, execution or successful skill loading', () => {
  const { stream, persisted } = fixture()
  assert.throws(() => verify_harness_events(stream, persisted.filter(event => event['type'] !== 'user/message'), 0), /SKILL_NOT_DISCOVERED/)
  assert.throws(() => verify_harness_events(stream.filter(event => event['type'] !== 'tool_result'), persisted, 0), /SKILL_NOT_LOADED/)
  assert.throws(() => verify_harness_events(stream.filter(event => !JSON.stringify(event).includes('compare_students')), persisted, 0), /BUSINESS_CALLS_MISSING/)
  assert.throws(() => verify_harness_events(stream.map(event => event['type'] === 'tool_result' ? { ...event, callId: 'unrelated' } : event), persisted, 0), /SKILL_NOT_LOADED/)
  assert.throws(() => verify_harness_events(stream.filter(event => !(event['type'] === 'tool_result' && event['callId'] === 'export')), persisted, 0), /BUSINESS_CALL_NOT_COMPLETED/)
  assert.throws(() => verify_harness_events(stream.map(event => event['type'] === 'tool_result' && event['callId'] === 'compare_students' ? { ...event, status: 'error' } : event), persisted, 0), /BUSINESS_CALL_NOT_COMPLETED/)
})

test('quoted real and shell-variable CLI paths retain the same completion checks', () => {
  const { stream, persisted } = fixture()
  const realPaths = stream.map(event => event['type'] === 'tool_call' && event['tool'] === 'bash'
    ? { ...event, input: { command: String((event['input'] as { command: string }).command).replace('modules/app/cli.ts', '"/project space/modules/app/cli.ts"') } } : event)
  assert.equal(verify_harness_events(realPaths, persisted, 0), 'session-test')
  const batch = stream.map(event => event['type'] === 'tool_call' && event['tool'] === 'bash'
    ? { ...event, input: { command: String((event['input'] as { command: string }).command).replace('modules/app/cli.ts', '"$REAL/app/cli.ts"') } } : event)
  assert.equal(verify_harness_events(batch, persisted, 0), 'session-test')
})

test('Harness verification rejects unsafe business calls and failed or mismatched persisted sessions', () => {
  const { stream, persisted } = fixture()
  assert.throws(() => verify_harness_events(JSON.parse(JSON.stringify(stream).replaceAll('--summary-only', '')), persisted, 0), /UNSAFE_BUSINESS_CALL/)
  assert.throws(() => verify_harness_events(JSON.parse(JSON.stringify(stream).replaceAll('--fixture', '')), persisted, 0), /UNSAFE_BUSINESS_CALL/)
  assert.throws(() => verify_harness_events(stream, [{ type: 'session', id: 'other' }, ...persisted.slice(1)], 0), /SESSION_ID_MISMATCH/)
  assert.throws(() => verify_harness_events(stream, persisted.slice(0, -1), 0), /DURABLE_COMPLETION_MISSING/)
  assert.throws(() => verify_harness_events(stream, [...persisted, { type: 'turn/end', data: { reason: { kind: 'error' } } }], 0), /DURABLE_COMPLETION_MISSING/)
  assert.throws(() => verify_harness_events([...stream.slice(0, -1), { ...stream.at(-1), text: '任务已完成' }], persisted, 0), /REPORT_PATH_NOT_RETURNED/)
})

test('built Harness launcher fails without a credential and never creates a passed verification', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'study-harness-preflight-'))
  t.after(async () => { await rm(directory, { recursive: true, force: true }) })
  const bin = join(directory, 'runtime/lib/bin.js')
  await mkdir(join(directory, 'runtime/lib'), { recursive: true })
  await writeFile(bin, 'throw new Error("must not launch without credentials")\n')
  const project = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'))
  await writeFile(join(directory, 'runtime/package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: project.version }))
  const env = { ...process.env }
  delete env['DEEPSEEK_API_KEY']
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../data/lib/companion/app/harness.js', import.meta.url)), '--dsh-bin', bin, '--out', join(directory, 'result')], { env, encoding: 'utf8', timeout: 10000 })
  assert.ifError(result.error)
  assert.equal(result.signal, null)
  assert.equal(result.status, 1)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), { status: 'failed', reason: 'MISSING_CREDENTIAL' })
  await assert.rejects(access(join(directory, 'result')))
})
