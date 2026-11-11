import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prRecord } from '../../plugins/common/workflow/scripts/lib/board.mjs';
import { ensureWorkflowLabels, workflowLabels } from '../../plugins/common/workflow/scripts/lib/core.mjs';

const cfg = { repo: 'acme/app', reviewer: 'reviewer', owner: 'owner' };
const linked = number => ({ body: `Closes #${number}`, closingIssuesReferences: [{ number, repository: { name: 'app', owner: { login: 'acme' } } }] });
const pr = (number, extra = {}) => ({ number, title: `PR ${number}`, body: 'No linked issue.', headRefOid: 'abc', labels: [], reviews: [], statusCheckRollup: [], mergeable: 'MERGEABLE', files: [{ path: 'src/a.js' }], ...extra });

test('the risk labels are part of the label catalog', () => {
  assert.deepEqual(workflowLabels['risk:R0'][1], 'Low-risk PR: docs, tests or a local change');
  assert.ok(workflowLabels['risk:R1'] && workflowLabels['risk:R2']);
  assert.ok(workflowLabels['nits:swept'], 'labels ensure creates the Nits sweep label');
});

test('a verdict marker without a mode reads like the one review mode', () => {
  const modeless = (value, state = 'COMMENTED') => ({ author: { login: 'reviewer' }, state, commit: { oid: 'abc' }, body: `<!-- agent-review sha=abc round=1 verdict=${value} -->` });
  assert.equal(prRecord(pr(20, { isDraft: true, reviews: [modeless('ready')] }), cfg).shipReady, true);
  assert.equal(prRecord(pr(20, { isDraft: true, reviews: [modeless('ready'), modeless('fixes')] }), cfg).shipReady, false);
  const handedOff = prRecord(pr(20, { isDraft: false, reviews: [modeless('ready')] }), cfg);
  assert.deepEqual([handedOff.shipReady, handedOff.awaitingReview], [false, true], 'a ready PR awaits the Reviewer approval');
  const fixes = prRecord(pr(20, { isDraft: false, reviews: [modeless('fixes')] }), cfg);
  assert.equal(fixes.awaitingReview, false, 'a blocking verdict on a ready PR reviews its head');
  assert.equal(prRecord(pr(20, { isDraft: false, reviews: [modeless('ready'), modeless('ready', 'APPROVED')] }), cfg).approved, true);
});

const verdict = (mode, value, state = 'COMMENTED') => ({ author: { login: 'reviewer' }, state, commit: { oid: 'abc' }, body: `<!-- agent-review sha=abc round=1 mode=${mode} verdict=${value} -->` });

test('only a human change request at the head holds a ready draft, and their later approval clears it', () => {
  const ready = verdict('team', 'ready');
  const human = (state, oid = 'abc') => ({ author: { login: 'teammate' }, state, commit: { oid }, body: '' });
  assert.equal(prRecord(pr(20, { isDraft: true, reviews: [ready, human('CHANGES_REQUESTED')] }), cfg).shipReady, false, 'a change request at the head');
  assert.equal(prRecord(pr(20, { isDraft: true, reviews: [ready, human('CHANGES_REQUESTED', 'old')] }), cfg).shipReady, true, 'an older head');
  assert.equal(prRecord(pr(20, { isDraft: true, reviews: [ready, human('CHANGES_REQUESTED'), human('APPROVED')] }), cfg).shipReady, true, 'approved later');
});

test('missing workflow labels are created, existing ones kept', () => {
  const created = [];
  const names = ensureWorkflowLabels('acme/app', () => Object.keys(workflowLabels).filter(name => name !== 'risk:R1').map(name => ({ name })), name => created.push(name));
  assert.deepEqual([names, created], [['risk:R1'], ['risk:R1']]);
});

test('a ready PR the Reviewer approved at its head with an author verdict is approved and awaits no review', () => {
  const approval = { ...verdict('author', 'ready', 'APPROVED') };
  const record = prRecord(pr(20, { isDraft: false, ...linked(5), statusCheckRollup: [{ conclusion: 'SUCCESS' }], reviews: [verdict('author', 'ready'), approval] }), cfg);
  assert.deepEqual([record.approved, record.awaitingReview], [true, false]);
});

test('one review skill, one mode: one reviewer, no subagents, the cap is final and Nits never block', () => {
  const read = path => readFileSync(new URL(`../../plugins/common/workflow/${path}`, import.meta.url), 'utf8');
  const skill = name => read(`skills/${name}/SKILL.md`);
  const deliver = skill('deliver');
  assert.match(deliver, /Never review or approve in this session/);
  assert.match(deliver, /Nits never block/);
  const review = skill('review');
  const approval = read('skills/review/references/approval.md');
  assert.match(approval, /verdict=owner/);
  assert.match(approval, /pr auto-merge --pr <N>`/);
  assert.match(review, /Never start a subagent, finder or verifier/);
  assert.match(review, /<!-- agent-review sha=<HEAD> round=<N> verdict=<ready\|fixes\|cap\|split> -->/);
  assert.doesNotMatch(review, /mode=|author mode|team mode/i);
  assert.match(review, /`verdict=cap`, final/);
  assert.match(review, /never the whole diff again/);
  assert.match(review, /Nits never block and never earn another round/);
  assert.match(review, /\*\*Follow-up:\*\*/);
  assert.match(deliver, /Add no capability, option or refactor the issue did not ask for/);
  const agent = read('agents/reviewer.md');
  assert.match(agent, /^name: reviewer$/m);
  assert.match(agent, /^skills:\n  - review$/m);
  assert.match(agent, /^disallowedTools: Agent$/m);
  // The frontmatter model is the default; drive passes the model risk calls for (Opus for R2), which takes precedence.
  assert.match(agent, /^model: sonnet$/m);
  assert.match(agent, /^effort: \w+$/m);
  const implementer = read('agents/implementer.md');
  assert.match(implementer, /^name: implementer$/m);
  assert.match(implementer, /^model: sonnet$/m);
  assert.match(implementer, /^effort: \w+$/m);
  assert.match(implementer, /^skills:\n  - deliver\n  - tdd$/m);
  assert.match(implementer, /^disallowedTools: Agent$/m);
  assert.match(implementer, /at most 5 lines/);
});
