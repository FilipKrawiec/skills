import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { commandEffort, commandModel, findUsageComment, parseUsage, parseUsageComment, parseUsageLine, recordUsage, usageComment, usageCost, usageEntry, usageHost, usageSummary, usageTotals, visibleResult } from '../../plugins/common/workflow/scripts/lib/usage.mjs';
import { exportedSymbols, issueCriteria, reviewPacket } from '../../plugins/common/workflow/scripts/lib/packet.mjs';
import { drive, githubIo, handBackRole, parseHandBack, reviewerBrief, reviewerCommand } from '../../plugins/common/workflow/scripts/lib/drive.mjs';
import { statusCommand } from '../../plugins/common/workflow/scripts/lib/state.mjs';

const claudeOutput = JSON.stringify({ type: 'result', subtype: 'success', result: 'verdict: ready', total_cost_usd: 0.31, usage: { input_tokens: 12, output_tokens: 340, cache_read_input_tokens: 9000, cache_creation_input_tokens: 800 } });
const codexOutput = [
  { type: 'thread.started', thread_id: 't' },
  { type: 'item.completed', item: { type: 'agent_message', text: 'verdict: fixes' } },
  { type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 20 } },
  { type: 'turn.completed', usage: { input_tokens: 50, cached_input_tokens: 10, output_tokens: 5 } },
].map(event => JSON.stringify(event)).join('\n');

test('claude and codex usage formats parse into input, output, cache and cost', () => {
  assert.deepEqual(parseUsage('claude', claudeOutput), { input: 12, output: 340, cacheRead: 9000, cacheWrite: 800, cost: 0.31 });
  assert.deepEqual(parseUsage('claude', JSON.stringify([{ type: 'system' }, JSON.parse(claudeOutput)])), { input: 12, output: 340, cacheRead: 9000, cacheWrite: 800, cost: 0.31 });
  assert.deepEqual(parseUsage('codex', codexOutput), { input: 150, output: 25, cacheRead: 70, cacheWrite: null, cost: null });
});
test('missing, malformed or unknown-host usage reads as null and never throws', () => {
  for (const text of ['', 'plain text', '{"result":"x"}', '[1', undefined]) assert.equal(parseUsage('claude', text), null);
  assert.equal(parseUsage('codex', '{"type":"item.completed"}'), null);
  assert.equal(parseUsage('agy', claudeOutput), null);
  assert.deepEqual(parseUsage('claude', JSON.stringify({ usage: { input_tokens: 'many' } })), { input: null, output: null, cacheRead: null, cacheWrite: null, cost: null });
});
test('the visible result of a session is its answer text, or the raw output when unparseable', () => {
  assert.equal(visibleResult('claude', claudeOutput), 'verdict: ready');
  assert.equal(visibleResult('codex', codexOutput), 'verdict: fixes');
  assert.equal(visibleResult('claude', 'not json'), 'not json');
});
test('reviewer commands ask each host for machine-readable output, and the host is read back from the flags', () => {
  const claude = reviewerCommand('opus', '/b', 'n');
  const codex = reviewerCommand('gpt', '/b', 'n', 'codex');
  assert.deepEqual(claude.slice(0, 4), ['claude', '--print', '--output-format', 'json']);
  assert.deepEqual(codex.slice(0, 3), ['codex', 'exec', '--json']);
  assert.equal(usageHost(claude), 'claude');
  assert.equal(usageHost(codex), 'codex');
  assert.equal(commandModel(claude), 'opus');
  assert.equal(commandModel(codex), 'gpt');
});
test('a hand-back usage line parses and does not take one of the six lines', () => {
  assert.deepEqual(parseUsageLine('in=1200 out=300 cache=5000 cost=0.12 model=sonnet host=claude'), { usage: { input: 1200, output: 300, cacheRead: 5000, cacheWrite: null, cost: 0.12 }, model: 'sonnet', effort: null, host: 'claude', plugin: null });
  assert.equal(parseUsageLine('nothing useful').usage, null);
  const hb = parseHandBack('status: done\ncommit: fix: a\npaths: a.js\ncheck: pass\nnote: ok\nbody: /e.md\nusage: in=1 out=2');
  assert.equal(hb.usage, 'in=1 out=2');
  assert.equal(hb.body, '/e.md');
});

const entries = [
  usageEntry({ role: 'reviewer', host: 'claude', model: 'opus', usage: parseUsage('claude', claudeOutput) }),
  usageEntry({ role: 'reviewer', host: 'claude', model: 'opus', usage: parseUsage('claude', claudeOutput) }),
  usageEntry({ role: 'reviewer', host: 'codex', model: 'gpt', usage: null }),
  usageEntry({ role: 'implementer', host: 'claude', model: 'sonnet', usage: { input: 5, output: 6, cacheRead: null, cacheWrite: null, cost: null } }),
];
test('usage totals sum per role and model, and a host without data stays unreported', () => {
  const rows = usageTotals(entries);
  const opus = rows.find(row => row.model === 'opus');
  assert.deepEqual([opus.sessions, opus.input, opus.output, opus.cacheRead, opus.cost], [2, 24, 680, 18000, 0.62]);
  const summary = usageSummary(entries);
  assert.equal(summary.find(row => row.model === 'gpt').input, 'unreported');
  assert.equal(summary.find(row => row.role === 'implementer').cost, 'unreported');
  assert.equal(usageSummary([]), 'unreported');
  const comment = usageComment(entries);
  assert.match(comment, /\| reviewer \| gpt \| unreported \| codex \| 1 \| unreported \|/);
  assert.match(comment, /\$0\.62/);
  assert.match(comment, /Baseline: 2026-11-16 dry-run baseline \(Opus reviews without a packet\): \$0\.21-0\.46/);
  assert.equal(parseUsageComment(comment).length, 4);
});
test('usageCost totals reported cost and names each role with an unreported session', () => {
  const row = (role, cost) => usageEntry({ role, host: 'claude', model: 'm', usage: cost === null ? null : { input: 1, output: 1, cacheRead: null, cacheWrite: null, cost } });
  assert.deepEqual(usageCost([row('implementer', 0.5), row('reviewer', 0.25), row('devops', null), row('devops', null)]), { total: 0.75, unreported: ['devops'] });
  assert.deepEqual(usageCost([row('planner', null)]), { total: 'unreported', unreported: ['planner'] });
  assert.deepEqual(usageCost([]), { total: 'unreported', unreported: [] });
});
test('recordUsage creates the comment, then updates it, ignores a repeated key and never throws', () => {
  const store = []; const writes = [];
  const gh = () => [store];
  const write = args => { writes.push(args); const body = args.find(arg => arg.startsWith('body=')).slice(5); if (args.includes('PATCH')) store[0].body = body; else store.push({ id: 9, user: { login: 'builder' }, body }); };
  const first = usageEntry({ role: 'reviewer', host: 'claude', model: 'opus', usage: parseUsage('claude', claudeOutput), key: 'k1' });
  assert.equal(recordUsage({ repo: 'acme/app', pr: 5, author: 'builder', entry: first }, { gh, write }), true);
  assert.match(writes[0].join(' '), /POST repos\/acme\/app\/issues\/5\/comments/);
  recordUsage({ repo: 'acme/app', pr: 5, author: 'builder', entry: usageEntry({ role: 'implementer', host: 'claude', model: 'sonnet', usage: null }) }, { gh, write });
  assert.match(writes[1].join(' '), /PATCH repos\/acme\/app\/issues\/comments\/9/);
  recordUsage({ repo: 'acme/app', pr: 5, author: 'builder', entry: first }, { gh, write });
  assert.equal(writes.length, 2, 'the same key is not recorded twice');
  assert.equal(findUsageComment(store, 'builder').entries.length, 2);
  assert.equal(findUsageComment(store, 'someone-else'), null, 'a stranger comment with the marker is not counted');
  const original = console.error; console.error = () => {};
  try { assert.equal(recordUsage({ repo: 'acme/app', pr: 5, entry: first }, { gh: () => { throw new Error('network'); }, write }), false); } finally { console.error = original; }
});

const lanes = { repo: 'acme/app', base: 'main', implementer: 'builder', reviewer: 'reviewer', owner: 'owner', requiredChecks: ['verify'] };
test('status shows per-PR usage totals, "unreported" with none, and survives a failed read', () => {
  const pr = { number: 5, url: 'u', state: 'OPEN', isDraft: false, headRefOid: 'a'.repeat(40), labels: [], reviews: [], statusCheckRollup: [], closingIssuesReferences: [], body: 'Closes #3', mergeable: 'MERGEABLE' };
  const run = read => { const lines = []; const log = console.log; console.log = line => lines.push(line); try { statusCommand(['5'], lanes, read, () => pr); } finally { console.log = log; } return JSON.parse(lines[0]); };
  const comments = [{ id: 1, user: { login: 'builder' }, body: usageComment(entries) }];
  const withUsage = run(args => (args[1] === '--paginate' ? (args[3].includes('/issues/5/') ? [comments] : [[]]) : { pull_request: {} }));
  const issueRow = [{ id: 2, user: { login: 'builder' }, body: usageComment([usageEntry({ role: 'planner', host: null, model: null, usage: null })]) }];
  const withIssueRows = run(args => (args[1] === '--paginate' ? (args[3].includes('/issues/3/') ? [issueRow] : [comments]) : { pull_request: {} }));
  assert.deepEqual(withIssueRows.usage.filter(row => row.role === 'planner').map(row => [row.model, row.cost, row.sessions]), [['unreported', 'unreported', 1]], 'rows drive wrote on the closing issue count toward the PR');
  assert.equal(withIssueRows.usage.find(row => row.model === 'opus').sessions, 2);
  assert.equal(withUsage.usage.find(row => row.model === 'gpt').output, 'unreported');
  assert.equal(withUsage.usage.find(row => row.model === 'opus').sessions, 2);
  assert.deepEqual(withUsage.cost, { total: 0.62, unreported: ['implementer', 'reviewer'] }, 'status totals the reported cost and names the roles that reported none');
  assert.equal(run(args => (args[1] === '--paginate' ? [[]] : { pull_request: {} })).usage, 'unreported');
  assert.equal(run(args => { if (args[1] === '--paginate') throw new Error('x'); return { pull_request: {} }; }).usage, 'unreported');
});
test('drive records a hand-back usage line once, and a failure to record never blocks the step', () => {
  const recorded = []; const writes = {};
  const issue = { number: 3, url: 'https://github.com/acme/app/issues/3', state: 'OPEN', title: 'feat: a', body: '', labels: [{ name: 'state:started' }, { name: 'risk:R1' }] };
  const pr = { number: 5, url: 'u', state: 'OPEN', isDraft: true, headRefOid: 'a'.repeat(40), headRefName: '3-a', labels: [{ name: 'risk:R1' }], mergeable: 'MERGEABLE', statusCheckRollup: [{ name: 'verify', conclusion: 'SUCCESS' }], reviews: [], body: 'Closes #3', closingIssuesReferences: [{ number: 3, repository: { owner: { login: 'acme' }, name: 'app' } }], files: [] };
  const assessment = { risk: 'R1', assessed: 'R1', head: pr.headRefOid, paths: [], reason: 'local' };
  const io = {
    issue: () => issue, dependencies: () => [], pr: () => pr, tree: () => ({ path: '/w/3', branch: '3-a', dirty: false, commits: 1, unpushed: false, diffPaths: [], subjects: [] }),
    assessment: () => assessment, reviewingSince: () => null, syncTree: () => {}, scratch: () => '/w/3/.wf', write: (path, text) => { writes[path] = text; }, packetFacts: () => raw(),
    recordUsage: (p, hb) => { recorded.push([p.number, hb.usage]); throw new Error('comment API down'); },
  };
  const step = drive(io, 3, lanes, { usage: 'in=1 out=2 model=sonnet' });
  assert.equal(step.agent, 'reviewer', 'the delivery still reaches its next step');
  assert.deepEqual(recorded, [[5, 'in=1 out=2 model=sonnet']]);
  assert.match(writes['/w/3/.wf/review-packet.md'], /^# Review packet: PR #5/);
  assert.ok(writes['/w/3/.wf/drive-3-reviewer.md'].indexOf('/w/3/.wf/review-packet.md') < writes['/w/3/.wf/drive-3-reviewer.md'].indexOf('Task:'));
  delete io.packetFacts;
  drive(io, 3, lanes, {});
  assert.match(writes['/w/3/.wf/review-packet.md'], /^# Review packet unavailable/, 'a packet that cannot be built tells the Reviewer to gather the context');
});

test('a host that prints no figures still records an unreported row per role, on the PR or else the issue', () => {
  const recorded = [];
  const issue = { number: 3, url: 'https://github.com/acme/app/issues/3', state: 'OPEN', title: 'feat: a', body: '', labels: [{ name: 'state:started' }, { name: 'risk:R1' }] };
  const pr = { number: 5, url: 'u', state: 'OPEN', isDraft: true, headRefOid: 'a'.repeat(40), headRefName: '3-a', labels: [{ name: 'risk:R1' }], mergeable: 'MERGEABLE', statusCheckRollup: [{ name: 'verify', conclusion: 'SUCCESS' }], reviews: [], body: 'Closes #3', closingIssuesReferences: [{ number: 3, repository: { owner: { login: 'acme' }, name: 'app' } }], files: [] };
  const io = (current, writes = {}) => ({
    issue: () => issue, dependencies: () => [], pr: () => current, tree: () => ({ path: '/w/3', branch: '3-a', dirty: false, commits: 1, unpushed: false, diffPaths: [], subjects: [] }),
    assessment: () => ({ risk: 'R1', assessed: 'R1', head: pr.headRefOid, paths: [], reason: 'local' }), reviewingSince: () => null, syncTree: () => {}, scratch: () => '/w/3/.wf', write: (path, text) => { writes[path] = text; }, packetFacts: () => raw(),
    recordUsage: (target, hb) => recorded.push([target.number, handBackRole(hb), hb.usage]),
  });
  drive(io(pr), 3, lanes, { status: 'done' });
  assert.deepEqual(recorded.splice(0), [[5, 'implementer', undefined]], 'a hand-back without a usage line is still recorded on the open PR');
  drive(io(null), 3, lanes, { status: 'distinct' });
  assert.deepEqual(recorded.splice(0), [[3, 'planner', undefined]], 'with no PR the row lands on the issue');
  drive(io(pr), 3, lanes, { risk: 'R1', reason: 'local' });
  assert.deepEqual(recorded.splice(0), [[5, 'devops', undefined]], 'a risk hand-back has no status yet is recorded');
  assert.equal(handBackRole({ status: 'sliced' }), 'planner');
  assert.equal(handBackRole({ status: 'narrowed' }), 'planner');
  assert.equal(handBackRole({ status: 'done', risk: 'R2' }), 'devops');
  const rows = usageSummary([usageEntry({ role: 'implementer', host: null, model: null, usage: null }), usageEntry({ role: 'devops', host: 'claude', model: 'sonnet', usage: null })]);
  assert.deepEqual(rows.map(row => [row.role, row.model, row.cost, row.sessions]), [['devops', 'sonnet', 'unreported', 1], ['implementer', 'unreported', 'unreported', 1]]);
});

test('an epic hand-back records one usage row on the epic before driveEpic, unreported without figures, and a failure never blocks', () => {
  const recorded = [];
  const epic = { number: 9, url: 'https://github.com/acme/app/issues/9', state: 'CLOSED', title: 'epic', body: '', labels: [{ name: 'type:epic' }] };
  const io = { issue: () => epic, dependencies: () => [], subIssues: () => [], recordUsage: (target, hb) => { recorded.push([target.number, handBackRole(hb), hb.usage]); } };
  drive(io, 9, lanes, { status: 'done' });
  assert.deepEqual(recorded.splice(0), [[9, 'improver', undefined]], 'no usage line still records an unreported row on the epic');
  drive(io, 9, lanes, { agent: 'reviewer', usage: 'in=1 out=2 model=opus' });
  assert.deepEqual(recorded.splice(0), [[9, 'reviewer', 'in=1 out=2 model=opus']]);
  drive(io, 9, lanes, {});
  assert.deepEqual(recorded, [], 'no hand-back, no row');
  io.recordUsage = () => { throw new Error('down'); };
  assert.doesNotThrow(() => drive(io, 9, lanes, { status: 'done' }));
});

const spec = `## Outcome
Something.

### Acceptance criteria
- [ ] First criterion, verbatim.
- [ ] Second criterion.

\`\`\`scope
{"paths":["a/"],"dependencies":[]}
\`\`\`
`;
const raw = (extra = {}) => ({
  issue: { url: 'https://github.com/acme/app/issues/3', body: spec }, pr: { number: 5, url: 'u', head: 'a'.repeat(40), base: 'origin/main' }, round: 1, requiredChecks: ['verify'],
  checks: [{ name: 'verify', state: 'FAILURE', excerpt: 'line1\nAssertionError: boom' }, { name: 'lint', state: 'SUCCESS' }],
  gate: { status: 0, head: 'a'.repeat(40), at: '2026-11-16T10:00:00Z' },
  files: [{ path: 'src/a/x.mjs', additions: 3, deletions: 1, changeType: 'MODIFIED' }, { path: 'src/a/old.mjs', additions: 0, deletions: 0, changeType: 'RENAMED' }, { path: 'docs/d.md', additions: 1, deletions: 0, changeType: 'MODIFIED' }],
  diffs: { 'src/a/x.mjs': '+export function widget() {}\n-old', 'docs/d.md': '+note' }, range: 'origin/main...HEAD', previous: null, threads: [], callSites: [{ symbol: 'widget', file: 'src/a/x.mjs', sites: ['src/b/use.mjs:4:widget()'] }],
  ...extra,
});
test('the round 1 packet holds the facts in order, with failing excerpts, mechanical renames and call sites', () => {
  const text = reviewPacket(raw());
  const order = ['## 1. Issue', '## 2. CI', '## 3. Project gate', '## 4. Diff at head by area', '## 5. Call sites'].map(heading => text.indexOf(heading));
  assert.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), `sections out of order: ${order}`);
  assert.match(text, /- \[ \] First criterion, verbatim\.\n- \[ \] Second criterion\./);
  assert.match(text, /```scope\n\{"paths":\["a\/"\],"dependencies":\[\]\}\n```/);
  assert.match(text, /- verify \(required\): FAILURE\n```\nline1\nAssertionError: boom\n```/);
  assert.match(text, /- lint: SUCCESS/);
  assert.match(text, /pass \(at this head, 2026-11-16T10:00:00Z\)/);
  assert.match(text, /### src\/a \(\+3 -1, 1 file\)/);
  assert.match(text, /### Renames \(mechanical, no content change\)\n- src\/a\/old\.mjs/);
  assert.match(text, /`widget` \(src\/x\.mjs|`widget` \(src\/a\/x\.mjs\)[^]*src\/b\/use\.mjs:4:widget\(\)/);
  assert.doesNotMatch(text, /Delta since/);
});
test('a later-round packet adds the delta since the last verdict and the open threads with file and line', () => {
  const text = reviewPacket(raw({ round: 2, previous: { sha: 'b'.repeat(40), files: ['src/a/x.mjs'], diff: '+fix' }, threads: [{ path: 'src/a/x.mjs', line: 12, isResolved: false, body: '**Important** drops data\nmore' }, { path: 'docs/d.md', line: 1, isResolved: true, body: 'done' }] }));
  assert.match(text, /## 5\. Delta since the last verdict\n\nSince your last verdict at bbbbbbb/);
  assert.match(text, /## 6\. Open threads\n\n- src\/a\/x\.mjs:12: \*\*Important\*\* drops data/);
  assert.doesNotMatch(text, /docs\/d\.md:1/, 'a resolved thread is not open');
  assert.match(text, /## 7\. Call sites/);
});
test('the packet states what it leaves out and never carries the PR description, notes or hand-back', () => {
  const text = reviewPacket({ ...raw(), pr: { number: 5, url: 'u', head: 'a'.repeat(40), base: 'origin/main', body: 'SECRET-PR-DESCRIPTION', handBack: 'SECRET-HAND-BACK', note: 'SECRET-NOTE' } });
  assert.doesNotMatch(text, /SECRET-/);
  assert.match(text, /leaves out the PR description, implementer notes and hand-back/);
});
test('oversized parts are cut with a marker the reviewer sees', () => {
  const long = Array.from({ length: 500 }, (_, i) => `+line ${i}`).join('\n');
  const log = Array.from({ length: 100 }, (_, i) => `log ${i}`).join('\n');
  const text = reviewPacket(raw({ diffs: { 'src/a/x.mjs': long, 'docs/d.md': '+n' }, checks: [{ name: 'verify', state: 'FAILURE', excerpt: log }] }));
  assert.match(text, /\[truncated: 300 more lines of src\/a\/x\.mjs; read the rest with git diff origin\/main\.\.\.HEAD -- src\/a\/x\.mjs\]/);
  assert.match(text, /\[truncated: 60 more lines of the failing log\]/);
  const missing = reviewPacket(raw({ diffs: {} }));
  assert.match(missing, /\[truncated: 1 more file diff; read it with git diff/);
});
test('issueCriteria falls back to the clipped body and exportedSymbols reads added exports', () => {
  assert.match(issueCriteria('no section here').criteria, /no section here/);
  assert.equal(issueCriteria('no section here').scope, '(no scope packet)');
  assert.deepEqual(exportedSymbols('+++ b/x\n+export function a() {}\n+export const b = 1\n-export function gone() {}\n+export { c, d as e }\n+const hidden = 2'), ['a', 'b', 'c', 'e']);
});
test('the reviewer brief names the packet first, and a missing packet leaves the brief as before', () => {
  const f = { repo: 'acme/app', pr: { number: 5, url: 'u', headRefOid: 'a'.repeat(40) }, issue: { number: 3, url: 'iu' }, risk: 'R1', step: { mode: 'review', round: 1 }, lanes, base: 'main' };
  const brief = reviewerBrief({ ...f, packet: '/w/.wf/review-packet.md' });
  assert.ok(brief.indexOf('/w/.wf/review-packet.md') < brief.indexOf('Task:'));
  assert.doesNotMatch(reviewerBrief(f), /review packet/i);
});

test('drive gathers packet facts from the worktree at head and never reads the PR description', t => {
  const dir = mkdtempSync(join(tmpdir(), 'packet-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => { const result = spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.test', ...args], { cwd: dir, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  git('init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'a.mjs'), 'export const keep = 1;\n'); writeFileSync(join(dir, 'b.mjs'), "import { widget } from './a.mjs';\nwidget();\n");
  git('add', '.'); git('commit', '-qm', 'base'); git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  writeFileSync(join(dir, 'a.mjs'), 'export const keep = 1;\nexport function widget() {}\n'); git('commit', '-qam', 'feat');
  const head = git('rev-parse', 'HEAD');
  mkdirSync(join(dir, '.wf')); writeFileSync(join(dir, '.wf', 'gate.json'), JSON.stringify({ status: 0, head, at: 'now' }));
  const gh = args => (args[0] === 'api' && args[1] === 'graphql' ? { data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [{ isResolved: false, path: 'b.mjs', line: 2, comments: { nodes: [{ body: '**Important** x' }] } }] } } } } } : []);
  const io = githubIo(lanes, gh);
  const pr = { number: 5, url: 'u', headRefOid: head, body: 'SECRET-PR-DESCRIPTION', statusCheckRollup: [{ name: 'verify', conclusion: 'SUCCESS' }], reviews: [], files: [{ path: 'a.mjs', additions: 1, deletions: 0, changeType: 'MODIFIED' }] };
  const facts = io.packetFacts({ issue: { url: 'iu', body: spec }, pr, tree: { path: dir }, round: 1 });
  const text = reviewPacket(facts);
  assert.match(text, /\+export function widget\(\) \{\}/);
  assert.match(text, /`widget` \(a\.mjs\)[^]*b\.mjs:1:import \{ widget \}/);
  assert.match(text, /pass \(at this head, now\)/);
  assert.doesNotMatch(JSON.stringify(facts), /SECRET-PR-DESCRIPTION/);
});

test('usage carries effort: parsed from the command or the hand-back, summed per role, model and effort, unreported when a host gives none', () => {
  assert.equal(commandEffort(['claude', '--model', 'opus', '--effort', 'high']), 'high');
  assert.equal(commandEffort(['codex', 'exec', '-m', 'gpt', '-c', 'model_reasoning_effort="medium"']), 'medium');
  assert.equal(commandEffort(['claude', '--model', 'opus']), null);
  assert.equal(parseUsageLine('in=1 out=2 model=sonnet effort=high host=claude').effort, 'high');
  const rows = [
    usageEntry({ role: 'implementer', host: 'claude', model: 'sonnet', effort: 'medium', usage: null }),
    usageEntry({ role: 'implementer', host: 'claude', model: 'sonnet', effort: 'high', usage: null }),
    usageEntry({ role: 'devops', host: 'codex', model: 'gpt', usage: null }),
  ];
  assert.deepEqual(usageTotals(rows).map(row => [row.role, row.model, row.effort, row.sessions]), [['devops', 'gpt', 'unreported', 1], ['implementer', 'sonnet', 'high', 1], ['implementer', 'sonnet', 'medium', 1]]);
  const comment = usageComment(rows);
  assert.match(comment, /\| Role \| Model \| Effort \| Host \|/);
  assert.match(comment, /\| implementer \| sonnet \| high \| claude \| 1 \|/);
  assert.match(comment, /\| devops \| gpt \| unreported \| codex \| 1 \|/);
  assert.equal(parseUsageComment(comment)[0].effort, 'medium');
});
