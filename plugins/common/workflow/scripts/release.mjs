import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { syncManifests, validateRepositoryReleaseVersion } from './manifests.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
function fail(message) { throw new Error(message); }
function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) fail((result.stderr || '').trim() || `git ${args.join(' ')} failed`);
  return (result.stdout || '').trim();
}
export function semver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value).replace(/^v/, ''));
  return match ? match.slice(1).map(Number) : null;
}
export function commonPackages(root) {
  const path = resolve(root, 'plugins/common');
  return readdirSync(path, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name).sort();
}
function manifestVersion(root) {
  const versions = new Set(commonPackages(root).map(name => JSON.parse(readFileSync(resolve(root, `plugins/common/${name}/package-metadata.json`), 'utf8')).version));
  if (versions.size !== 1) fail(`package-metadata.json versions disagree: ${JSON.stringify([...versions].sort())}`);
  const version = semver([...versions][0]);
  if (!version) fail('package-metadata.json must carry a semantic version');
  return version;
}
function latestTag(root) {
  const tags = git(root, 'tag', '--list', 'v*').split('\n').filter(Boolean).flatMap(tag => {
    const version = semver(tag); return version ? [{ tag, version }] : [];
  });
  tags.sort((a, b) => a.version[0] - b.version[0] || a.version[1] - b.version[1] || a.version[2] - b.version[2]);
  return tags.at(-1) || null;
}
export function bumpType(tag, root) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const log = git(root, 'log', range, '--pretty=format:%B---COMMIT-SEP---');
  let feature = false;
  for (const body of log.split('---COMMIT-SEP---').map(value => value.trim()).filter(Boolean)) {
    const first = body.split(/\r?\n/, 1)[0] || '';
    if (body.includes('BREAKING CHANGE:') || /^\w+(?:\([^)]+\))?!:/.test(first)) return 'major';
    if (/^feat(?:\([^)]+\))?:/i.test(first)) feature = true;
  }
  return feature ? 'minor' : 'patch';
}
export function nextVersion(current, bump) {
  const [major, minor, patch] = current;
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  fail(`unknown bump type '${bump}', expected 'major', 'minor', 'patch', or 'auto'`);
}
function ensureReleasable(root) {
  git(root, 'fetch', '--quiet', '--tags', 'origin');
  const branch = git(root, 'branch', '--show-current');
  if (branch !== 'main') fail(`release only from main, not '${branch || 'a detached HEAD'}'`);
  const status = git(root, 'status', '--porcelain');
  if (status) fail(`cannot release with dirty working tree:\n${status}`);
  if (git(root, 'rev-parse', 'HEAD') !== git(root, 'rev-parse', 'origin/main')) fail('main is not level with origin/main; pull or push first');
}
function manifestPaths(root) {
  const paths = [];
  for (const name of commonPackages(root)) {
    const directory = resolve(root, 'plugins/common', name);
    for (const path of ['package-metadata.json', 'plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
      const full = resolve(directory, path);
      if (existsSync(full)) paths.push(relative(root, full));
    }
  }
  for (const path of ['.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json', '.agents/plugins.json']) {
    if (existsSync(resolve(root, path))) paths.push(path);
  }
  return paths;
}
export function performRelease({ bump = 'auto', message, dryRun = false, root = ROOT } = {}) {
  if (!dryRun) ensureReleasable(root);
  const latest = latestTag(root);
  if (latest && !git(root, 'rev-list', `${latest.tag}..HEAD`)) { console.log(`Nothing to release: ${latest.tag} is HEAD.`); return null; }
  const current = latest ? latest.version : manifestVersion(root);
  const resolvedBump = bump === 'auto' ? bumpType(latest?.tag, root) : bump;
  const version = nextVersion(current, resolvedBump);
  const tag = `v${version}`;
  console.log(`=== Release Automation: ${current.join('.')} -> ${version} (${resolvedBump}) ===`);
  if (dryRun) { console.log(`[dry-run] Would bump version to ${version} and create tag ${tag}`); return version; }

  for (const name of commonPackages(root)) {
    const path = resolve(root, 'plugins/common', name, 'package-metadata.json');
    const data = JSON.parse(readFileSync(path, 'utf8'));
    data.version = version;
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  }
  syncManifests(root);
  const paths = manifestPaths(root);
  if (git(root, 'status', '--porcelain')) {
    git(root, 'add', '--', ...paths);
    git(root, 'commit', '-m', `chore(release): bump version to ${version}`);
  }
  git(root, 'tag', '-a', tag, '-m', message || `Release ${tag}: ${resolvedBump} release automated from conventional commits`);
  validateRepositoryReleaseVersion(root);
  console.log(`Successfully released and tagged ${tag}!`);
  return version;
}
export function releaseCommand(args = []) {
  let bump = 'auto', message, dryRun = false, root = ROOT;
  const rest = [...args];
  if (rest[0] && !rest[0].startsWith('-')) bump = rest.shift();
  while (rest.length) {
    const key = rest.shift();
    if (key === '--dry-run') dryRun = true;
    else if (key === '-m' || key === '--message') message = rest.shift();
    else if (key === '--root' && rest[0]) root = resolve(rest.shift());
    else fail('Usage: workflow release [auto|patch|minor|major] [--message TEXT] [--dry-run]');
  }
  if (!['auto', 'patch', 'minor', 'major'].includes(bump)) fail('Usage: workflow release [auto|patch|minor|major] [--message TEXT] [--dry-run]');
  performRelease({ bump, message, dryRun, root });
  return 0;
}
