#!/usr/bin/env node
// Explicit opt-in: invokes both installed hosts and may consume their configured usage.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runResponsibility } from '../plugins/common/workflow/scripts/lib/responsibility.mjs';

const [codexModel, claudeModel] = process.argv.slice(2);
if (!codexModel || !claudeModel || process.argv.length !== 4) {
  console.error('Usage: node scripts/probe-responsibilities.mjs CODEX_MODEL CLAUDE_MODEL');
  process.exit(1);
}
const directory = mkdtempSync(join(tmpdir(), 'responsibility-probe-'));
try {
  for (const [host, model] of [['codex', codexModel], ['claude', claudeModel]]) {
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
