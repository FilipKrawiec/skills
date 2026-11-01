import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const commonRoot = join(root, 'plugins/common');
const packages = readdirSync(commonRoot, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name).sort();
const json = path => JSON.parse(readFileSync(join(root, path), 'utf8'));

test('common packages are directly installable by every host', () => {
  for (const name of packages) {
    const path = join(commonRoot, name);
    for (const required of ['skills', 'plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
      assert.equal(existsSync(join(path, required)), true, `${name}/${required}`);
    }
  }
});

test('all plugin definitions share the repository release version', () => {
  const expected = json('plugins/common/core/package-metadata.json').version;
  const versions = new Set(packages.flatMap(name => [
    'package-metadata.json', 'plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json',
  ].map(file => json(`plugins/common/${name}/${file}`).version)));
  assert.deepEqual([...versions], [expected]);
});

test('common packages contain no agent-native rules or agents', () => {
  for (const name of packages) {
    const path = join(commonRoot, name);
    assert.equal(existsSync(join(path, 'rules')), false, `${name}/rules`);
    assert.equal(existsSync(join(path, 'agents')), false, `${name}/agents`);
    const files = readdirSync(path, { recursive: true });
    assert.equal(files.some(file => String(file).endsWith('agents/openai.yaml')), false, name);
  }
});

test('retired orchestration material is absent', () => {
  for (const path of ['plugins/common/orchestration', 'spec/autonomous-sdlc', 'archive/autonomous-sdlc']) {
    assert.equal(existsSync(join(root, path)), false, path);
  }
});

test('agent marketplaces list only their common packages', () => {
  const claude = json('.claude-plugin/marketplace.json');
  const codex = json('.agents/plugins/marketplace.json');
  assert.deepEqual(new Set(claude.plugins.map(plugin => plugin.source)), new Set(packages.map(name => `./plugins/common/${name}`)));
  assert.deepEqual(new Set(codex.plugins.map(plugin => plugin.source.path)), new Set(packages.map(name => `./plugins/common/${name}`)));
});

test('Antigravity workspace configuration includes common packages', () => {
  const config = json('.agents/plugins.json');
  assert.ok(config.entries.some(entry => entry.path === 'plugins/common'));
});

test('all docs and ADRs are indexed', () => {
  const index = readFileSync(join(root, 'docs/index.md'), 'utf8');
  const adrIndex = readFileSync(join(root, 'docs/adr/README.md'), 'utf8');
  const recordIndex = readFileSync(join(root, 'docs/records/README.md'), 'utf8');
  assert.ok(index.includes('CONCEPTS.md'));
  for (const file of readdirSync(join(root, 'docs/adr')).filter(name => name.endsWith('.md') && name !== 'README.md')) {
    assert.ok(index.includes(file) || adrIndex.includes(file), `ADR not indexed: ${file}`);
  }
  for (const file of readdirSync(join(root, 'docs/records')).filter(name => name.endsWith('.md') && name !== 'README.md')) {
    assert.ok(index.includes(file) || recordIndex.includes(file), `Record not indexed: ${file}`);
  }
});

test('skills do not hardcode repository scripts or test directories', () => {
  const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : entry.name.endsWith('.md') ? [path] : [];
  });
  for (const path of walk(join(root, 'plugins'))) {
    const content = readFileSync(path, 'utf8');
    assert.ok(!content.includes('scripts/release.py'), `${relative(root, path)} hardcodes scripts/release.py`);
    assert.ok(!content.includes('scripts/tests'), `${relative(root, path)} hardcodes scripts/tests`);
  }
});

test('repository tests and verification no longer depend on Python', () => {
  const pythonFiles = [];
  const walk = directory => readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'build') return;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.py')) pythonFiles.push(relative(root, path));
  });
  walk(root);
  assert.deepEqual(pythonFiles, []);
  const justfile = readFileSync(join(root, 'justfile'), 'utf8');
  const workflow = readFileSync(join(root, '.github/workflows/verify.yml'), 'utf8');
  assert.match(justfile, /unit:\n\s+node --test scripts\/tests\/\*\.test\.mjs/);
  assert.doesNotMatch(justfile, /python3|pip install/);
  assert.doesNotMatch(workflow, /setup-python|python3|pip install/);
});
