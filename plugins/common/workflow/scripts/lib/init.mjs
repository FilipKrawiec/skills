import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, githubRepoFromRemote } from './core.mjs';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'workflow.mjs');
const login = /^[A-Za-z0-9-]+$/;
const markEnvironment = repoOwner => `workflow init (${repoOwner}) environment:`;
const markAllow = 'workflow init standing owner approval:';

function environmentEntry(repoOwner, reviewer) {
  return `${markEnvironment(repoOwner)} github.com/${repoOwner}/ repositories and their organization are trusted source control; the GitHub account ${reviewer} is the configured Reviewer identity and posts review verdicts there.`;
}
const allowEntry = `${markAllow} the owner pre-approves everything the workflow drive command does: pushing drive branches, opening and readying pull requests, starting the separate Reviewer session and posting its verdict, turning on auto-merge, merging an approved pull request, closing issues and epics, and changing delivery hosts and models in .agents/config.json through a reviewed pull request. Production release or publish, force-push to a protected branch, and changes to credentials or permissions stay owner-only.`;

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
  log: line => console.log(line),
};

export function initCommand(args, io = {}) {
  const env = { ...defaultIo, ...io };
  const unknown = args.filter((arg, at) => arg.startsWith('--') && !['--dry-run', '--settings', '--implementer', '--reviewer', '--owner', '--test'].includes(arg) && !['--settings', '--implementer', '--reviewer', '--owner', '--test'].includes(args[at - 1]));
  if (unknown.length) throw new Error('Usage: init [--dry-run] [--settings FILE] [--implementer LOGIN] [--reviewer LOGIN] [--owner LOGIN] [--test COMMAND]');
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
    if (!test) throw new Error('Cannot tell how this project verifies itself (no justfile verify recipe, no npm test script); rerun with --test "COMMAND" naming its full test command');
  }
  const todo = [];
  const unable = [];
  const said = message => { env.log(message); };

  // Machine: ~/.claude/settings.json
  const settingsPath = option(args, '--settings') || env.settingsPath();
  const before = readJson(settingsPath) ?? {};
  if (typeof before !== 'object' || Array.isArray(before)) throw new Error(`${settingsPath} must hold a JSON object`);
  const after = mergeAutoMode(before, { repoOwner, reviewer });
  if (JSON.stringify(after) === JSON.stringify(before)) said(`unchanged: ${settingsPath} already holds the autoMode entries`);
  else {
    said(`${dry ? 'would update' : 'updated'}: ${settingsPath} (autoMode.environment for ${repoOwner}, autoMode.allow standing owner approval)`);
    if (!dry) {
      mkdirSync(dirname(settingsPath), { recursive: true });
      if (existsSync(settingsPath)) copyFileSync(settingsPath, `${settingsPath}.bak`);
      writeFileSync(settingsPath, `${JSON.stringify(after, null, 2)}\n`);
    }
  }

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

  // GitHub: labels and safety
  if (dry) said('would run: labels ensure and safety check');
  else {
    const labels = env.runCli(root, ['labels', 'ensure']);
    said(labels.ok ? `labels ensure: ${labels.text || 'all labels exist'}` : `labels ensure failed: ${labels.text}`);
    if (!labels.ok) unable.push('labels: merge the new .agents/config.json and .github/CODEOWNERS to the default branch, then rerun `init`');
    const safety = env.runCli(root, ['safety', 'check']);
    if (safety.text) said(safety.text);
    if (!safety.ok) unable.push('GitHub safety (branch protection, Reviewer role): follow deliver/references/github-safety.md, then rerun `init`; `safety apply` needs the owner account');
  }
  if (todo.length && !dry) unable.push(`commit and merge the new files (${todo.join(', ')}) to the default branch; the first PR for them needs your approval`);
  said(unable.length ? `could not do:\n${unable.map(line => `- ${line}`).join('\n')}` : 'could not do: nothing');
  return { unable };
}
