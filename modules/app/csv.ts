import type { ResultEnvelope } from '../data/types.ts'
import type { WorkspacePayload } from './core.ts'

/** CSV columns shared by files and browser downloads; payload paths use JSON Pointer. */
export const CSV_FORMAT = 'study-csv-v1'

type Cell = string | number | boolean | null
type CsvRow = Record<string, Cell>

function pointer(value: string): string { return value.replaceAll('~', '~0').replaceAll('/', '~1') }
function quote(value: string): string { return `"${value.replaceAll('"', '""')}"` }

/**
 * Export one existing result without recomputing scores, plans or evidence.
 * Each object/array has a path-addressed row; scalar fields retain their types.
 * @param result - The exact envelope selected in the UI or produced by the CLI.
 * @returns UTF-8 CSV with a BOM, CRLF rows and reversible spreadsheet-text escaping.
 */
export function result_to_csv(result: ResultEnvelope<unknown>): string {
  const metadata: CsvRow = {
    csv_format: CSV_FORMAT, generated_at: result.generated_at, schema_version: result.schema_version, dataset_version: result.dataset_version,
    policy_version: result.policy_version, producer_version: result.producer_version, source_mode: result.source_mode,
    result_status: result.result_status, scope_json: JSON.stringify(result.scope),
    evidence_ids_json: JSON.stringify(result.evidence_ids), limitations_json: JSON.stringify(result.limitations),
  }
  const rows: CsvRow[] = []
  const columns = new Set<string>()
  const visit = (value: unknown, path: string): void => {
    const row: CsvRow = { ...metadata, evidence_ids_json: path === '' ? metadata['evidence_ids_json']! : '', limitations_json: path === '' ? metadata['limitations_json']! : '', path, row_type: Array.isArray(value) ? 'array' : value !== null && typeof value === 'object' ? 'object' : 'value' }
    const types: Record<string, string> = Object.create(null) as Record<string, string>
    const children: Array<[string, unknown]> = []
    const assign = (key: string, entry: unknown): void => {
      if (entry === undefined) return
      if (entry !== null && typeof entry === 'object') { children.push([key, entry]); return }
      if (entry !== null && typeof entry !== 'string' && typeof entry !== 'number' && typeof entry !== 'boolean') throw new Error('CSV只支持JSON数据')
      if (typeof entry === 'number' && !Number.isFinite(entry)) throw new Error('CSV不能导出非有限数值')
      const column = `value/${pointer(key)}`
      row[column] = entry
      types[column] = entry === null ? 'null' : typeof entry
      columns.add(column)
    }
    if (Array.isArray(value)) {
      row['length'] = value.length
      value.forEach((entry, index) => children.push([String(index), entry]))
    } else if (value !== null && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) assign(key, entry)
    } else assign('value', value)
    row['types_json'] = JSON.stringify(types)
    const escaped: string[] = []
    for (const [key, entry] of Object.entries(row)) {
      // Preserve literal identifiers/text while preventing spreadsheet formula execution.
      if (typeof entry === 'string' && /^[\s]*[=+\-@\t\r\n]/u.test(entry)) { row[key] = `'${entry}`; escaped.push(key) }
    }
    row['escaped_columns_json'] = JSON.stringify(escaped)
    rows.push(row)
    for (const [key, child] of children) visit(child, `${path}/${pointer(key)}`)
  }
  visit(result.payload, '')
  const headers = [...Object.keys(metadata), 'path', 'row_type', 'length', 'types_json', 'escaped_columns_json', ...[...columns].sort()]
  return '\uFEFF' + [headers.map(quote).join(','), ...rows.map(row => headers.map(key => quote(row[key] === null ? 'null' : String(row[key] ?? ''))).join(','))].join('\r\n') + '\r\n'
}

/**
 * Enumerate the CSV projections required for one complete local report.
 * @param workspace - Verified workspace, shared with the HTML and JSON exports.
 * @returns Relative filenames and their existing result envelopes; no new analysis.
 */
export function csv_exports(workspace: ResultEnvelope<WorkspacePayload>): Array<[string, ResultEnvelope<unknown>]> {
  const results: Array<[string, ResultEnvelope<unknown>]> = [
    ['summary.csv', { ...workspace, payload: workspace.payload.summary }],
    ['curriculum.csv', workspace.payload.curriculum],
    ['quality.csv', { ...workspace, payload: workspace.payload.quality_records, evidence_ids: workspace.payload.quality_records.map(record => record.record_id) }],
  ]
  for (const [key, entry] of Object.entries(workspace.payload.cases)) {
    for (const kind of ['statistics', 'diagnosis', 'plan', 'peers'] as const) results.push([`students/${encodeURIComponent(key)}/${kind}.csv`, entry[kind]])
    results.push([`students/${encodeURIComponent(key)}/hints.csv`, { ...entry.plan, payload: entry.hints }])
  }
  for (const [key, entry] of Object.entries(workspace.payload.class_reports)) results.push([`classes/${encodeURIComponent(key)}.csv`, entry])
  for (const [key, entry] of Object.entries(workspace.payload.class_plans)) results.push([`class-plans/${encodeURIComponent(key)}.csv`, entry])
  for (const [key, entry] of Object.entries(workspace.payload.node_pairings)) results.push([`node-pairings/${encodeURIComponent(key)}.csv`, entry])
  return results
}
