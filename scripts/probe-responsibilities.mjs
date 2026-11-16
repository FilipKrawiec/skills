#!/usr/bin/env node
// Explicit opt-in: invokes the selected installed hosts and may consume usage.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runResponsibility } from '../plugins/common/workflow/scripts/lib/responsibility.mjs';

const args = process.argv.slice(2);
let hosts;
if (args.length === 2 && args[0] === '--agy' && args[1]) {
  hosts = [['agy', args[1]]];
} else if (args.length === 2 && args.every(arg => arg && !arg.startsWith('--'))) {
  hosts = [['codex', args[0]], ['claude', args[1]]];
} else {
  console.error('Usage: node scripts/probe-responsibilities.mjs CODEX_MODEL CLAUDE_MODEL | --agy AGY_MODEL');
  process.exit(1);
}
const directory = mkdtempSync(join(tmpdir(), 'responsibility-probe-'));
try {
  for (const [host, model] of hosts) {
    const marker = randomBytes(16).toString('hex');
    const brief = join(directory, `${host}.md`);
    writeFileSync(brief, `Read this file. Return exactly two lines and no other text: status: done, then note: followed by your assigned responsibility, one space, and ${marker}.`);
    const output = runResponsibility({ orchestrator: 'codex', roles: { design: { host, model } } }, 'design', brief);
    if (output.trim() !== `status: done\nnote: design ${marker}`) throw new Error(`${host} did not return the brief's exact hand-back`);
    console.log(`${host}: brief and hand-back passed`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
