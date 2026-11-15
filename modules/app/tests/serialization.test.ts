import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Window } from '../../data/node_modules/happy-dom/lib/index.js'
import { make_input } from '../../data/tests/helpers.ts'
import { build_workspace } from '../core.ts'
import { make_demo_input } from '../demo.ts'
import { prepare_workspace_dataset } from '../pipeline.ts'
import { render_report } from '../report.ts'
import { pack_report_value, unpack_report_value } from '../serialization.ts'
import type { PackedReport } from '../serialization.ts'

test('report pooling preserves JSON values, tag-looking arrays and literal dangerous keys', () => {
  const literal = JSON.parse('{"__proto__":{"kept":true},"constructor":"literal"}')
  const value = { empty: {}, array: [], tags: ['a', ['o', 1]], scalar: [null, true, false, 0, -12.5],
    literal, text: '</script><script>unexpected()</script>\u2028\u2029', omitted: undefined }
  const packed = pack_report_value(value)
  assert.deepEqual(unpack_report_value(JSON.parse(JSON.stringify(packed))), JSON.parse(JSON.stringify(value)))
  assert.deepEqual(pack_report_value(value), packed)
  assert.throws(() => pack_report_value(undefined))
})

test('restored duplicate objects remain independent as in the original JSON document', () => {
  const child = { items: [{ label: 'shared content' }] }
  const restored = unpack_report_value(pack_report_value({ left: child, right: child }))
  assert.deepEqual(restored, { left: child, right: child })
  assert.notEqual(restored.left, restored.right)
  assert.notEqual(restored.left.items, restored.right.items)
  restored.left.items[0]!.label = 'changed only on one side'
  assert.equal(restored.right.items[0]!.label, 'shared content')
})

test('invalid node references and duplicate or nonstring object keys fail explicitly', () => {
  const malformed: PackedReport[] = [
    { format: 'study-report-pool-v1', root: -1, nodes: [null] },
    { format: 'study-report-pool-v1', root: 0, nodes: [['a', 0]] },
    { format: 'study-report-pool-v1', root: 0, nodes: [['a', 1], null] },
    { format: 'study-report-pool-v1', root: 1, nodes: ['key', ['o', 0]] },
    { format: 'study-report-pool-v1', root: 2, nodes: ['key', 'value', ['o', 0, 1, 0, 1]] },
    { format: 'study-report-pool-v1', root: 2, nodes: [false, 'value', ['o', 0, 1]] },
  ]
  for (const packed of malformed) assert.throws(() => unpack_report_value(packed))
})

test('pooling reduces repeated workspace content without dropping any report field', () => {
  const workspace = build_workspace(prepare_workspace_dataset(make_demo_input(), { source_mode: 'fixture' }))
  const packed = pack_report_value(workspace)
  assert.deepEqual(unpack_report_value(packed), JSON.parse(JSON.stringify(workspace)))
  assert.ok(Buffer.byteLength(JSON.stringify(packed)) < Buffer.byteLength(JSON.stringify(workspace)) * 0.6)
})

test('the exported pooled report boots offline and renders literal markup safely', async t => {
  const input = make_input()
  input.items[0]!['题干或内容'] = '</script><img src="unexpected.invalid" onerror="globalThis.unexpected=true">'
  const workspace = build_workspace(prepare_workspace_dataset(input, { source_mode: 'fixture' }))
  const html = await render_report(workspace)
  assert.ok(!html.includes('</script><img'))
  const script = /<script type="module">([\s\S]*)<\/script>/u.exec(html)?.[1]
  assert.ok(script)
  const window = new Window({ settings: {
    enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true,
    disableJavaScriptFileLoading: true, enableCSSFileLoading: false, enableImageFileLoading: false,
    enableIframePageLoading: false,
    navigation: { disableMainFrameNavigation: true, disableChildFrameNavigation: true, disableChildPageNavigation: true, disableFallbackToSetURL: true },
  } })
  t.after(async () => { await window.happyDOM.close() })
  let networkRequests = 0
  window.fetch = async () => { networkRequests += 1; throw new Error('Report tests must stay offline.') }
  const app = window.document.createElement('div')
  app.id = 'app'
  window.document.body.append(app)
  window.eval(`${script.replace(/^export\s+/gm, '')}\nglobalThis.__restoredWorkspace = WORKSPACE;`)
  const restored: unknown = window.eval('JSON.parse(JSON.stringify(globalThis.__restoredWorkspace))')
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify(workspace)))
  assert.equal(window.document.querySelector('h1')?.textContent, '教师工作台')
  assert.equal(window.document.querySelectorAll('nav button').length, 7)
  assert.equal(window.document.querySelectorAll('script[src],link[href],iframe,img').length, 0)
  assert.equal(networkRequests, 0)
})

test('compiled report decoder has no runtime imports and restores the same format', async () => {
  const compiled = await readFile(new URL('../../data/lib/companion/app/serialization.js', import.meta.url), 'utf8')
  assert.ok(!/^import\s/m.test(compiled))
  assert.ok(compiled.includes('function unpack_report_value'))
})
