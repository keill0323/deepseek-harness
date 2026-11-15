import { get_evidence, get_student_stats } from '../data/core.ts'
import type { EvidenceRecord, PreparedDataset, ResultEnvelope } from '../data/types.ts'
import { analyze_class, compare_classes, compare_students, compare_with_peers, inspect_node_pairing } from '../comparison/core.ts'
import { diagnose_student, get_curriculum } from '../diagnosis/core.ts'
import { build_learning_plan, get_hint } from '../guidance/core.ts'
import { build_class_plan } from '../guidance/class.ts'
import { make_result, scope_key } from '../shared/result.ts'

/** One complete, version-consistent individual view. */
export interface StudentCase {
  statistics: ReturnType<typeof get_student_stats>
  diagnosis: ReturnType<typeof diagnose_student>
  plan: ReturnType<typeof build_learning_plan>
  peers: ReturnType<typeof compare_with_peers>
  hints: Record<string, Array<ReturnType<typeof get_hint>>>
  teacher_hints: Record<string, ReturnType<typeof get_hint>>
}

/** A local teaching report containing no remote model responses. */
export interface WorkspacePayload {
  title: string
  engine: 'local_rules'
  students: Array<{ student_id: string; class_id: string }>
  nodes: Array<{ node_id: string; date: string; description: string }>
  classes: string[]
  summary: PreparedDataset['summary']
  curriculum: ReturnType<typeof get_curriculum>
  cases: Record<string, StudentCase>
  class_reports: Record<string, ReturnType<typeof analyze_class>>
  class_plans: Record<string, ReturnType<typeof build_class_plan>>
  node_pairings: Record<string, ReturnType<typeof inspect_node_pairing>>
  quality_records: EvidenceRecord[]
  browser_snapshot: PreparedDataset
}

/**
 * Enumerate every student/class and unordered pair of input nodes for report export.
 * @param dataset - One prepared input snapshot.
 * @returns Stable, escaped keys with explicit subject and node scopes in each result.
 */
export function build_node_pairings(dataset: PreparedDataset): WorkspacePayload['node_pairings'] {
  const entries: WorkspacePayload['node_pairings'] = Object.create(null) as WorkspacePayload['node_pairings']
  const nodes = dataset.input.nodes.map(row => row['节点编号']!).sort()
  const subjects = [
    ...dataset.input.students.map(row => ({ student_id: row['学生编号']! })),
    ...[...new Set(dataset.input.students.map(row => row['模拟班级编号']!))].sort().map(class_id => ({ class_id })),
  ]
  for (let left = 0; left < nodes.length; left += 1) for (let right = left + 1; right < nodes.length; right += 1) {
    for (const subject of subjects) {
      const value = inspect_node_pairing(dataset, { ...subject, left_node_id: nodes[left]!, right_node_id: nodes[right]! })
      const key = [value.payload.kind, value.payload.subject_id, nodes[left]!, nodes[right]!].map(encodeURIComponent).join(':')
      entries[key] = value
    }
  }
  return entries
}

/**
 * Build all node-specific student cases and class reports from one source snapshot.
 * @param dataset - Prepared source data with a current view and evidence history.
 * @returns A local report; student hints contain neither reference answers nor solutions.
 */
export function build_workspace(dataset: PreparedDataset): ResultEnvelope<WorkspacePayload> {
  const students = dataset.input.students.map(row => ({ student_id: row['学生编号']!, class_id: row['模拟班级编号']! }))
  const nodes = dataset.input.nodes.map(row => ({ node_id: row['节点编号']!, date: row['模拟测验日期'] ?? '', description: row['说明'] ?? '' }))
  const classes = [...new Set(students.map(student => student.class_id))].sort()
  const curriculum = get_curriculum(dataset)
  const cases: Record<string, StudentCase> = Object.create(null) as Record<string, StudentCase>
  const classReports: WorkspacePayload['class_reports'] = Object.create(null) as WorkspacePayload['class_reports']
  const classPlans: WorkspacePayload['class_plans'] = Object.create(null) as WorkspacePayload['class_plans']
  const operationFailures: string[] = []
  for (const node of nodes) {
    for (const student of students) {
      const scope = { student_id: student.student_id, node_id: node.node_id }
      const statistics = get_student_stats(dataset, scope)
      const diagnosis = diagnose_student(dataset, scope, { statistics, curriculum })
      const plan = build_learning_plan(dataset, scope, diagnosis, statistics)
      const peers = compare_with_peers(dataset, scope)
      const hints: StudentCase['hints'] = Object.create(null) as StudentCase['hints']
      const teacherHints: StudentCase['teacher_hints'] = Object.create(null) as StudentCase['teacher_hints']
      const selected = [...new Set(plan.payload.activities.flatMap(activity => activity.item_ids))]
      for (const itemId of selected) {
        hints[itemId] = ([1, 2, 3] as const).map(level => get_hint(dataset, { ...scope, item_id: itemId, level, mode: 'student' }))
        teacherHints[itemId] = get_hint(dataset, { ...scope, item_id: itemId, level: 3, mode: 'teacher' })
      }
      const results: ResultEnvelope<unknown>[] = [statistics, diagnosis, plan, peers, ...Object.values(hints).flat(), ...Object.values(teacherHints)]
      if (results.some(result => result.result_status === 'error')) operationFailures.push(`${student.student_id}/${node.node_id}`)
      cases[scope_key(student.student_id, node.node_id)] = { statistics, diagnosis, plan, peers, hints, teacher_hints: teacherHints }
    }
    for (const classId of classes) {
      const scope = { class_id: classId, node_id: node.node_id }, key = scope_key(classId, node.node_id)
      classReports[key] = analyze_class(dataset, scope)
      classPlans[key] = build_class_plan(dataset, scope, classReports[key])
      if (classReports[key].result_status === 'error' || classPlans[key].result_status === 'error') operationFailures.push(key)
    }
  }
  const nodePairings = build_node_pairings(dataset)
  for (const [key, entry] of Object.entries(nodePairings)) if (entry.result_status === 'error') operationFailures.push(key)
  const sanitizedItems = dataset.input.items.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !['参考答案', '参考解析', '评分点'].includes(key))))
  const browserSnapshot: PreparedDataset = {
    ...dataset,
    input: { ...dataset.input, items: sanitizedItems, records: [] },
    history: [],
  }
  const payload: WorkspacePayload = {
    title: '智慧学伴', engine: 'local_rules', students, nodes, classes,
    summary: dataset.summary, curriculum, cases, class_reports: classReports, class_plans: classPlans, node_pairings: nodePairings,
    // 质量记录 = 有 quality_issues 的全部当前记录（处置后仍可追溯，与验收书 6 条一致）
    quality_records: dataset.current.filter(record => record.quality_issues.length > 0), browser_snapshot: browserSnapshot,
  }
  const limitations = [
    '本作品使用本地规则、统计和材料索引，未调用远程大模型。',
    '本地教师报告包含模拟作答证据，仅供本次赛事使用；界面不提供生产环境身份认证。',
    '未评分记录不计得分；复核记录依统计标记处理，复核分数不作为薄弱或成功活动依据。未观察内容不推断为未掌握。',
  ]
  if (operationFailures.length) limitations.push(`以下对象存在未完成操作：${operationFailures.join('、')}`)
  return make_result(dataset, {}, payload, operationFailures.length ? 'error' : dataset.summary.review_count ? 'needs_review' : 'ok', dataset.current.map(record => record.record_id), limitations)
}

function value(request: Record<string, unknown>, key: string): string {
  const selected = request[key]
  if (typeof selected !== 'string' || selected.trim() === '') throw new Error(`必须提供字符串字段 ${key}`)
  return selected
}

function optionalValue(request: Record<string, unknown>, key: string): string | undefined {
  return request[key] === undefined ? undefined : value(request, key)
}

function stringList(request: Record<string, unknown>, key: string): string[] | undefined {
  const selected = request[key]
  if (selected === undefined) return undefined
  if (!Array.isArray(selected) || !selected.every(item => typeof item === 'string' && item.trim() !== '')) throw new Error(`${key} 必须是非空字符串数组`)
  return selected as string[]
}

/**
 * Validate a JSON request before invoking a team business operation.
 * @param dataset - One prepared snapshot for the entire request.
 * @param operation - Documented operation name.
 * @param request - Parsed JSON fields; invalid identifiers are never silently ignored.
 * @returns The corresponding result, or an explicit rejected-request result.
 */
export function execute_operation(dataset: PreparedDataset, operation: string, request: Record<string, unknown>): ResultEnvelope<unknown> {
  try {
    const common = ['student_id', 'node_id']
    const accepted: Record<string, string[]> = {
      get_student_stats: common, diagnose_student: common, build_learning_plan: common,
      get_curriculum: ['topic_id'], get_evidence: ['student_id', 'node_id', 'record_ids', 'event_ids', 'include_history'],
      compare_students: ['left_student_id', 'right_student_id', 'node_id', 'item_ids'],
      compare_with_peers: ['student_id', 'node_id', 'class_id', 'item_ids'],
      inspect_node_pairing: ['student_id', 'class_id', 'left_node_id', 'right_node_id'],
      analyze_class: ['class_id', 'node_id'], build_class_plan: ['class_id', 'node_id'], compare_classes: ['left_class_id', 'right_class_id', 'node_id', 'item_ids'],
      get_hint: ['student_id', 'node_id', 'item_id', 'level', 'mode'], workspace: [],
    }
    const fields = accepted[operation]
    if (!fields) throw new Error(`未知操作 ${operation}`)
    for (const key of Object.keys(request)) if (!fields.includes(key)) throw new Error(`${operation} 不接受字段 ${key}`)
    const studentScope = (): { student_id: string; node_id: string } => ({ student_id: value(request, 'student_id'), node_id: value(request, 'node_id') })
    switch (operation) {
      case 'inspect_node_pairing': {
        if (('student_id' in request) === ('class_id' in request)) throw new Error('跨节点配对必须且只能指定一个学生或班级')
        const subject = 'student_id' in request ? { student_id: value(request, 'student_id') } : { class_id: value(request, 'class_id') }
        return inspect_node_pairing(dataset, { ...subject, left_node_id: value(request, 'left_node_id'), right_node_id: value(request, 'right_node_id') })
      }
      case 'workspace': return build_workspace(dataset)
      case 'get_student_stats': return get_student_stats(dataset, studentScope())
      case 'diagnose_student': return diagnose_student(dataset, studentScope())
      case 'build_learning_plan': return build_learning_plan(dataset, studentScope())
      case 'get_curriculum': {
        const topic = optionalValue(request, 'topic_id')
        return get_curriculum(dataset, topic ? { topic_id: topic } : {})
      }
      case 'get_evidence': {
        if (!Object.keys(request).some(key => key !== 'include_history')) throw new Error('证据查询必须明确指定筛选条件')
        if (request['include_history'] !== undefined && typeof request['include_history'] !== 'boolean') throw new Error('include_history 必须为布尔值')
        const student = optionalValue(request, 'student_id'), node = optionalValue(request, 'node_id')
        const records = stringList(request, 'record_ids'), events = stringList(request, 'event_ids')
        return get_evidence(dataset, {
          ...(student ? { student_id: student } : {}), ...(node ? { node_id: node } : {}),
          ...(records ? { record_ids: records } : {}), ...(events ? { event_ids: events } : {}),
          ...(request['include_history'] !== undefined ? { include_history: request['include_history'] as boolean } : {}),
        })
      }
      case 'analyze_class': return analyze_class(dataset, { class_id: value(request, 'class_id'), node_id: value(request, 'node_id') })
      case 'build_class_plan': return build_class_plan(dataset, { class_id: value(request, 'class_id'), node_id: value(request, 'node_id') })
      case 'compare_students': {
        const items = stringList(request, 'item_ids')
        return compare_students(dataset, { left_student_id: value(request, 'left_student_id'), right_student_id: value(request, 'right_student_id'), node_id: value(request, 'node_id'), ...(items ? { item_ids: items } : {}) })
      }
      case 'compare_classes': {
        const items = stringList(request, 'item_ids')
        return compare_classes(dataset, { left_class_id: value(request, 'left_class_id'), right_class_id: value(request, 'right_class_id'), node_id: value(request, 'node_id'), ...(items ? { item_ids: items } : {}) })
      }
      case 'compare_with_peers': {
        const items = stringList(request, 'item_ids'), group = optionalValue(request, 'class_id')
        return compare_with_peers(dataset, { ...studentScope(), ...(items ? { item_ids: items } : {}), ...(group ? { class_id: group } : {}) })
      }
      case 'get_hint': {
        const level = request['level']
        if (level !== 1 && level !== 2 && level !== 3) throw new Error('level 必须是数字1、2或3')
        const mode = request['mode'] ?? 'student'
        if (mode !== 'student' && mode !== 'teacher') throw new Error('mode 必须为student或teacher')
        return get_hint(dataset, { ...studentScope(), item_id: value(request, 'item_id'), level, mode })
      }
      default: throw new Error(`未实现操作 ${operation}`)
    }
  } catch (error) {
    return make_result(dataset, {}, null, 'error', [], [error instanceof Error ? error.message : '请求失败'])
  }
}
