import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasStandingApproval, initCommand, mergeAutoMode } from '../../plugins/common/workflow/scripts/lib/init.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'init-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const lines = [];
  const settings = join(dir, 'home', 'settings.json');
  const root = join(dir, 'repo');
  mkdirSync(root, { recursive: true });
  const io = { root: () => root, remote: () => 'git@github.com:acme/widgets.git', settingsPath: () => settings, runCli: (_root, args) => { calls.push(args.join(' ')); return { ok: true, text: '' }; }, log: line => lines.push(line) };
  return { dir, root, settings, calls, lines, io };
}
const args = ['--implementer', 'acme-builder', '--reviewer', 'acme-reviewer', '--test', 'make check'];

test('merges autoMode keeping $defaults and every existing key, with a backup', t => {
  const f = fixture(t);
  mkdirSync(join(f.dir, 'home'));
  const original = { theme: 'dark', autoMode: { environment: ['$defaults', 'mine'], allow: ['$defaults', 'keep'], soft_deny: ['x'] } };
  writeFileSync(f.settings, JSON.stringify(original));
  initCommand(args, f.io);
  const result = JSON.parse(readFileSync(f.settings, 'utf8'));
  assert.equal(result.theme, 'dark');
  assert.deepEqual(result.autoMode.soft_deny, ['x']);
  assert.deepEqual(result.autoMode.environment.slice(0, 2), ['$defaults', 'mine']);
  assert.match(result.autoMode.environment[2], /acme\/.*acme-reviewer/);
  assert.deepEqual(result.autoMode.allow.slice(0, 2), ['$defaults', 'keep']);
  assert.match(result.autoMode.allow[2], /\.agents\/config\.json/);
  assert.match(result.autoMode.allow[2], /Production release or publish, force-push to a protected branch/);
  assert.deepEqual(JSON.parse(readFileSync(`${f.settings}.bak`, 'utf8')), original);
});

test('a second run changes nothing', t => {
  const f = fixture(t);
  initCommand(args, f.io);
  const first = readFileSync(f.settings, 'utf8');
  rmSync(`${f.settings}.bak`, { force: true });
  initCommand(args, f.io);
  assert.equal(readFileSync(f.settings, 'utf8'), first);
  assert.equal(existsSync(`${f.settings}.bak`), false);
  const merged = mergeAutoMode(JSON.parse(first), { repoOwner: 'acme', reviewer: 'acme-reviewer' });
  assert.equal(merged.autoMode.allow.length, 2);
});

test('writes an all-Claude config and a Reviewer-only CODEOWNERS in a bare repo', t => {
  const f = fixture(t);
  initCommand(args, f.io);
  const config = JSON.parse(readFileSync(join(f.root, '.agents/config.json'), 'utf8'));
  assert.equal(config.identities.owner, 'acme');
  assert.equal(config.delivery.orchestrator, 'claude');
  assert.equal(config.delivery.roles.implementer.model, 'sonnet');
  for (const name of ['reviewer', 'planner', 'devops', 'improver', 'freshImplementer']) assert.deepEqual(config.delivery.roles[name], { host: 'claude', model: 'opus' });
  assert.equal(readFileSync(join(f.root, '.github/CODEOWNERS'), 'utf8'), '* @acme-reviewer\n');
  assert.deepEqual(f.calls, ['labels ensure', 'safety check', 'runner install']);
});

test('leaves an existing config untouched and reports it', t => {
  const f = fixture(t);
  mkdirSync(join(f.root, '.agents'));
  const own = '{"version":1,"identities":{"reviewer":"acme-reviewer"}}';
  writeFileSync(join(f.root, '.agents/config.json'), own);
  initCommand(['--settings', f.settings], f.io);
  assert.equal(readFileSync(join(f.root, '.agents/config.json'), 'utf8'), own);
  assert.ok(f.lines.some(line => line.includes('left untouched') && line.includes('config.json')));
});

test('dry run writes nothing and runs nothing', t => {
  const f = fixture(t);
  initCommand([...args, '--dry-run'], f.io);
  assert.equal(existsSync(f.settings), false);
  assert.equal(existsSync(join(f.root, '.agents')), false);
  assert.equal(existsSync(join(f.root, '.github')), false);
  assert.deepEqual(f.calls, []);
  assert.ok(f.lines.some(line => line.startsWith('would update')));
});

test('reports what it could not do with the next step', t => {
  const f = fixture(t);
  f.io.runCli = () => ({ ok: false, text: 'boom' });
  const { unable } = initCommand(args, f.io);
  assert.ok(unable.some(line => line.startsWith('labels:')));
  assert.ok(unable.some(line => line.startsWith('GitHub safety')));
  assert.ok(f.lines.at(-1).startsWith('could not do:'));
});

test('flags a CODEOWNERS that does not name the Reviewer alone', t => {
  const f = fixture(t);
  mkdirSync(join(f.root, '.github'));
  writeFileSync(join(f.root, '.github/CODEOWNERS'), '* @someone\n');
  const { unable } = initCommand(args, f.io);
  assert.equal(readFileSync(join(f.root, '.github/CODEOWNERS'), 'utf8'), '* @someone\n');
  assert.ok(unable.some(line => line.startsWith('CODEOWNERS:')));
});

test('takes the test command from the project, or stops before writing anything', t => {
  const f = fixture(t);
  const bare = ['--implementer', 'acme-builder', '--reviewer', 'acme-reviewer'];
  assert.throws(() => initCommand(bare, f.io), /--test/);
  assert.equal(existsSync(f.settings), false);
  writeFileSync(join(f.root, 'package.json'), '{"scripts":{"test":"x"}}');
  initCommand(bare, f.io);
  assert.deepEqual(JSON.parse(readFileSync(join(f.root, '.agents/config.json'), 'utf8')).steps.test, ['npm', 'test']);
});

test('an explicit --test command is split into argv', t => {
  const f = fixture(t);
  initCommand(args, f.io);
  assert.deepEqual(JSON.parse(readFileSync(join(f.root, '.agents/config.json'), 'utf8')).steps.test, ['make', 'check']);
});

test('init turns on marketplace auto-update, keeps other marketplaces, and verifies it on rerun', t => {
  const f = fixture(t);
  mkdirSync(join(f.dir, 'home'));
  writeFileSync(f.settings, JSON.stringify({ extraKnownMarketplaces: { other: { source: { source: 'github', repo: 'a/b' } } } }));
  initCommand(args, f.io);
  const result = JSON.parse(readFileSync(f.settings, 'utf8'));
  assert.equal(result.extraKnownMarketplaces.filipkrawiec.autoUpdate, true);
  assert.equal(result.extraKnownMarketplaces.filipkrawiec.source.repo, 'FilipKrawiec/skills');
  assert.deepEqual(result.extraKnownMarketplaces.other, { source: { source: 'github', repo: 'a/b' } });
  f.lines.length = 0;
  initCommand(args, f.io);
  assert.ok(f.lines.some(line => /unchanged: .*marketplace auto-update/.test(line)));
  writeFileSync(f.settings, JSON.stringify({ ...result, extraKnownMarketplaces: { ...result.extraKnownMarketplaces, filipkrawiec: { ...result.extraKnownMarketplaces.filipkrawiec, autoUpdate: false } } }));
  initCommand(args, f.io);
  assert.equal(JSON.parse(readFileSync(f.settings, 'utf8')).extraKnownMarketplaces.filipkrawiec.autoUpdate, true, 'a rerun repairs it');
});

test('init runs runner install, and names the exact command when it cannot', t => {
  const f = fixture(t);
  initCommand(args, f.io);
  assert.ok(f.calls.includes('runner install'));
  const g = fixture(t);
  g.io.runCli = (_root, a) => ({ ok: a[0] !== 'runner', text: 'no launchctl' });
  const { unable } = initCommand(args, g.io);
  assert.ok(unable.some(line => line.includes('node ') && line.includes('workflow.mjs runner install')));
});

test('the standing owner approval check finds the entry and lists it when missing', t => {
  const f = fixture(t);
  initCommand(args, f.io);
  assert.equal(hasStandingApproval(JSON.parse(readFileSync(f.settings, 'utf8'))), true);
  assert.equal(hasStandingApproval({ autoMode: { allow: ['$defaults'] } }), false);
  assert.equal(hasStandingApproval({}), false);
  const g = fixture(t);
  g.io.verifySettings = () => ({ autoMode: { allow: ['$defaults'] } });
  const { unable } = initCommand(args, g.io);
  assert.ok(unable.some(line => line.startsWith('autoMode.allow:')));
});

test('dry run does not install the runner', t => {
  const f = fixture(t);
  initCommand([...args, '--dry-run'], f.io);
  assert.ok(f.lines.some(line => /would run: .*runner install/.test(line)));
});
