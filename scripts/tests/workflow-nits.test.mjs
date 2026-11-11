import test from 'node:test';
import assert from 'node:assert/strict';
import { nitsCommand, nitsLedger } from '../../plugins/common/workflow/scripts/lib/pr.mjs';

const lanes = { repo: 'acme/app', reviewer: 'reviewer' };
const comment = (path, body, login = 'reviewer', line = 3) => ({ path, line, body, user: { login }, html_url: `https://x/${path}` });
const comments = {
  1: [comment('src/a.js', '**Nit** rename'), comment('src/a.js', '**Important** broken'), comment('src/b.js', '**Nit** owner says', 'owner')],
  2: [comment('src/a.js', '**Nit** again', 'reviewer', 9)],
  3: [comment('src/c.js', '**Nit** swept already')],
  4: [],
};
const merged = [
  { number: 1, url: 'u1', title: 'One', mergedAt: '2026-11-01', labels: [] },
  { number: 2, url: 'u2', title: 'Two', mergedAt: '2026-11-02', labels: [] },
  { number: 3, url: 'u3', title: 'Three', mergedAt: '2026-11-03', labels: [{ name: 'nits:swept' }] },
  { number: 4, url: 'u4', title: 'Four', mergedAt: '2026-11-04', labels: [] },
];

test('the ledger keeps only the Reviewer Nits of unswept PRs, grouped by file', () => {
  const ledger = nitsLedger(merged, number => comments[number], 'reviewer');
  assert.deepEqual(ledger.prs.map(pr => pr.number), [1, 2]);
  assert.deepEqual(ledger.files, [{ path: 'src/a.js', nits: [
    { pr: 1, line: 3, body: '**Nit** rename', url: 'https://x/src/a.js' },
    { pr: 2, line: 9, body: '**Nit** again', url: 'https://x/src/a.js' },
  ] }]);
});

test('nits reads PRs merged in the window and prints one JSON line', () => {
  const calls = []; const lines = []; const log = console.log; console.log = line => lines.push(line);
  try {
    nitsCommand(['--days', '7'], lanes, { now: () => Date.parse('2026-11-11T12:00:00Z'), gh: args => { calls.push(args); return args[0] === 'pr' ? merged : [comments[Number(args.at(-1).split('/').at(-2))]]; } });
  } finally { console.log = log; }
  assert.equal(lines.length, 1);
  const output = JSON.parse(lines[0]);
  assert.deepEqual([output.days, output.since, output.prs.length, output.files.length], [7, '2026-11-04', 2, 1]);
  assert.ok(calls[0].includes('merged:>=2026-11-04') && calls[0].includes('merged'));
  assert.deepEqual(calls.slice(1).map(args => args.at(-1)), ['repos/acme/app/pulls/1/comments', 'repos/acme/app/pulls/2/comments', 'repos/acme/app/pulls/4/comments']);
});

test('nits refuses unknown arguments and needs a reviewer', () => {
  assert.throws(() => nitsCommand(['--done'], lanes), /Usage: nits/);
  assert.throws(() => nitsCommand(['--since', '3'], lanes), /Usage: nits/);
  assert.throws(() => nitsCommand([], { repo: 'acme/app' }), /identities.reviewer/);
});
