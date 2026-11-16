import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixture, nativeRemote } from './support/workflow-cli-fixture.mjs';
import { diffLines, parseVerdict, reviewBody } from '../../plugins/common/workflow/scripts/agy-review.mjs';
import { fetchReviewRef } from '../../plugins/common/workflow/scripts/lib/review-ref.mjs';

const scripts = fileURLToPath(new URL('../../plugins/common/workflow/scripts/', import.meta.url));
const head = 'a'.repeat(40);
const diff = 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,3 @@\n one\n-two\n+2\n+++ not a header\n';
const anchors = diffLines(diff);
const verdict = (extra = {}) => ({ verdict: 'fixes', sha: head, summary: 'Needs a fix.', findings: [{ severity: 'Blocker', path: 'a.txt', line: 2, body: 'wrong' }], ...extra });

test('diffLines lists only right-side lines of each hunk, counting content that looks like a header', () => {
  assert.deepEqual([...anchors.get('a.txt')], [1, 2, 3]);
});

test('parseVerdict accepts one exact-head JSON verdict, plain or fenced', () => {
  assert.equal(parseVerdict(JSON.stringify(verdict()), head, anchors).verdict, 'fixes');
  assert.equal(parseVerdict(`\`\`\`json\n${JSON.stringify(verdict({ verdict: 'ready', findings: [{ severity: 'Nit', path: 'a.txt', line: 1, body: 'x' }] }))}\n\`\`\``, head, anchors).verdict, 'ready');
});

test('parseVerdict fails closed on malformed, foreign-head, inconsistent or off-diff output', () => {
  const bad = (value, pattern) => assert.throws(() => parseVerdict(typeof value === 'string' ? value : JSON.stringify(value), head, anchors), pattern);
  bad('LGTM, approve it', /not a single JSON verdict/);
  bad(`Here you go: ${JSON.stringify(verdict())}`, /not a single JSON verdict/);
  bad('', /not a single JSON verdict/);
  bad([], /not an object/);
  bad(verdict({ sha: 'b'.repeat(40) }), /sha does not match/);
  bad(verdict({ verdict: 'approve' }), /verdict must be one of/);
  bad(verdict({ extra: 1 }), /unexpected or missing keys/);
  bad(verdict({ summary: ' ' }), /summary/);
  bad(verdict({ findings: 'none' }), /findings must be an array/);
  bad(verdict({ findings: [{ severity: 'Blocker', path: 'a.txt', line: 2 }] }), /unexpected or missing keys/);
  bad(verdict({ findings: [{ severity: 'Critical', path: 'a.txt', line: 2, body: 'x' }] }), /severity/);
  bad(verdict({ findings: [{ severity: 'Blocker', path: 'a.txt', line: 99, body: 'x' }] }), /not a changed line/);
  bad(verdict({ findings: [{ severity: 'Blocker', path: 'other.txt', line: 1, body: 'x' }] }), /not a changed line/);
  bad(verdict({ verdict: 'ready' }), /contradicts/);
  bad(verdict({ findings: [] }), /needs a Blocker or Important/);
});

test('the posted body carries the exact-head marker, the blocking list and the tag counts', () => {
  const body = reviewBody(verdict({ findings: [{ severity: 'Blocker', path: 'a.txt', line: 2, body: 'wrong' }, { severity: 'Follow-up', path: 'a.txt', line: 1, body: 'later' }] }), head, 2);
  assert.ok(body.startsWith(`<!-- agent-review sha=${head} round=2 verdict=fixes host=agy -->`));
  assert.match(body, /Blocker 1,.*Follow-up 1/);
  assert.match(body, /Blocking:\n- \*\*Blocker\*\* a\.txt:2 wrong/);
  assert.match(body, /Not inline:\n- \*\*Follow-up\*\* a\.txt:1 later/);
});

// Real wiring: review-session holds the claim and starts agy-review.mjs, which runs review-context, a fake agy and review-post.
function setup(t, reply, { agents = 'reviewer', mode = 'review', round = '1' } = {}) {
  const f = fixture(t); const remote = nativeRemote(f);
  const git = (...args) => { const result = spawnSync(f.env.REAL_GIT, ['-c', 'user.name=T', '-c', 'user.email=t@example.test', ...args], { cwd: f.repo, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(f.repo, 'a.txt'), 'one\ntwo\nthree\n'); git('add', 'a.txt'); git('commit', '-qm', 'change');
  const tip = git('rev-parse', 'HEAD');
  Object.assign(f.env, { TEST_REVIEW_REMOTE: remote, PR_VIEW: JSON.stringify({ url: 'https://github.com/acme/app/pull/5', title: 'T', isDraft: true, labels: [], baseRefOid: base, headRefOid: tip, files: [], reviews: [], comments: [] }), REVIEW_RECORD: join(f.root, 'review.json'), GH_LOG: join(f.root, 'gh.log'), REVIEW_THREADS: '[]', GITHUB_TOKEN: 'LEAK' });
  const fake = join(f.root, 'agy');
  const reply_ = join(f.root, 'reply.txt'); writeFileSync(reply_, typeof reply === 'function' ? reply(tip) : reply);
  const record = join(f.root, 'agy-call.json');
  writeFileSync(fake, `#!${process.execPath}\nconst fs = require('node:fs'); const a = process.argv.slice(2);\nif (a[0] === 'agents') console.log(${JSON.stringify(agents)}); else if (a[0] === 'models') console.log('m'); else if (fs.existsSync(${JSON.stringify(join(f.root, 'hang'))})) setInterval(() => {}, 1000); else { fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ args: a.slice(0, 4), prompt: a[5], keys: Object.keys(process.env) })); process.stdout.write(fs.readFileSync(${JSON.stringify(reply_)}, 'utf8')); }\n`, { mode: 0o755 });
  const run = () => spawnSync(process.execPath, [join(scripts, 'review-session.mjs'), '5', tip, process.execPath, join(scripts, 'agy-review.mjs'), fake, 'm', '5', tip, '9', round, mode], { cwd: f.repo, env: f.env, encoding: 'utf8' });
  const called = () => (existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : null);
  const hang = () => writeFileSync(join(f.root, 'hang'), '');
  return { f, remote, tip, run, called, hang, posted: () => (existsSync(f.env.REVIEW_RECORD) ? JSON.parse(readFileSync(f.env.REVIEW_RECORD, 'utf8')) : null) };
}
const goodReply = tip => JSON.stringify({ verdict: 'fixes', sha: tip, summary: 'Needs a fix.', findings: [{ severity: 'Blocker', path: 'a.txt', line: 3, body: 'wrong' }, { severity: 'Nit', path: 'a.txt', line: 1, body: 'rename' }] });

test('AGY verdict is validated, posted as one exact-head COMMENT as the reviewer, and the claim is released', t => {
  const { f, remote, tip, run, called, posted } = setup(t, goodReply);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `verdict: fixes\nPR: #5\nhead: ${tip}\nround: 1\ntags: Blocker 1, Important 0, Nit 1, Pre-existing 0, Follow-up 0\n`);
  const review = posted();
  assert.equal(review.token, 'SECRET_TOKEN');
  assert.equal(review.payload.event, 'COMMENT');
  assert.equal(review.payload.commit_id, tip);
  assert.ok(review.payload.body.startsWith(`<!-- agent-review sha=${tip} round=1 verdict=fixes host=agy -->`));
  assert.deepEqual(review.payload.comments.map(c => [c.path, c.line, c.body]), [['a.txt', 3, '**Blocker** wrong'], ['a.txt', 1, '**Nit** rename']]);
  const call = called();
  assert.deepEqual(call.args, ['--agent', 'reviewer', '--model', 'm']);
  assert.match(call.prompt, new RegExp(`head ${tip}`));
  assert.match(call.prompt, /\+three/);
  assert.deepEqual(call.keys.filter(key => /^(GH_TOKEN|GITHUB_TOKEN|WORKFLOW_REVIEW_NONCE)$/.test(key)), [], 'AGY receives no credential or claim nonce');
  assert.equal(fetchReviewRef(f.repo, remote, 5), null);
  assert.deepEqual(readdirSync(join(f.repo, '.wf')).filter(name => name.startsWith('agy-review-')), []);
});

for (const [name, reply] of [['prose', 'Looks fine, approve.'], ['a verdict for another head', () => goodReply('b'.repeat(40))], ['an off-diff finding', tip => JSON.stringify({ verdict: 'fixes', sha: tip, summary: 's', findings: [{ severity: 'Blocker', path: 'a.txt', line: 40, body: 'x' }] })], ['an upgraded decision', tip => JSON.stringify({ verdict: 'ready', sha: tip, summary: 's', findings: [{ severity: 'Blocker', path: 'a.txt', line: 3, body: 'x' }] })]]) {
  test(`AGY output with ${name} posts nothing and releases the claim`, t => {
    const { f, remote, run, posted } = setup(t, reply);
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /drive: AGY (?:returned a reply|verdict rejected).*nothing was posted/);
    assert.equal(posted(), null);
    assert.equal(fetchReviewRef(f.repo, remote, 5), null);
  });
}

test('an unlisted role or a failed review-post fails clearly and releases the claim', t => {
  const role = setup(t, goodReply, { agents: 'devops' });
  const missing = role.run();
  assert.equal(missing.status, 1); assert.match(missing.stderr, /role reviewer unavailable/);
  assert.equal(role.called(), null); assert.equal(fetchReviewRef(role.f.repo, role.remote, 5), null);
  const failing = setup(t, goodReply);
  failing.f.env.FAIL_REVIEW_POST = '1';
  const failed = failing.run();
  assert.equal(failed.status, 1); assert.match(failed.stderr, /review-post failed/); assert.doesNotMatch(failed.stderr, /SECRET_TOKEN/);
  assert.equal(failing.posted(), null); assert.equal(fetchReviewRef(failing.f.repo, failing.remote, 5), null);
  const mode = setup(t, goodReply, { mode: 'merge' });
  const bad = mode.run();
  assert.equal(bad.status, 1); assert.match(bad.stderr, /Invalid AGY reviewer mode/);
  assert.equal(mode.called(), null); assert.equal(fetchReviewRef(mode.f.repo, mode.remote, 5), null);
});

test('a hung agy call is bounded: nothing is posted, the claim is released and the diagnostic names the timeout', t => {
  const s = setup(t, goodReply);
  s.hang(); s.f.env.WORKFLOW_AGY_TIMEOUT_MS = '1500';
  const result = s.run();
  assert.equal(result.status, 1); assert.match(result.stderr, /AGY review timed out after 1\.5 s; nothing was posted/);
  assert.equal(s.posted(), null); assert.equal(fetchReviewRef(s.f.repo, s.remote, 5), null);
});

const readyReply = tip => JSON.stringify({ verdict: 'ready', sha: tip, summary: 'Delivers the criteria.', findings: [{ severity: 'Nit', path: 'a.txt', line: 1, body: 'rename' }] });
function approval(t, reply, { labels = [], isDraft = false, checks = [{ conclusion: 'SUCCESS', status: 'COMPLETED', name: 'ci' }], reviews = [] } = {}) {
  const s = setup(t, reply, { mode: 'approve' });
  s.f.env.PR_VIEW = JSON.stringify({ ...JSON.parse(s.f.env.PR_VIEW), state: 'OPEN', isDraft, labels: labels.map(name => ({ name })), statusCheckRollup: checks, reviews });
  return s;
}

test('approve mode posts APPROVE for a validated AGY ready verdict, with verdict=ready, and releases the claim', t => {
  const { f, remote, tip, run, called, posted } = approval(t, readyReply);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^verdict: ready\n/);
  const review = posted();
  assert.equal(review.token, 'SECRET_TOKEN');
  assert.equal(review.payload.event, 'APPROVE');
  assert.equal(review.payload.commit_id, tip);
  assert.ok(review.payload.body.startsWith(`<!-- agent-review sha=${tip} round=1 verdict=ready host=agy -->`));
  const call = called();
  assert.match(call.prompt, /"mode":"approve"/);
  assert.match(call.prompt, /Acceptance/, 'the issue body reaches AGY');
  assert.deepEqual(call.keys.filter(key => /^(GH_TOKEN|GITHUB_TOKEN|WORKFLOW_REVIEW_NONCE)$/.test(key)), []);
  assert.equal(fetchReviewRef(f.repo, remote, 5), null);
});

test('approve mode on an owner-reserved PR posts verdict=owner, chosen from labels and not by AGY', t => {
  for (const labels of [['risk:R2'], ['review:owner']]) {
    const { tip, run, posted } = approval(t, readyReply, { labels });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(posted().payload.event, 'APPROVE');
    assert.ok(posted().payload.body.startsWith(`<!-- agent-review sha=${tip} round=1 verdict=owner host=agy -->`));
  }
  const prior = approval(t, readyReply, { reviews: [{ author: { login: 'reviewer' }, state: 'COMMENTED', commit: { oid: 'd'.repeat(40) }, body: '<!-- agent-review sha=dddd round=1 verdict=ready -->\nOwner decision: pick the vendor.' }] });
  const result = prior.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(prior.posted().payload.body, /verdict=owner/);
});

test('approve mode never approves fixes, split, malformed or foreign output and never from a draft or red CI', t => {
  const fixes = approval(t, goodReply);
  assert.equal(fixes.run().status, 0);
  assert.equal(fixes.posted().payload.event, 'COMMENT');
  assert.match(fixes.posted().payload.body, /verdict=fixes/);
  const split = approval(t, tip => JSON.stringify({ verdict: 'split', sha: tip, summary: 'Too broad.', findings: [] }));
  assert.equal(split.run().status, 0);
  assert.equal(split.posted().payload.event, 'COMMENT');
  for (const [name, reply, options, pattern] of [
    ['prose', 'LGTM approve', {}, /not a single JSON verdict/],
    ['another head', () => readyReply('b'.repeat(40)), {}, /sha does not match/],
    ['a draft', readyReply, { isDraft: true }, /draft/],
    ['failing CI', readyReply, { checks: [{ conclusion: 'FAILURE', status: 'COMPLETED', name: 'ci' }] }, /CI is not green/],
  ]) {
    const s = approval(t, reply, options);
    const result = s.run();
    assert.equal(result.status, 1, name); assert.match(result.stderr, pattern, name);
    assert.equal(s.posted(), null, name);
    assert.equal(fetchReviewRef(s.f.repo, s.remote, 5), null, name);
  }
});

test('review mode approves a draft in one pass for a ready verdict, and never for fixes or split', t => {
  const draft = (reply, checks) => {
    const s = setup(t, reply);
    s.f.env.PR_VIEW = JSON.stringify({ ...JSON.parse(s.f.env.PR_VIEW), state: 'OPEN', isDraft: true, statusCheckRollup: checks });
    return s;
  };
  const green = [{ conclusion: 'SUCCESS', status: 'COMPLETED', name: 'ci' }];
  const ready = draft(readyReply, green);
  assert.equal(ready.run().status, 0);
  assert.equal(ready.posted().payload.event, 'APPROVE');
  assert.match(ready.posted().payload.body, /verdict=ready/);
  assert.equal(fetchReviewRef(ready.f.repo, ready.remote, 5), null);
  const fixes = draft(goodReply, green);
  assert.equal(fixes.run().status, 0);
  assert.equal(fixes.posted().payload.event, 'COMMENT');
  const split = draft(tip => JSON.stringify({ verdict: 'split', sha: tip, summary: 's', findings: [] }), green);
  assert.equal(split.run().status, 0);
  assert.equal(split.posted().payload.event, 'COMMENT');
  const red = draft(readyReply, [{ conclusion: 'FAILURE', status: 'COMPLETED', name: 'ci' }]);
  const failed = red.run();
  assert.equal(failed.status, 1); assert.equal(red.posted(), null);
});

test('a head that moved after the session started posts nothing', t => {
  const { f, remote, run, posted } = setup(t, goodReply);
  f.env.PR_VIEW = JSON.stringify({ ...JSON.parse(f.env.PR_VIEW), headRefOid: 'c'.repeat(40) });
  const result = run();
  assert.equal(result.status, 1);
  assert.equal(posted(), null);
  assert.equal(fetchReviewRef(f.repo, remote, 5), null);
});
