#!/usr/bin/env node
/** Compatibility entry: the shared pipeline owns all scoring, plans and exports. */
import { fileURLToPath } from 'node:url';
import { run_companion_cli } from '../../../../modules/app/cli.ts';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.exitCode = await run_companion_cli(['help']);
} else {
  if (!args.includes('--data')) args.push('--data', fileURLToPath(new URL('../private-data/模拟学情数据/', import.meta.url)));
  if (!args.includes('--out')) args.push('--out', fileURLToPath(new URL('../generated/', import.meta.url)));
  if (!args.includes('--summary-only')) args.push('--summary-only');
  process.exitCode = await run_companion_cli(['export', ...args]);
}
