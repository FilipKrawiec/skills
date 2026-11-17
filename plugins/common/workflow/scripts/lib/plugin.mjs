import { readFileSync } from 'node:fs';
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
    .flatMap(([key, installs]) => (Array.isArray(installs) ? installs : []).filter(install => typeof install?.version === 'string').map(install => ({ key, version: install.version })));
}
// One line for the owner when an installed copy differs from the CLI's version; null when they match or nothing is known.
export function versionNotice(cliVersion, installed = installedPlugins()) {
  if (!cliVersion) return null;
  const stale = installed.filter(install => install.version !== cliVersion);
  if (!stale.length) return null;
  const versions = [...new Set(stale.map(install => install.version))].join(', ');
  return `workflow: installed plugin ${versions} differs from this CLI's ${cliVersion}; drive's sessions load ${cliVersion} through --plugin-dir. To update the installation, run: claude plugin update ${stale[0].key}`;
}
