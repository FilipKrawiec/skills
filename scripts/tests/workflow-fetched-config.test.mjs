import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fetchedConfig, config } from '../../plugins/common/workflow/scripts/lib/core.mjs';

const identity = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.test', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.test' };
const git = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, env: identity, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const writeConfig = (dir, implementer) => {
  mkdirSync(join(dir, '.agents'), { recursive: true }); mkdirSync(join(dir, '.github'), { recursive: true });
  writeFileSync(join(dir, '.agents', 'config.json'), JSON.stringify({ version: 1, identities: { implementer, reviewer: 'reviewer' } }));
  writeFileSync(join(dir, '.github', 'CODEOWNERS'), '* @reviewer\n/*.rules @owner\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', `config ${implementer}`);
};

test('a stale local default branch is fetched first, so the merged config applies and its commit is named', t => {
  const dir = mkdtempSync(join(tmpdir(), 'fetched-config-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cwd = process.cwd(); t.after(() => process.chdir(cwd));
  mkdirSync(join(dir, 'acme'));
  const origin = join(dir, 'acme', 'app.git'); const clone = join(dir, 'clone');
  git(dir, 'init', '-q', '-b', 'main', origin);
  writeConfig(origin, 'codex-bot');
  git(dir, 'clone', '-q', origin, clone);
  // Reach the local origin through a fake ssh, so the remote still reads as a GitHub repository.
  const ssh = join(dir, 'ssh'); writeFileSync(ssh, `#!/bin/sh\nfor a; do c="$a"; done\ncd '${dir}' && exec sh -c "$c"\n`); chmodSync(ssh, 0o755);
  git(clone, 'remote', 'set-url', 'origin', 'git@github.com:acme/app.git');
  git(clone, 'config', 'core.sshCommand', ssh);
  git(clone, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');
  git(clone, 'fetch', '-q', 'origin'); git(clone, 'remote', 'set-head', 'origin', 'main');
  writeConfig(origin, 'claude-bot');
  const head = git(origin, 'rev-parse', 'HEAD');
  process.chdir(clone);
  assert.equal(config().lanes.implementer, 'codex-bot', 'the local view is stale');
  const fresh = fetchedConfig().lanes;
  assert.equal(fresh.implementer, 'claude-bot');
  assert.equal(fresh.configCommit, head);
});
