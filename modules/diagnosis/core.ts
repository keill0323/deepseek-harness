import { get_student_stats } from '../data/core.ts'
import type { CsvRow, EvidenceRecord, PreparedDataset, ResultEnvelope, StudentScope, StudentStats } from '../data/types.ts'
import type { CurriculumEntry, CurriculumPayload, DiagnosisPayload, Finding } from './types.ts'
import { analyze_steps } from './steps.ts'

export type { CurriculumEntry, CurriculumMaterial, CurriculumPayload, CurriculumTopic, DiagnosisPayload, Finding } from './types.ts'

/** Same-snapshot results that one analysis run can reuse without global caches. */
export interface DiagnosisContext {
  statistics?: ResultEnvelope<StudentStats>
  curriculum?: ResultEnvelope<CurriculumPayload>
}

function matchingVersion(dataset: PreparedDataset, prior: ResultEnvelope<unknown>): boolean {
  return prior.schema_version === dataset.schema_version && prior.dataset_version === dataset.dataset_version
    && prior.policy_version === dataset.policy_version && prior.producer_version === dataset.producer_version
    && prior.source_mode === dataset.source_mode
}

function result<T>(dataset: PreparedDataset, scope: Record<string, string>, payload: T, status: ResultEnvelope<T>['result_status'], evidence: string[] = [], limitations: string[] = []): ResultEnvelope<T> {
  return { schema_version: dataset.schema_version, dataset_version: dataset.dataset_version, policy_version: dataset.policy_version, producer_version: dataset.producer_version, source_mode: dataset.source_mode, scope, result_status: status, payload, evidence_ids: [...new Set(evidence)].sort(), limitations }
}

function splitIds(value: string | undefined): string[] {
  return value?.split(/[、,，;；\s]+/u).filter(Boolean) ?? []
}

function textbookMatches(name: string, content: string): boolean {
  return (/代数式|整式/u.test(name) && /代数式|整式/u.test(content))
    || (/不等式/u.test(name) && /不等式/u.test(content))
    || (/方程/u.test(name) && /方程/u.test(content))
}

function entryFor(dataset: PreparedDataset, requirement: CsvRow): CurriculumEntry {
  const topic = requirement['主题编号'] ?? ''
  const indicator = requirement['指标编号'] ?? ''
  const name = requirement['主题'] ?? topic
  const materials = dataset.input.items.filter(item => item['材料类型'] !== '题目' && (
    item['主题编号'] === topic || splitIds(item['指标编号']).includes(indicator)
    || (item['材料类型'] === '教材' && textbookMatches(name, item['题干或内容'] ?? ''))
  )).map(item => ({ material_id: item['材料编号']!, type: item['材料类型'] ?? '', title: item['题干或内容'] ?? '', source_file: item['来源或资料文件'] || null }))
  const location = requirement['课标文件页／正文页']?.trim() ?? ''
  const pages = /^(\d+)\s*[／/]\s*(\d+)$/u.exec(location)
  return {
    indicator_id: indicator, topic_id: topic, topic_name: name, objective: requirement['主题目标'] ?? '',
    indicator_description: requirement['观察指标'] ?? '',
    material_ids: materials.map(material => material.material_id).sort(),
    question_ids: dataset.input.items.filter(item => item['材料类型'] === '题目' && item['主题编号'] === topic && splitIds(item['指标编号']).includes(indicator)).map(item => item['材料编号']!).sort(),
    textbook_pages: requirement['教材正文页'] || null,
    course_standard: { file: '课程标准_2022.pdf', file_page: pages ? Number(pages[1]) : null, printed_page: pages ? Number(pages[2]) : null, index_reference: requirement['课标整理编号'] || null, verification: 'input_index' },
    materials,
  }
}

/**
 * Index supplied curriculum requirements, questions, and related learning resources.
 * @param dataset - Prepared source snapshot containing requirements and materials.
 * @param query - Optional topic identifier; unknown identifiers are rejected.
 * @returns Traceable topic and indicator entries; source-index pages do not imply PDF verification.
 */
export function get_curriculum(dataset: PreparedDataset, query: { topic_id?: string } = {}): ResultEnvelope<CurriculumPayload> {
  const allEntries = dataset.input.requirements.map(requirement => entryFor(dataset, requirement))
  if (query.topic_id !== undefined && !allEntries.some(entry => entry.topic_id === query.topic_id)) {
    return result(dataset, { topic_id: query.topic_id }, { topics: [], entries: [], links: [] }, 'error', [], ['指定主题不在输入课程要求表中。'])
  }
  const entries = allEntries.filter(entry => query.topic_id === undefined || entry.topic_id === query.topic_id)
  const topics = [...new Set(entries.map(entry => entry.topic_id))].sort().map(topic => {
    const grouped = entries.filter(entry => entry.topic_id === topic)
    return { topic_id: topic, name: grouped[0]!.topic_name, objective: grouped[0]!.objective, indicator_ids: grouped.map(entry => entry.indicator_id).sort(), material_ids: [...new Set(grouped.flatMap(entry => entry.material_ids))].sort() }
  })
  const algebra = topics.find(topic => /代数式|整式/u.test(topic.name))
  const links: CurriculumPayload['links'] = algebra ? topics.filter(topic => topic.topic_id !== algebra.topic_id && /方程|不等式/u.test(topic.name)).map(topic => ({ from_topic_id: algebra.topic_id, to_topic_id: topic.topic_id, relation: 'supports', basis: '教学组织建议：式的表示与化简可支持后续方程或不等式求解，具体顺序由教师结合任务调整。' })) : []
  return result(dataset, query.topic_id === undefined ? {} : { topic_id: query.topic_id }, { topics, entries, links }, entries.length > 0 ? 'ok' : 'insufficient_data', [], ['页码及页段取自输入课程索引；本函数不读取或声称核验了PDF页面。', '教材主题关系依据材料标题匹配，引用具体章节或练习时仍需核对正文。'])
}

function points(record: EvidenceRecord): Map<string, number> {
  const parsed = new Map<string, number>()
  for (const pair of record.point_scores.split(/[；;\n]/u)) {
    const match = /^\s*([^\s=]+)\s*=\s*(\d+(?:\.\d+)?)\s*$/u.exec(pair)
    if (match) parsed.set(match[1]!, Number(match[2]))
  }
  return parsed
}

function baseFinding(entry: CurriculumEntry | undefined, type: string, suffix: string): Pick<Finding, 'finding_id' | 'finding_type' | 'topic_id' | 'indicator_id' | 'material_ids'> {
  return { finding_id: `${type}:${suffix}`, finding_type: type, topic_id: entry?.topic_id ?? null, indicator_id: entry?.indicator_id ?? null, material_ids: entry?.material_ids ?? [] }
}

/**
 * Diagnose observed work without turning missing records or disputed scores into a weakness.
 * @param dataset - Prepared snapshot whose statistical eligibility is already determined.
 * @param scope - Student and one explicit measurement node.
 * @param context - Optional full curriculum and scoped statistics already computed in this analysis run.
 * @returns Facts, bounded interpretations, missing observations, and independent scoring-review items.
 */
export function diagnose_student(dataset: PreparedDataset, scope: StudentScope, context: DiagnosisContext = {}): ResultEnvelope<DiagnosisPayload> {
  const stats = context.statistics ?? get_student_stats(dataset, scope)
  const indexed = context.curriculum ?? get_curriculum(dataset)
  const curriculum = indexed.payload.entries
  const payload: DiagnosisPayload = { student_id: scope.student_id, node_id: scope.node_id, stats: stats.payload, findings: [], covered_indicator_ids: [], unobserved_indicator_ids: [], curriculum }
  if (!matchingVersion(dataset, stats) || !matchingVersion(dataset, indexed)
    || stats.scope['student_id'] !== scope.student_id || stats.scope['node_id'] !== scope.node_id
    || stats.payload.student_id !== scope.student_id || stats.payload.node_id !== scope.node_id
    || indexed.scope['topic_id'] !== undefined || indexed.result_status === 'error') {
    return result(dataset, { ...scope }, { ...payload, stats: get_student_stats(dataset, scope).payload, curriculum: [], findings: [] }, 'error', [], ['复用结果的版本、对象范围或课程范围不同，未拼接诊断。'])
  }
  if (stats.result_status === 'error') return result(dataset, { ...scope }, payload, 'error', [], stats.limitations)
  const records = dataset.current.filter(record => record.student_id === scope.student_id && record.node_id === scope.node_id)
  const items = new Map(dataset.input.items.map(item => [item['材料编号'], item]))
  const node = dataset.input.nodes.find(row => row['节点编号'] === scope.node_id)!
  const allowed = new Set(splitIds(node['可用题目编号']))
  const availableIndicators = new Set(dataset.input.items.filter(item => item['材料类型'] === '题目' && allowed.has(item['材料编号'] ?? '')).flatMap(item => splitIds(item['指标编号'])))
  for (const indicator of stats.payload.indicators) {
    const entry = curriculum.find(value => value.indicator_id === indicator.indicator_id)
    if (indicator.valid_record_count > 0) {
      payload.covered_indicator_ids.push(indicator.indicator_id)
      payload.findings.push({ ...baseFinding(entry, 'observed_performance', indicator.indicator_id), category: 'fact', title: '已观察到的指标表现', description: `当前节点该指标有${indicator.valid_record_count}条有效记录，合计${indicator.earned_score}/${indicator.possible_score}分；结论仅限这些已观察题目。`, item_id: null, evidence_ids: indicator.evidence_ids, step_refs: [], point_refs: [] })
    } else if (availableIndicators.has(indicator.indicator_id)) {
      payload.unobserved_indicator_ids.push(indicator.indicator_id)
      payload.findings.push({ ...baseFinding(entry, 'unobserved_indicator', indicator.indicator_id), category: 'insufficient_data', title: '该指标尚缺有效观察', description: '当前节点没有通过质量检查的可计分记录，不能推断为答错或未掌握；可安排补充观察。', item_id: null, evidence_ids: [], step_refs: [], point_refs: [] })
    }
  }
  for (const record of records) {
    const item = items.get(record.item_id)
    const entry = curriculum.find(value => value.indicator_id === item?.['指标编号'])
    if (record.action === 'review') {
      payload.findings.push({ ...baseFinding(entry, 'scoring_review', record.record_id), category: 'scoring_review', title: '记录需先复核', description: record.quality_issues.map(issue => issue.message).join('；'), item_id: record.item_id, evidence_ids: [record.record_id], step_refs: [], point_refs: [] })
      continue
    }
    if (!record.include_in_statistics) continue
    const analysis = analyze_steps(record.steps, item?.['题干或内容'] ?? '')
    if (analysis.status === 'error' && analysis.error) {
      const error = analysis.error
      const rubric = (item?.['评分点'] ?? '').split(/\r?\n/u)
      const rootPoint = error.finding_type === 'inequality_direction'
        ? rubric.find(line => /负数/u.test(line) && /反向|方向/u.test(line))?.split(/\s/u)[0] : undefined
      const rootScore = rootPoint ? points(record).get(rootPoint) : undefined
      const scoringConflict = (rootScore !== undefined && rootScore > 0) || record.score === record.max_score
      payload.findings.push({ ...baseFinding(entry, error.finding_type, record.record_id), category: scoringConflict ? 'scoring_review' : 'fact', title: scoringConflict ? '过程与评分需复核' : error.title, description: `${error.description}${scoringConflict ? ' 但记录获得满分或与该错误明确对应的评分点仍给分，需先核对过程和评分，不据此断言学生薄弱。' : ''}`, item_id: record.item_id, evidence_ids: [record.record_id], step_refs: error.step_refs, point_refs: rootPoint ? [rootPoint] : [], })
      continue
    }
    if (analysis.status === 'unsupported') {
      payload.findings.push({ ...baseFinding(entry, 'step_analysis_unavailable', record.record_id), category: 'inference', title: '自动步骤核验暂不支持此过程', description: `${analysis.reason} 此限制属于自动诊断能力，不表示缺少作答记录或学生未掌握；保留已有评分，请教师核对过程。`, item_id: record.item_id, evidence_ids: [record.record_id], step_refs: [], point_refs: [] })
    }
    if (record.score! < record.max_score!) {
      const missingPoints = [...points(record)].filter(([, score]) => score === 0).map(([id]) => id)
      payload.findings.push({ ...baseFinding(entry, 'partial_score', record.record_id), category: 'fact', title: '该题存在未得分部分', description: record.steps.trim() === '' ? '现有评分显示该题未得满分，但未提供解答过程，不能据此编造具体步骤错误。' : '现有评分显示该题未得满分；自动规则尚不能定位可靠的具体变形错误，需对照题目评分点查看过程。', item_id: record.item_id, evidence_ids: [record.record_id], step_refs: [], point_refs: missingPoints })
    }
  }
  const hasReview = payload.findings.some(finding => finding.category === 'scoring_review')
  const status = hasReview ? 'needs_review' : stats.result_status
  const limitations = [...stats.limitations, '步骤核验仅检查支持语法中的整式恒等及线性方程、不等式的相邻变形；不证明作答完整、建模正确或知识掌握。未支持过程单列为自动核验能力限制，不当作学生证据不足。', '课程页码来自输入索引；需结合实际PDF页面与教材正文核验引用。']
  if (hasReview) limitations.push('评分复核项不用于形成学生薄弱点；已有统计中的明确过程评分冲突也需由教师确认。')
  return result(dataset, { ...scope }, payload, status, records.map(record => record.record_id), limitations)
}
