import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verify_workspace } from './verify.ts'
import type { WorkspacePayload } from './core.ts'
import type { ResultEnvelope } from '../data/types.ts'
import { CSV_FORMAT, csv_exports, result_to_csv } from './csv.ts'
import { build_student_pack, render_student_document, STUDENT_PRACTICE_FORMAT } from './student.ts'
import { load_student_assets } from './student-report.ts'
import { scope_key } from '../shared/result.ts'

/**
 * Verify completion and the content of every exported student and class file.
 * @param directory - Export directory created by the business CLI.
 * @param sourceMode - Expected fixture or official-input mode.
 * @returns A general status only; malformed, partial or inconsistent exports fail closed.
 */
export async function check_export(directory: string, sourceMode: 'live' | 'fixture'): Promise<boolean> {
  try {
    const json = async (path: string): Promise<unknown> => JSON.parse(await readFile(join(directory, path), 'utf8'))
    const manifest = await json('manifest.json')
    if (!manifest || typeof manifest !== 'object' || !('status' in manifest) || manifest.status !== 'complete'
      || !('source_mode' in manifest) || manifest.source_mode !== sourceMode) return false
    const content = await json('workspace.json')
    // The complete stored report is validated below, including version, scope and evidence checks.
    const workspace = content as ResultEnvelope<WorkspacePayload>
    if (workspace.source_mode !== sourceMode || workspace.result_status === 'error') return false
    const students = workspace.payload.browser_snapshot.input.students.map(student => ({
      student_id: student['学生编号']!, class_id: student['模拟班级编号']!,
    }))
    const nodes = workspace.payload.browser_snapshot.input.nodes.map(node => ({
      node_id: node['节点编号']!, date: node['模拟测验日期'] ?? '', description: node['说明'] ?? '',
    }))
    if (!isDeepStrictEqual(workspace.payload.students, students) || !isDeepStrictEqual(workspace.payload.nodes, nodes)) return false
    for (const key of ['schema_version', 'dataset_version', 'policy_version', 'producer_version', 'generated_at'] as const) {
      if (!(key in manifest) || Reflect.get(manifest, key) !== workspace[key]) return false
    }
    const current = verify_workspace(workspace)
    if (current.status !== 'passed' || !isDeepStrictEqual(current, await json('acceptance.json'))) return false
    for (const [folder, values] of Object.entries({ students: workspace.payload.cases, classes: workspace.payload.class_reports, 'class-plans': workspace.payload.class_plans, 'node-pairings': workspace.payload.node_pairings })) {
      for (const [key, value] of Object.entries(values)) if (!isDeepStrictEqual(value, await json(`${folder}/${encodeURIComponent(key)}.json`))) return false
    }
    const csvFiles = csv_exports(workspace)
    if (!('export_format_version' in manifest) || manifest.export_format_version !== 'study-export-v3'
      || !('csv_format' in manifest) || manifest.csv_format !== CSV_FORMAT
      || !('csv_files' in manifest) || !isDeepStrictEqual(manifest.csv_files, csvFiles.map(([name]) => `csv/${name}`))) return false
    for (const [name, entry] of csvFiles) if (await readFile(join(directory, 'csv', name), 'utf8') !== result_to_csv(entry)) return false
    const fields = await json('fields.json')
    if (!fields || typeof fields !== 'object' || !('generated_at' in fields) || fields.generated_at !== workspace.generated_at) return false
    const studentAssets = await load_student_assets()
    const studentPages: Array<{ student_id: string; node_id: string; path: string; sha256: string }> = []
    for (const node of nodes) for (const student of students) {
      const pack = build_student_pack(workspace, student.student_id, node.node_id)
      const expected = render_student_document(pack, studentAssets)
      const path = `student-pages/${encodeURIComponent(scope_key(student.student_id, node.node_id))}.html`
      if (await readFile(join(directory, path), 'utf8') !== expected) return false
      studentPages.push({ student_id: student.student_id, node_id: node.node_id, path, sha256: createHash('sha256').update(expected).digest('hex') })
    }
    if (!('student_practice_format' in manifest) || manifest.student_practice_format !== STUDENT_PRACTICE_FORMAT
      || !('student_pages' in manifest) || !isDeepStrictEqual(manifest.student_pages, studentPages)) return false
    const html = await readFile(join(directory, 'index.html'), 'utf8')
    return 'report_sha256' in manifest && manifest.report_sha256 === createHash('sha256').update(html).digest('hex') && html.startsWith('<!doctype html>') && html.includes('</html>')
  } catch (error) {
    // A missing, malformed or structurally invalid local artifact is an incomplete export.
    return false
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, mode] = process.argv.slice(2)
  const valid = directory !== undefined && (mode === 'live' || mode === 'fixture') && await check_export(directory, mode)
  process.stdout.write(`${JSON.stringify({ export_complete: valid })}\n`)
  process.exitCode = valid ? 0 : 1
}
