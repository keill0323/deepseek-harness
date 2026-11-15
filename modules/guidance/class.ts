import { analyze_class } from '../comparison/core.ts'
import type { ClassScope } from '../comparison/core.ts'
import { effectiveScore, effectiveMax } from '../data/core.ts'
import type { PreparedDataset, ResultEnvelope } from '../data/types.ts'
import { get_curriculum } from '../diagnosis/core.ts'
import { make_result } from '../shared/result.ts'
import { guidance_for } from './knowledge.ts'

/** A teacher action grounded in one indicator and an explicitly named student group. */
export interface ClassRecommendation {
  kind: 'targeted_practice' | 'extension' | 'observation'
  indicator_id: string
  topic_id: string
  student_ids: string[]
  item_ids: string[]
  material_ids: string[]
  evidence_ids: string[]
  goal: string
  rationale: string
  steps: string[]
  observation: string
  adjust_when: string
}

/** Same-node group suggestions; disputed scores never become teaching diagnoses. */
export interface ClassPlanPayload extends ClassScope {
  engine: 'local_rules'
  analysis: ReturnType<typeof analyze_class>['payload']
  recommendations: ClassRecommendation[]
  review_record_ids: string[]
}

/**
 * Turn class evidence into support, extension and observation groups without ranking students.
 * @param dataset - One prepared source snapshot.
 * @param scope - A class and an explicitly selected measurement node.
 * @param analysis - Optional class analysis from the same versions and scope.
 * @returns Concrete teacher actions with source records, available items and adjustment conditions.
 */
export function build_class_plan(dataset: PreparedDataset, scope: ClassScope,
  analysis: ReturnType<typeof analyze_class> = analyze_class(dataset, scope),
): ResultEnvelope<ClassPlanPayload> {
  const matches = (['schema_version', 'dataset_version', 'policy_version', 'producer_version', 'source_mode', 'generated_at'] as const)
    .every(key => analysis[key] === dataset[key]) && analysis.scope['class_id'] === scope.class_id
    && analysis.scope['node_id'] === scope.node_id && analysis.payload.class_id === scope.class_id && analysis.payload.node_id === scope.node_id
  const own = matches ? analysis : analyze_class(dataset, scope)
  const payload: ClassPlanPayload = { ...scope, engine: 'local_rules', analysis: own.payload, recommendations: [], review_record_ids: own.payload.quality_record_ids }
  if (!matches || own.result_status === 'error') return make_result(dataset, { ...scope }, payload, 'error', [], ['班级分析的版本、范围或状态无效，未生成教学建议。'])
  const node = dataset.input.nodes.find(row => row['节点编号'] === scope.node_id)!
  const taught = new Set(node['已教及测量主题']?.split(/[、,，;；\s]+/u))
  const allowed = new Set(node['可用题目编号']?.split(/[、,，;；\s]+/u))
  const members = own.payload.student_summaries.map(student => student.student_id)
  const records = dataset.current.filter(record => record.node_id === scope.node_id && members.includes(record.student_id))
  const usable = records.filter(record => record.include_in_statistics && record.action !== 'review')
  const curriculum = get_curriculum(dataset)
  for (const entry of curriculum.payload.entries) {
    if (!taught.has(entry.topic_id)) continue
    const items = entry.question_ids.filter(id => allowed.has(id))
    if (!items.length) continue
    const groups: Record<ClassRecommendation['kind'], string[]> = { targeted_practice: [], extension: [], observation: [] }
    for (const student of members) {
      const selected = usable.filter(record => record.student_id === student && items.includes(record.item_id))
      const kind = selected.length === 0 ? 'observation' : selected.some(record => effectiveScore(record)! < effectiveMax(record)!) ? 'targeted_practice' : 'extension'
      groups[kind].push(student)
    }
    for (const kind of ['targeted_practice', 'observation', 'extension'] as const) {
      const students = groups[kind]
      if (!students.length) continue
      const evidence = usable.filter(record => students.includes(record.student_id) && items.includes(record.item_id))
      const guidance = guidance_for(entry.indicator_id)
      const label = entry.indicator_description || entry.indicator_id
      payload.recommendations.push({ kind, indicator_id: entry.indicator_id, topic_id: entry.topic_id,
        student_ids: students, item_ids: items, material_ids: entry.material_ids,
        evidence_ids: evidence.map(record => record.record_id).sort(),
        goal: `${kind === 'targeted_practice' ? '核对失分并分步练习' : kind === 'extension' ? '解释与迁移' : '补充观察'}：${label}`,
        rationale: kind === 'targeted_practice' ? '该组已有有效记录出现失分；先核对具体过程，不能仅凭评分点缺分认定共同根因。'
          : kind === 'extension' ? '该组在已有有效样本中表现较好；结论仅限这些题目，不推断稳定掌握。'
            : '该组在本指标缺少可用于教学判断的评分证据；先核对待评分或复核项，缺记录不判定为不会。',
        steps: kind === 'targeted_practice' ? ['核对所列作答证据，区分独立错误与连带结果。', '使用所列材料和同指标题目分步练习，每次仅给一级提示。', '收集独立作答及实际帮助等级后重新运行诊断。']
          : kind === 'extension' ? ['请学生解释已完成题目的关键依据。', '从所列题目选择尚未尝试的同范围任务；没有新题时改做解释与检验。', '保留变式作答，核对能否独立解释与检查。']
            : ['先处理待评分与复核记录，不重复安排尚待评分的题。', '从所列节点允许题目选择适合的新观察任务并保留步骤。', '记录提示等级，取得评分证据后再分组。'],
        observation: guidance.observation.join('；'), adjust_when: guidance.adjustment.join(''),
      })
    }
  }
  return make_result(dataset, { ...scope }, payload, own.result_status,
    [...new Set(payload.recommendations.flatMap(recommendation => recommendation.evidence_ids))],
    ['分组与调整条件为团队实施规则，不是官方阈值或教学效果结论。', '待复核评分保留统计口径，但不作为补弱或成功建议依据；未教学指标不生成建议。'])
}
