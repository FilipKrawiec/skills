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

test('common packages contain no agent-native rules, and agents only as role definitions', () => {
  for (const name of packages) {
    const path = join(commonRoot, name);
    assert.equal(existsSync(join(path, 'rules')), false, `${name}/rules`);
    // A role's agent definition (such as the workflow's reviewer) preloads only the skills that role needs.
    if (existsSync(join(path, 'agents'))) assert.ok(readdirSync(join(path, 'agents')).every(file => /^[a-z][a-z0-9-]*\.md$/.test(file)), `${name}/agents`);
    const files = readdirSync(path, { recursive: true });
    assert.equal(files.some(file => String(file).endsWith('agents/openai.yaml')), false, name);
  }
});

test('retired orchestration material is absent', () => {
  for (const path of ['plugins/common/orchestration', 'spec/autonomous-sdlc', 'archive/autonomous-sdlc']) {
    assert.equal(existsSync(join(root, path)), false, path);
  }
});

test('the AFK watcher, its queues and its labels are gone', () => {
  const workflow = join(commonRoot, 'workflow');
  for (const path of ['skills/afk', 'skills/review/references/queue.md', 'skills/spec/references/afk-ready.md', 'skills/explore/references/idle.md', 'scripts/lib/afk-board.mjs', 'scripts/lib/afk-runs.mjs', 'scripts/lib/afk-watch.mjs']) {
    assert.equal(existsSync(join(workflow, path)), false, path);
  }
  const files = readdirSync(workflow, { recursive: true }).filter(file => /\.(md|mjs|json)$/.test(String(file)));
  for (const file of files) {
    const text = readFileSync(join(workflow, String(file)), 'utf8');
    assert.doesNotMatch(text, /lane:afk|lane:proposed|state:claimed|reviewQueue|Review queue|issue queue|workflow\.mjs afk|`afk`/, String(file));
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

const skillText = name => readFileSync(join(commonRoot, 'workflow/skills', name, 'SKILL.md'), 'utf8');
const instructionFiles = () => packages.flatMap(name => ['skills', 'agents'].flatMap(dir => {
  const path = join(commonRoot, name, dir);
  return existsSync(path) ? readdirSync(path, { recursive: true }).map(String).filter(file => file.endsWith('.md')).map(file => join(path, file)) : [];
}));

test('deliver replaces vcs, ship and pr-fix, and no skill edits workflow state with gh', () => {
  for (const name of ['vcs', 'ship', 'pr-fix']) assert.equal(existsSync(join(commonRoot, 'workflow/skills', name)), false, name);
  const deliver = skillText('deliver');
  for (const step of ['drive <issue|epic>', '--hand-back <file>', 'session: "separate"', '`wait`', '`owner`']) assert.ok(deliver.includes(step), step);
  for (const file of instructionFiles()) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /gh (pr (ready|merge|checks|edit)|project item-|run watch)|gh issue edit[^\n`]*--(add|remove)-label/, relative(root, file));
  }
});

test('no doctrine: no skill or agent rule mandates a skill by path or by a rule list', () => {
  assert.doesNotMatch(readFileSync(join(root, 'AGENTS.md'), 'utf8'), /^## Doctrine/m);
  for (const file of instructionFiles()) assert.doesNotMatch(readFileSync(file, 'utf8'), /invoke the (craft|design|ux)[\w, ]* skills|skills the project's agent rules name|^## Doctrine/im, relative(root, file));
});

test('delivery skills keep one plain command per Bash call, inline plan scoring, epic-wide improve and a single tdd gate', () => {
  for (const name of ['deliver', 'review']) assert.match(skillText(name), /one plain command per Bash call/, name);
  const plan = skillText('plan');
  assert.match(plan, /start no scorer subagent/);
  assert.doesNotMatch(plan, /fresh subagents|2 scorers/);
  const improve = skillText('improve');
  assert.match(improve, /once per delivered epic/);
  assert.match(improve, /<cli> nits --done/);
  const tdd = skillText('tdd');
  assert.match(tdd, /full gate once through `[^`]*workflow\.mjs check`/);
  assert.match(tdd, /without a fake clock/);
});
