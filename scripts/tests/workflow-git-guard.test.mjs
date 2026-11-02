import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { blockedGitSubcommand } from '../../plugins/common/workflow/scripts/git-guard.mjs';

const guard = resolve(new URL('../../plugins/common/workflow/scripts/git-guard.mjs', import.meta.url).pathname);

test('git guard finds plain commits and pushes in compound commands', () => {
  for (const command of ['git commit -m x', 'git -C repo -c user.name=x commit -am y', 'cd a && git push -u origin b', 'GIT_AUTHOR_NAME=x git commit', 'env git push', '/usr/bin/git push --force-with-lease', 'git add . ; git commit -q -F - <<EOF']) {
    assert.ok(blockedGitSubcommand(command), command);
  }
  for (const command of ['git status', 'git log --grep commit', 'git merge origin/main', 'node workflow.mjs commit --message x -- a', 'echo git push', 'gh pr create']) {
    assert.equal(blockedGitSubcommand(command), null, command);
  }
});

function runGuard(cwd, command) {
  return spawnSync(process.execPath, [guard], { input: JSON.stringify({ cwd, tool_input: { command } }), encoding: 'utf8' });
}

test('git guard blocks plain commits only in repositories with workflow config', t => {
  const root = mkdtempSync(join(tmpdir(), 'git-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ['governed', 'plain']) assert.equal(spawnSync('git', ['init', '-q', join(root, name)]).status, 0);
  mkdirSync(join(root, 'governed', '.agents'));
  writeFileSync(join(root, 'governed', '.agents', 'config.json'), '{}');
  const blocked = runGuard(join(root, 'governed'), 'git commit -m x');
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /workflow\.mjs commit/);
  assert.equal(runGuard(join(root, 'governed'), 'git status').status, 0);
  assert.equal(runGuard(join(root, 'plain'), 'git push').status, 0);
});
