import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'local-install-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function link(destination, extra = {}) {
  return spawnSync('just', ['link-agy'], {
    cwd: root,
    env: { ...process.env, AGY_IDE_PLUGIN_DIR: destination, ...extra },
    encoding: 'utf8',
  });
}
function packageNames() {
  return readdirSync(join(root, 'plugins/common'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
}

test('link-agy replaces stale links, supports spaces and preserves unrelated files', t => {
  const destination = join(fixture(t), 'plugin links');
  mkdirSync(destination);
  symlinkSync(join(destination, 'missing'), join(destination, 'filipkrawiec-core'));
  writeFileSync(join(destination, 'unrelated'), 'keep');
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = link(destination);
    assert.equal(result.status, 0, result.stderr);
    for (const name of packageNames()) {
      const path = join(destination, `filipkrawiec-${name}`);
      assert.equal(lstatSync(path).isSymbolicLink(), true, path);
      assert.equal(realpathSync(path), realpathSync(join(root, 'plugins/common', name)));
    }
    assert.equal(readFileSync(join(destination, 'unrelated'), 'utf8'), 'keep');
  }
});

test('link-agy creates its destination without importing devcontainer plugins', t => {
  const directory = fixture(t);
  const destination = join(directory, 'new plugin links');
  const devcontainer = join(directory, 'devcontainer/plugins/unrequested');
  mkdirSync(devcontainer, { recursive: true });
  const result = link(destination, { DEVCONTAINER_ROOT: join(directory, 'devcontainer') });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(new Set(readdirSync(destination)), new Set(packageNames().map(name => `filipkrawiec-${name}`)));
});

test('link-agy refuses real files and directories without removing contents', t => {
  for (const kind of ['directory', 'file']) {
    const destination = join(fixture(t), kind);
    mkdirSync(destination);
    const conflict = join(destination, 'filipkrawiec-core');
    let preserved;
    if (kind === 'directory') {
      mkdirSync(conflict);
      preserved = join(conflict, 'keep');
    } else preserved = conflict;
    writeFileSync(preserved, 'valuable');
    const result = link(destination);
    assert.notEqual(result.status, 0);
    assert.equal(lstatSync(conflict).isSymbolicLink(), false);
    assert.equal(readFileSync(preserved, 'utf8'), 'valuable');
  }
});
