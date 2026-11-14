import { prepare_dataset } from '../data/core.ts'
import type { DatasetInput, EvidenceRecord, PreparedDataset, PrepareOptions } from '../data/types.ts'
import { diagnose_student, get_curriculum } from '../diagnosis/core.ts'
import { scope_key } from '../shared/result.ts'

/**
 * Prepare a shared view and propagate explicit process-scoring review to every consumer.
 * @param input - Literal local source tables.
 * @param options - Origin and implementation version for the whole pipeline.
 * @returns A derived current view; imported fields and historical versions remain intact.
 */
export function prepare_workspace_dataset(input: DatasetInput, options: PrepareOptions = {}): PreparedDataset {
  const dataset = prepare_dataset(input, { ...options, producer_version: options.producer_version ?? 'study-companion@0.4.0' })
  const additionalReviews = new Map<string, string[]>()
  const observed = new Set(dataset.current.map(record => scope_key(record.student_id, record.node_id)))
  const recordIndex = new Map(dataset.current.map(record => [record.record_id, record]))
  const curriculum = get_curriculum(dataset)
  for (const student of dataset.input.students) {
    for (const node of dataset.input.nodes) {
      const scope = { student_id: student['学生编号']!, node_id: node['节点编号']! }
      if (!observed.has(scope_key(scope.student_id, scope.node_id))) continue
      const diagnosis = diagnose_student(dataset, scope, { curriculum })
      for (const finding of diagnosis.payload.findings) {
        if (finding.category !== 'scoring_review') continue
        for (const id of finding.evidence_ids) {
          const current = recordIndex.get(id)
          if (current?.include_in_statistics) {
            const location = finding.step_refs.length > 0 ? `原作答第${finding.step_refs.join('、')}步：` : ''
            additionalReviews.set(id, [...(additionalReviews.get(id) ?? []), `${location}${finding.description}`])
          }
        }
      }
    }
  }
  if (additionalReviews.size === 0) return dataset
  const replacements = new Map<string, EvidenceRecord>()
  for (const record of dataset.current) {
    const messages = additionalReviews.get(record.record_id)
    if (!messages) continue
    replacements.set(record.record_id, {
      ...record, include_in_statistics: false, action: 'review',
      quality_issues: [...record.quality_issues, { code: 'semantic_scoring_review', message: [...new Set(messages)].join(' ') }],
    })
  }
  const current = dataset.current.map(record => replacements.get(record.record_id) ?? record)
  return {
    ...dataset,
    current,
    history: dataset.history.map(record => replacements.get(record.record_id) ?? record),
    summary: {
      ...dataset.summary,
      included_count: current.filter(record => record.action === 'include').length,
      review_count: current.filter(record => record.action === 'review').length,
      excluded_count: current.filter(record => record.action === 'exclude').length,
    },
  }
}
