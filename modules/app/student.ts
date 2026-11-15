import type { ResultEnvelope } from '../data/types.ts'
import type { LearningActivity, LearningPlanPayload } from '../guidance/types.ts'
import type { WorkspacePayload } from './core.ts'

/** The independent student document contains only one assigned practice pack. */
export const STUDENT_PRACTICE_FORMAT = 'study-student-v1'

export interface StudentPracticeQuestion {
  item_id: string
  type: string
  prompt: string
  options: string
  hints: Array<{ level: 1 | 2 | 3; hint: string }>
}

export interface StudentPracticeActivity {
  activity_id: string
  order: number
  phase: 'first' | 'later'
  kind: LearningActivity['kind']
  goal: string
  prompt: string
  success_criteria: string[]
  questions: StudentPracticeQuestion[]
}

/** Explicit allowlist: no answer keys, original work, scores, evidence or other learners. */
export interface StudentPracticePack {
  format: typeof STUDENT_PRACTICE_FORMAT
  schema_version: ResultEnvelope<unknown>['schema_version']
  generated_at: string
  dataset_version: string
  policy_version: ResultEnvelope<unknown>['policy_version']
  producer_version: string
  source_mode: ResultEnvelope<unknown>['source_mode']
  student_id: string
  node_id: string
  plan_type: LearningPlanPayload['plan_type']
  certainty: LearningPlanPayload['certainty']
  delivery: { advance_when: string }
  activities: StudentPracticeActivity[]
}

export interface StudentDocumentAssets { js: string; css: string }

function student_ids(value: string | undefined): string[] {
  return value?.split(/[、,，;；\s]+/u).filter(Boolean) ?? []
}

/**
 * Project one validated workspace case into an independent student-only pack.
 * @param workspace - The existing teacher workspace; it is never embedded in the output.
 * @param studentId - The one assigned learner.
 * @param nodeId - The one assigned measurement node.
 * @returns Only assigned questions, method hints and safe practice instructions.
 */
export function build_student_pack(workspace: ResultEnvelope<WorkspacePayload>, studentId: string, nodeId: string): StudentPracticePack {
  const key = `${encodeURIComponent(studentId)}:${encodeURIComponent(nodeId)}`
  const snapshot = workspace.payload.browser_snapshot
  const node = snapshot.input.nodes.find(row => row['节点编号'] === nodeId)
  if (!workspace.payload.students.some(student => student.student_id === studentId)
    || !workspace.payload.nodes.some(value => value.node_id === nodeId)
    || !snapshot.input.students.some(student => student['学生编号'] === studentId) || !node
    || !Object.hasOwn(workspace.payload.cases, key)) throw new Error('学生或测验节点不存在，未导出学生练习')
  const item = workspace.payload.cases[key]!
  const plan = item.plan
  if (plan.scope['student_id'] !== studentId || plan.scope['node_id'] !== nodeId
    || plan.payload.student_id !== studentId || plan.payload.node_id !== nodeId || plan.result_status === 'error') {
    throw new Error('学习计划的学生或节点范围不一致，未导出学生练习')
  }
  const metadata = ['schema_version', 'generated_at', 'dataset_version', 'policy_version', 'producer_version', 'source_mode'] as const
  if (metadata.some(field => plan[field] !== workspace[field] || snapshot[field] !== workspace[field])) {
    throw new Error('学习计划与题目不属于同一分析批次，未导出学生练习')
  }
  const allowed = new Set(student_ids(node['可用题目编号']))
  const taught = new Set(student_ids(node['已教及测量主题']))
  const questions = new Map(snapshot.input.items.map(question => [question['材料编号'], question]))
  const first = new Set(plan.payload.delivery.first_activity_ids)
  const activities = plan.payload.activities.map(activity => ({
    activity_id: activity.activity_id, order: activity.order,
    phase: first.has(activity.activity_id) ? 'first' as const : 'later' as const,
    kind: activity.kind, goal: activity.goal, prompt: activity.prompt,
    success_criteria: [...activity.success_criteria],
    questions: [...new Set(activity.item_ids)].map(itemId => {
      const question = questions.get(itemId)
      if (!question || question['材料类型'] !== '题目' || !allowed.has(itemId) || !taught.has(question['主题编号'] ?? '')) {
        throw new Error('练习题目不在指定节点的已教允许范围，未导出学生练习')
      }
      const hints = (item.hints[itemId] ?? []).map(hint => {
        if (hint.scope['student_id'] !== studentId || hint.scope['node_id'] !== nodeId || hint.scope['item_id'] !== itemId
          || hint.scope['mode'] !== 'student' || hint.scope['level'] !== String(hint.payload.level)
          || hint.payload.student_id !== studentId || hint.payload.node_id !== nodeId || hint.payload.item_id !== itemId
          || hint.payload.mode !== 'student' || ![1, 2, 3].includes(hint.payload.level) || hint.result_status === 'error'
          || metadata.some(field => hint[field] !== workspace[field])) {
          throw new Error('提示的学生、节点、题目或模式不一致，未导出学生练习')
        }
        return { level: hint.payload.level, hint: hint.payload.hint }
      }).sort((left, right) => left.level - right.level)
      return { item_id: itemId, type: question['题型'] ?? '', prompt: question['题干或内容'] ?? '', options: question['选项'] ?? '', hints }
    }),
  }))
  return {
    format: STUDENT_PRACTICE_FORMAT, schema_version: workspace.schema_version, generated_at: workspace.generated_at,
    dataset_version: workspace.dataset_version, policy_version: workspace.policy_version, producer_version: workspace.producer_version,
    source_mode: workspace.source_mode, student_id: studentId, node_id: nodeId,
    plan_type: plan.payload.plan_type, certainty: plan.payload.certainty,
    delivery: { advance_when: plan.payload.delivery.advance_when }, activities,
  }
}

/**
 * Render an offline student document without serializing any unknown object fields.
 * @param pack - One student practice pack produced by the strict projection.
 * @param assets - Repository-owned, self-contained student JavaScript and CSS.
 * @returns A complete HTML file with escaped inline practice data and no external assets.
 */
export function render_student_document(pack: StudentPracticePack, assets: StudentDocumentAssets): string {
  if (pack.format !== STUDENT_PRACTICE_FORMAT) throw new Error('学生练习格式不受支持')
  if (/<\/script/iu.test(assets.js) || /<\/style/iu.test(assets.css) || /^import\s/m.test(assets.js)) {
    throw new Error('学生页面资源不是安全的独立文件')
  }
  const safe: StudentPracticePack = {
    format: STUDENT_PRACTICE_FORMAT, schema_version: pack.schema_version, generated_at: pack.generated_at,
    dataset_version: pack.dataset_version, policy_version: pack.policy_version, producer_version: pack.producer_version,
    source_mode: pack.source_mode, student_id: pack.student_id, node_id: pack.node_id, plan_type: pack.plan_type,
    certainty: pack.certainty, delivery: { advance_when: pack.delivery.advance_when },
    activities: pack.activities.map(activity => ({
      activity_id: activity.activity_id, order: activity.order, phase: activity.phase, kind: activity.kind,
      goal: activity.goal, prompt: activity.prompt, success_criteria: [...activity.success_criteria],
      questions: activity.questions.map(question => ({
        item_id: question.item_id, type: question.type, prompt: question.prompt, options: question.options,
        hints: question.hints.map(hint => ({ level: hint.level, hint: hint.hint })),
      })),
    })),
  }
  const json = JSON.stringify(safe).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>智慧学伴 · 学生练习</title><style>${assets.css}</style></head><body><div id="student-app"></div><noscript>请启用 JavaScript 完成本次练习</noscript><script type="module">const STUDENT_PRACTICE = ${json};\n${assets.js}</scr${'ipt'}></body></html>\n`
}
