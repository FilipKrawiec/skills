import './support/host-stubs.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

test('release preview accepts a help-shaped short message value', t => {
  const root = project(t);
  const cli = fileURLToPath(new URL('../../plugins/common/workflow/scripts/workflow.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'release', 'patch', '-m', '-h', '--dry-run', '--root', root], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Nothing to release: v8\.3\.0 is HEAD/);
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

test('release commits the manifests on main and tags that commit', t => {
  const root = project(t);
  for (const name of ['core', 'workflow']) {
    const dir = join(root, 'plugins/common', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package-metadata.json'), `${JSON.stringify({ version: '8.3.0', description: name })}\n`);
  }
  writeFileSync(join(root, 'file.txt'), 'feature');
  command(root, 'git', 'add', '.');
  command(root, 'git', 'commit', '-q', '-m', 'feat: add capability');
  command(root, 'git', 'push', '-q', 'origin', 'main');
  const before = command(root, 'git', 'rev-parse', 'main');
  assert.equal(performRelease({ root }), '8.4.0');
  assert.equal(command(root, 'git', 'branch', '--show-current'), 'main');
  assert.equal(command(root, 'git', 'rev-parse', 'main^'), before);
  assert.equal(command(root, 'git', 'rev-parse', 'v8.4.0^{commit}'), command(root, 'git', 'rev-parse', 'main'));
  assert.equal(command(root, 'git', 'log', '-1', '--format=%s', 'main'), 'chore(release): bump version to 8.4.0');
  assert.deepEqual(command(root, 'git', 'show', '--name-only', '--format=', 'main').split('\n').filter(f => !f.endsWith('package-metadata.json') && !f.endsWith('plugin.json') && !f.includes('marketplace')), []);
  assert.match(command(root, 'git', 'show', 'main:plugins/common/core/package-metadata.json'), /8\.4\.0/);
});

test('the bump commit is tagged at HEAD so its own run releases nothing', t => {
  const root = project(t);
  for (const name of ['core', 'workflow']) {
    const dir = join(root, 'plugins/common', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package-metadata.json'), `${JSON.stringify({ version: '8.3.0', description: name })}\n`);
  }
  command(root, 'git', 'add', '.');
  command(root, 'git', 'commit', '-q', '-m', 'fix: add packages');
  command(root, 'git', 'push', '-q', 'origin', 'main');
  assert.equal(performRelease({ root }), '8.3.1');
  command(root, 'git', 'push', '-q', '--atomic', 'origin', 'HEAD:main', 'refs/tags/v8.3.1');
  assert.equal(performRelease({ root }), null);
});

test('the release workflow creates the GitHub Release before the release branch move, which cannot fail the run', () => {
  const text = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
  const create = text.indexOf('gh release create');
  const move = text.indexOf('HEAD:refs/heads/release');
  assert.ok(create > 0 && move > create, 'Release first, branch move after');
  assert.match(text.slice(move).split('\n')[0], /\|\|/);
});
