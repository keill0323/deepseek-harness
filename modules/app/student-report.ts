import { readFile } from 'node:fs/promises'
import { render_student_document } from './student.ts'
import type { StudentDocumentAssets, StudentPracticePack } from './student.ts'

/** Load the local student-only assets for file export or teacher-side download. */
export async function load_student_assets(): Promise<StudentDocumentAssets> {
  const [js, css] = await Promise.all([
    readFile(new URL('./student-viewer.js', import.meta.url), 'utf8'),
    readFile(new URL('./student-viewer.css', import.meta.url), 'utf8'),
  ])
  return { js, css }
}

/**
 * Render one student pack with the bundled offline student interface.
 * @param pack - Only one learner's assigned practice and safe method hints.
 * @returns An independent HTML document containing no teacher workspace.
 */
export async function render_student_report(pack: StudentPracticePack): Promise<string> {
  return render_student_document(pack, await load_student_assets())
}
