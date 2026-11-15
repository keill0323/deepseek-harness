import type { PreparedDataset, ResultEnvelope } from '../data/types.ts'

/**
 * Encode two opaque identifiers without ambiguous separator collisions.
 * @param entity - Student or class identifier, preserved without trimming.
 * @param node - Explicit measurement node identifier.
 * @returns A stable report key; ordinary alphanumeric identifiers retain their existing form.
 */
export function scope_key(entity: string, node: string): string {
  return `${encodeURIComponent(entity)}:${encodeURIComponent(node)}`
}

/**
 * Carry one prepared snapshot's versions and evidence into a business result.
 * @param dataset - Snapshot used by the operation.
 * @param scope - Explicit input identifiers and selected mode.
 * @param payload - Operation-specific fields.
 * @param status - Success, limited evidence, review, or rejected request.
 * @param evidence - Record identifiers supporting the result.
 * @param limitations - Limits that affect interpretation.
 * @returns A result with deterministic, unique evidence identifiers.
 */
export function make_result<T>(
  dataset: PreparedDataset,
  scope: Record<string, string | boolean>,
  payload: T,
  status: ResultEnvelope<T>['result_status'] = 'ok',
  evidence: string[] = [],
  limitations: string[] = [],
): ResultEnvelope<T> {
  return {
    schema_version: dataset.schema_version, generated_at: dataset.generated_at,
    dataset_version: dataset.dataset_version,
    policy_version: dataset.policy_version,
    producer_version: dataset.producer_version,
    source_mode: dataset.source_mode,
    scope,
    result_status: status,
    payload,
    evidence_ids: [...new Set(evidence)].sort(),
    limitations,
  }
}
