import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { benchCommand, compareResults, parseVerdict, renderResults, scoreEntry, summarize, validateSnapshot } from '../../plugins/common/workflow/scripts/lib/bench.mjs';

const sha = char => char.repeat(40);
const defect = { pr: 1, title: 'feat: a', kind: 'defect', base: sha('a'), head: sha('b'), defect: { name: 'reverses delta-only rounds', keywords: ['delta', 'whole diff'] } };
const clean = { pr: 2, title: 'chore: b', kind: 'clean', base: sha('c'), head: sha('d') };
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
});
test('compare shows the delta in catches, false positives and cost', () => {
  const before = { summary: { defects: 3, caught: 1, clean: 2, falsePositives: 1, cost: { total: 1, mean: 0.2, reported: 5, unreported: 0 } } };
  const after = { summary: { defects: 3, caught: 2, clean: 2, falsePositives: 0, cost: { total: 0.5, mean: 0.1, reported: 5, unreported: 0 } } };
  assert.deepEqual(compareResults(before, after), { caught: 1, falsePositives: -1, totalCost: -0.5, meanCost: -0.1 });
  const unreported = { summary: { ...after.summary, cost: { total: 'unreported', mean: 'unreported', reported: 0, unreported: 5 } } };
  assert.deepEqual(compareResults(before, unreported), { caught: 1, falsePositives: -1, totalCost: 'unreported', meanCost: 'unreported' });
});
test('text output names verdict, catch, false positive and cost per PR', () => {
  const rows = [
    { pr: 1, kind: 'defect', title: 'feat: a', verdict: 'fixes', caught: true, falsePositive: null, cost: 0.2 },
    { pr: 2, kind: 'clean', title: 'chore: b', verdict: 'fixes', caught: null, falsePositive: true, cost: null },
  ];
  const result = { rows, summary: summarize(rows) };
  const text = renderResults(result, { caught: 1, falsePositives: 0, totalCost: 0.1, meanCost: 0.05 });
  assert.match(text, /#1 defect fixes caught \$0\.20/);
  assert.match(text, /#2 clean fixes false positive unreported/);
  assert.match(text, /caught 1\/1; false positives 1\/1; cost total \$0\.20, mean \$0\.20 \(1 unreported\)/);
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

test('without --run the command validates and lists what it would run, spending nothing', async () => {
  let calls = 0;
  await withSnapshot(async (dir, file) => {
    const { code, out } = await capture({ args: ['--snapshot', file, '--json'], io: { review: () => { calls++; return review('ready'); } } });
    assert.equal(code, 0);
    const printed = JSON.parse(out);
    assert.equal(printed.run, false);
    assert.equal(printed.cost, 0);
    assert.deepEqual(printed.would.map(entry => entry.pr), [1, 2]);
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
test('--run replays every PR through the stubbed Reviewer, saves JSON and compares against an earlier result', async () => {
  await withSnapshot(async (dir, file) => {
    const reviews = { 1: review('fixes', 'whole diff restored', 0.3), 2: { verdict: 'ready', text: '', usage: null } };
    const io = { review: entry => reviews[entry.pr] };
    const out = join(dir, 'now.json');
    const first = await capture({ args: ['--snapshot', file, '--run', '--json', '--out', out], io });
    const result = JSON.parse(first.out);
    assert.deepEqual(result.rows.map(row => [row.pr, row.verdict, row.caught, row.falsePositive, row.cost]), [[1, 'fixes', true, null, 0.3], [2, 'ready', null, false, null]]);
    assert.equal(result.summary.caught, 1);
    assert.equal(result.summary.cost.unreported, 1);
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).summary, result.summary);
    reviews[1] = review('ready', '', 0.1);
    const second = await capture({ args: ['--snapshot', file, '--run', '--compare', out], io });
    assert.match(second.out, /vs saved: caught -1/);
    const replayed = await capture({ args: ['--snapshot', file, '--from', out, '--compare', out], io: { review: () => { throw new Error('must not run'); } } });
    assert.match(replayed.out, /vs saved: caught \+0/);
  });
});
