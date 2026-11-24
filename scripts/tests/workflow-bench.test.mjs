import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { benchCommand, checkGate, checkGuardRemoval, checkLayerImports, checkRawPrimitives, checkRedRun, compareResults, parseSettings, parseVerdict, renderResults, scoreEntry, summarize, summarizeByRisk, validateImplementerSnapshot, validateSnapshot } from '../../plugins/common/workflow/scripts/lib/bench.mjs';

const sha = char => char.repeat(40);
const defect = { pr: 1, issue: 11, title: 'feat: a', kind: 'defect', risk: 'R1', base: sha('a'), head: sha('b'), defect: { name: 'reverses delta-only rounds', keywords: ['delta', 'whole diff'] } };
const clean = { pr: 2, issue: 12, title: 'chore: b', kind: 'clean', risk: 'R2', base: sha('c'), head: sha('d') };
const snapshot = { version: 1, repo: 'o/r', counts: { defect: 1, clean: 1 }, entries: [defect, clean] };
const review = (verdict, text = '', cost = 0.25) => ({ verdict, text, usage: { cost } });

test('a defect is caught only on a blocking verdict that names it', () => {
  assert.deepEqual(scoreEntry(defect, review('fixes', 'Important: this restores the whole diff each round')), { caught: true, falsePositive: null });
  assert.deepEqual(scoreEntry(defect, review('ready', 'delta looks fine')), { caught: false, falsePositive: null });
  assert.deepEqual(scoreEntry(defect, review('fixes', 'Nit: naming of a variable')), { caught: false, falsePositive: null });
});
test('a clean PR is a false positive when the Reviewer blocks it', () => {
  assert.deepEqual(scoreEntry(clean, review('fixes', 'Important: something')), { caught: null, falsePositive: true });
  assert.deepEqual(scoreEntry(clean, review('ready')), { caught: null, falsePositive: false });
  assert.deepEqual(scoreEntry(clean, { verdict: null, text: 'garbled' }), { caught: null, falsePositive: false });
});
test('verdicts are read from the hand-back', () => {
  assert.equal(parseVerdict('verdict: FIXES\nPR #1'), 'fixes');
  assert.equal(parseVerdict('Verdict=ready'), 'ready');
  assert.equal(parseVerdict('no verdict here'), null);
});
test('totals count catches, false positives and cost, leaving unreported usage out of the mean', () => {
  const rows = [
    { pr: 1, kind: 'defect', caught: true, falsePositive: null, cost: 0.2 },
    { pr: 3, kind: 'defect', caught: false, falsePositive: null, cost: null },
    { pr: 2, kind: 'clean', caught: null, falsePositive: true, cost: 0.4 },
  ];
  assert.deepEqual(summarize(rows), { defects: 2, caught: 1, clean: 1, falsePositives: 1, cost: { total: 0.6, mean: 0.3, reported: 2, unreported: 1 } });
  assert.deepEqual(summarize([{ pr: 1, kind: 'clean', caught: null, falsePositive: false, cost: null }]).cost, { total: 'unreported', mean: 'unreported', reported: 0, unreported: 1 });
});
test('snapshot validation names each problem', () => {
  assert.deepEqual(validateSnapshot(snapshot), []);
  const bad = { version: 1, repo: 'o/r', counts: { defect: 2, clean: 1 }, entries: [{ ...defect, head: 'abc' }, { ...defect, defect: undefined }, { ...clean, defect: { name: 'x', keywords: ['y'] } }, { ...clean, pr: 2 }] };
  const problems = validateSnapshot(bad).join('\n');
  assert.match(problems, /#1: head must be a 40 or 64 character commit id/);
  assert.match(problems, /#1: duplicate PR/);
  assert.match(validateSnapshot({ ...snapshot, entries: [{ ...defect, issue: undefined }, clean] }).join('\n'), /#1: issue must be the closing issue number/);
  assert.match(problems, /#1: a known-defect PR names its defect and keywords/);
  assert.match(problems, /#2: a known-clean PR has no defect/);
  assert.match(problems, /counts do not match/);
  assert.match(validateSnapshot({ version: 2, entries: [] }).join('\n'), /version 1/);
  assert.match(validateSnapshot({ version: 1, repo: 'o/r', counts: { defect: 0, clean: 0 }, entries: [] }).join('\n'), /no entries/);
});
test('the committed snapshot validates and states its counts', () => {
  const committed = JSON.parse(readFileSync(fileURLToPath(new URL('../../docs/review-benchmark.json', import.meta.url)), 'utf8'));
  assert.deepEqual(validateSnapshot(committed), []);
  assert.ok(committed.counts.defect >= 3 && committed.counts.clean >= 1);
  assert.deepEqual(committed.counts, { defect: 4, clean: 4 });
  assert.equal(committed.entries.find((e) => e.pr === 568).kind, 'defect');
});
test('compare shows the delta in catches, false positives and cost', () => {
  const before = { summary: { defects: 3, caught: 1, clean: 2, falsePositives: 1, cost: { total: 1, mean: 0.2, reported: 5, unreported: 0 } } };
  const after = { summary: { defects: 3, caught: 2, clean: 2, falsePositives: 0, cost: { total: 0.5, mean: 0.1, reported: 5, unreported: 0 } } };
  assert.deepEqual(compareResults(before, after), { caught: 1, falsePositives: -1, totalCost: -0.5, meanCost: -0.1 });
  const unreported = { summary: { ...after.summary, cost: { total: 'unreported', mean: 'unreported', reported: 0, unreported: 5 } } };
  assert.deepEqual(compareResults(before, unreported), { caught: 1, falsePositives: -1, totalCost: 'unreported', meanCost: 'unreported' });
});
test('settings are model:effort pairs and reject anything else', () => {
  assert.deepEqual(parseSettings('sonnet:medium,opus:high'), [{ model: 'sonnet', effort: 'medium' }, { model: 'opus', effort: 'high' }]);
  assert.throws(() => parseSettings('opus'), /model:effort/);
  assert.throws(() => parseSettings('opus:extreme'), /effort/);
  assert.throws(() => parseSettings('opus:high,opus:high'), /twice/);
});
test('each snapshot entry names its risk', () => {
  assert.match(validateSnapshot({ ...snapshot, entries: [{ ...defect, risk: undefined }, clean] }).join('\n'), /#1: risk must be R0, R1 or R2/);
  assert.match(validateSnapshot({ ...snapshot, entries: [{ ...defect, risk: 'R3' }, clean] }).join('\n'), /#1: risk must be R0, R1 or R2/);
});
test('summaries split by the risk of each entry, with its sample size', () => {
  const rows = [
    { pr: 1, kind: 'defect', risk: 'R1', caught: true, falsePositive: null, cost: 0.2 },
    { pr: 3, kind: 'defect', risk: 'R2', caught: false, falsePositive: null, cost: 0.4 },
    { pr: 2, kind: 'clean', risk: 'R1', caught: null, falsePositive: true, cost: 0.1 },
  ];
  const byRisk = summarizeByRisk(rows);
  assert.deepEqual(Object.keys(byRisk), ['R0', 'R1', 'R2']);
  assert.deepEqual([byRisk.R0.defects, byRisk.R0.clean], [0, 0]);
  assert.deepEqual([byRisk.R1.defects, byRisk.R1.caught, byRisk.R1.clean, byRisk.R1.falsePositives, byRisk.R1.cost.total], [1, 1, 1, 1, 0.3]);
  assert.deepEqual([byRisk.R2.defects, byRisk.R2.caught, byRisk.R2.falsePositives], [1, 0, 0]);
});
test('text output names verdict, catch, false positive and cost per PR and per risk', () => {
  const rows = [
    { pr: 1, kind: 'defect', risk: 'R1', title: 'feat: a', verdict: 'fixes', caught: true, falsePositive: null, cost: 0.2 },
    { pr: 2, kind: 'clean', risk: 'R2', title: 'chore: b', verdict: 'fixes', caught: null, falsePositive: true, cost: null },
  ];
  const result = { runs: [{ model: 'opus', effort: 'high', rows, summary: summarize(rows), byRisk: summarizeByRisk(rows) }] };
  const text = renderResults(result, [{ caught: 1, falsePositives: 0, totalCost: 0.1, meanCost: 0.05 }]);
  assert.match(text, /== opus high/);
  assert.match(text, /#1 R1 defect fixes caught \$0\.20/);
  assert.match(text, /#2 R2 clean fixes false positive unreported/);
  assert.match(text, /caught 1\/1; false positives 1\/1; cost total \$0\.20, mean \$0\.20 \(1 unreported\)/);
  assert.match(text, /R1: caught 1\/1; false positives 0\/0; cost total \$0\.20/);
  assert.match(text, /R2: caught 0\/0; false positives 1\/1/);
  assert.match(text, /vs saved: caught \+1, false positives \+0, total cost \+\$0\.10, mean cost \+\$0\.05/);
});

const capture = async args => {
  const lines = [];
  const original = console.log;
  console.log = line => lines.push(String(line));
  try { return { code: await benchCommand(args.args, args.io), out: lines.join('\n') }; } finally { console.log = original; }
};
const withSnapshot = async action => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-'));
  try { const file = join(dir, 'snapshot.json'); writeFileSync(file, JSON.stringify(snapshot)); return await action(dir, file); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('without --run the command validates and lists what it would run per setting, spending nothing', async () => {
  let calls = 0;
  await withSnapshot(async (dir, file) => {
    const { code, out } = await capture({ args: ['--snapshot', file, '--settings', 'sonnet:medium,opus:high', '--json'], io: { review: () => { calls++; return review('ready'); } } });
    assert.equal(code, 0);
    const printed = JSON.parse(out);
    assert.equal(printed.run, false);
    assert.equal(printed.cost, 0);
    assert.deepEqual(printed.would.map(entry => entry.pr), [1, 2]);
    assert.deepEqual(printed.settings, [{ model: 'sonnet', effort: 'medium' }, { model: 'opus', effort: 'high' }]);
    assert.equal(calls, 0);
    const text = await capture({ args: ['--snapshot', file], io: { review: () => { calls++; } } });
    assert.match(text.out, /Dry listing; nothing run/);
    assert.match(text.out, /1 known-defect and 1 known-clean/);
    assert.equal(calls, 0);
  });
});
test('an invalid snapshot fails before any replay', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-'));
  try {
    const file = join(dir, 'bad.json');
    writeFileSync(file, JSON.stringify({ version: 1, repo: 'o/r', counts: { defect: 0, clean: 0 }, entries: [] }));
    let calls = 0;
    await assert.rejects(() => benchCommand(['--snapshot', file, '--run'], { review: () => { calls++; } }), /no entries/);
    assert.equal(calls, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('--run replays the snapshot once per setting through the stubbed Reviewer, saves JSON and compares per setting', async () => {
  await withSnapshot(async (dir, file) => {
    const seen = [];
    const reviews = { 'sonnet:medium': { 1: review('ready', '', 0.1), 2: review('fixes', 'Important: x', 0.1) }, 'opus:high': { 1: review('fixes', 'whole diff restored', 0.3), 2: { verdict: 'ready', text: '', usage: null } } };
    const io = { review: (entry, setting) => { seen.push(`${setting.model}:${setting.effort}:${entry.pr}`); return reviews[`${setting.model}:${setting.effort}`][entry.pr]; } };
    const args = ['--snapshot', file, '--run', '--settings', 'sonnet:medium,opus:high'];
    const out = join(dir, 'now.json');
    const first = await capture({ args: [...args, '--json', '--out', out], io });
    assert.deepEqual(seen, ['sonnet:medium:1', 'sonnet:medium:2', 'opus:high:1', 'opus:high:2']);
    const result = JSON.parse(first.out);
    assert.deepEqual(result.runs.map(run => [run.model, run.effort, run.summary.caught, run.summary.falsePositives]), [['sonnet', 'medium', 0, 1], ['opus', 'high', 1, 0]]);
    const opus = result.runs[1];
    assert.deepEqual(opus.rows.map(row => [row.pr, row.risk, row.verdict, row.caught, row.falsePositive, row.cost]), [[1, 'R1', 'fixes', true, null, 0.3], [2, 'R2', 'ready', null, false, null]]);
    assert.equal(opus.summary.cost.unreported, 1);
    assert.equal(opus.byRisk.R1.caught, 1);
    assert.equal(opus.byRisk.R2.falsePositives, 0);
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).runs.map(run => run.summary), result.runs.map(run => run.summary));
    reviews['opus:high'][1] = review('ready', '', 0.1);
    const second = await capture({ args: [...args, '--compare', out], io });
    assert.match(second.out, /vs saved: caught -1/);
    const replayed = await capture({ args: ['--snapshot', file, '--from', out, '--compare', out], io: { review: () => { throw new Error('must not run'); } } });
    assert.match(replayed.out, /vs saved: caught \+0/);
  });
});
test('--from wraps a legacy result with top-level rows and summary as one run', async () => {
  await withSnapshot(async (dir, file) => {
    const out = join(dir, 'now.json');
    await capture({ args: ['--snapshot', file, '--run', '--json', '--out', out], io: { model: 'opus', effort: 'medium', review: () => review('ready') } });
    const [run] = JSON.parse(readFileSync(out, 'utf8')).runs;
    const legacy = join(dir, 'legacy.json');
    writeFileSync(legacy, JSON.stringify({ rows: run.rows, summary: run.summary }));
    const { out: text } = await capture({ args: ['--snapshot', file, '--from', legacy, '--json'], io: { review: () => { throw new Error('must not run'); } } });
    assert.equal(JSON.parse(text).runs.length, 1);
    assert.equal(JSON.parse(text).runs[0].summary.clean, run.summary.clean);
  });
});
test('--run without --settings uses the single configured setting', async () => {
  await withSnapshot(async (dir, file) => {
    const seen = [];
    const io = { model: 'opus', effort: 'medium', review: (entry, setting) => { seen.push(`${setting.model}:${setting.effort}`); return review('ready'); } };
    const { out } = await capture({ args: ['--snapshot', file, '--run', '--json'], io });
    assert.deepEqual(seen, ['opus:medium', 'opus:medium']);
    assert.equal(JSON.parse(out).runs.length, 1);
  });
});

// The implementer bench.
const tree = entries => new Map(Object.entries(entries));
test('layer check: a domain file importing an app, api or infra path fails, in four languages', () => {
  const cases = {
    typescript: [{ 'src/users/domain/users.ts': "import { x } from '../domain/other.ts';\nexport const a = 1;" }, { 'src/users/domain/users.ts': "import { save } from '../infra/memory-users.ts';" }, '../infra/memory-users.ts'],
    java: [{ 'src/main/java/com/example/users/domain/User.java': 'import java.util.List;\nimport com.example.users.domain.Email;' }, { 'src/main/java/com/example/users/domain/User.java': 'import com.example.users.infrastructure.UserEntity;' }, 'com.example.users.infrastructure.UserEntity'],
    kotlin: [{ 'src/main/kotlin/users/domain/User.kt': 'import kotlin.math.max' }, { 'src/main/kotlin/users/domain/User.kt': 'import users.application.RegisterUser' }, 'users.application.RegisterUser'],
    dart: [{ 'lib/users/domain/user.dart': "import 'package:meta/meta.dart';\nimport 'email.dart';" }, { 'lib/users/domain/user.dart': "import '../api/user_dto.dart';" }, '../api/user_dto.dart'],
  };
  for (const [language, [good, bad, target]] of Object.entries(cases)) {
    assert.deepEqual(checkLayerImports(tree(good), language), { pass: true, violations: [] }, language);
    const failed = checkLayerImports(tree(bad), language);
    assert.equal(failed.pass, false, language);
    assert.match(failed.violations[0], new RegExp(target.replaceAll('.', '\\.')), language);
  }
  assert.equal(checkLayerImports(tree({ 'src/users/app/use.ts': "import { x } from '../infra/y.ts';" }), 'typescript').pass, true, 'only domain files are checked');
  assert.equal(checkLayerImports(tree({ 'src/users/domain/users.test.ts': "import { x } from '../infra/y.ts';" }), 'typescript').pass, true, 'a domain test may wire an adapter');
});
test('primitive check: a raw primitive on a public domain signature fails, in four languages', () => {
  const cases = {
    typescript: ['export function rename(user: User, name: Name): User {', 'export function rename(user: User, name: string): User {', 'rename uses string'],
    java: ['    public Order cancel(Reason reason) {', '    public Order cancel(String reason) {', 'cancel uses String'],
    kotlin: ['    fun cancel(reason: Reason): Order {', '    fun cancel(reason: String): Order {', 'cancel uses String'],
    dart: ['  Order cancel(Reason reason) {', '  Order cancel(String reason) {', 'cancel uses String'],
  };
  const paths = { typescript: 'src/o/domain/o.ts', java: 'src/o/domain/Order.java', kotlin: 'src/o/domain/Order.kt', dart: 'lib/o/domain/order.dart' };
  for (const [language, [good, bad, message]] of Object.entries(cases)) {
    const path = paths[language];
    assert.deepEqual(checkRawPrimitives(tree({ [path]: good }), language), { pass: true, violations: [] }, language);
    const failed = checkRawPrimitives(tree({ [path]: bad }), language);
    assert.equal(failed.pass, false, language);
    assert.match(failed.violations[0], new RegExp(message), language);
  }
});
test('primitive check: return types count, factories and non-public members do not, and only domain files are read', () => {
  const ts = body => checkRawPrimitives(tree({ 'src/u/domain/u.ts': body }), 'typescript');
  assert.equal(ts('export function nameOf(user: User): string {').pass, false);
  assert.equal(ts('export const age = (user: User): number => 1;').pass, false);
  assert.equal(ts('export async function load(id: UserId): Promise<boolean> {').pass, false);
  assert.equal(ts('  find(id: UserId): Promise<User | undefined>;').pass, true);
  assert.equal(ts('export function email(raw: string): Email {').pass, true, 'the parser named after its type');
  assert.equal(ts('  private helper(raw: string): string {').pass, true);
  assert.equal(checkRawPrimitives(tree({ 'src/u/app/u.ts': 'export function f(a: string): string {' }), 'typescript').pass, true);
  const java = body => checkRawPrimitives(tree({ 'src/u/domain/E.java': body }), 'java');
  assert.equal(java('    public static Email of(String raw) {').pass, true);
  assert.equal(java('    String helper(String raw) {').pass, true, 'package-private');
  assert.equal(java('    public int count() {').pass, false);
  const kotlin = body => checkRawPrimitives(tree({ 'src/u/domain/E.kt': body }), 'kotlin');
  assert.equal(kotlin('    private fun helper(raw: String): String {').pass, true);
  assert.equal(kotlin('    fun count(): Int {').pass, false);
  const dart = body => checkRawPrimitives(tree({ 'lib/u/domain/e.dart': body }), 'dart');
  assert.equal(dart('  int _count(String raw) {').pass, true, 'a private member');
  assert.equal(dart('  int count(String raw) {').pass, false);
});
test('red check: the new test must fail on the pre-fix tree', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'bench-red-'));
  try {
    const start = tree({ 'src/a.ts': 'old', 'test/a.test.ts': 'one' });
    const run = (gate, dir) => ({ status: existsSync(join(dir, 'src', 'fix.ts')) ? 0 : 1 });
    const fixed = tree({ ...Object.fromEntries(start), 'src/fix.ts': 'new', 'test/b.test.ts': 'two' });
    assert.deepEqual(checkRedRun({ start, final: fixed, gate: ['x'], run, scratch }), { pass: true, violations: [] });
    assert.match(checkRedRun({ start, final: tree({ ...Object.fromEntries(start), 'src/fix.ts': 'new' }), gate: ['x'], run, scratch }).violations[0], /no new or changed test file/);
    const alreadyGreen = checkRedRun({ start, final: fixed, gate: ['x'], run: () => ({ status: 0 }), scratch });
    assert.equal(alreadyGreen.pass, false);
    assert.match(alreadyGreen.violations[0], /passed on the pre-fix tree/);
    assert.equal(checkRedRun({ start, final: tree({ ...Object.fromEntries(start), 'test/a.test.ts': 'edited' }), gate: ['x'], run: () => ({ status: 2 }), scratch }).pass, true, 'a changed test counts');
    assert.deepEqual(checkGate({ dir: scratch, gate: ['x'], run: () => ({ status: 0 }) }), { pass: true, violations: [] });
    assert.equal(checkGate({ dir: scratch, gate: ['x'], run: () => ({ status: 1 }) }).pass, false);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('guard check: the run\'s tests must fail once the named guard is removed from the final tree', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'bench-guard-'));
  try {
    const guard = { path: 'src/trust.ts', find: "standing === 'Trusted'", replace: 'true' };
    const final = tree({ 'src/trust.ts': "export const ok = a => a.standing === 'Trusted';", 'test/a.test.ts': 'x' });
    const run = () => ({ status: 1 });
    const caught = checkGuardRemoval({ final, guard, gate: ['x'], run: (gate, dir) => ({ status: readFileSync(join(dir, 'src/trust.ts'), 'utf8').includes("'Trusted'") ? 0 : 1 }), scratch });
    assert.deepEqual(caught, { pass: true, violations: [] });
    const survived = checkGuardRemoval({ final, guard, gate: ['x'], run: () => ({ status: 0 }), scratch });
    assert.equal(survived.pass, false);
    assert.match(survived.violations[0], /passed with the guard removed/);
    assert.match(checkGuardRemoval({ final: tree({ 'src/trust.ts': 'export const ok = true;' }), guard, gate: ['x'], run, scratch }).violations[0], /guard not found/);
    assert.match(checkGuardRemoval({ final: tree({}), guard, gate: ['x'], run, scratch }).violations[0], /guard not found/);
    assert.equal(final.get('src/trust.ts').includes("'Trusted'"), true, 'the final tree itself is untouched');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
test('the seeded intake task: the obvious test passes with the trust guard deleted, a rejected-input test does not', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const committed = JSON.parse(readFileSync(join(root, 'docs/implementer-benchmark.json'), 'utf8'));
  const task = committed.tasks.find(item => item.id === 'ts-intake-accept');
  const dir = join(root, task.fixture);
  const start = new Map(readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => { const path = join(entry.parentPath, entry.name); return [relative(dir, path), readFileSync(path, 'utf8')]; }));
  const useCase = `import { admit, authorId, title, type Authors, type Submissions } from '../domain/intake.ts';
export async function acceptSubmission(authors: Authors, submissions: Submissions, rawAuthor: string, rawTitle: string) {
  const author = await authors.find(authorId(rawAuthor));
  if (!author) return { type: 'UnknownAuthor' } as const;
  if (admit(author).type === 'Refused') return { type: 'Refused' } as const;
  await submissions.save({ author: author.id, title: title(rawTitle) });
  return { type: 'Accepted' } as const;
}
`;
  const head = `import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptSubmission } from '../src/intake/app/accept-submission.ts';
import { authorId } from '../src/intake/domain/intake.ts';
import { MemoryAuthors, MemorySubmissions } from '../src/intake/infra/memory-intake.ts';
const trusted = { id: authorId('t'), standing: 'Trusted' } as const;
const untrusted = { id: authorId('u'), standing: 'Untrusted' } as const;
test('unknown author', async () => { assert.deepEqual(await acceptSubmission(new MemoryAuthors(), new MemorySubmissions(), 'x', 'T'), { type: 'UnknownAuthor' }); });
test('a trusted author is accepted and stored', async () => {
  const submissions = new MemorySubmissions();
  assert.deepEqual(await acceptSubmission(new MemoryAuthors([trusted]), submissions, 't', 'T'), { type: 'Accepted' });
  assert.equal((await submissions.all()).length, 1);
});
`;
  const rejected = `test('an untrusted author is refused and nothing is stored', async () => {
  const submissions = new MemorySubmissions();
  assert.deepEqual(await acceptSubmission(new MemoryAuthors([untrusted]), submissions, 'u', 'T'), { type: 'Refused' });
  assert.equal((await submissions.all()).length, 0);
});
`;
  const scratch = mkdtempSync(join(tmpdir(), 'bench-intake-'));
  const run = (gate, cwd) => spawnSync(gate[0], gate.slice(1), { cwd, stdio: 'ignore', env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT')) });
  try {
    const solved = body => new Map([...start, ['src/intake/app/accept-submission.ts', useCase], ['test/accept.test.ts', body]]);
    const naive = solved(head);
    assert.equal(run(task.gate, (() => { const d = mkdtempSync(join(scratch, 'n-')); for (const [path, content] of naive) { mkdirSync(join(d, path, '..'), { recursive: true }); writeFileSync(join(d, path), content); } return d; })()).status, 0, 'the naive solution passes the gate');
    assert.match(checkGuardRemoval({ final: naive, guard: task.guard, gate: task.gate, run, scratch }).violations[0], /passed with the guard removed/);
    assert.deepEqual(checkGuardRemoval({ final: solved(head + rejected), guard: task.guard, gate: task.gate, run, scratch }), { pass: true, violations: [] });
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
test('a task that grades a guard must name it', async () => {
  await withImplementerSnapshot([implementerTask], async (dir) => {
    const guarded = { ...implementerTask, checks: ['red', 'guard'] };
    assert.match(validateImplementerSnapshot({ version: 1, repo: 'o/r', tasks: [guarded] }, dir).join('\n'), /ts-a: guard must name path, find and replace/);
    assert.deepEqual(validateImplementerSnapshot({ version: 1, repo: 'o/r', tasks: [{ ...guarded, guard: { path: 'p', find: 'f', replace: 'r' } }] }, dir), []);
  });
});

const implementerTask = { id: 'ts-a', language: 'typescript', fixture: 'fixtures/a', issue: { title: 'feat: a', body: 'Do a.' }, gate: ['node', '--test'], checks: ['layers', 'primitives', 'red', 'gate'] };
const withImplementerSnapshot = async (tasks, action) => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-impl-'));
  try {
    for (const name of ['a', 'b', 'c']) {
      mkdirSync(join(dir, 'fixtures', name, 'src', 'domain'), { recursive: true });
      writeFileSync(join(dir, 'fixtures', name, 'AGENTS.md'), '---\nactive_skills:\n  - ddd\n  - hexagonal-architecture\n---\n# Fixture\n');
      writeFileSync(join(dir, 'fixtures', name, 'src', 'domain', 'a.ts'), 'export const a = 1;\n');
    }
    const file = join(dir, 'snapshot.json');
    writeFileSync(file, JSON.stringify({ version: 1, repo: 'o/r', tasks }));
    return await action(dir, file);
  } finally { rmSync(dir, { recursive: true, force: true }); }
};
test('implementer snapshot validation accepts a complete task and names each problem', async () => {
  await withImplementerSnapshot([implementerTask], async (dir) => {
    assert.deepEqual(validateImplementerSnapshot({ version: 1, repo: 'o/r', tasks: [implementerTask] }, dir), []);
    mkdirSync(join(dir, 'fixtures', 'plain'));
    writeFileSync(join(dir, 'fixtures', 'plain', 'AGENTS.md'), '---\nactive_skills:\n  - tdd\n---\n');
    const problems = validateImplementerSnapshot({ version: 1, repo: 'o/r', tasks: [
      { ...implementerTask, id: 'ts-b', fixture: 'fixtures/missing' },
      { ...implementerTask, id: 'ts-c', fixture: 'fixtures/plain' },
      { ...implementerTask, id: 'ts-d', issue: { title: 'x' }, gate: [], checks: ['layers', 'vibes'], language: 'cobol' },
      { ...implementerTask, id: 'ts-a' }, { ...implementerTask },
    ] }, dir).join('\n');
    assert.match(problems, /ts-b: fixture must name an existing project directory/);
    assert.match(problems, /ts-c: the fixture's AGENTS.md lists ddd and hexagonal-architecture under active_skills/);
    assert.match(problems, /ts-d: issue names its title and body/);
    assert.match(problems, /ts-d: gate must be a non-empty argv array/);
    assert.match(problems, /ts-d: checks must be a non-empty subset of layers, primitives, red, gate/);
    assert.match(problems, /ts-d: language must be one of/);
    assert.match(problems, /ts-a: duplicate task/);
    assert.match(validateImplementerSnapshot({ version: 1, repo: 'o/r', tasks: [] }, dir).join('\n'), /no tasks/);
    assert.match(validateImplementerSnapshot({ version: 2 }, dir).join('\n'), /version 1/);
  });
});
test('the committed implementer snapshot validates', () => {
  const committed = JSON.parse(readFileSync(fileURLToPath(new URL('../../docs/implementer-benchmark.json', import.meta.url)), 'utf8'));
  assert.deepEqual(validateImplementerSnapshot(committed), []);
  assert.ok(committed.tasks.length >= 3);
});
test('each committed fixture starts clean on the static checks, so a failure measures the skills, not the fixture', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const committed = JSON.parse(readFileSync(join(root, 'docs/implementer-benchmark.json'), 'utf8'));
  for (const task of committed.tasks) {
    const dir = join(root, task.fixture);
    const files = new Map(readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => { const path = join(entry.parentPath, entry.name); return [relative(dir, path), readFileSync(path, 'utf8')]; }));
    assert.deepEqual(checkLayerImports(files, task.language), { pass: true, violations: [] }, task.id);
    assert.deepEqual(checkRawPrimitives(files, task.language), { pass: true, violations: [] }, task.id);
  }
});
test('without --run the implementer bench validates its snapshot and lists what it would run, spending nothing', async () => {
  await withImplementerSnapshot([implementerTask], async (dir, file) => {
    const boom = () => { throw new Error('must not run'); };
    const { code, out } = await capture({ args: ['--implementer', '--snapshot', file, '--baseline', 'abc123', '--json'], io: { arms: boom, implement: boom, run: boom } });
    assert.equal(code, 0);
    const printed = JSON.parse(out);
    assert.deepEqual([printed.run, printed.cost, printed.spendCap, printed.baseline, printed.setting], [false, 0, 10, 'abc123', { model: 'sonnet', effort: 'low' }]);
    assert.deepEqual(printed.would.map(task => task.id), ['ts-a']);
    assert.match((await capture({ args: ['--implementer', '--snapshot', file], io: {} })).out, /Dry listing; nothing run, nothing spent. Snapshot holds 1 seeded implementer tasks/);
    await assert.rejects(() => benchCommand(['--implementer', '--model', 'opus'], {}), /cheapest delivery setting/);
    await assert.rejects(() => benchCommand(['--baseline', 'abc'], {}), /--implementer/);
  });
  await withImplementerSnapshot([{ ...implementerTask, fixture: 'fixtures/nope' }], async (dir, file) => {
    await assert.rejects(() => benchCommand(['--implementer', '--snapshot', file, '--run'], { arms: () => { throw new Error('must not run'); } }), /Invalid implementer benchmark snapshot: ts-a: fixture/);
  });
});
// A stubbed session: the current arm adds a failing-first test and a fix; the baseline arm adds a fix with no test and an infra import.
const stubSession = (scratch, costs, seen = []) => ({
  scratch,
  arms: baseline => [{ name: 'current', ref: 'working tree', plugin: join(scratch, 'now') }, { name: 'baseline', ref: baseline ?? 'merge-base', plugin: join(scratch, 'then') }],
  implement: ({ arm, task, tree: dir, brief, model, effort }) => {
    seen.push({ arm: arm.name, task: task.id, model, effort, brief: readFileSync(brief, 'utf8') });
    mkdirSync(join(dir, 'src', 'domain'), { recursive: true });
    writeFileSync(join(dir, 'src', 'domain', 'fix.ts'), arm.name === 'current' ? 'export const fix = 1;\n' : "import { db } from '../infra/db.ts';\n");
    if (arm.name === 'current') { mkdirSync(join(dir, 'test')); writeFileSync(join(dir, 'test', 'fix.test.ts'), 'test'); }
    return { usage: { cost: costs.shift() ?? 1 } };
  },
  run: (argv, dir) => ({ status: existsSync(join(dir, 'src', 'domain', 'fix.ts')) ? 0 : 1 }),
});
test('--run reports per arm the pass rate per check and overall and the cost per task, with --out and --compare', async () => {
  await withImplementerSnapshot([implementerTask, { ...implementerTask, id: 'ts-b', fixture: 'fixtures/b' }], async (dir, file) => {
    const seen = [];
    const io = stubSession(dir, [0.4, 0.2, 0.4, 0.2], seen);
    const out = join(dir, 'result.json');
    const { out: printed } = await capture({ args: ['--implementer', '--snapshot', file, '--run', '--baseline', 'abc123', '--json', '--out', out], io });
    const result = JSON.parse(printed);
    assert.deepEqual(result.arms.map(arm => [arm.arm, arm.ref]), [['current', 'working tree'], ['baseline', 'abc123']]);
    const [current, baseline] = result.arms;
    assert.deepEqual(current.summary.checks.layers, { passed: 2, total: 2, rate: 1 });
    assert.deepEqual(current.summary.overall, { passed: 8, total: 8, rate: 1 });
    assert.deepEqual(current.summary.cost, { total: 0.8, perTask: 0.4, reported: 2, unreported: 0 });
    assert.deepEqual([baseline.summary.checks.layers.rate, baseline.summary.checks.primitives.rate, baseline.summary.checks.red.rate, baseline.summary.checks.gate.rate], [0, 1, 0, 1]);
    assert.deepEqual(baseline.summary.overall, { passed: 4, total: 8, rate: 0.5 });
    assert.equal(baseline.summary.tasksPassed, 0);
    assert.deepEqual(baseline.rows[0].violations.red, ['no new or changed test file']);
    assert.equal(result.totalCost, 1.2);
    assert.deepEqual(result.skipped, []);
    assert.deepEqual(result.setting, { model: 'sonnet', effort: 'low' });
    assert.deepEqual(seen.map(item => `${item.arm}:${item.task}:${item.model}:${item.effort}`), ['current:ts-a:sonnet:low', 'baseline:ts-a:sonnet:low', 'current:ts-b:sonnet:low', 'baseline:ts-b:sonnet:low']);
    assert.match(seen[0].brief, /# Implementer brief: #1 feat: a/);
    assert.match(seen[0].brief, /Risk R0\. Model sonnet\. Effort low\./);
    assert.match(seen[0].brief, /Do a\./);
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).arms.map(arm => arm.summary.overall.rate), [1, 0.5]);
    const text = (await capture({ args: ['--implementer', '--snapshot', file, '--run', '--compare', out], io: stubSession(dir, [0.4, 0.2, 0.4, 0.2]) })).out;
    assert.match(text, /== current \(working tree\)/);
    assert.match(text, /pass rate: layers 2\/2; primitives 2\/2; red 2\/2; gate 2\/2; overall 8\/8 \(1\); cost per task \$0\.40/);
    assert.match(text, /vs saved: pass rate \+0, cost per task \+\$0\.00/);
    const replay = await capture({ args: ['--implementer', '--snapshot', file, '--from', out, '--compare', out], io: {} });
    assert.match(replay.out, /overall 4\/8 \(0\.5\)/);
  });
});
test('the implementer bench starts no task once reported cost reaches 10 USD and lists the skipped ones', async () => {
  const tasks = ['a', 'b', 'c'].map(name => ({ ...implementerTask, id: `ts-${name}`, fixture: `fixtures/${name}` }));
  await withImplementerSnapshot(tasks, async (dir, file) => {
    const seen = [];
    const { out } = await capture({ args: ['--implementer', '--snapshot', file, '--run', '--json'], io: stubSession(dir, [6, 4, 1, 1], seen) });
    const result = JSON.parse(out);
    assert.deepEqual(seen.map(item => `${item.arm}:${item.task}`), ['current:ts-a', 'baseline:ts-a']);
    assert.deepEqual(result.skipped, [{ task: 'ts-b', arm: 'current' }, { task: 'ts-b', arm: 'baseline' }, { task: 'ts-c', arm: 'current' }, { task: 'ts-c', arm: 'baseline' }]);
    assert.equal(result.totalCost, 10);
    assert.match((await capture({ args: ['--implementer', '--snapshot', file, '--run'], io: stubSession(dir, [10, 1, 1, 1]) })).out, /Skipped at the spend cap: ts-a \(baseline\), ts-b \(current\), ts-b \(baseline\), ts-c \(current\), ts-c \(baseline\)/);
    const under = [];
    await capture({ args: ['--implementer', '--snapshot', file, '--run', '--json'], io: stubSession(dir, [4.9, 4.9, 0.05, 0.05, 0.05, 0.05], under) });
    assert.equal(under.length, 6, 'a total just under the cap starts every task');
  });
});
