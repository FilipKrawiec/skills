// Owner decisions of epics #409 and #560 that code or skill text implements, one test each, named with its decision and date.
// CODEOWNERS assigns this file to the owner. A decision changes only when the owner records a new one first: never edit,
// weaken or delete a test here to make a change pass; stop and ask the owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { deliveryAssignment, drive, decideIssue, implementerBrief, modelForStep, reviewerBrief, reviewerCommand } from '../../plugins/common/workflow/scripts/lib/drive.mjs';
import { prState } from '../../plugins/common/workflow/scripts/lib/state.mjs';

const root = new URL('../../', import.meta.url);
const text = path => readFileSync(new URL(path, root), 'utf8');
const head = 'a'.repeat(40);
const lanes = { repo: 'acme/app', base: 'main', implementer: 'builder', reviewer: 'reviewer', owner: 'owner', codeowners: '* @reviewer\n/.github/CODEOWNERS @owner\n' };
const label = name => ({ name });
const verdict = (value, state = 'COMMENTED') => ({ author: { login: 'reviewer' }, state, body: `<!-- agent-review sha=${head} round=1 verdict=${value} -->`, commit: { oid: head } });
const pr = (extra = {}) => ({ number: 5, url: 'https://github.com/acme/app/pull/5', state: 'OPEN', isDraft: false, headRefOid: head, headRefName: '3-x', labels: [label('risk:R1')], mergeable: 'MERGEABLE', statusCheckRollup: [{ name: 'verify', conclusion: 'SUCCESS' }], reviews: [], body: 'Closes #3', closingIssuesReferences: [{ number: 3, repository: { owner: { login: 'acme' }, name: 'app' } }], files: [], ...extra });
const issue = (extra = {}) => ({ number: 3, url: 'https://github.com/acme/app/issues/3', state: 'OPEN', title: 'feat(app): x', body: '', labels: [label('state:started')], ...extra });
const assessed = { risk: 'R1', assessed: 'R1', head, paths: [], reason: 'local' };
const tree = (extra = {}) => ({ path: '/w/3', branch: '3-x', dirty: false, commits: 1, unpushed: false, diffPaths: [], subjects: [], ...extra });
const step = (facts, extra = {}) => decideIssue({ blockers: [], diffPaths: [], handBack: {}, issueAssessment: assessed, prAssessment: assessed, ...facts, ...extra }, lanes);

test('decision 2026-11-16 (#560): a later review round judges only the delta after one full-diff round', () => {
  const brief = round => reviewerBrief({ repo: 'acme/app', pr: pr(), issue: issue(), risk: 'R1', step: { mode: 'review', round }, lanes, base: 'main' });
  assert.doesNotMatch(brief(1), /Later round/);
  assert.match(brief(2), /Later round: judge only the delta/);
  assert.match(text('plugins/common/workflow/skills/review/SKILL.md'), /delta/);
});

test('decision 2026-11-16 (#560): one reviewer per round and it starts no subagent', () => {
  assert.match(text('plugins/common/workflow/skills/review/SKILL.md'), /Never start a subagent, finder or verifier/);
  assert.match(text('plugins/common/workflow/agents/reviewer.md'), /disallowedTools: Agent/);
  assert.match(reviewerBrief({ repo: 'acme/app', pr: pr(), issue: issue(), risk: 'R1', step: { mode: 'review', round: 1 }, lanes, base: 'main' }), /never start an agent/);
  const next = step({ issue: issue(), tree: tree(), pr: pr({ isDraft: true }) });
  assert.deepEqual([next.agent, next.mode], ['reviewer', 'review'], 'a round is one reviewer step');
});

test('decision 2026-11-16 (#409, #560): Nits never block', () => {
  assert.match(text('plugins/common/workflow/skills/review/SKILL.md'), /Only Blocker and Important block/);
  assert.match(text('plugins/common/workflow/skills/review/SKILL.md'), /Nits never block and never earn another round/);
  assert.match(implementerBrief({ issue: issue(), risk: 'R1', model: 'sonnet', base: 'main', tree: tree(), pr: pr(), step: { mode: 'fix', reason: 'blocking review findings' }, round: 1 }), /Nits never block/);
});

test('decision 2026-11-16 (#560): the Reviewer runs Opus at every risk', () => {
  for (const risk of ['R0', 'R1', 'R2']) {
    assert.equal(modelForStep({ agent: 'reviewer' }, risk), 'opus');
    assert.equal(deliveryAssignment(undefined, { agent: 'reviewer' }, risk).model, 'opus');
  }
});

test('decision 2026-11-16 (#466, #467, #560): the Reviewer approval merges every risk except reserved effects and owner code-owner paths', () => {
  const approved = [verdict('ready', 'APPROVED')];
  for (const risk of ['R0', 'R1', 'R2']) assert.equal(prState(pr({ labels: [label(`risk:${risk}`)], reviews: approved }), lanes).next.action, 'merge', risk);
  assert.equal(prState(pr({ labels: [label('review:owner')], reviews: [verdict('owner', 'APPROVED')] }), lanes).next.actor, 'owner', 'a reserved effect');
  assert.equal(prState(pr({ files: [{ path: '.github/CODEOWNERS' }], reviews: approved }), lanes).next.actor, 'owner', 'an owner code-owner path');
  assert.match(text('AGENTS.md'), /budget increases, authority\/credential\/release changes, quality-gate weakening/);
});

test('decision 2026-11-16 (#560): AGY is advisory only and never reviews or implements', () => {
  for (const role of ['reviewer', 'implementer', 'freshImplementer']) {
    assert.throws(() => deliveryAssignment({ orchestrator: 'claude', roles: { [role]: { host: 'agy', model: 'm' } } }, { agent: role === 'freshImplementer' ? 'implementer' : role, fresh: role === 'freshImplementer' }, 'R1'), /advisory only/);
  }
  assert.throws(() => reviewerCommand('m', '/b', 'n', 'agy', 'agy'), /Unsupported reviewer host/);
  assert.equal(existsSync(new URL('plugins/common/workflow/scripts/agy-review.mjs', root)), false);
});

test('decision 2026-11-16 (#560): a diff outside the issue scope is blocked before a PR opens or a review starts', () => {
  const scoped = issue({ body: '```scope\n{"paths":["src/"]}\n```' });
  const done = { status: 'done', commit: 'feat(app): x', paths: ['src/a.js'] };
  assert.deepEqual(step({ issue: scoped, tree: tree({ diffPaths: ['src/a.js'] }), handBack: done }), { do: 'open' });
  const blocked = step({ issue: scoped, tree: tree({ diffPaths: ['src/a.js', 'plugins/x.md'] }), handBack: done });
  assert.deepEqual([blocked.agent, blocked.outOfScope], ['implementer', ['plugins/x.md']]);
});

test('decision 2026-11-16 (#560): only the owner changes a recorded decision', () => {
  assert.match(text('.github/CODEOWNERS'), /^\/scripts\/tests\/workflow-decisions\.test\.mjs @FilipKrawiec$/m);
  assert.match(text('plugins/common/workflow/skills/spec/references/decision-records.md'), /decision changes only when the owner records a new one first/);
  assert.match(text('scripts/tests/workflow-decisions.test.mjs'), /A decision changes only when the owner records a new one first/);
});
