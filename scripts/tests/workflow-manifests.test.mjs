import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateRepository } from '../../plugins/common/workflow/scripts/manifests.mjs';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'workflow-manifests-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'plugins/common'), { recursive: true });
  mkdirSync(join(root, '.agents'), { recursive: true });
  cpSync(join(ROOT, 'plugins/common/workflow'), join(root, 'plugins/common/workflow'), { recursive: true });
  writeFileSync(join(root, '.agents/plugins.json'), JSON.stringify({ entries: [{ path: 'plugins/common' }] }));
  return root;
}

test('manifest validator accepts the current repository definitions', () => {
  assert.doesNotThrow(() => validateRepository(ROOT));
});

test('manifest validator detects metadata drift in a package manifest', t => {
  const root = fixture(t);
  const path = join(root, 'plugins/common/workflow/.codex-plugin/plugin.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.keywords = [...(manifest.keywords || []), 'drift'];
  writeFileSync(path, JSON.stringify(manifest, null, 2));
  assert.throws(() => validateRepository(root), /must match package keywords/);
});

test('manifest validator rejects broken relative links', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'plugins/common/workflow/skills/afk/references/broken.md'), '[missing](no-file.md)');
  assert.throws(() => validateRepository(root), /contains broken relative link/);
});

test('manifest validator accepts only tool-call guard hooks', t => {
  const root = fixture(t);
  const path = join(root, 'plugins/common/workflow/hooks/hooks.json');
  assert.doesNotThrow(() => validateRepository(root));
  writeFileSync(path, JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'cat rules.md' }] }] } }));
  assert.throws(() => validateRepository(root), /may only guard tool calls/);
});
