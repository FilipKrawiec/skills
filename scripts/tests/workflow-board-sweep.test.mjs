import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { estimatedCost, gate, reportedCost, settleCost, writeBudget, readBudget } from '../../plugins/common/workflow/scripts/lib/quota.mjs';

const lib = name => new URL(`../../plugins/common/workflow/scripts/lib/${name}`, import.meta.url).href;
const project = { number: 7, owner: 'acme', title: 'Board' };

// A board of 500 cards behind a fake `gh`: every call is logged; the board query applies its filter the way GitHub does;
// `project item-list` and `issue list` fail, because the sweep must never call them.
function fakeGithub(root) {
  const cards = Array.from({ length: 500 }, (_, index) => ({ number: index + 1, state: index < 495 ? 'CLOSED' : 'OPEN', status: index < 3 ? 'Review' : 'Done' }));
  writeFileSync(join(root, 'cards.json'), JSON.stringify(cards));
  const bin = join(root, 'bin'); mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs'); const args = process.argv.slice(2); const root = ${JSON.stringify(root)};
fs.appendFileSync(root + '/calls', args.join(' ').slice(0, 200) + '\\n');
const out = value => console.log(JSON.stringify(value));
const text = args.join(' ');
if (args[0] === 'api' && args[1] === 'rate_limit') out({ remaining: 5000, limit: 5000, reset: Math.floor(Date.now() / 1000) + 3600 });
else if (args[1] === 'graphql' && text.includes('projectV2(number')) {
  const cards = JSON.parse(fs.readFileSync(root + '/cards.json', 'utf8'));
  const nodes = cards.filter(card => card.state === 'CLOSED' && card.status !== 'Done').map(card => ({ id: 'item' + card.number, status: { name: card.status }, content: { number: card.number, state: card.state, repository: { nameWithOwner: 'acme/app' } } }));
  out({ data: { repositoryOwner: { projectV2: { items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } } });
} else if (args[1] === 'graphql' && text.includes('projectItems')) {
  const number = Number(/number=(\\d+)/.exec(text)[1]);
  out({ data: { repository: { issue: { state: 'CLOSED', projectItems: { nodes: [{ id: 'item' + number, project: { id: 'PVT_1' } }] } } } } });
} else if (args[0] === 'project' && args[1] === 'view') out({ id: 'PVT_1', title: 'Board' });
else if (args[0] === 'project' && args[1] === 'field-list') out({ fields: [{ id: 'F1', name: 'Status', options: [{ id: 'O1', name: 'Todo' }, { id: 'O2', name: 'Done' }] }] });
else if (args[0] === 'project' && args[1] === 'item-edit') console.log('ok');
else { console.error('unexpected gh call: ' + text); process.exit(1); }
`, { mode: 0o755 });
  return bin;
}
function sweepTwice() {
  const root = mkdtempSync(join(tmpdir(), 'sweep-'));
  const bin = fakeGithub(root);
  const repo = join(root, 'repo'); mkdirSync(repo);
  spawnSync('git', ['init', '-q'], { cwd: repo });
  const code = `import { sweepBoard } from ${JSON.stringify(lib('board.mjs'))};
const cfg = { repo: 'acme/app', project: ${JSON.stringify(project)} };
console.log(JSON.stringify([sweepBoard(cfg, { windowed: true }), sweepBoard(cfg, { windowed: true })]));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: repo, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, WORKFLOW_QUOTA_DIR: root, WORKFLOW_QUOTA: '' } });
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(join(root, 'calls'), 'utf8').trim().split('\n').filter(line => !line.includes('rate_limit'));
  return { moved: JSON.parse(result.stdout.trim()), calls, root };
}

test('a sweep of a 500-card board reads one filtered query, never lists the project or the closed issues, and a second sweep inside its window makes no call', () => {
  const { moved, calls } = sweepTwice();
  assert.deepEqual(moved[0], [1, 2, 3], 'the three closed cards outside Done move');
  assert.deepEqual(moved[1], [], 'the sweep inside its window moves nothing');
  const reads = calls.filter(line => line.includes('projectV2(number'));
  assert.equal(reads.length, 1, 'one board query for the whole sweep');
  assert.ok(reads[0].includes('api graphql'), 'a GraphQL query on the project items');
  assert.ok(!calls.some(line => /^project item-list|^issue list/.test(line)), 'neither the whole board nor every closed issue is listed');
  assert.equal(calls.filter(line => /^project (view|field-list)/.test(line)).length, 2, 'the project metadata is read once for every move together');
});

test('a sweep with no closed card outside Done costs the one board query and nothing more', () => {
  const root = mkdtempSync(join(tmpdir(), 'sweep-'));
  const bin = fakeGithub(root);
  writeFileSync(join(root, 'cards.json'), JSON.stringify([{ number: 1, state: 'CLOSED', status: 'Done' }]));
  const repo = join(root, 'repo'); mkdirSync(repo); spawnSync('git', ['init', '-q'], { cwd: repo });
  const code = `import { sweepBoard } from ${JSON.stringify(lib('board.mjs'))}; console.log(JSON.stringify(sweepBoard({ repo: 'acme/app', project: ${JSON.stringify(project)} })));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: repo, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, WORKFLOW_QUOTA_DIR: root, WORKFLOW_QUOTA: '' } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
  assert.equal(readFileSync(join(root, 'calls'), 'utf8').trim().split('\n').filter(line => !line.includes('rate_limit')).length, 1);
});

test('a board with no owner sweeps nothing and reads nothing', async () => {
  const { sweepBoard } = await import(lib('board.mjs'));
  const seen = [];
  const read = (name, ttl, load) => { seen.push([name, ttl]); return load(); };
  assert.deepEqual(sweepBoard({ repo: 'acme/app', project: { number: 1 } }, { read }), []);
  assert.deepEqual(seen, [], 'nothing to read');
});

test('the gate counts a paginated list and a board listing by what they cost', () => {
  assert.equal(estimatedCost(['issue', 'list', '--repo', 'a/b', '--state', 'closed', '--limit', '1000', '--json', 'number']), 10);
  assert.equal(estimatedCost(['pr', 'view', '5']), 1);
  assert.equal(estimatedCost(['issue', 'list', '--limit', '50']), 1);
  assert.equal(estimatedCost(['project', 'item-list', '7', '--owner', 'a', '--limit', '1000']), 4000);
  const file = join(mkdtempSync(join(tmpdir(), 'cost-')), 'graphql-budget.json');
  writeBudget({ remaining: 5000, limit: 5000, resetAt: new Date(Date.now() + 3_600_000).toISOString(), probedAt: Date.now() }, file, 'k');
  gate(['issue', 'list', '--limit', '1000'], { file, key: 'k', share: 1, report: () => {} });
  assert.equal(readBudget(file, 'k').remaining, 4990, 'a ten-page list spends ten points, not one');
});

test('a response that reports its rate-limit cost corrects the local count', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'cost-')), 'graphql-budget.json');
  writeBudget({ remaining: 4999, limit: 5000, resetAt: new Date(Date.now() + 3_600_000).toISOString(), probedAt: Date.now() }, file, 'k');
  const output = JSON.stringify({ data: { rateLimit: { cost: 7 } } });
  assert.equal(reportedCost(output), 7);
  assert.equal(reportedCost('{}'), null);
  settleCost(['api', 'graphql', '-f', 'query=query{x}'], output, file, 'k');
  assert.equal(readBudget(file, 'k').remaining, 4993, 'the gate had counted one point; seven were spent');
});
