import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, githubRepoFromRemote } from './core.mjs';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'workflow.mjs');
const login = /^[A-Za-z0-9-]+$/;
const markEnvironment = repoOwner => `workflow init (${repoOwner}) environment:`;
const runnerRecipes = ['install', 'uninstall'].map(verb => ({ name: `runner-${verb}`, text: `runner-${verb}:\n    node ${cli} runner ${verb}\n` }));
const gatePath = 'scripts/design-system-gate.mjs';
// Copied into a consuming project: it composes its own component library, so feature code never hand-rolls a primitive the library should own.
const gateSource = String.raw`#!/usr/bin/env node
// Design-system gate (workflow init): fails a raw React <button>, <input> or <select>, or a raw Flutter Material widget, outside the library path.
// Usage: node scripts/design-system-gate.mjs LIBRARY_PATH. A missing primitive is added to the library first, never inline in the feature.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const library = process.argv[2];
if (!library) { console.log('design-system gate: no library path configured; nothing to check'); process.exit(0); }
const root = process.cwd();
const libDir = resolve(root, library);
const skip = new Set(['node_modules', '.git', 'build', 'dist', '.dart_tool', 'coverage', '.next']);
const react = /<(button|input|select)(?=[\s/>])/;
const material = /\b(ElevatedButton|TextButton|OutlinedButton|FilledButton|IconButton|FloatingActionButton|TextField|TextFormField|DropdownButton|DropdownMenu|Checkbox|Radio|Switch|Slider)(?:<[^>()]*>)?\s*\(/;
const problems = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (!skip.has(entry.name) && path !== libDir) walk(path); continue; }
    const isReact = /\.(jsx|tsx)$/.test(entry.name);
    const isDart = entry.name.endsWith('.dart');
    if (!isReact && !isDart) continue;
    if (/\.(test|spec)\.(jsx|tsx)$|_test\.dart$/.test(entry.name)) continue;
    readFileSync(path, 'utf8').split(/\r?\n/).forEach((line, at) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      const hit = (isReact ? react : material).exec(line);
      if (hit) problems.push(relative(root, path).split(sep).join('/') + ':' + (at + 1) + ': raw ' + (isReact ? '<' + hit[1] + '>' : hit[1]) + ' outside ' + library + '; add the primitive to the library first');
    });
  }
}
walk(root);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('design-system gate: no raw primitives outside ' + library);
`;
const markAllow = 'workflow init standing owner approval:';

// Claude Code's per-marketplace auto-update flag: released plugin versions then reach the installation without the owner.
export function ensureMarketplaceAutoUpdate(settings) {
  const known = settings.extraKnownMarketplaces && typeof settings.extraKnownMarketplaces === 'object' && !Array.isArray(settings.extraKnownMarketplaces) ? settings.extraKnownMarketplaces : {};
  const entry = known.filipkrawiec && typeof known.filipkrawiec === 'object' ? known.filipkrawiec : {};
  return { ...settings, extraKnownMarketplaces: { ...known, filipkrawiec: { ...entry, source: entry.source || { source: 'github', repo: 'FilipKrawiec/skills' }, autoUpdate: true } } };
}
function environmentEntry(repoOwner, reviewer) {
  return `${markEnvironment(repoOwner)} github.com/${repoOwner}/ repositories and their organization are trusted source control; the GitHub account ${reviewer} is the configured Reviewer identity and posts review verdicts there.`;
}
const allowEntry = `${markAllow} the owner pre-approves everything the workflow drive command does: pushing drive branches, opening and readying pull requests, starting the separate Reviewer session and posting its verdict, turning on auto-merge, merging an approved pull request, closing issues and epics, and changing delivery hosts and models in .agents/config.json through a reviewed pull request. Production release or publish, force-push to a protected branch, and changes to credentials or permissions stay owner-only.`;

export const hasStandingApproval = settings => Array.isArray(settings?.autoMode?.allow) && settings.autoMode.allow.some(item => typeof item === 'string' && item.startsWith(markAllow));

// Adds or refreshes this command's own entries; every other entry, including $defaults, stays.
function ensureEntry(list, marker, entry) {
  const base = Array.isArray(list) && list.length ? [...list] : ['$defaults'];
  const at = base.findIndex(item => typeof item === 'string' && item.startsWith(marker));
  if (at < 0) base.push(entry); else base[at] = entry;
  return base;
}
export function mergeAutoMode(settings, { repoOwner, reviewer }) {
  const current = settings.autoMode && typeof settings.autoMode === 'object' && !Array.isArray(settings.autoMode) ? settings.autoMode : {};
  return {
    ...settings,
    autoMode: {
      ...current,
      environment: ensureEntry(current.environment, markEnvironment(repoOwner), environmentEntry(repoOwner, reviewer)),
      allow: ensureEntry(current.allow, markAllow, allowEntry),
    },
  };
}
function defaultConfig({ implementer, reviewer, owner, test }) {
  const role = model => ({ host: 'claude', model });
  return {
    version: 1,
    identities: { implementer, reviewer, owner },
    steps: { process: null, assemble: null, test },
    delivery: {
      orchestrator: 'claude',
      roles: {
        implementer: role('sonnet'), freshImplementer: role('opus'), reviewer: role('opus'),
        planner: role('opus'), devops: role('opus'), improver: role('opus'),
      },
    },
  };
}
// The project's own verification command: --test, else a justfile verify recipe, else an npm test script.
function detectTestCommand(root, given) {
  if (given) return given.trim().split(/\s+/);
  const justfile = ['justfile', 'Justfile', '.justfile'].map(name => join(root, name)).find(path => existsSync(path));
  if (justfile && /^verify\b[^\n]*:/m.test(readFileSync(justfile, 'utf8'))) return ['just', 'verify'];
  try { if (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts?.test) return ['npm', 'test']; } catch {}
  return null;
}
function codeownersReviewer(contents) {
  const wildcard = String(contents).split(/\r?\n/).map(line => line.replace(/#.*/, '').trim().split(/\s+/).filter(Boolean)).reverse().find(parts => parts[0] === '*');
  const owners = wildcard?.slice(1).filter(value => /^@[A-Za-z0-9-]+$/.test(value)) || [];
  return owners.length === 1 ? owners[0].slice(1) : null;
}
function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot parse ${path}: ${error.message}`);
  }
}
function option(args, name) {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
  return value;
}
function runCli(root, args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  return { ok: !result.error && result.status === 0, text: `${result.stdout || ''}${result.stderr || ''}`.trim() };
}
const defaultIo = {
  root: () => git('rev-parse', '--show-toplevel'),
  remote: () => git('remote', 'get-url', 'origin'),
  settingsPath: () => join(homedir(), '.claude', 'settings.json'),
  runCli,
  verifySettings: path => readJson(path),
  log: line => console.log(line),
};

export function initCommand(args, io = {}) {
  const env = { ...defaultIo, ...io };
  const unknown = args.filter((arg, at) => arg.startsWith('--') && !['--dry-run', '--settings', '--implementer', '--reviewer', '--owner', '--test', '--library'].includes(arg) && !['--settings', '--implementer', '--reviewer', '--owner', '--test', '--library'].includes(args[at - 1]));
  if (unknown.length) throw new Error('Usage: init [--dry-run] [--settings FILE] [--implementer LOGIN] [--reviewer LOGIN] [--owner LOGIN] [--test COMMAND] [--library PATH]');
  const dry = args.includes('--dry-run');
  const root = env.root();
  const repo = githubRepoFromRemote(env.remote());
  const repoOwner = repo.split('/')[0];
  const configPath = join(root, '.agents', 'config.json');
  const codeownersPath = join(root, '.github', 'CODEOWNERS');
  const existingConfig = readJson(configPath);
  const existingCodeowners = existsSync(codeownersPath) ? readFileSync(codeownersPath, 'utf8') : null;
  const reviewer = option(args, '--reviewer') || existingConfig?.identities?.reviewer || (existingCodeowners && codeownersReviewer(existingCodeowners));
  if (!reviewer || !login.test(reviewer)) throw new Error('Name the Reviewer account with --reviewer LOGIN');
  let test;
  if (!existingConfig) {
    test = detectTestCommand(root, option(args, '--test'));
    if (!test) throw new Error('Cannot tell how this project verifies itself (no justfile verify recipe, no npm test script); rerun with --test "COMMAND" naming its full test command (plain words only: no quotes or shell syntax)');
  }
  const library = option(args, '--library');
  if (library !== undefined && (isAbsolute(library) || library.split(/[\\/]/).includes('..') || /\s/.test(library))) throw new Error('--library must be a relative path inside the project, without spaces');
  const todo = [];
  const unable = [];
  const said = message => { env.log(message); };

  // Machine: ~/.claude/settings.json
  const settingsPath = option(args, '--settings') || env.settingsPath();
  const before = readJson(settingsPath) ?? {};
  if (typeof before !== 'object' || Array.isArray(before)) throw new Error(`${settingsPath} must hold a JSON object`);
  const after = ensureMarketplaceAutoUpdate(mergeAutoMode(before, { repoOwner, reviewer }));
  if (JSON.stringify(after) === JSON.stringify(before)) said(`unchanged: ${settingsPath} already holds the autoMode entries and marketplace auto-update`);
  else {
    said(`${dry ? 'would update' : 'updated'}: ${settingsPath} (autoMode.environment for ${repoOwner}, autoMode.allow standing owner approval, extraKnownMarketplaces.filipkrawiec.autoUpdate)`);
    if (!dry) {
      mkdirSync(dirname(settingsPath), { recursive: true });
      if (existsSync(settingsPath)) copyFileSync(settingsPath, `${settingsPath}.bak`);
      writeFileSync(settingsPath, `${JSON.stringify(after, null, 2)}\n`);
    }
  }

  // The headless runner sessions rely on the standing owner approval entry
  if (!dry && !hasStandingApproval(env.verifySettings(settingsPath))) unable.push(`autoMode.allow: ${settingsPath} lacks the standing owner approval entry (${markAllow}); add it by hand, or rerun \`init\` once the file is writable`);

  // Project: .agents/config.json
  if (existingConfig) said(`left untouched: ${configPath} already exists`);
  else {
    const implementer = option(args, '--implementer');
    if (!implementer || !login.test(implementer)) throw new Error('.agents/config.json is missing; name the implementer account with --implementer LOGIN');
    const owner = option(args, '--owner') || repoOwner;
    if (!login.test(owner)) throw new Error('--owner must be a GitHub login');
    said(`${dry ? 'would write' : 'wrote'}: ${configPath} (all delivery roles on Claude: Sonnet implementer, Opus others)`);
    if (!dry) {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, `${JSON.stringify(defaultConfig({ implementer, reviewer, owner, test }), null, 2)}\n`);
    }
    todo.push('.agents/config.json');
  }

  // Project: .github/CODEOWNERS
  if (existingCodeowners === null) {
    said(`${dry ? 'would write' : 'wrote'}: ${codeownersPath} (* @${reviewer})`);
    if (!dry) {
      mkdirSync(dirname(codeownersPath), { recursive: true });
      writeFileSync(codeownersPath, `* @${reviewer}\n`);
    }
    todo.push('.github/CODEOWNERS');
  } else if (codeownersReviewer(existingCodeowners) === reviewer) said(`left untouched: ${codeownersPath} already names @${reviewer} as the default owner`);
  else {
    said(`left untouched: ${codeownersPath} does not name @${reviewer} as the sole default owner`);
    unable.push(`CODEOWNERS: edit .github/CODEOWNERS so \`* @${reviewer}\` is the only default owner, then merge it through a pull request`);
  }

  // Project: justfile runner recipes (existing recipes stay)
  const justPath = ['justfile', 'Justfile', '.justfile'].map(name => join(root, name)).find(path => existsSync(path)) ?? join(root, 'justfile');
  const justText = existsSync(justPath) ? readFileSync(justPath, 'utf8') : '';
  const recipes = library ? [...runnerRecipes, { name: 'design-system-gate', text: `design-system-gate:\n    node ${gatePath} ${library}\n` }] : runnerRecipes;
  const missing = recipes.filter(recipe => !new RegExp(`^${recipe.name}(?=[\\s:])[^\\n]*:`, 'm').test(justText));
  if (!missing.length) said(`left untouched: ${justPath} already has the recipes`);
  else {
    said(`${dry ? 'would add' : 'added'} to ${justPath}: ${missing.map(recipe => recipe.name).join(', ')}`);
    if (!dry) writeFileSync(justPath, `${justText}${justText && !justText.endsWith('\n\n') ? (justText.endsWith('\n') ? '\n' : '\n\n') : ''}${missing.map(recipe => recipe.text).join('\n')}`);
    todo.push(justPath.slice(root.length + 1));
  }

  // Project: the design-system gate, configured with the library path
  if (!library) unable.push('design system: no component library path is configured, so no raw-primitive gate was installed; rerun `init --library PATH` naming the directory of the project\'s own component library');
  else {
    const gateFile = join(root, gatePath);
    if (existsSync(gateFile)) said(`left untouched: ${gateFile} already exists`);
    else {
      said(`${dry ? 'would write' : 'wrote'}: ${gateFile} (fails a raw <button>, <input> or <select>, or a Material widget, outside ${library}; run it with \`just design-system-gate\` and add that to the verify recipe)`);
      if (!dry) {
        mkdirSync(dirname(gateFile), { recursive: true });
        writeFileSync(gateFile, gateSource);
      }
      todo.push(gatePath);
    }
  }

  // GitHub: labels and safety
  if (dry) said('would run: labels ensure, safety check and runner install');
  else {
    const labels = env.runCli(root, ['labels', 'ensure']);
    said(labels.ok ? `labels ensure: ${labels.text || 'all labels exist'}` : `labels ensure failed: ${labels.text}`);
    if (!labels.ok) unable.push('labels: merge the new .agents/config.json and .github/CODEOWNERS to the default branch, then rerun `init`');
    const safety = env.runCli(root, ['safety', 'check']);
    if (safety.text) said(safety.text);
    if (!safety.ok) unable.push('GitHub safety (branch protection, Reviewer role): follow deliver/references/github-safety.md, then rerun `init`; `safety apply` needs the owner account');
  }
  if (!dry) {
    const installed = env.runCli(root, ['runner', 'install']);
    said(installed.ok ? `runner install: ${installed.text}` : `runner install failed: ${installed.text}`);
    if (!installed.ok) unable.push(`runner: the launchd job needs macOS and the owner's session (auto mode blocks agents from installing LaunchAgents); run \`just runner-install\` in ${root}`);
  }
  if (todo.length && !dry) unable.push(`commit and merge the new files (${todo.join(', ')}) to the default branch; the first PR for them needs your approval`);
  said(unable.length ? `could not do:\n${unable.map(line => `- ${line}`).join('\n')}` : 'could not do: nothing');
  return { unable };
}
