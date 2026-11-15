import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { load_dataset } from '../data/io.ts'
import { build_workspace, execute_operation } from './core.ts'
import { prepare_workspace_dataset } from './pipeline.ts'
import { render_report } from './report.ts'
import { verify_workspace } from './verify.ts'
import { CSV_FORMAT, csv_exports, result_to_csv } from './csv.ts'

const HELP = `智慧学伴完整本地工具
  npm run study:build
  node modules/app/cli.ts export --data <CSV目录> --out <新目录> [--summary-only]
  node modules/app/cli.ts run --data <CSV目录> --operation <操作名> --request <JSON>
  node modules/app/cli.ts run --data <CSV目录> --operation <操作名> --request-file <JSON文件> [--out <新文件>] [--format json|csv] [--summary-only]
操作：get_student_stats、get_evidence、compare_students、compare_with_peers、analyze_class、compare_classes、get_curriculum、diagnose_student、build_learning_plan、build_class_plan、get_hint、workspace。
export 导出独立交互HTML、同源JSON/CSV成果、字段说明和自动核验。--fixture 标识测试数据。
--summary-only 仅回传结果状态与本地文件路径，供Harness调用；run时必须同时指定--out。
`

function argumentsFor(args: string[]): { command: string; options: Map<string, string>; flags: Set<string> } {
  const command = args[0] ?? 'help'
  const options = new Map<string, string>(), flags = new Set<string>()
  const names = new Set(['--data', '--out', '--operation', '--request', '--request-file', '--format'])
  for (let i = 1; i < args.length; i += 1) {
    const name = args[i]!
    if (name === '--fixture' || name === '--summary-only') {
      if (flags.has(name)) throw new Error(`重复选项 ${name}`)
      flags.add(name)
    } else if (names.has(name)) {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error(`${name} 缺少值`)
      if (options.has(name)) throw new Error(`重复选项 ${name}`)
      options.set(name, value)
    } else throw new Error(`未知选项 ${name}`)
  }
  return { command, options, flags }
}

function required(options: Map<string, string>, name: string): string {
  const value = options.get(name)
  if (!value) throw new Error(`必须指定 ${name}`)
  return value
}

async function writeNew(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
}

/**
 * Run data analysis or export a local, self-contained teacher report.
 * @param args - CLI arguments following the script filename.
 * @returns Exit code; malformed or incomplete exports fail visibly.
 */
export async function run_companion_cli(args: string[]): Promise<number> {
  const summaryOnly = args.includes('--summary-only')
  try {
    const { command, options, flags } = argumentsFor(args)
    if (command === 'help' || command === '--help') { process.stdout.write(HELP); return 0 }
    if (command !== 'run' && command !== 'export') throw new Error(`未知命令 ${command}`)
    if (command === 'export' && [...options.keys()].some(key => !['--data', '--out'].includes(key))) throw new Error('export只接受--data和--out')
    if (command === 'run' && summaryOnly && !options.has('--out')) throw new Error('run --summary-only 必须指定本地--out文件')
    const input = await load_dataset(required(options, '--data'))
    const dataset = prepare_workspace_dataset(input, { source_mode: flags.has('--fixture') ? 'fixture' : 'live' })
    if (command === 'run') {
      const format = options.get('--format') ?? 'json'
      if (format !== 'json' && format !== 'csv') throw new Error('--format 必须为json或csv')
      const operation = required(options, '--operation')
      if (options.has('--request') && options.has('--request-file')) throw new Error('--request与--request-file只能选一个')
      const raw = options.has('--request-file') ? await readFile(required(options, '--request-file'), 'utf8') : options.get('--request') ?? '{}'
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('请求必须为JSON对象')
      const result = execute_operation(dataset, operation, parsed as Record<string, unknown>)
      const output = options.get('--out')
      const serialized = format === 'csv' ? result_to_csv(result) : `${JSON.stringify(result, null, 2)}\n`
      if (output) {
        await mkdir(dirname(resolve(output)), { recursive: true })
        await writeFile(resolve(output), serialized, { encoding: 'utf8', flag: 'wx' })
      }
      const response = summaryOnly
        ? { result_status: result.result_status, operation, result_path: resolve(required(options, '--out')), engine: 'local_rules' }
        : result
      process.stdout.write(summaryOnly ? `${JSON.stringify(response, null, 2)}\n` : serialized)
      return result.result_status === 'error' ? 1 : 0
    }
    const directory = resolve(required(options, '--out'))
    const workspace = build_workspace(dataset)
    const verification = verify_workspace(workspace)
    if (workspace.result_status === 'error' || verification.status === 'failed') throw new Error(`全链路核验未通过：${verification.errors.join('；') || workspace.limitations.join('；')}`)
    const html = await render_report(workspace)
    await mkdir(dirname(directory), { recursive: true })
    await mkdir(directory, { recursive: false })
    await writeFile(join(directory, 'index.html'), html, { encoding: 'utf8', flag: 'wx' })
    await writeNew(join(directory, 'workspace.json'), workspace)
    await writeNew(join(directory, 'acceptance.json'), verification)
    await writeNew(join(directory, 'fields.json'), {
      schema_version: 'team-v1', versions: ['dataset_version', 'policy_version', 'producer_version'],
      csv: {
        format: CSV_FORMAT, encoding: 'UTF-8 BOM，逗号分隔，CRLF行结束，所有单元格双引号转义',
        rows: '每个对象或数组一行；path是payload内的JSON Pointer，空字符串为根；row_type标识object/array/value，length保留数组长度。value/列为该对象的直接字段；下级对象、数组和数组元素按path关联。',
        types: 'types_json保留字段类型：未知值为null，真实零分为number 0，空文本为string。空单元格表示该行不含此列，不代表零分。',
        metadata: '每行带版本、状态和scope_json；根行保留总evidence_ids_json和limitations_json；数值由同一JSON结果投影，不重新计算。',
        escaping: '可能被表格软件解释为公式的文本加单引号，escaped_columns_json列出这些列；还原时只删除所列单元格的一个前导单引号。数值不加前缀。导入表格软件时将编号列指定为文本。',
      },
      result_status: { ok: '已完成且有可用证据', insufficient_data: '信息不足，分数未知为null', needs_review: '包含需人工核对的记录或结论', error: '请求无效或操作失败' },
      score_rate: '0到1的得分比例，仅使用有效评分记录', delta_percentage_points: '左侧减右侧，单位百分点',
      evidence_ids: '可在本地证据页核对的作答记录编号', source_row_number: 'CSV表头为第1条的逻辑行位置',
      findings: '事实、有限推断、证据不足、评分复核分别标明', source_mode: 'live为实际输入，fixture为开发样例',
      engine: 'local_rules为本地统计与规则；不表示远程LLM输出',
      structures: {
        workspace: { students: '输入学生及班级名单', nodes: '测验节点与测量范围', summary: '原始行、当前事件和质量处理计数', cases: '以学生编号:节点编号索引的完整个体结果', class_reports: '以班级编号:节点编号索引的群体结果（含逐题与评分点事件分布）', class_plans: '同班同节点的分组教学建议，含对象、依据、实施步骤、观察与调整条件', curriculum: '课程主题、指标与材料定位', quality_records: '待复核的当前记录', browser_snapshot: '仅供本地教师报告计算比较及核对证据，题库参考答案和解析已去除' },
        result: { scope: '本次操作明确选择的学生、班级、节点或展示模式', payload: '操作特定结果', limitations: '影响解释和适用范围的限制' },
        evidence: { record_id: '记录编号', event_id: '独立作答事件', revision: '十进制正整数修订版本', student_id: '模拟学生编号', item_id: '题目材料编号', topic_id: '主题编号', node_id: '测验节点', grading_status: '原始评分状态', score: '记录得分，缺失或无效为null', max_score: '记录满分', answer: '原始最终作答，仅限教师证据', steps: '原始过程，仅限教师证据', point_scores: '原始分点评分', include_in_statistics: '是否允许参与统计', action: 'include纳入、exclude正常未评分排除、review人工复核', quality_issues: '问题代码与原因', original_values: '不改写的导入字段', source: '来源CSV与逻辑行编号' },
        statistics: { record_count: '当前事件记录数', valid_record_count: '通过质量检查且已评分的记录数', earned_score: '有效得分合计，没有有效记录为null', possible_score: '同批有效记录满分合计，没有有效记录为null', topics: '按主题统计及taught教学范围', indicators: '按观察指标统计', review_record_ids: '需复核的当前记录编号' },
        comparison: { candidate_item_ids: '请求候选题目', shared_item_ids: '左右侧均有有效样本的共同题目', excluded_items: '从两侧共同移除的题目与原因', weight_mode: '共同题目的满分占比', within_item_aggregation: '题内先按每名学生平均得分率，再平均学生', exclude_self: '同伴比较是否先排除本人', comparable: '是否存在可计算共同题集', items: '逐题人数、记录数、平均得分率、权重和两侧证据', left_rate: '左侧共同题集加权得分率', right_rate: '右侧共同题集加权得分率', delta_rate: '左侧减右侧的比例差', reason_codes: '无法比较或移除题目的原因' },
        diagnosis: { category: 'fact事实、inference有限推断、insufficient_data证据不足、scoring_review评分复核', finding_type: '具体发现类型', step_refs: '从1开始的原始步骤编号，不能可靠定位时为空', point_refs: '原题评分点编号', material_ids: '输入材料编号', covered_indicator_ids: '已有有效观察的指标', unobserved_indicator_ids: '本节点可测但缺有效记录的指标' },
        activity: { order: '建议实施顺序', kind: 'targeted_practice针对练习、extension解释迁移、observation补充观察', goal: '活动目标', rationale: '选择活动的已有依据', item_ids: '实际题目编号', prompt: '不直接给最终答案的活动提示', observation: '后续应观察的表现', adjust_when: '根据实际新记录调整活动的条件' },
        class_recommendation: { student_ids: '建议适用学生，不表示能力排名', evidence_ids: '同班同节点同指标的非复核计分记录', item_ids: '输入提供的同指标节点允许题集', steps: '教师实施顺序', observation: '待收集的表现', adjust_when: '团队实施规则，不是官方阈值' },
        hint: { level: '1到3的帮助等级', mode: 'student学生提示或teacher教师查看', hint: '该级方法提示', requires_review: '现有评分是否待复核', teacher_solution: '仅显式教师模式出现，学生提示和学生练习导出不含此字段' },
        curriculum: { indicator_id: '观察指标编号', question_ids: '对应题目编号', textbook_pages: '输入索引提供的教材页段', course_standard: '课标文件名、文件页、正文页和索引编号；verification=input_index仅代表来自索引', materials: '实际材料编号、类型、标题与源文件' },
      },
    })
    for (const [key, entry] of Object.entries(workspace.payload.cases)) {
      await writeNew(join(directory, 'students', `${encodeURIComponent(key)}.json`), entry)
    }
    for (const [key, entry] of Object.entries(workspace.payload.class_reports)) {
      await writeNew(join(directory, 'classes', `${encodeURIComponent(key)}.json`), entry)
    }
    for (const [key, entry] of Object.entries(workspace.payload.class_plans)) {
      await writeNew(join(directory, 'class-plans', `${encodeURIComponent(key)}.json`), entry)
    }
    const csvFiles = csv_exports(workspace)
    for (const [name, entry] of csvFiles) {
      const path = join(directory, 'csv', name)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, result_to_csv(entry), { encoding: 'utf8', flag: 'wx' })
    }
    await writeFile(join(directory, 'README.txt'), '双击index.html查看本地交互报告。workspace.json及students、classes、class-plans为可机读成果，csv为同源表格投影，fields.json解释字段和CSV还原规则。页面支持当前结果、学生练习与班级建议的CSV下载。acceptance.json仅记录自动核验，真人复验仍待完成。赛事数据仅限本次比赛本地使用，不得上传公网。\n', { encoding: 'utf8', flag: 'wx' })
    await writeNew(join(directory, 'manifest.json'), {
      status: 'complete', generated_at: new Date().toISOString(), schema_version: workspace.schema_version, dataset_version: workspace.dataset_version,
      policy_version: workspace.policy_version, producer_version: workspace.producer_version, source_mode: workspace.source_mode,
      export_format_version: 'study-export-v2', csv_format: CSV_FORMAT, csv_files: csvFiles.map(([name]) => `csv/${name}`),
      entry: 'index.html', report_sha256: createHash('sha256').update(html).digest('hex'), verification: 'acceptance.json', machine_readable: 'workspace.json', human_review: 'pending',
    })
    process.stdout.write(`${JSON.stringify({
      result_status: workspace.result_status, engine: 'local_rules', output_directory: directory,
      report_path: join(directory, 'index.html'), manifest_path: join(directory, 'manifest.json'),
      ...(summaryOnly ? {} : { automated_verification: verification.status, student_case_count: Object.keys(workspace.payload.cases).length, class_report_count: Object.keys(workspace.payload.class_reports).length }),
    }, null, 2)}\n`)
    return 0
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ result_status: 'error', engine: 'local_rules', error: summaryOnly ? '本地操作失败；请在本地检查输入、参数和输出目录。' : error instanceof Error ? error.message : '本地操作失败' }, null, 2)}\n`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  void run_companion_cli(process.argv.slice(2)).then(code => { process.exitCode = code })
}
