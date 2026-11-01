import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI = new URL('../../plugins/common/workflow/scripts/workflow.mjs', import.meta.url);
function fixture(t, body) {
  const root = mkdtempSync(join(tmpdir(), 'workflow-project-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'AGENTS.md'), `---\nactive_skills:\n  - ddd\nbuild_tools:\n  just:\n    build_script: justfile\n    lifecycle_tasks:\n      verify: ${body}\n---\n`);
  writeFileSync(join(root, 'justfile'), 'default:');
  return root;
}
function cli(root, ...args) {
  return spawnSync('node', [CLI.pathname, 'project', '--root', root, ...args], { encoding: 'utf8' });
}

test('project status reads the nearest repo config and detects its configured tool', t => {
  const root = fixture(t, 'printf verified');
  const result = cli(root, 'status');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Project Root:/);
  assert.match(result.stdout, /Active Skills: \['ddd'\]/);
  assert.match(result.stdout, /Detected Tool: 'just'/);
  assert.match(result.stdout, /Available Tasks: \['verify'\]/);
});

test('project lifecycle task runs from the repo root', t => {
  const root = fixture(t, 'printf verified');
  const result = cli(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS: Task 'verify' completed successfully/);
});

test('project lifecycle task rejects missing and empty task definitions', t => {
  const root = fixture(t, "''");
  const result = cli(root, 'missing');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not found or empty/);
});
