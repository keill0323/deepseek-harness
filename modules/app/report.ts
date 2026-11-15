import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { ResultEnvelope } from '../data/types.ts'
import type { WorkspacePayload } from './core.ts'
import { pack_report_value } from './serialization.ts'

/**
 * Render a self-contained local report using the same comparison implementation as the CLI.
 * @param workspace - A validated local workspace result.
 * @returns HTML with inline local assets and escaped JSON; no remote resources.
 */
export async function render_report(workspace: ResultEnvelope<WorkspacePayload>): Promise<string> {
  const compiledSibling = new URL('../comparison/core.js', import.meta.url)
  const compiledSource = new URL('../data/lib/companion/comparison/core.js', import.meta.url)
  const comparisonPath = existsSync(compiledSibling) ? compiledSibling : compiledSource
  const decoderPath = new URL('../app/serialization.js', comparisonPath)
  const csvPath = new URL('../app/csv.js', comparisonPath)
  if (!existsSync(comparisonPath) || !existsSync(decoderPath) || !existsSync(csvPath)) throw new Error('缺少报告运行产物，请先运行 npm run study:build')
  const [comparison, decoder, csv, viewer, css] = await Promise.all([
    readFile(comparisonPath, 'utf8'), readFile(decoderPath, 'utf8'), readFile(csvPath, 'utf8'), readFile(new URL('./viewer.js', import.meta.url), 'utf8'), readFile(new URL('./viewer.css', import.meta.url), 'utf8'),
  ])
  if ([comparison, decoder, csv].some(source => /^import\s/m.test(source))) throw new Error('浏览器报告模块出现运行时导入，不能导出独立报告')
  const json = JSON.stringify(pack_report_value(workspace)).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  const script = `${comparison}\n${decoder}\n${csv}\nconst WORKSPACE = unpack_report_value(${json});\n${viewer}`
  if (/<\/script/iu.test(script)) throw new Error('报告脚本包含不安全的结束标签')
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>智慧学伴 · 本地学习分析</title><style>${css}</style></head><body><div id="app"></div><noscript>请启用JavaScript查看本地报告。</noscript><script type="module">${script}</script></body></html>\n`
}
