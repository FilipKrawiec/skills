import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostBoundModules, scriptRunners, unstubbedHostTests } from './support/host-binary-scan.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const scripts = fileURLToPath(new URL('../../plugins/common/workflow/scripts/', import.meta.url));

const unstubbed = "import { spawnSync } from 'node:child_process';\ntest('x', () => spawnSync('lsof', ['-a']));\n";
const stubbed = "import './support/host-stubs.mjs';\nimport { spawnSync } from 'node:child_process';\ntest('x', () => spawnSync('lsof', ['-a']));\n";

test('the gate fails a fixture test that spawns lsof unstubbed and passes one that uses the stub', () => {
  assert.deepEqual(unstubbedHostTests({ 'a.test.mjs': unstubbed }, []), ['a.test.mjs']);
  assert.deepEqual(unstubbedHostTests({ 'a.test.mjs': stubbed }, []), []);
});

test('the gate fails a test that runs a host binary through a shell or imports a module that does, unless stubbed', () => {
  const shelled = "spawnSync('sh', ['-c', 'ps -o pid= -p 1']);";
  assert.deepEqual(unstubbedHostTests({ 'b.test.mjs': shelled }, []), ['b.test.mjs']);
  const importer = "import { busyPaths } from '../../plugins/common/workflow/scripts/lib/worktrees.mjs';";
  assert.deepEqual(unstubbedHostTests({ 'c.test.mjs': importer }, ['lib/worktrees.mjs']), ['c.test.mjs']);
  assert.deepEqual(unstubbedHostTests({ 'c.test.mjs': `import './support/host-stubs.mjs';\n${importer}` }, ['lib/worktrees.mjs']), []);
  assert.deepEqual(unstubbedHostTests({ 'd.test.mjs': "spawnSync('git', ['status']);" }, ['lib/worktrees.mjs']), []);
});

test('the gate fails a fixture test that spawns workflow.mjs unstubbed, directly or through a support module, and passes one that uses the stub', () => {
  const direct = "import { spawnSync } from 'node:child_process';\ntest('x', () => spawnSync(process.execPath, ['plugins/common/workflow/scripts/workflow.mjs', 'issue']));\n";
  assert.deepEqual(unstubbedHostTests({ 'e.test.mjs': direct }, ['workflow.mjs']), ['e.test.mjs']);
  assert.deepEqual(unstubbedHostTests({ 'e.test.mjs': `import './support/host-stubs.mjs';\n${direct}` }, ['workflow.mjs']), []);
  const support = "const cli = join(root, 'plugins/common/workflow/scripts/workflow.mjs');\nexport const run = () => spawnSync(process.execPath, [cli]);\n";
  const runners = scriptRunners({ 'support/cli-fixture.mjs': support, 'support/paths.mjs': "export const cli = 'workflow.mjs';" }, ['workflow.mjs']);
  assert.deepEqual(runners, ['support/cli-fixture.mjs']);
  const viaSupport = "import { run } from './support/cli-fixture.mjs';\ntest('x', () => run());\n";
  assert.deepEqual(unstubbedHostTests({ 'f.test.mjs': viaSupport }, ['workflow.mjs'], runners), ['f.test.mjs']);
  assert.deepEqual(unstubbedHostTests({ 'f.test.mjs': `import './support/host-stubs.mjs';\n${viaSupport}` }, ['workflow.mjs'], runners), []);
});

test('no test in the suite runs a host binary the suite does not stub', () => {
  const read = (dir, files) => Object.fromEntries(files.map(file => [file, readFileSync(join(dir, file), 'utf8')]));
  const modules = [...readdirSync(scripts).filter(f => f.endsWith('.mjs')), ...readdirSync(join(scripts, 'lib')).map(f => `lib/${f}`).filter(f => f.endsWith('.mjs'))];
  const hostBound = hostBoundModules(read(scripts, modules));
  assert.ok(hostBound.includes('lib/worktrees.mjs'), 'the scan must see worktrees.mjs spawn lsof');
  const tests = read(here, readdirSync(here).filter(f => f.endsWith('.test.mjs') && f !== 'host-binaries.test.mjs'));
  const support = read(join(here, 'support'), readdirSync(join(here, 'support')).filter(f => f.endsWith('.mjs')));
  const runners = scriptRunners(support, hostBound);
  assert.ok(runners.includes('workflow-cli-fixture.mjs'), 'the scan must see the CLI fixture spawn workflow.mjs');
  assert.deepEqual(unstubbedHostTests(tests, hostBound, runners), []);
});
