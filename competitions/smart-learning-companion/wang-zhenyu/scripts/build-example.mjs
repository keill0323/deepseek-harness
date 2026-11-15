#!/usr/bin/env node
/** Generate the shared, explicitly synthetic example without competition identifiers. */
import { fileURLToPath } from 'node:url';
import { run_demo_cli } from '../../../../modules/app/demo.ts';

const args = process.argv.slice(2);
if (!args.includes('--out')) args.push('--out', fileURLToPath(new URL('../generated-example/', import.meta.url)));
process.exitCode = await run_demo_cli(args);
