import assert from 'node:assert/strict'
import { parse_csv } from '../../data/io.ts'

const unpointer = (value: string): string => value.replaceAll('~1', '/').replaceAll('~0', '~')

/**
 * Decode the documented row structure with an independent CSV parser.
 * @param text - Exported CSV text including metadata and type columns.
 * @returns The reconstructed payload for comparison with the JSON export.
 */
export function csv_payload(text: string): unknown {
  const values = new Map<string, unknown>()
  for (const row of parse_csv(text, 'result.csv')) {
    for (const name of JSON.parse(row['escaped_columns_json']!) as string[]) row[name] = row[name]!.slice(1)
    const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    for (const [column, type] of Object.entries(JSON.parse(row['types_json']!) as Record<string, string>)) {
      const raw = row[column]!
      fields[unpointer(column.slice('value/'.length))] = type === 'null' ? null : type === 'number' ? Number(raw) : type === 'boolean' ? raw === 'true' : raw
    }
    const value: unknown = row['row_type'] === 'array' ? new Array(Number(row['length'])) : row['row_type'] === 'object' ? { ...fields } : fields['value']
    const path = row['path']!
    values.set(path, value)
    if (path !== '') {
      const split = path.lastIndexOf('/')
      const parent = values.get(path.slice(0, split))
      assert.ok(parent !== null && typeof parent === 'object', `Missing CSV parent: ${path}`)
      Object.defineProperty(parent, unpointer(path.slice(split + 1)), { value, enumerable: true, configurable: true, writable: true })
    }
  }
  return values.get('')
}
