import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The plugin directory that contains the running CLI: sessions drive starts load this one, never a stale installed copy.
export const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
const name = 'filipkrawiec-workflow';
const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
export const pluginVersion = (root = pluginRoot) => {
  const version = (readJson(join(root, '.claude-plugin', 'plugin.json')) || readJson(join(root, 'plugin.json')))?.version;
  return typeof version === 'string' ? version : null;
};
// Installed copies of this plugin, as Claude Code records them: [{ key, version }].
export function installedPlugins(home = homedir()) {
  const plugins = readJson(join(home, '.claude', 'plugins', 'installed_plugins.json'))?.plugins;
  if (!plugins || typeof plugins !== 'object') return [];
  return Object.entries(plugins).filter(([key]) => key.startsWith(`${name}@`))
    .flatMap(([key, installs]) => (Array.isArray(installs) ? installs : []).filter(install => typeof install?.version === 'string').map(install => ({ key, version: install.version, scope: install.scope || 'user' })));
}
// One line for the owner when an installed copy differs from the CLI's version; null when they match or nothing is known.
export function versionNotice(cliVersion, installed = installedPlugins()) {
  if (!cliVersion) return null;
  const stale = installed.filter(install => install.version !== cliVersion);
  if (!stale.length) return null;
  const versions = [...new Set(stale.map(install => install.version))].join(', ');
  return `workflow: installed plugin ${versions} differs from this CLI's ${cliVersion}; drive's sessions load ${cliVersion} through --plugin-dir. To update the installation, run: claude plugin update ${stale[0].key} --scope ${stale[0].scope}`;
}

// The newest release this machine knows: the marketplace checkout Claude Code keeps current (with auto-update on).
export const latestRelease = (home = homedir()) => pluginVersion(join(home, '.claude', 'plugins', 'marketplaces', 'filipkrawiec', 'plugins', 'common', 'workflow'));
const numbers = version => String(version).split(/[.-]/).slice(0, 3).map(part => Number(part) || 0);
export function isOlder(running, latest) {
  if (!running || !latest) return false;
  const a = numbers(running); const b = numbers(latest);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
// One line per session when the running copy is older than the latest release; the marker file keeps every later command quiet.
export function staleCopyNotice({ running = pluginVersion(), latest = latestRelease(), session = process.env.CLAUDE_CODE_SESSION_ID || String(process.ppid), directory = join(homedir(), '.cache', 'workflow-cli', 'stale-notice') } = {}) {
  if (!isOlder(running, latest)) return null;
  const marker = join(directory, `${session}`.replace(/[^\w.-]/g, '_'));
  try { if (readFileSync(marker, 'utf8') === latest) return null; } catch { /* first command of this session */ }
  try { mkdirSync(directory, { recursive: true }); writeFileSync(marker, latest); } catch { /* an unwritable cache only repeats the warning */ }
  return `workflow: this CLI is ${running} but ${latest} is released; run \`claude plugin update filipkrawiec-workflow@filipkrawiec\` (init turns on automatic updates so this stops needing you)`;
}
