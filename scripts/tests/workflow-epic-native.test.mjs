import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyConsolidatedDelivery } from '../../plugins/common/workflow/scripts/lib/consolidated-delivery.mjs';
import { verifyEpicClosure } from '../../plugins/common/workflow/scripts/lib/epic-closure.mjs';
import { resolveNativeEpicEvidence } from '../../plugins/common/workflow/scripts/lib/epic-attestation.mjs';

const pr = 'https://github.com/a/b/pull/12';
function fixture(over = {}) {
  const outcome = { criterion: { id: 'a', text: 'Works' }, state: 'met', explanation: 'The evidence shows it.', evidence: [pr], ...over };
  const epic = { number: 9, body: '### Acceptance criteria\n- [x] Works <!-- workflow:criterion a -->\n' };
  const slices = [{ number: 10, state: 'CLOSED' }];
  const packet = { version: 1, epic: 9, children: [10], outcomes: [outcome] };
  const adapters = { native: () => packet, lookup: (repo, n) => ({ number: n, pr: true, merged: true, base: 'main' }), merged: () => true };
  return { epic, slices, packet, outcome, adapters, check: () => verifyEpicClosure({ epic, slices, repo: 'a/b', base: 'main' }, adapters) };
}

test('closure completes with a current Reviewer outcome and merged children', () => {
  assert.equal(fixture().check().complete, true);
});

test('closure stops on a stale criterion, an unlisted child, an open child or a child without a merged PR', () => {
  for (const mutate of [
    f => { f.epic.body = f.epic.body.replace('Works', 'Changed'); },
    f => { f.slices.push({ number: 11, state: 'CLOSED' }); },
    f => { f.slices[0].state = 'OPEN'; },
    f => { f.adapters.merged = () => false; },
    f => { f.epic.body = f.epic.body.replace('[x]', '[ ]'); },
    f => { f.adapters.native = () => { throw Error('no review'); }; },
  ]) { const f = fixture(); mutate(f); assert.equal(f.check().complete, false); }
});

test('outcomes need an explanation and evidence links', () => {
  for (const over of [{ explanation: '  ' }, { explanation: undefined }, { evidence: [] }, { evidence: ['not a url'] }]) assert.equal(fixture(over).check().complete, false);
});

test('cited PRs must exist in the repository and be merged into the base; other links and content are not checked', () => {
  const f = fixture();
  f.adapters.lookup = () => null; assert.equal(f.check().complete, false);
  f.adapters.lookup = (repo, n) => ({ number: n, pr: false }); assert.equal(f.check().complete, false, 'an issue where a PR is cited');
  f.adapters.lookup = (repo, n) => ({ number: n, pr: true, merged: false, base: 'main' }); assert.equal(f.check().complete, false);
  f.adapters.lookup = (repo, n) => ({ number: n, pr: true, merged: true, base: 'dev' }); assert.equal(f.check().complete, false);
  const issue = fixture({ evidence: ['https://github.com/a/b/issues/3', 'https://example.org/anything'] });
  issue.adapters.lookup = (repo, n) => ({ number: n, pr: false });
  assert.equal(issue.check().complete, true);
  const other = fixture({ evidence: ['https://github.com/other/repo/pull/1'] });
  other.adapters.lookup = () => { throw Error('must not look up'); };
  assert.equal(other.check().complete, true);
});

test('outcome parsing rows: text after the marker, a commit link and rejection messages that show the expected format', () => {
  const rows = [
    { name: 'text after the criterion marker', mutate: f => { f.epic.body = f.epic.body.replace('-->', '--> (owner: dev)'); }, complete: true },
    { name: 'a commit link resolves to its merged PR', over: { evidence: ['https://github.com/a/b/commit/abcdef1234567'] }, mutate: f => { f.adapters.commitPr = (repo, sha) => (sha === 'abcdef1234567' ? 12 : null); }, complete: true },
    { name: 'a commit in no merged PR names the PR link format', over: { evidence: ['https://github.com/a/b/commit/abcdef1234567'] }, mutate: f => { f.adapters.commitPr = () => null; }, complete: false, message: /pull\/<number>/ },
    { name: 'a criterion without an ID names the marker format', mutate: f => { f.epic.body = '### Acceptance criteria\n- [x] Works\n'; }, complete: false, message: /- \[ \] <criterion text> <!-- workflow:criterion <id> -->/ },
    { name: 'a non-URL evidence entry names the link format', over: { evidence: ['not a url'] }, complete: false, message: /pull\/<number>/ },
  ];
  for (const row of rows) {
    const f = fixture(row.over); row.mutate?.(f);
    const result = f.check();
    assert.equal(result.complete, row.complete, `${row.name}: ${result.issues}`);
    if (row.message) assert.match(result.issues.join(' '), row.message, row.name);
  }
});

test('unmet outcomes keep the epic open with a concrete follow-up', () => {
  const result = fixture({ state: 'unmet', nextAction: 'Fix the gap' }).check();
  assert.equal(result.complete, false);
  assert.deepEqual(result.outstanding, [{ id: 'a', text: 'Works', nextAction: 'Fix the gap' }]);
  assert.equal(fixture({ state: 'unverifiable' }).check().complete, false, 'no next action, no follow-up');
});

const cfg = { repo: 'a/b', reviewer: 'reviewer', implementer: 'builder' };
const comment = (login, time, extra = {}) => ({ user: { login }, created_at: time, body: JSON.stringify({ kind: 'workflow:epic-outcomes', version: 1, ...extra }) });

test('the newest outcome comment by the configured Reviewer is current; an edit or older comment does not matter', () => {
  const comments = () => [comment('reviewer', '2026-01-02T00:00:00Z', { n: 2 }), comment('reviewer', '2026-01-01T00:00:00Z', { n: 1 }), comment('builder', '2026-01-03T00:00:00Z', { n: 3 })];
  const resolve = (adapters = {}) => resolveNativeEpicEvidence({ repo: 'a/b', issue: 9 }, { trustedConfig: () => cfg, comments, ...adapters });
  assert.equal(resolve().n, 2);
  assert.throws(() => resolve({ comments: () => [comment('builder', '2026-01-03T00:00:00Z')] }));
  assert.throws(() => resolve({ trustedConfig: () => ({ ...cfg, implementer: 'reviewer' }) }));
  assert.throws(() => resolve({ comments: () => { throw Error('unavailable'); } }));
});

test('the outcome comment is read as raw JSON or fenced JSON, with or without a marker; other bodies are ignored', () => {
  const json = JSON.stringify({ kind: 'workflow:epic-outcomes', version: 1, n: 7 });
  const marker = '<!-- workflow:epic-outcomes -->';
  const read = body => resolveNativeEpicEvidence({ repo: 'a/b', issue: 9 }, { trustedConfig: () => cfg, comments: () => [{ user: { login: 'reviewer' }, created_at: '2026-01-01T00:00:00Z', body }] });
  for (const body of [json, `${marker}\n${json}`, `\`\`\`json\n${json}\n\`\`\``, `${marker}\n\n\`\`\`json\n${json}\n\`\`\`\n`]) assert.equal(read(body).n, 7, body);
  assert.throws(() => read('Looks good, epic done.'), /not posted an epic outcome/);
  assert.throws(() => read(`${marker}\n\`\`\`json\n{not json}\n\`\`\``), /marker line .*one fenced/);
});

test('prose before or after the fence is accepted; an unparseable newer comment explains the format instead of using an older one', () => {
  const json = JSON.stringify({ kind: 'workflow:epic-outcomes', version: 1, n: 7 });
  const marker = '<!-- workflow:epic-outcomes -->';
  const at = (body, created_at) => ({ user: { login: 'reviewer' }, created_at, body });
  const read = comments => resolveNativeEpicEvidence({ repo: 'a/b', issue: 9 }, { trustedConfig: () => cfg, comments: () => comments });
  assert.equal(read([at(`${marker}\nIntro.\n\`\`\`json\n${json}\n\`\`\`\nTrailing note.`, '2026-01-01T00:00:00Z')]).n, 7);
  const old = at(json, '2026-01-01T00:00:00Z');
  assert.throws(() => read([old, at(`${marker}\noops`, '2026-01-02T00:00:00Z')]), /marker line .*one fenced/);
  assert.equal(read([at(`${marker}\noops`, '2026-01-01T00:00:00Z'), at(json, '2026-01-02T00:00:00Z')]).n, 7);
});

test('consolidated delivery needs the Reviewer to name a merged PR; the issue body may change', () => {
  const child = { number: 10, state: 'CLOSED', body: 'anything' };
  const packet = { version: 1, epic: 9, consolidated: [{ issue: 10, pr: 25, state: 'met' }] };
  const adapters = { native: () => packet, mergedPr: (number, base) => number === 25 && base === 'main' };
  const check = () => verifyConsolidatedDelivery({ epic: 9, child, repo: 'a/b', base: 'main' }, adapters);
  assert.equal(check(), true);
  child.body += ' edited'; assert.equal(check(), true);
  adapters.mergedPr = () => false; assert.equal(check(), false); adapters.mergedPr = () => true;
  packet.consolidated.push(packet.consolidated[0]); assert.equal(check(), false); packet.consolidated.pop();
  packet.consolidated[0].state = 'unmet'; assert.equal(check(), false);
  adapters.native = () => { throw Error('unavailable'); }; assert.equal(check(), false);
});

test('the first fence tagged json is read even after an earlier non-JSON fence', () => {
  const json = JSON.stringify({ kind: 'workflow:epic-outcomes', version: 1, n: 7 });
  const body = `<!-- workflow:epic-outcomes -->\n\`\`\`text\nsee below\n\`\`\`\n\`\`\`json\n${json}\n\`\`\``;
  const read = resolveNativeEpicEvidence({ repo: 'a/b', issue: 9 }, { trustedConfig: () => cfg, comments: () => [{ user: { login: 'reviewer' }, created_at: '2026-01-01T00:00:00Z', body }] });
  assert.equal(read.n, 7);
});

test('an outcome must copy the criterion text verbatim, Markdown included; stripped markup is stale and says how to fix it', () => {
  const body = '### Acceptance criteria\n- [x] **Measured.** `bench` replays it <!-- workflow:criterion a -->\n';
  const verbatim = fixture({ criterion: { id: 'a', text: '**Measured.** `bench` replays it' } });
  verbatim.epic.body = body;
  assert.equal(verbatim.check().complete, true);
  const stripped = fixture({ criterion: { id: 'a', text: 'Measured. bench replays it' } });
  stripped.epic.body = body;
  const result = stripped.check();
  assert.equal(result.complete, false);
  assert.equal(result.needsReview, true);
  assert.match(result.issues[0], /verbatim/);
});
