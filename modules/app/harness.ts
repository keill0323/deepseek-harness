/** Real headless Harness verification using local synthetic inputs and durable Session evidence. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync } from 'node:fs'
import { mkdir, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual, parseArgs, parseEnv } from 'node:util'
import { check_export } from './check-export.ts'
import { execute_operation } from './core.ts'
import { make_demo_input } from './demo.ts'
import { prepare_workspace_dataset } from './pipeline.ts'
import { is_generated_at } from '../data/time.ts'

const sourceRoot = new URL('../../', import.meta.url)
const SOURCE_ROOT = fileURLToPath(existsSync(new URL('package.json', sourceRoot)) ? sourceRoot : new URL('../../../../../', import.meta.url))
const REQUESTS = {
  get_student_stats: { student_id: 'DEMO-A', node_id: 'CHECK-2' },
  compare_students: { left_student_id: 'DEMO-A', right_student_id: 'DEMO-B', node_id: 'CHECK-2' },
  diagnose_student: { student_id: 'DEMO-A', node_id: 'CHECK-2' },
  build_learning_plan: { student_id: 'DEMO-A', node_id: 'CHECK-2' },
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SESSION_RECORD')
  return value as Record<string, unknown>
}

/**
 * Recompute a real CLI result using its validated batch time, preserving every other field.
 * @param actual - Parsed result written by the Harness-invoked CLI.
 * @param operation - Requested business operation.
 * @param request - Synthetic request supplied to that operation.
 * @param startedAt - Observed Harness launch time in milliseconds.
 * @param finishedAt - Observed Harness completion time in milliseconds.
 * @returns Nothing; stale timestamps or different business results throw.
 */
export function verify_harness_result(actual: unknown, operation: string, request: Record<string, unknown>, startedAt: number, finishedAt: number): void {
  const generated_at = object(actual)['generated_at']
  if (!is_generated_at(generated_at) || Date.parse(generated_at) < startedAt || Date.parse(generated_at) > finishedAt) throw new Error('OPERATION_TIMESTAMP_INVALID')
  const dataset = prepare_workspace_dataset(make_demo_input(), { source_mode: 'fixture', generated_at })
  const expected = execute_operation(dataset, operation, request)
  if (!isDeepStrictEqual(actual, JSON.parse(JSON.stringify(expected)))) throw new Error('OPERATION_RESULT_MISMATCH')
}

/**
 * Validate durable discovery, successful skill loading, CLI execution and completion.
 * @param stream - Parsed headless --json output, including the final outcome.
 * @param persisted - Parsed, uncompressed Session events for the same invocation.
 * @param exitCode - Observed child-process exit code; null cannot pass.
 * @returns The identity of the verified completed Session.
 */
export function verify_harness_events(stream: unknown[], persisted: unknown[], exitCode: number | null): string {
  const events = stream.map(object), log = persisted.map(object)
  const opening = events[0], final = events.at(-1)
  if (exitCode !== 0 || opening?.['type'] !== 'session' || typeof opening['sessionId'] !== 'string'
    || final?.['type'] !== 'final' || final['sessionId'] !== opening['sessionId']
    || object(final['reason'])['kind'] !== 'completed') throw new Error('SESSION_NOT_COMPLETED')
  if (log[0]?.['type'] !== 'session' || log[0]['id'] !== opening['sessionId']) throw new Error('SESSION_ID_MISMATCH')
  const catalog = log.some(event => {
    if (event['type'] !== 'user/message') return false
    const rawSource = object(event['data'])['source']
    if (rawSource === null || typeof rawSource !== 'object' || Array.isArray(rawSource)) return false
    const source = object(rawSource)
    return source['kind'] === 'skill-catalog' && Array.isArray(source['entries'])
      && source['entries'].some(entry => object(entry)['name'] === 'study-companion')
  })
  if (!catalog) throw new Error('SKILL_NOT_DISCOVERED')
  const calls = events.filter(event => event['type'] === 'tool_call')
  const skill = calls.find(event => event['tool'] === 'skill' && object(event['input'])['name'] === 'study-companion')
  if (!skill || !events.some(event => event['type'] === 'tool_result' && event['callId'] === skill['callId']
    && event['status'] === 'completed' && typeof event['result'] === 'string' && event['result'].includes('study-companion'))) throw new Error('SKILL_NOT_LOADED')
  const businessCalls = calls.filter(event => event['tool'] === 'bash' || event['tool'] === 'pwsh').flatMap(call => {
    const input = object(call['input'])
    const command = input['command']
    if (typeof command !== 'string') return []
    const normalized = command.replaceAll('\\', '/')
    return /\bapp\/cli\.ts["']?\s+(run|export)\b/u.test(normalized) ? [{ call, command: normalized }] : []
  })
  if (businessCalls.some(({ command }) => !/(?:^|\s)--summary-only(?:\s|$)/u.test(command)
    || !/(?:^|\s)--fixture(?:\s|$)/u.test(command))) throw new Error('UNSAFE_BUSINESS_CALL')
  if (!businessCalls.some(({ command }) => /cli\.ts["']?\s+export\b/u.test(command))
    || Object.keys(REQUESTS).some(operation => !businessCalls.some(({ command }) => command.includes(operation)))) throw new Error('BUSINESS_CALLS_MISSING')
  if (businessCalls.some(({ call }) => typeof call['callId'] !== 'string'
    || !events.some(event => event['type'] === 'tool_result' && event['callId'] === call['callId'] && event['status'] === 'completed'))) throw new Error('BUSINESS_CALL_NOT_COMPLETED')
  const lastTurn = log.findLast(event => event['type'] === 'turn/end')
  if (!lastTurn || object(object(lastTurn['data'])['reason'])['kind'] !== 'completed') throw new Error('DURABLE_COMPLETION_MISSING')
  if (typeof final['text'] !== 'string' || !final['text'].replaceAll('\\', '/').includes('tmp/study-data/report/index.html')) throw new Error('REPORT_PATH_NOT_RETURNED')
  return opening['sessionId']
}

async function runChild(bin: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, prefix: string, timeoutMs: number): Promise<number | null> {
  const stdout = openSync(`${prefix}.jsonl`, 'wx', 0o600)
  let stderr: number | undefined
  try {
    stderr = openSync(`${prefix}.stderr.log`, 'wx', 0o600)
    const errorFd = stderr
    return await new Promise((done, reject) => {
      const child = spawn(bin, args, { cwd, env, stdio: ['ignore', stdout, errorFd] })
      let timedOut = false
      const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, timeoutMs)
      const force = setTimeout(() => { child.kill('SIGKILL') }, timeoutMs + 10000)
      child.once('error', () => { clearTimeout(deadline); clearTimeout(force); reject(new Error('PROCESS_START_FAILED')) })
      child.once('close', (code, signal) => {
        clearTimeout(deadline); clearTimeout(force)
        if (timedOut || signal) reject(new Error('SESSION_INTERRUPTED'))
        else done(code)
      })
    })
  } finally {
    closeSync(stdout)
    if (stderr !== undefined) closeSync(stderr)
  }
}

async function jsonLines(path: string): Promise<unknown[]> {
  return (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}

/**
 * Run a real installed dsh headless Session using only independently authored inputs.
 * @param args - --dsh-bin, a fresh --out directory and an optional local --env-file.
 * @returns Zero only after Session, CLI outputs and complete report checks pass.
 */
export async function run_harness_cli(args: string[]): Promise<number> {
  let directory: string | undefined
  try {
    const { values } = parseArgs({ args, options: { 'dsh-bin': { type: 'string' }, out: { type: 'string' }, 'env-file': { type: 'string' } }, strict: true })
    if (!values['dsh-bin'] || !values.out) throw new Error('REQUIRED_ARGUMENTS_MISSING')
    const dshBin = await realpath(resolve(values['dsh-bin']))
    const runtime = object(JSON.parse(await readFile(join(dirname(dirname(dshBin)), 'package.json'), 'utf8')))
    const project = object(JSON.parse(await readFile(join(SOURCE_ROOT, 'package.json'), 'utf8')))
    if (runtime['name'] !== '@deepseek-ai/dsh' || runtime['version'] !== project['version']) throw new Error('RUNTIME_VERSION_MISMATCH')
    const configured = values['env-file'] ? parseEnv(await readFile(resolve(values['env-file']), 'utf8')) : {}
    const apiKey = process.env['DEEPSEEK_API_KEY'] || configured['DEEPSEEK_API_KEY']
    if (!apiKey) throw new Error('MISSING_CREDENTIAL')
    directory = resolve(values.out)
    await mkdir(dirname(directory), { recursive: true })
    await mkdir(directory)
    const workspace = join(directory, 'workspace'), sessions = join(directory, 'sessions')
    await mkdir(join(workspace, '.git'), { recursive: true })
    await mkdir(join(workspace, '.agents/skills/study-companion'), { recursive: true })
    const skill = await readFile(join(SOURCE_ROOT, '.agents/skills/study-companion/SKILL.md'))
    await writeFile(join(workspace, '.agents/skills/study-companion/SKILL.md'), skill, { flag: 'wx' })
    await symlink(join(SOURCE_ROOT, 'modules'), join(workspace, 'modules'), process.platform === 'win32' ? 'junction' : 'dir')
    const fixture = join(workspace, 'tmp/study-data/fixture')
    const fixtureCode = await runChild(process.execPath, [join(SOURCE_ROOT, 'modules/app/demo.ts'), '--out', fixture], workspace, process.env, join(directory, 'fixture'), 60000)
    if (fixtureCode !== 0) throw new Error('FIXTURE_PREPARATION_FAILED')
    const requests = join(workspace, 'requests')
    await mkdir(requests)
    for (const [operation, request] of Object.entries(REQUESTS)) await writeFile(join(requests, `${operation}.json`), JSON.stringify(request), { flag: 'wx' })
    const patch = join(directory, 'session.patch.yml')
    await writeFile(patch, '- id: session-log-deepseek\n  config:\n    enabled: false\n- id: session-telemetry-otel\n  disabled: true\n- id: session-persistence-jsonl\n  config:\n    root: !!js process.env.STUDY_HARNESS_SESSION_DIR\n    compression: none\n', { flag: 'wx' })
    const env: NodeJS.ProcessEnv = { ...process.env, DEEPSEEK_API_KEY: apiKey,
      DSH_HOME: join(directory, 'home'), DSH_AGENTS_HOME: join(directory, 'agents'),
      DSH_TELEMETRY_MODE: 'DISABLED', STUDY_HARNESS_SESSION_DIR: sessions }
    const baseUrl = process.env['DEEPSEEK_BASE_URL'] || configured['DEEPSEEK_BASE_URL']
    if (baseUrl) env['DEEPSEEK_BASE_URL'] = baseUrl
    const task = '使用已发现的 study-companion Skill 完成一次合成数据联调。先通过 skill 工具加载它。工作目录中 modules 是已构建的项目业务模块；输入位于 tmp/study-data/fixture/input，全部为自编合成数据。不要读取输入CSV、报告正文或凭据，不修改代码，也不创建子代理。用现有 CLI 依次执行 requests/ 下四个请求文件，操作名与文件名相同，输出到 tmp/study-data/results/<操作名>.json；再导出完整报告到 tmp/study-data/report。所有调用须使用 --fixture --summary-only，保留已有 fixture/report。最后只返回操作状态与新报告 index.html 路径。'
    const startedAt = Date.now()
    const code = await runChild(process.execPath, [dshBin, '--profile', 'headless', '--patch', patch, '--json', '--approval-policy', 'never', task], workspace, env, join(directory, 'run'), 240000)
    const finishedAt = Date.now()
    const stream = await jsonLines(join(directory, 'run.jsonl'))
    const opening = object(stream[0])
    const sessionId = opening['sessionId']
    if (typeof sessionId !== 'string') throw new Error('SESSION_ID_MISSING')
    const files = await readdir(sessions, { recursive: true })
    const sessionFiles = files.filter(file => basename(dirname(file)) === sessionId && /^session(?:\.v\d+)?\.jsonl$/u.test(basename(file)))
    if (sessionFiles.length !== 1) throw new Error('SESSION_LOG_MISSING_OR_AMBIGUOUS')
    const persisted = await jsonLines(join(sessions, sessionFiles[0]!))
    verify_harness_events(stream, persisted, code)
    const report = join(workspace, 'tmp/study-data/report')
    if (!await check_export(report, 'fixture')) throw new Error('REPORT_VERIFICATION_FAILED')
    const manifest = object(JSON.parse(await readFile(join(report, 'manifest.json'), 'utf8')))
    const reportTime = manifest['generated_at']
    if (!is_generated_at(reportTime) || Date.parse(reportTime) < startedAt || Date.parse(reportTime) > finishedAt) throw new Error('REPORT_TIMESTAMP_INVALID')
    for (const [operation, request] of Object.entries(REQUESTS)) {
      const actual = JSON.parse(await readFile(join(workspace, 'tmp/study-data/results', `${operation}.json`), 'utf8'))
      verify_harness_result(actual, operation, request, startedAt, finishedAt)
    }
    const result = { status: 'passed', verification: 'real_harness_session', session_id: sessionId,
      runtime_version: runtime['version'], skill_sha256: createHash('sha256').update(skill).digest('hex'), operations: Object.keys(REQUESTS),
      report_path: join(report, 'index.html'), session_log: join(sessions, sessionFiles[0]!), source_mode: 'fixture', human_review: 'pending' }
    await writeFile(join(directory, 'verification.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
    process.stdout.write(JSON.stringify({ status: result.status, verification_path: join(directory, 'verification.json'), report_path: result.report_path }) + '\n')
    return 0
  } catch (error) {
    const message = error instanceof Error && /^[A-Z_]+$/u.test(error.message) ? error.message : 'HARNESS_VERIFICATION_FAILED'
    process.stdout.write(JSON.stringify({ status: 'failed', reason: message, ...(directory ? { log_directory: directory } : {}) }) + '\n')
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void run_harness_cli(process.argv.slice(2)).then(code => { process.exitCode = code })
}
