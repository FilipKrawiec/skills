import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewerCommand, implementerBrief, reviewerBrief, devopsBrief, plannerBrief, improverBrief } from '../../plugins/common/workflow/scripts/lib/drive.mjs';
import { installedPlugins, pluginRoot, pluginVersion, versionNotice } from '../../plugins/common/workflow/scripts/lib/plugin.mjs';
import { parseUsageLine, usageEntry, usageSummary } from '../../plugins/common/workflow/scripts/lib/usage.mjs';

const workflow = fileURLToPath(new URL('../../plugins/common/workflow', import.meta.url));
const manifest = JSON.parse(readFileSync(join(workflow, '.claude-plugin', 'plugin.json'), 'utf8'));

test('the Reviewer session loads the plugin directory that contains the running CLI', () => {
  const argv = reviewerCommand('opus', '/w/.wf/b.md', 'review-5-r1', 'claude', 'claude', 'medium');
  const at = argv.indexOf('--plugin-dir');
  assert.ok(at > 0);
  assert.equal(argv[at + 1], workflow);
  assert.ok(argv[at + 2].startsWith('--'), 'a flag follows, so a variadic --plugin-dir cannot swallow the prompt');
  assert.equal(argv.at(-1), 'Follow your brief at /w/.wf/b.md. Return at most 5 lines.');
  assert.equal(reviewerCommand('opus', '/b', 'n', 'codex', 'codex').includes('--plugin-dir'), false);
});

test('the CLI knows its own plugin version and briefs name it', () => {
  assert.equal(pluginVersion(), manifest.version);
  assert.equal(pluginRoot.replace(/\/$/, ''), workflow);
  const brief = implementerBrief({ issue: { number: 1, title: 't', url: 'u', body: '' }, step: { mode: 'build' }, risk: 'R1', model: 'sonnet', effort: 'medium', tree: { path: '/w', branch: 'b' }, base: 'main', repo: 'o/r', lanes: {} });
  assert.ok(brief.includes(`Plugin: workflow ${manifest.version}`));
});

test('installed copies that differ from the CLI give a one-line update notice; matching or unknown give none', () => {
  const home = mkdtempSync(join(tmpdir(), 'plugins-'));
  try {
    mkdirSync(join(home, '.claude', 'plugins'), { recursive: true });
    writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: {
      'filipkrawiec-workflow@skills': [{ scope: 'user', version: '11.76.2' }, { scope: 'project', version: '11.65.0' }],
      'other@market': [{ scope: 'user', version: '1.0.0' }],
    } }));
    const installed = installedPlugins(home);
    assert.deepEqual(installed.map(i => i.version), ['11.76.2', '11.65.0']);
    const notice = versionNotice('11.81.0', installed);
    assert.equal(notice.includes('\n'), false);
    assert.match(notice, /11\.76\.2, 11\.65\.0 differs from this CLI's 11\.81\.0/);
    assert.match(notice, /claude plugin update filipkrawiec-workflow@skills --scope user$/);
    assert.equal(versionNotice('11.76.2', [{ key: 'filipkrawiec-workflow@skills', version: '11.76.2' }]), null);
    assert.equal(versionNotice(null, installed), null);
    assert.deepEqual(installedPlugins(join(home, 'missing')), []);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('status separates sessions by the plugin version they reported', () => {
  assert.equal(parseUsageLine('model=opus plugin=11.81.0').plugin, '11.81.0');
  const rows = usageSummary([usageEntry({ role: 'reviewer', host: 'claude', model: 'opus', plugin: '11.81.0' }), usageEntry({ role: 'reviewer', host: 'claude', model: 'opus' })]);
  assert.deepEqual(rows.map(row => row.plugin), ['11.81.0', undefined]);
});

test('every role brief names the plugin version', () => {
  const facts = { issue: { number: 1, title: 't', url: 'u', body: '', labels: [] }, pr: { number: 2, url: 'p', headRefOid: 'a'.repeat(40), body: '' }, step: { mode: 'review', round: 1 }, risk: 'R1', model: 'opus', effort: 'medium', round: 1, tree: { path: '/w', branch: 'b' }, base: 'main', repo: 'o/r', lanes: {}, diffPaths: [] };
  const briefs = { reviewer: reviewerBrief(facts), epicOutcome: reviewerBrief({ ...facts, pr: null, step: { mode: 'epic-outcome', round: 1 } }), improver: improverBrief(facts), devops: devopsBrief(facts), planner: plannerBrief(facts) };
  for (const [role, brief] of Object.entries(briefs)) assert.ok(brief.includes(`Plugin: workflow ${manifest.version}`), role);
});
