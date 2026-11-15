import type { EvidenceRecord, PreparedDataset, ResultEnvelope, ScoreSummary } from '../data/types.ts'

/** A same-node request comparing two named students. */
export interface StudentComparisonScope {
  left_student_id: string
  right_student_id: string
  node_id: string
  item_ids?: string[]
}

/** A student-to-peer request; the student is excluded from the peer group first. */
export interface PeerComparisonScope {
  student_id: string
  node_id: string
  class_id?: string
  item_ids?: string[]
}

/** A same-node request comparing two classes. */
export interface ClassComparisonScope {
  left_class_id: string
  right_class_id: string
  node_id: string
  item_ids?: string[]
}

/** A class analysis always belongs to one explicitly named test. */
export interface ClassScope {
  class_id: string
  node_id: string
}

/** Two distinct nodes for one student or one class; no cross-node score comparison. */
export type NodePairingScope = { left_node_id: string; right_node_id: string }
  & ({ student_id: string } | { class_id: string })

/** Coverage and quality at one node, with no missing-value score imputation. */
export interface NodeObservation {
  node_id: string
  allowed: boolean
  taught: boolean
  record_count: number
  valid_record_count: number
  valid_student_ids: string[]
  evidence_ids: string[]
  quality_record_ids: string[]
  reason_codes: string[]
}

/** Same-item, same-student observation pairs; pairing does not establish learning progress. */
export interface NodePairingPayload {
  kind: 'student' | 'class'
  subject_id: string
  left_node_id: string
  right_node_id: string
  candidate_item_ids: string[]
  shared_allowed_item_ids: string[]
  paired_item_ids: string[]
  items: Array<{
    item_id: string
    topic_id: string
    indicator_id: string
    left: NodeObservation
    right: NodeObservation
    paired_student_ids: string[]
    pairable: boolean
    reason_codes: string[]
  }>
  comparable: false
  delta_rate: null
  reason_codes: string[]
}

/**
 * Identify same-item observations available at two nodes without inferring progress.
 * @param dataset - Prepared current records and the input node teaching scopes.
 * @param scope - One student or class and two distinct nodes, in display order.
 * @returns Pairable items, side-specific gaps and evidence; no cross-node score or ranking.
 */
export function inspect_node_pairing(dataset: PreparedDataset, scope: NodePairingScope): ResultEnvelope<NodePairingPayload> {
  const kind = 'student_id' in scope ? 'student' : 'class'
  const subject = 'student_id' in scope ? scope.student_id : scope.class_id
  const members = kind === 'student'
    ? dataset.input.students.filter(row => row['学生编号'] === subject).map(row => row['学生编号']!)
    : classMembers(dataset, subject)
  const leftNode = dataset.input.nodes.find(row => row['节点编号'] === scope.left_node_id)
  const rightNode = dataset.input.nodes.find(row => row['节点编号'] === scope.right_node_id)
  const payload: NodePairingPayload = {
    kind, subject_id: subject, left_node_id: scope.left_node_id, right_node_id: scope.right_node_id,
    candidate_item_ids: [], shared_allowed_item_ids: [], paired_item_ids: [], items: [],
    comparable: false, delta_rate: null, reason_codes: [],
  }
  if (!members.length) payload.reason_codes.push(kind === 'student' ? 'unknown_student' : 'unknown_class')
  if (!leftNode || !rightNode) payload.reason_codes.push('unknown_node')
  if (scope.left_node_id === scope.right_node_id) payload.reason_codes.push('same_node')
  if (payload.reason_codes.length || !leftNode || !rightNode) {
    return result(dataset, { ...scope }, payload, 'error', [], ['请选择一个有效学生或班级，以及两个不同的测验节点。'])
  }
  const leftAllowed = new Set(splitIds(leftNode['可用题目编号']))
  const rightAllowed = new Set(splitIds(rightNode['可用题目编号']))
  const itemMap = new Map(dataset.input.items.filter(row => row['材料类型'] === '题目').map(row => [row['材料编号']!, row]))
  payload.candidate_item_ids = [...new Set([...leftAllowed, ...rightAllowed])].sort()
  if (payload.candidate_item_ids.some(id => !itemMap.has(id))) {
    payload.reason_codes.push('unknown_item_in_node')
    return result(dataset, { ...scope }, payload, 'error', [], ['节点题目索引包含不存在的题目，请核对输入后重跑。'])
  }
  payload.shared_allowed_item_ids = payload.candidate_item_ids.filter(id => leftAllowed.has(id) && rightAllowed.has(id))
  const memberSet = new Set(members)
  const selected = dataset.current.filter(row => memberSet.has(row.student_id)
    && (row.node_id === scope.left_node_id || row.node_id === scope.right_node_id))
  function observation(nodeId: string, itemId: string, allowed: boolean, taught: boolean): NodeObservation {
    const rows = selected.filter(row => row.node_id === nodeId && row.item_id === itemId)
    const valid = rows.filter(row => allowed && taught && row.include_in_statistics)
    const reasons: string[] = []
    if (!allowed) reasons.push('item_not_allowed_in_node')
    if (!taught) reasons.push('topic_not_taught')
    if (!rows.length) reasons.push('no_records')
    if (rows.some(row => row.grading_status === '待评分')) reasons.push('pending_grading')
    if (rows.some(row => row.grading_status === '未作答')) reasons.push('unanswered')
    if (rows.some(row => row.action === 'review' && !row.include_in_statistics)) reasons.push('quality_excluded')
    if (rows.some(row => row.action === 'review' && row.include_in_statistics)) reasons.push('scoring_review_retained')
    if (!valid.length) reasons.push('no_valid_records')
    return {
      node_id: nodeId, allowed, taught, record_count: rows.length, valid_record_count: valid.length,
      valid_student_ids: [...new Set(valid.map(row => row.student_id))].sort(),
      evidence_ids: valid.map(row => row.record_id).sort(),
      quality_record_ids: rows.filter(row => row.quality_issues.length).map(row => row.record_id).sort(), reason_codes: reasons,
    }
  }
  const leftTaught = new Set(splitIds(leftNode['已教及测量主题']))
  const rightTaught = new Set(splitIds(rightNode['已教及测量主题']))
  for (const id of payload.candidate_item_ids) {
    const item = itemMap.get(id)!
    const topic = item['主题编号']!
    const left = observation(scope.left_node_id, id, leftAllowed.has(id), leftTaught.has(topic))
    const right = observation(scope.right_node_id, id, rightAllowed.has(id), rightTaught.has(topic))
    const rightStudents = new Set(right.valid_student_ids)
    const paired = left.valid_student_ids.filter(student => rightStudents.has(student))
    const reasons: string[] = []
    if (!left.allowed || !right.allowed || !left.taught || !right.taught) reasons.push('node_scope_mismatch')
    if (!left.valid_record_count || !right.valid_record_count) reasons.push('missing_valid_observations')
    else if (!paired.length) reasons.push('no_common_valid_students')
    payload.items.push({ item_id: id, topic_id: topic, indicator_id: item['指标编号']!, left, right,
      paired_student_ids: paired, pairable: paired.length > 0, reason_codes: reasons })
  }
  payload.paired_item_ids = payload.items.filter(item => item.pairable).map(item => item.item_id)
  payload.reason_codes.push('cross_node_progress_not_established')
  if (!payload.shared_allowed_item_ids.length) payload.reason_codes.push('no_shared_allowed_items')
  if (!payload.paired_item_ids.length) payload.reason_codes.push('no_paired_observations')
  const evidence = payload.items.flatMap(item => [item.left, item.right].flatMap(side => [...side.evidence_ids, ...side.quality_record_ids]))
  const reviewed = selected.some(row => row.action === 'review' && payload.candidate_item_ids.includes(row.item_id))
  return result(dataset, { ...scope }, payload, reviewed ? 'needs_review' : payload.paired_item_ids.length ? 'ok' : 'insufficient_data', evidence, [
    '可配对仅表示同一学生在两个节点对同一道题均有有效评分记录；班级按逐题共同学生配对，不把不同学生混作纵向样本。',
    '两个节点的教学范围、作答条件与重复练习影响未被控制，因此不计算跨节点总分差，不将可配对观察解释为学习进步或教学效果。',
    '缺记录、待评分、未作答、未教范围与质量隔离分别列出；真实零分保留，语义复核依计分标记处理并附复核依据。',
  ])
}

/** Per-item means and sample sizes retained for recomputing the common-item result. */
export interface ComparedItem {
  item_id: string
  max_score: number
  left_count: number
  right_count: number
  left_record_count: number
  right_record_count: number
  left_mean_rate: number
  right_mean_rate: number
  weight: number
  left_evidence_ids: string[]
  right_evidence_ids: string[]
}

/** Two sides use identical items and maximum-score weights; differences are left minus right. */
export interface ComparisonPayload {
  kind: 'students' | 'student_peers' | 'classes'
  left_label: string
  right_label: string
  node_id: string
  candidate_item_ids: string[]
  shared_item_ids: string[]
  excluded_items: Array<{ item_id: string; reason_codes: string[] }>
  weight_mode: 'item_max_score'
  within_item_aggregation: 'mean_student_rate'
  exclude_self: boolean
  comparable: boolean
  reason_codes: string[]
  items: ComparedItem[]
  left_rate: number | null
  right_rate: number | null
  delta_rate: number | null
  delta_percentage_points: number | null
  quality_record_ids: string[]
}

/** A group summary describes observed evidence without treating nonparticipants as zeroes. */
export interface ClassAnalysisPayload extends ScoreSummary {
  class_id: string
  node_id: string
  student_count: number
  observed_student_count: number
  scored_student_count: number
  review_count: number
  excluded_count: number
  grading_status_counts: Record<string, number>
  topics: Array<ScoreSummary & { topic_id: string; taught: boolean; observed_student_count: number }>
  indicators: Array<ScoreSummary & { indicator_id: string; topic_id: string; observed_student_count: number }>
  coverage: { available_item_count: number; observed_item_count: number; valid_item_count: number; item_coverage_rate: number | null }
  student_summaries: Array<ScoreSummary & { student_id: string; review_count: number }>
  quality_record_ids: string[]
  items: Array<ScoreSummary & {
    item_id: string
    indicator_id: string
    observed_student_count: number
    scored_student_count: number
    score_distribution: Array<{ score: number; record_count: number }>
    scoring_points: Array<ScoreSummary & { point_id: string; max_score: number; scored_student_count: number; score_distribution: Array<{ score: number; record_count: number }> }>
  }>
  needs_observation: Array<{ student_id: string; indicator_ids: string[] }>
}

const LIMITATIONS = [
  '比较仅限同一节点的共同有效题集，缺少有效样本不补零，允许计分的真实零分保留。',
  '题目先按学生平均得分率，再按题目满分加权；各侧使用相同题目与权重。差值单位为比例，百分点字段已乘100。',
  '结果描述已提供记录，不代表全科能力或教学效果，不能将不同节点的分数差直接解释为进步。',
]

function result<T>(dataset: PreparedDataset, scope: Record<string, string | boolean>, payload: T,
  status: ResultEnvelope<T>['result_status'], evidence: string[] = [], limitations: string[] = []): ResultEnvelope<T> {
  return {
    schema_version: dataset.schema_version, dataset_version: dataset.dataset_version,
    policy_version: dataset.policy_version, producer_version: dataset.producer_version, source_mode: dataset.source_mode,
    scope, result_status: status, payload, evidence_ids: [...new Set(evidence)].sort(), limitations,
  }
}

function splitIds(value: string | undefined): string[] {
  return [...new Set(value?.split(/[、,，;；\s]+/u).filter(Boolean) ?? [])].sort()
}

function classMembers(dataset: PreparedDataset, classId: string): string[] {
  return dataset.input.students.filter(row => row['模拟班级编号'] === classId).map(row => row['学生编号']!).sort()
}

function summarize(records: EvidenceRecord[]): ScoreSummary {
  const valid = records.filter(row => row.include_in_statistics)
  // 有效值（corrected 优先，原文保留于 original_values）——与数据模块差异化处置一致
  const effectiveScore = (row: typeof valid[number]) => row.corrected?.score ?? row.score
  const effectiveMax = (row: typeof valid[number]) => row.corrected?.max_score ?? row.max_score
  const earned = valid.length ? valid.reduce((sum, row) => sum + effectiveScore(row)!, 0) : null
  const possible = valid.length ? valid.reduce((sum, row) => sum + effectiveMax(row)!, 0) : null
  return {
    record_count: records.length, valid_record_count: valid.length,
    earned_score: earned, possible_score: possible,
    score_rate: earned !== null && possible !== null && possible > 0 ? earned / possible : null,
    evidence_ids: valid.map(row => row.record_id).sort(),
  }
}

function meanForItem(records: EvidenceRecord[]): { mean: number; studentCount: number } {
  const rates = new Map<string, number[]>()
  for (const row of records) {
    const studentRates = rates.get(row.student_id) ?? []
    studentRates.push((row.corrected?.score ?? row.score)! / (row.corrected?.max_score ?? row.max_score)!)
    rates.set(row.student_id, studentRates)
  }
  const studentMeans = [...rates.values()].map(values => values.reduce((sum, value) => sum + value, 0) / values.length)
  return { mean: studentMeans.reduce((sum, value) => sum + value, 0) / studentMeans.length, studentCount: studentMeans.length }
}

function emptyComparison(kind: ComparisonPayload['kind'], left: string, right: string, node: string, excludeSelf: boolean): ComparisonPayload {
  return {
    kind, left_label: left, right_label: right, node_id: node,
    candidate_item_ids: [], shared_item_ids: [], excluded_items: [], weight_mode: 'item_max_score',
    within_item_aggregation: 'mean_student_rate', exclude_self: excludeSelf,
    comparable: false, reason_codes: [], items: [], left_rate: null, right_rate: null,
    delta_rate: null, delta_percentage_points: null, quality_record_ids: [],
  }
}

function compare(dataset: PreparedDataset, payload: ComparisonPayload, scope: Record<string, string | boolean>,
  leftMembers: string[], rightMembers: string[], itemIds: string[] | undefined, validationErrors: string[]): ResultEnvelope<ComparisonPayload> {
  const node = dataset.input.nodes.find(row => row['节点编号'] === payload.node_id)
  if (!node) validationErrors.push('unknown_node')
  const itemMap = new Map(dataset.input.items.filter(row => row['材料类型'] === '题目').map(row => [row['材料编号']!, row]))
  const allowed = splitIds(node?.['可用题目编号'])
  const candidates = itemIds === undefined ? allowed : [...new Set(itemIds)].sort()
  for (const id of candidates) {
    if (!itemMap.has(id)) validationErrors.push('unknown_item')
    else if (node && !allowed.includes(id)) validationErrors.push('item_not_allowed_in_node')
  }
  payload.candidate_item_ids = candidates
  if (validationErrors.length) {
    payload.reason_codes = [...new Set(validationErrors)].sort()
    return result(dataset, scope, payload, 'error', [], ['请求包含未知或超出指定节点范围的编号，未忽略筛选条件。'])
  }
  const leftSet = new Set(leftMembers)
  const rightSet = new Set(rightMembers)
  const candidateSet = new Set(candidates)
  const selected = dataset.current.filter(row => row.node_id === payload.node_id && candidateSet.has(row.item_id)
    && (leftSet.has(row.student_id) || rightSet.has(row.student_id)))
  const reviewed = selected.filter(row => row.action === 'review')
  payload.quality_record_ids = reviewed.map(row => row.record_id).sort()
  const valid = selected.filter(row => row.include_in_statistics)
  for (const id of candidates) {
    const leftRows = valid.filter(row => row.item_id === id && leftSet.has(row.student_id))
    const rightRows = valid.filter(row => row.item_id === id && rightSet.has(row.student_id))
    const reasons = [...(leftRows.length ? [] : ['no_valid_left_sample']), ...(rightRows.length ? [] : ['no_valid_right_sample'])]
    if (reasons.length) {
      payload.excluded_items.push({ item_id: id, reason_codes: reasons })
      continue
    }
    const left = meanForItem(leftRows)
    const right = meanForItem(rightRows)
    payload.items.push({
      item_id: id, max_score: Number(itemMap.get(id)!['满分']), left_count: left.studentCount, right_count: right.studentCount,
      left_record_count: leftRows.length, right_record_count: rightRows.length,
      left_mean_rate: left.mean, right_mean_rate: right.mean, weight: 0,
      left_evidence_ids: leftRows.map(row => row.record_id).sort(), right_evidence_ids: rightRows.map(row => row.record_id).sort(),
    })
  }
  payload.shared_item_ids = payload.items.map(item => item.item_id)
  const totalMaximum = payload.items.reduce((sum, item) => sum + item.max_score, 0)
  if (!payload.items.length || !Number.isFinite(totalMaximum) || totalMaximum <= 0) {
    payload.reason_codes.push('no_shared_valid_items')
  } else {
    for (const item of payload.items) item.weight = item.max_score / totalMaximum
    payload.comparable = true
    payload.left_rate = payload.items.reduce((sum, item) => sum + item.left_mean_rate * item.weight, 0)
    payload.right_rate = payload.items.reduce((sum, item) => sum + item.right_mean_rate * item.weight, 0)
    payload.delta_rate = payload.left_rate - payload.right_rate
    payload.delta_percentage_points = payload.delta_rate * 100
  }
  const evidence = payload.items.flatMap(item => [...item.left_evidence_ids, ...item.right_evidence_ids])
  const limitations = [...LIMITATIONS]
  if (payload.excluded_items.length) limitations.push('一侧没有有效样本的题目已从双方共同题集移除，详见excluded_items。')
  if (reviewed.length) {
    const used = new Set(evidence)
    const participating = reviewed.filter(row => used.has(row.record_id)).length
    const blocked = reviewed.filter(row => !row.include_in_statistics).length
    const unshared = reviewed.length - participating - blocked
    limitations.push(`本次范围内有 ${reviewed.length} 条待复核记录：${participating} 条按有效分值参与比较，${blocked} 条未满足计分条件被排除，${unshared} 条可计分但不在共同有效题集中。`)
  }
  return result(dataset, scope, payload, payload.quality_record_ids.length ? 'needs_review' : payload.comparable ? 'ok' : 'insufficient_data', evidence, limitations)
}

/**
 * Compare two students on their shared valid items in one test.
 * @param dataset - Prepared dataset with quality-isolated current evidence.
 * @param scope - Both student identifiers, node, and optional candidate items.
 * @returns Recomputable same-item weighted rates, or an explicit scope error.
 */
export function compare_students(dataset: PreparedDataset, scope: StudentComparisonScope): ResultEnvelope<ComparisonPayload> {
  const errors: string[] = []
  const known = new Set(dataset.input.students.map(row => row['学生编号']))
  if (!known.has(scope.left_student_id) || !known.has(scope.right_student_id)) errors.push('unknown_student')
  const payload = emptyComparison('students', scope.left_student_id, scope.right_student_id, scope.node_id, false)
  return compare(dataset, payload, { left_student_id: scope.left_student_id, right_student_id: scope.right_student_id, node_id: scope.node_id },
    [scope.left_student_id], [scope.right_student_id], scope.item_ids, errors)
}

/**
 * Compare a student with a class peer group after excluding that student.
 * @param dataset - Prepared dataset; only valid current records enter means.
 * @param scope - Student, node, optional peer class, and optional items.
 * @returns Common-item weighted rates with self exclusion and sample evidence.
 */
export function compare_with_peers(dataset: PreparedDataset, scope: PeerComparisonScope): ResultEnvelope<ComparisonPayload> {
  const student = dataset.input.students.find(row => row['学生编号'] === scope.student_id)
  const classId = scope.class_id ?? student?.['模拟班级编号'] ?? ''
  const members = classMembers(dataset, classId)
  const errors = [...(student ? [] : ['unknown_student']), ...(members.length ? [] : ['unknown_class'])]
  const payload = emptyComparison('student_peers', scope.student_id, classId, scope.node_id, true)
  return compare(dataset, payload, { student_id: scope.student_id, class_id: classId, node_id: scope.node_id, exclude_self: true },
    [scope.student_id], members.filter(id => id !== scope.student_id), scope.item_ids, errors)
}

/**
 * Compare two classes using identical shared items and maximum-score weights.
 * @param dataset - Prepared dataset with explicit student-to-class membership.
 * @param scope - Both classes, one node, and optional candidate items.
 * @returns Item means and a left-minus-right difference in rates and percentage points.
 */
export function compare_classes(dataset: PreparedDataset, scope: ClassComparisonScope): ResultEnvelope<ComparisonPayload> {
  const left = classMembers(dataset, scope.left_class_id)
  const right = classMembers(dataset, scope.right_class_id)
  const errors = left.length && right.length ? [] : ['unknown_class']
  const payload = emptyComparison('classes', scope.left_class_id, scope.right_class_id, scope.node_id, false)
  return compare(dataset, payload, { left_class_id: scope.left_class_id, right_class_id: scope.right_class_id, node_id: scope.node_id },
    left, right, scope.item_ids, errors)
}

function observedStudents(records: EvidenceRecord[]): number {
  return new Set(records.map(row => row.student_id)).size
}

function emptyClass(scope: ClassScope): ClassAnalysisPayload {
  return {
    ...summarize([]), ...scope, student_count: 0, observed_student_count: 0, scored_student_count: 0,
    review_count: 0, excluded_count: 0, grading_status_counts: {}, topics: [], indicators: [],
    coverage: { available_item_count: 0, observed_item_count: 0, valid_item_count: 0, item_coverage_rate: null },
    student_summaries: [], quality_record_ids: [], items: [], needs_observation: [],
  }
}

/**
 * Summarize one class's observed evidence, coverage, and review queue in one test.
 * @param dataset - Prepared dataset with historical revisions already resolved.
 * @param scope - Class and node identifiers from the input tables.
 * @returns Descriptive observed-score summaries, without imputing missing students as zero.
 */
export function analyze_class(dataset: PreparedDataset, scope: ClassScope): ResultEnvelope<ClassAnalysisPayload> {
  const members = classMembers(dataset, scope.class_id)
  const node = dataset.input.nodes.find(row => row['节点编号'] === scope.node_id)
  if (!members.length || !node) return result(dataset, { ...scope }, emptyClass(scope), 'error', [], ['班级或节点编号不在输入名单中。'])
  const memberSet = new Set(members)
  const records = dataset.current.filter(row => row.node_id === scope.node_id && memberSet.has(row.student_id))
  const valid = records.filter(row => row.include_in_statistics)
  const items = new Map(dataset.input.items.map(row => [row['材料编号'], row]))
  const taught = new Set(splitIds(node['已教及测量主题']))
  const topicIds = [...new Set(dataset.input.requirements.map(row => row['主题编号']!))].sort()
  const allowed = splitIds(node['可用题目编号'])
  const validItems = new Set(valid.map(row => row.item_id))
  const statuses = new Map<string, number>()
  for (const row of records) statuses.set(row.grading_status, (statuses.get(row.grading_status) ?? 0) + 1)
  const payload: ClassAnalysisPayload = {
    ...summarize(records), ...scope, student_count: members.length,
    observed_student_count: observedStudents(records), scored_student_count: observedStudents(valid),
    review_count: records.filter(row => row.action === 'review').length,
    excluded_count: records.filter(row => row.action === 'exclude').length,
    grading_status_counts: Object.fromEntries([...statuses.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
    topics: topicIds.map(topicId => {
      const selected = records.filter(row => (row.corrected?.topic_id ?? row.topic_id) === topicId)
      return { ...summarize(selected), topic_id: topicId, taught: taught.has(topicId), observed_student_count: observedStudents(selected) }
    }),
    indicators: dataset.input.requirements.map(requirement => {
      const indicatorId = requirement['指标编号']!
      const selected = records.filter(row => items.get(row.item_id)?.['指标编号'] === indicatorId)
      return { ...summarize(selected), indicator_id: indicatorId, topic_id: requirement['主题编号']!, observed_student_count: observedStudents(selected) }
    }).sort((a, b) => a.indicator_id < b.indicator_id ? -1 : a.indicator_id > b.indicator_id ? 1 : 0),
    coverage: {
      available_item_count: allowed.length, observed_item_count: new Set(records.map(row => row.item_id)).size,
      valid_item_count: validItems.size, item_coverage_rate: allowed.length ? validItems.size / allowed.length : null,
    },
    student_summaries: members.map(id => {
      const selected = records.filter(row => row.student_id === id)
      return { ...summarize(selected), student_id: id, review_count: selected.filter(row => row.action === 'review').length }
    }),
    quality_record_ids: records.filter(row => row.action === 'review').map(row => row.record_id).sort(),
    items: allowed.filter(id => items.get(id)?.['材料类型'] === '题目').map(id => {
      const selected = records.filter(row => row.item_id === id)
      const scored = selected.filter(row => row.include_in_statistics)
      const item = items.get(id)!
      const scoringPoints = (item['评分点'] ?? '').split(/\r?\n/u).flatMap(line => {
        const match = /^(\S+)\s+.+?\s+(\d+(?:\.\d+)?)\s*分\s*$/u.exec(line.trim())
        if (!match) return []
        const pointId = match[1]!, maximum = Number(match[2])
        const samples = scored.flatMap(record => {
          const parts = record.point_scores.split(/[；;\n]/u).map(part => part.trim().split(/\s*=\s*/u))
          const text = parts.find(part => part[0] === pointId)?.[1]
          return text === undefined ? [] : [{ record, score: Number(text) }]
        })
        const earned = samples.length ? samples.reduce((sum, sample) => sum + sample.score, 0) : null
        const possible = samples.length ? samples.length * maximum : null
        return [{ point_id: pointId, max_score: maximum, record_count: samples.length, valid_record_count: samples.length,
          scored_student_count: observedStudents(samples.map(sample => sample.record)),
          earned_score: earned, possible_score: possible,
          score_rate: earned !== null && possible !== null && possible > 0 ? earned / possible : null,
          score_distribution: distribution(samples.map(sample => sample.score)), evidence_ids: samples.map(sample => sample.record.record_id).sort() }]
      })
      return { ...summarize(selected), item_id: id, indicator_id: item['指标编号']!,
        observed_student_count: observedStudents(selected), scored_student_count: observedStudents(scored),
        score_distribution: distribution(scored.map(row => (row.corrected?.score ?? row.score)!)), scoring_points: scoringPoints }
    }),
    needs_observation: members.map(studentId => ({ student_id: studentId,
      indicator_ids: dataset.input.requirements.filter(requirement => taught.has(requirement['主题编号']!)
        && allowed.some(id => items.get(id)?.['指标编号'] === requirement['指标编号'])
        && !valid.some(row => row.student_id === studentId && items.get(row.item_id)?.['指标编号'] === requirement['指标编号']))
        .map(requirement => requirement['指标编号']!).sort(),
    })).filter(row => row.indicator_ids.length > 0),
  }
  return result(dataset, { ...scope }, payload, payload.review_count ? 'needs_review' : valid.length ? 'ok' : 'insufficient_data',
    records.map(row => row.record_id), ['分数汇总仅描述有效作答样本，不将缺少作答的学生或题目计为零分。',
      '班级总得分率受作答覆盖影响；班级间比较应使用compare_classes的共同有效题集。',
      '未教学主题保持独立标识，不能仅因没有记录列为班级薄弱项。',
      '逐题与评分点分布按有效作答事件计数，同时列出不同学生人数；分布不是共同题集加权均值。'])
}

function distribution(scores: number[]): Array<{ score: number; record_count: number }> {
  const counts = new Map<number, number>()
  for (const score of scores) counts.set(score, (counts.get(score) ?? 0) + 1)
  return [...counts].sort(([left], [right]) => left - right).map(([score, record_count]) => ({ score, record_count }))
}
