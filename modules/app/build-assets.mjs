import { copyFile, mkdir } from 'node:fs/promises'

const target = new URL('../data/lib/companion/app/', import.meta.url)
await mkdir(target, { recursive: true })
for (const name of ['viewer.js', 'viewer.css', 'student-viewer.js', 'student-viewer.css']) {
  await copyFile(new URL(name, import.meta.url), new URL(name, target))
}
