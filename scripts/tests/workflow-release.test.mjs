import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { bumpType, nextVersion, performRelease, semver } from '../../plugins/common/workflow/scripts/release.mjs';

function command(root, ...args) {
  const result = spawnSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `${args.join(' ')} failed`);
  return (result.stdout || '').trim();
}
function project(t) {
  const root = mkdtempSync(join(tmpdir(), 'workflow-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  command(root, 'git', 'init', '--bare', '-q', '-b', 'main', 'origin.git');
  const clone = join(root, 'clone');
  command(root, 'git', 'clone', '-q', join(root, 'origin.git'), clone);
  command(clone, 'git', 'config', 'user.name', 'Test');
  command(clone, 'git', 'config', 'user.email', 'test@example.test');
  writeFileSync(join(clone, 'file.txt'), 'initial');
  command(clone, 'git', 'add', '.');
  command(clone, 'git', 'commit', '-q', '-m', 'chore: initial');
  command(clone, 'git', 'tag', '-a', 'v8.3.0', '-m', 'v8.3.0');
  command(clone, 'git', 'push', '-q', 'origin', 'main', 'v8.3.0');
  return clone;
}

test('semantic versions and explicit bumps are parsed', () => {
  assert.deepEqual(semver('v9.0.0'), [9, 0, 0]);
  assert.equal(semver('invalid'), null);
  assert.equal(nextVersion([9, 0, 0], 'patch'), '9.0.1');
  assert.equal(nextVersion([9, 0, 0], 'minor'), '9.1.0');
  assert.equal(nextVersion([9, 0, 0], 'major'), '10.0.0');
});

test('conventional commits select major, minor or patch', t => {
  const root = project(t);
  writeFileSync(join(root, 'file.txt'), 'feature');
  command(root, 'git', 'commit', '-am', 'feat(core): add capability');
  assert.equal(bumpType('v8.3.0', root), 'minor');
  writeFileSync(join(root, 'file.txt'), 'breaking');
  command(root, 'git', 'commit', '-am', 'feat!: breaking API');
  assert.equal(bumpType('v8.3.0', root), 'major');
});

test('release preview uses the newest conventional bump without changing the worktree', t => {
  const root = project(t);
  writeFileSync(join(root, 'file.txt'), 'feature');
  command(root, 'git', 'commit', '-am', 'feat: add capability');
  assert.equal(performRelease({ dryRun: true, root }), '8.4.0');
  assert.equal(command(root, 'git', 'status', '--porcelain'), '');
  assert.equal(command(root, 'git', 'tag', '--list'), 'v8.3.0');
});

test('release refuses dirty, non-main, ahead and behind checkouts', t => {
  const root = project(t);
  writeFileSync(join(root, 'dirty.txt'), 'dirty');
  assert.throws(() => performRelease({ bump: 'patch', root }), /dirty working tree/);
  rmSync(join(root, 'dirty.txt'));
  command(root, 'git', 'switch', '-c', 'feature');
  assert.throws(() => performRelease({ bump: 'patch', root }), /only from main/);
  command(root, 'git', 'switch', '-q', 'main');
  writeFileSync(join(root, 'file.txt'), 'ahead');
  command(root, 'git', 'commit', '-qam', 'feat: ahead');
  assert.throws(() => performRelease({ bump: 'patch', root }), /not level with origin\/main/);
});
