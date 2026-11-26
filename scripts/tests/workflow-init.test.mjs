import test from 'node:test';
import './support/host-stubs.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  const line = unable.find(item => item.startsWith('runner:'));
  assert.ok(line.includes('just runner-install'));
  assert.ok(!line.includes('workflow.mjs'), 'the owner step never names the raw node command');
});

test('init adds the runner recipes to a justfile, creates one, leaves recipes alone and is idempotent', t => {
  const f = fixture(t);
  initCommand(args, f.io);
  const created = readFileSync(join(f.root, 'justfile'), 'utf8');
  assert.match(created, /^runner-install:\n    node \S+workflow\.mjs runner install$/m);
  assert.match(created, /^runner-uninstall:\n    node \S+workflow\.mjs runner uninstall$/m);
  initCommand(args, f.io);
  assert.equal(readFileSync(join(f.root, 'justfile'), 'utf8'), created);
  const g = fixture(t);
  const own = 'verify:\n    make check\n\nrunner-install:\n    echo mine\n';
  writeFileSync(join(g.root, 'justfile'), own);
  initCommand(args, g.io);
  const merged = readFileSync(join(g.root, 'justfile'), 'utf8');
  assert.ok(merged.startsWith(own));
  assert.equal(merged.match(/^runner-install:/gm).length, 1);
  assert.match(merged, /^runner-uninstall:\n    node \S+ runner uninstall$/m);
});

test('a recipe whose name only starts with a runner recipe does not hide the missing one, and the hint names the repository to run it in', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'justfile'), 'runner-install-dev:\n    echo dev\n');
  initCommand(args, f.io);
  assert.match(readFileSync(join(f.root, 'justfile'), 'utf8'), /^runner-install:\n/m, 'runner-install is added beside runner-install-dev');
  const g = fixture(t);
  g.io.runCli = (_root, a) => ({ ok: a[0] !== 'runner', text: 'no launchctl' });
  assert.ok(initCommand(args, g.io).unable.find(item => item.startsWith('runner:')).includes(`in ${g.root}`), 'the consuming repository is named, not "this repository"');
});

test('the justfile runner recipes run existing CLI scripts, and init and runner.md name them', t => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const justfile = readFileSync(join(root, 'justfile'), 'utf8');
  for (const verb of ['install', 'uninstall']) {
    const m = justfile.match(new RegExp(`^runner-${verb}:\\n\\s+node (\\S+) runner ${verb}$`, 'm'));
    assert.ok(m, `justfile has a runner-${verb} recipe`);
    assert.ok(existsSync(join(root, m[1])), `${m[1]} exists`);
  }
  const doc = readFileSync(join(root, 'plugins/common/workflow/skills/deliver/references/runner.md'), 'utf8');
  assert.ok(doc.includes('just runner-install') && doc.includes('just runner-uninstall'));
  const g = fixture(t);
  g.io.runCli = (_root, a) => ({ ok: a[0] !== 'runner', text: 'no launchctl' });
  assert.ok(initCommand(args, g.io).unable.some(line => line.includes('just runner-install')));
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

function gateRun(f, library) {
  return spawnSync(process.execPath, [join(f.root, 'scripts/design-system-gate.mjs'), library], { cwd: f.root, encoding: 'utf8' });
}
function put(f, path, text) {
  mkdirSync(dirname(join(f.root, path)), { recursive: true });
  writeFileSync(join(f.root, path), text);
}

test('init --library installs a gate that fails raw React primitives outside the library and passes them inside it', t => {
  const f = fixture(t);
  initCommand([...args, '--library', 'src/ui'], f.io);
  assert.match(readFileSync(join(f.root, 'justfile'), 'utf8'), /^design-system-gate:\n    node scripts\/design-system-gate\.mjs src\/ui$/m);
  put(f, 'src/ui/Button.tsx', 'export const Button = () => <button type="button">ok</button>;\n');
  put(f, 'src/features/Home.tsx', 'import { Button } from "../ui/Button";\nexport const Home = () => <Button />;\n');
  assert.equal(gateRun(f, 'src/ui').status, 0, 'the same element passes inside the library');
  for (const tag of ['button', 'input', 'select']) {
    put(f, 'src/features/Raw.tsx', `export const Raw = () => <${tag} name="x" />;\n`);
    const result = gateRun(f, 'src/ui');
    assert.equal(result.status, 1, `raw <${tag}> fails`);
    assert.match(result.stderr, new RegExp(`src/features/Raw\\.tsx:1: raw <${tag}> outside src/ui`));
  }
});

test('the gate fails a raw React primitive whose attributes start on the next lines, and init lists wiring it into verify', t => {
  const f = fixture(t);
  const { unable } = initCommand([...args, '--library', 'src/ui'], f.io);
  assert.ok(unable.some(line => line.startsWith('verify:') && line.includes('design-system-gate')));
  put(f, 'src/features/A.tsx', 'export const A = () => (\n  <button\n    type="button"\n    onClick={go}\n  >x</button>\n);\n');
  const result = gateRun(f, 'src/ui');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/features\/A\.tsx:2: raw <button> outside src\/ui/);
});

test('the gate fails a raw Material widget in Flutter feature code and passes it inside the library', t => {
  const f = fixture(t);
  initCommand([...args, '--library', 'lib/ui'], f.io);
  put(f, 'lib/ui/app_button.dart', 'Widget build(c) => ElevatedButton(onPressed: null, child: Text("ok"));\n');
  put(f, 'lib/features/home.dart', 'Widget build(c) => AppButton(label: "ok");\n');
  assert.equal(gateRun(f, 'lib/ui').status, 0);
  put(f, 'lib/features/home.dart', 'Widget build(c) => TextField();\n');
  const result = gateRun(f, 'lib/ui');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lib\/features\/home\.dart:1: raw TextField outside lib\/ui/);
});

test('without a library path init installs no gate and lists the missing setting', t => {
  const f = fixture(t);
  const { unable } = initCommand(args, f.io);
  assert.equal(existsSync(join(f.root, 'scripts/design-system-gate.mjs')), false);
  assert.ok(!readFileSync(join(f.root, 'justfile'), 'utf8').includes('design-system-gate'));
  assert.ok(unable.some(line => line.startsWith('design system:') && line.includes('--library')));
});

test('init --library rejects a path outside the project and a dry run writes no gate', t => {
  const f = fixture(t);
  assert.throws(() => initCommand([...args, '--library', '../ui'], f.io), /--library/);
  initCommand([...args, '--library', 'src/ui', '--dry-run'], f.io);
  assert.equal(existsSync(join(f.root, 'scripts')), false);
});
