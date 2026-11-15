import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { get_evidence, get_student_stats, prepare_dataset } from './core.ts'
import { load_dataset } from './io.ts'

const HELP = `智慧学伴本地数据工具（Node.js >=24.9）
  node modules/data/cli.ts prepare_dataset --data <CSV目录> [--out <新文件>]
  node modules/data/cli.ts get_student_stats --data <CSV目录> --student D17 --node N01
  node modules/data/cli.ts get_evidence --data <CSV目录> --records DR0023 [--history]
  get_evidence 还支持 --events <编号,编号>、--student <编号>、--node <编号>，筛选条件取交集。
  --fixture 显式标记开发fixture。--out 拒绝覆盖已有文件。所有结果均为JSON。
`

function parseArguments(args: string[]): { command: string; values: Map<string, string>; flags: Set<string> } {
  const command = args[0] ?? 'help'
  const values = new Map<string, string>()
  const flags = new Set<string>()
  const valueOptions = new Set(['--data', '--out', '--student', '--node', '--records', '--events'])
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index]!
    if (option === '--history' || option === '--fixture') {
      if (flags.has(option)) throw new Error(`重复选项 ${option}`)
      flags.add(option)
    } else if (valueOptions.has(option)) {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error(`选项 ${option} 缺少值`)
      if (values.has(option)) throw new Error(`重复选项 ${option}`)
      values.set(option, value)
    } else {
      throw new Error(`未知选项 ${option}`)
    }
  }
  return { command, values, flags }
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name)
  if (!value) throw new Error(`必须指定 ${name}`)
  return value
}

function identifiers(value: string): string[] {
  const ids = value.split(',').map(id => id.trim())
  if (ids.some(id => id === '')) throw new Error('编号列表不能包含空编号')
  return ids
}

/**
 * Run a local data transformation; this entry does not launch a Harness application.
 * @param args - Command arguments without the Node executable and script path.
 * @returns Zero on a valid or partial result, one on a rejected request.
 */
export async function run_cli(args: string[]): Promise<number> {
  const generated_at = new Date().toISOString()
  try {
    const { command, values, flags } = parseArguments(args)
    if (command === 'help' || command === '--help') {
      process.stdout.write(HELP)
      return 0
    }
    if (!['prepare_dataset', 'get_student_stats', 'get_evidence'].includes(command)) throw new Error(`未知操作 ${command}`)
    const allowed = new Set(['--data', '--out'])
    if (command === 'get_student_stats' || command === 'get_evidence') {
      allowed.add('--student')
      allowed.add('--node')
    }
    if (command === 'get_evidence') {
      allowed.add('--records')
      allowed.add('--events')
    }
    for (const name of values.keys()) if (!allowed.has(name)) throw new Error(`${command} 不支持 ${name}`)
    if (flags.has('--history') && command !== 'get_evidence') throw new Error('--history 仅供证据查询使用')
    const input = await load_dataset(required(values, '--data'))
    const dataset = prepare_dataset(input, { generated_at, source_mode: flags.has('--fixture') ? 'fixture' : 'live' })
    let output: unknown
    if (command === 'prepare_dataset') {
      output = {
        schema_version: dataset.schema_version, generated_at: dataset.generated_at,
        dataset_version: dataset.dataset_version,
        policy_version: dataset.policy_version,
        producer_version: dataset.producer_version,
        source_mode: dataset.source_mode,
        scope: {},
        result_status: dataset.summary.review_count > 0 ? 'needs_review' : dataset.summary.included_count === 0 ? 'insufficient_data' : 'ok',
        payload: { summary: dataset.summary, quality_records: dataset.current.filter(record => record.quality_issues.length > 0) },
        evidence_ids: dataset.current.filter(record => record.quality_issues.length > 0).map(record => record.record_id),
        limitations: ['自动检查覆盖结构和严格答案匹配；数学过程及评分合理性仍需人工复核。'],
      }
    } else if (command === 'get_student_stats') {
      output = get_student_stats(dataset, { student_id: required(values, '--student'), node_id: required(values, '--node') })
    } else {
      const student = values.get('--student')
      const node = values.get('--node')
      const records = values.get('--records')
      const events = values.get('--events')
      if (!student && !node && !records && !events) throw new Error('证据查询必须指定至少一个筛选条件')
      output = get_evidence(dataset, {
        ...(student ? { student_id: student } : {}),
        ...(node ? { node_id: node } : {}),
        ...(records ? { record_ids: identifiers(records) } : {}),
        ...(events ? { event_ids: identifiers(events) } : {}),
        include_history: flags.has('--history'),
      })
    }
    const json = `${JSON.stringify(output, null, 2)}\n`
    const destination = values.get('--out')
    if (destination) {
      const outputPath = resolve(destination)
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, json, { encoding: 'utf8', flag: 'wx' })
    }
    process.stdout.write(json)
    return typeof output === 'object' && output !== null && 'result_status' in output && output.result_status === 'error' ? 1 : 0
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      schema_version: 'team-v1', generated_at, dataset_version: 'unavailable', policy_version: 'team-policy-v1',
      producer_version: 'study-data@0.1.0', source_mode: args.includes('--fixture') ? 'fixture' : 'live', scope: {},
      result_status: 'error', payload: null, evidence_ids: [],
      limitations: [error instanceof Error ? error.message : '数据操作失败'],
    }, null, 2)}\n`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void run_cli(process.argv.slice(2)).then(code => { process.exitCode = code })
}
