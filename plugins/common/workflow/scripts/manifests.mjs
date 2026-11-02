import { existsSync, readFileSync, readdirSync, writeFileSync, statSync, realpathSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseYaml } from './yaml-lite.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SKILL_NAME = /^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const REFERENCE_NAME = /^[a-z0-9][a-z0-9-]*\.md$/;
const ALLOWED_FRONTMATTER = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'disable-model-invocation', 'allowed-tools']);
const CODEX_FIELDS = ['author', 'homepage', 'repository', 'license', 'keywords', 'interface'];
const AGY_FIELDS = ['author', 'homepage', 'repository', 'license', 'keywords'];
const ROOT_ENTRIES = new Set(['.claude-plugin', '.codex-plugin', 'package-metadata.json', 'plugin.json', 'pi', 'scripts', 'skills']);
const PROVIDER = /\b(claude|anthropic|codex|openai|chatgpt|gpt-?\d|gemini|antigravity|copilot|cursor)\b/i;

export function fail(message) { throw new Error(message); }
function rel(path, root = ROOT) { return relative(root, path) || '.'; }
function json(path) {
  try { const value = JSON.parse(readFileSync(path, 'utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${rel(path)} must contain a JSON object`); return value; }
  catch (error) { if (error instanceof SyntaxError) fail(`invalid JSON in ${rel(path)}: ${error.message}`); throw error; }
}
function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
function wordCount(text) {
  if (text.startsWith('---\n')) { const end = text.indexOf('\n---', 4); if (end !== -1) text = text.slice(end + 4); }
  return text.trim().split(/\s+/).filter(Boolean).length;
}
function frontmatter(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') fail(`${rel(path)} must start with YAML frontmatter`);
  const end = lines.indexOf('---', 1);
  if (end < 0) fail(`${rel(path)} must close YAML frontmatter`);
  let parsed;
  try { parsed = parseYaml(lines.slice(1, end).join('\n')); }
  catch (error) { fail(`${rel(path)} has invalid YAML frontmatter: ${error.message}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(`${rel(path)} frontmatter must be a YAML mapping`);
  return { data: parsed, text };
}
function stripCode(text) { return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, ''); }
function validateLinks(path, root, confined = null) {
  const text = stripCode(readFileSync(path, 'utf8'));
  const targets = [];
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) targets.push(match[1].trim());
  for (const match of text.matchAll(/^ {0,3}\[[^\]]+\]:\s*(\S+)/gm)) targets.push(match[1].trim());
  for (const target of targets) {
    if (/^(https?:|mailto:|#)/i.test(target)) continue;
    if (target.startsWith('file://') || isAbsolute(target)) fail(`${rel(path, root)} must not use an absolute file URL or path: '${target}'`);
    const targetPath = target.split('#', 1)[0];
    if (!targetPath) continue;
    let resolved = resolve(dirname(path), targetPath);
    if (!existsSync(resolved) || !statSync(resolved).isFile()) fail(`${rel(path, root)} contains broken relative link '${target}' -> ${resolved}`);
    resolved = realpathSync(resolved);
    if (confined && !(resolved === realpathSync(confined) || resolved.startsWith(`${realpathSync(confined)}${sep}`))) fail(`${rel(path, root)} links outside its skill: '${target}'; invoke the skill that owns it instead`);
  }
}
function validateSkill(skillDir, root) {
  const name = skillDir.split(sep).at(-1);
  const skillFile = resolve(skillDir, 'SKILL.md');
  if (!SKILL_NAME.test(name)) fail(`skill directory must be lowercase kebab-case: ${rel(skillDir, root)}`);
  const { data, text } = frontmatter(skillFile);
  const extra = Object.keys(data).filter(key => !ALLOWED_FRONTMATTER.has(key));
  if (extra.length) fail(`${rel(skillFile, root)} uses non-spec frontmatter keys: ${extra.sort().join(', ')}`);
  if (data.name !== name) fail(`${rel(skillFile, root)} name must match directory '${name}'`);
  if (typeof data.description !== 'string' || !data.description) fail(`${rel(skillFile, root)} must define a non-empty description`);
  if (data.description.length > 300) fail(`${rel(skillFile, root)} description exceeds 300 characters (${data.description.length})`);
  const words = wordCount(text);
  if (words > 800) fail(`${rel(skillFile, root)} body exceeds 800 words (${words} words)`);
  if (data['disable-model-invocation'] !== true && data['disable-model-invocation'] !== 'true' && !data.description.startsWith('Use when')) fail(`${rel(skillFile, root)} description must begin with 'Use when...'`);
  if (typeof data['allowed-tools'] !== 'string' || !data['allowed-tools'].trim() || /\n/.test(data['allowed-tools']) || data['allowed-tools'].trim().startsWith('-')) fail(`${rel(skillFile, root)} must define a non-empty 'allowed-tools' space-delimited string`);
  if (/\b[Ii]nvok(?:e|es|ing)\s+`[a-z0-9-]+`/.test(text) && !data['allowed-tools'].split(/\s+/).includes('Skill')) fail(`${rel(skillFile, root)} invokes a skill but 'allowed-tools' lacks Skill`);
  validateLinks(skillFile, root, skillDir);
  for (const path of walk(skillDir)) {
    if (['.md', '.py', '.json', '.yaml', '.yml', '.sh'].includes(path.slice(path.lastIndexOf('.')))) {
      const match = PROVIDER.exec(readFileSync(path, 'utf8'));
      if (match) fail(`${rel(path, root)} names a provider ('${match[0]}'); say 'agent' or 'AI' instead`);
    }
  }
  if (existsSync(resolve(skillDir, 'resources'))) fail(`${rel(skillDir, root)}/resources must be renamed to assets/`);
  for (const path of walk(resolve(skillDir, 'references')).filter(path => path.endsWith('.md'))) {
    if (!REFERENCE_NAME.test(path.split(sep).at(-1))) fail(`reference file must be lowercase kebab-case.md: ${rel(path, root)}`);
    const reference = readFileSync(path, 'utf8');
    if (wordCount(reference) > 600) fail(`reference file ${rel(path, root)} exceeds 600 words (${wordCount(reference)} words)`);
    if (/^##\s+(?:Contents|Table of Contents)/im.test(reference)) fail(`reference file ${rel(path, root)} must not include a Table of Contents`);
    validateLinks(path, root, skillDir);
  }
}
function commonPackages(root) {
  const directory = resolve(root, 'plugins/common');
  const packages = walk(directory).filter(path => path.endsWith(`${sep}package-metadata.json`)).sort();
  if (!packages.length) fail('missing or empty plugins directory');
  return packages;
}
function expectedManifests(metadata) {
  const identity = { name: metadata.name, description: metadata.description, version: metadata.version };
  const host = { ...identity, skills: './skills/' };
  const select = fields => Object.fromEntries(fields.filter(field => metadata[field] !== undefined).map(field => [field, metadata[field]]));
  return {
    'plugin.json': { ...identity, ...select(AGY_FIELDS) },
    '.claude-plugin/plugin.json': host,
    '.codex-plugin/plugin.json': { ...host, ...select(CODEX_FIELDS) },
  };
}
function validatePackage(metadataPath, expectedName, root) {
  const metadata = json(metadataPath);
  if (metadata.name !== expectedName) fail(`${rel(metadataPath, root)} must use package name ${expectedName}`);
  if (typeof metadata.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(metadata.version)) fail(`${rel(metadataPath, root)} must define a semantic version`);
  if (typeof metadata.description !== 'string' || !metadata.description) fail(`${rel(metadataPath, root)} must define a non-empty description`);
  const packageRoot = dirname(metadataPath);
  for (const [manifest, expected] of Object.entries(expectedManifests(metadata))) {
    const path = resolve(packageRoot, manifest);
    const actual = json(path);
    const fields = new Set(Object.keys(expected));
    if (manifest === '.codex-plugin/plugin.json') CODEX_FIELDS.forEach(field => fields.add(field));
    if (manifest === 'plugin.json') AGY_FIELDS.forEach(field => fields.add(field));
    for (const field of fields) if (!isDeepStrictEqual(actual[field], expected[field])) fail(`${rel(path, root)} must match package ${field}`);
    if (manifest !== 'plugin.json' && ('hooks' in actual || existsSync(resolve(dirname(path), 'hooks.json')))) fail(`${rel(dirname(path), root)} must not declare hooks; a skill's rules live in its SKILL.md`);
  }
  const allowed = new Set([...ROOT_ENTRIES, '.DS_Store']);
  const extras = readdirSync(packageRoot).filter(name => !allowed.has(name));
  if (extras.length) fail(`${rel(packageRoot, root)}: package root may hold only ${[...ROOT_ENTRIES].sort().join(', ')}, not ${extras.sort().join(', ')}`);
  const skillsRoot = resolve(packageRoot, 'skills');
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) if (entry.name !== '.DS_Store' && (!entry.isDirectory() || !existsSync(resolve(skillsRoot, entry.name, 'SKILL.md')))) fail(`${rel(packageRoot, root)}: skills/${entry.name} is not a skill`);
  return { metadata, packageRoot, expectedName };
}
function validateRepositoryMarkdown(root) {
  for (const candidate of ['docs', 'AGENTS.md', 'README.md', 'CONTRIBUTING.md', 'EVENT-STORMING.md']) {
    const path = resolve(root, candidate);
    if (existsSync(path) && path.endsWith('.md')) validateLinks(path, root);
    else for (const md of walk(path).filter(file => file.endsWith('.md'))) validateLinks(md, root);
  }
}
export function validateRepositoryReleaseVersion(root = ROOT) {
  const versions = new Set();
  for (const metadataPath of commonPackages(root)) {
    const pkg = dirname(metadataPath);
    for (const path of [metadataPath, resolve(pkg, 'plugin.json'), resolve(pkg, '.claude-plugin/plugin.json'), resolve(pkg, '.codex-plugin/plugin.json')]) {
      const version = json(path).version;
      if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) fail(`${rel(path, root)} must define a semantic release version`);
      versions.add(version);
    }
  }
  if (versions.size !== 1) fail(`all plugin definitions must share one release version, found ${JSON.stringify([...versions].sort())}`);
}
export function syncManifests(root = ROOT) {
  const packages = commonPackages(root);
  const versions = new Set(packages.map(path => json(path).version).filter(Boolean));
  if (versions.size !== 1) fail(`Cannot sync: found multiple versions across package-metadata.json: ${JSON.stringify([...versions].sort())}`);
  const version = [...versions][0];
  const claude = [], codex = [];
  let synced = 0;
  for (const metadataPath of packages) {
    const pkg = dirname(metadataPath);
    const metadata = json(metadataPath);
    const name = `filipkrawiec-${pkg.split(sep).at(-1)}`;
    const description = metadata.description || '';
    for (const [manifest, value] of Object.entries(expectedManifests({ ...metadata, name, description, version }))) {
      const path = resolve(pkg, manifest);
      const data = `${JSON.stringify(value, null, 2)}\n`;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, data);
      synced++;
    }
    const source = `./${relative(root, pkg).split(sep).join('/')}`;
    const repo = metadata.repository || 'https://github.com/FilipKrawiec/skills';
    claude.push({ name, description, category: 'development', source, homepage: repo });
    codex.push({ name, source: { source: 'local', path: source }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Engineering' });
  }
  for (const [path, plugins] of [[resolve(root, '.claude-plugin/marketplace.json'), claude], [resolve(root, '.agents/plugins/marketplace.json'), codex]]) {
    if (!existsSync(path)) continue;
    const data = json(path); data.plugins = plugins; writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`); synced++;
  }
  const agy = resolve(root, '.agents/plugins.json');
  if (existsSync(dirname(agy))) { writeFileSync(agy, `${JSON.stringify({ entries: [{ path: 'plugins/common' }] }, null, 2)}\n`); synced++; }
  console.log(`Synchronized ${synced} manifest files to release version ${version}.`);
}
export function validateRepository(root = ROOT) {
  const packages = commonPackages(root);
  for (const metadataPath of packages) {
    const packageRoot = dirname(metadataPath);
    const expectedName = `filipkrawiec-${packageRoot.split(sep).at(-1)}`;
    validatePackage(metadataPath, expectedName, root);
    const skillRoot = resolve(packageRoot, 'skills');
    const skills = readdirSync(skillRoot, { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(resolve(skillRoot, entry.name, 'SKILL.md')));
    if (!skills.length) fail(`${rel(skillRoot, root)} has no valid skills`);
    for (const skill of skills) validateSkill(resolve(skillRoot, skill.name), root);
  }
  for (const retired of [resolve(root, 'plugins/common/orchestration'), resolve(root, 'spec/autonomous-sdlc'), resolve(root, 'archive/autonomous-sdlc')]) if (existsSync(retired)) fail(`retired orchestration material remains at ${rel(retired, root)}`);
  const agy = resolve(root, '.agents/plugins.json');
  if (!existsSync(agy) || !Array.isArray(json(agy).entries) || !json(agy).entries.some(entry => entry?.path === 'plugins/common' || entry?.path === './plugins/common')) fail(`${rel(agy, root)} must declare 'plugins/common' in entries`);
  validateRepositoryReleaseVersion(root);
  validateRepositoryMarkdown(root);
  console.log('Plugin validation passed.');
}
export function manifestsCommand(args = []) {
  const [action = 'verify', rootArg] = args;
  if (!['verify', 'sync'].includes(action) || args.length > 2) fail('Usage: workflow manifests [verify|sync] [repository-root]');
  const root = resolve(rootArg || ROOT);
  if (action === 'sync') syncManifests(root);
  validateRepository(root);
  return 0;
}
