import test from 'node:test';
import assert from 'node:assert/strict';
import { afkMerge, afkPlan } from '../../plugins/common/workflow/scripts/lib/afk-board.mjs';
import { afkEndCards } from '../../plugins/common/workflow/scripts/lib/afk-runs.mjs';
import { workflowLabels } from '../../plugins/common/workflow/scripts/lib/core.mjs';

const cfg = { repo: 'acme/app', reviewer: 'reviewer', owner: 'owner' };
const epic = { number: 1, labels: ['type:epic'], ancestors: [], priority: 'P1', status: 'In progress', subIssuesSummary: { total: 2, completed: 0 } };
const story = (number, labels = ['lane:afk'], extra = {}) => ({ number, labels, ancestors: [1], blocked: false, paths: [`src/${number}.js`], priority: 2, status: 'Todo', ...extra });
const linked = number => ({ body: `Closes #${number}`, closingIssuesReferences: [{ number, repository: { name: 'app', owner: { login: 'acme' } } }] });
const pr = (number, extra = {}) => ({ number, title: `PR ${number}`, body: 'No linked issue.', headRefOid: 'abc', labels: [], reviews: [], statusCheckRollup: [], mergeable: 'MERGEABLE', files: [{ path: 'src/a.js' }], ...extra });
const now = Date.parse('2026-11-06T12:00:00Z');

test('the risk labels are part of the label catalog', () => {
  assert.deepEqual(workflowLabels['risk:R0'][1], 'Low-risk PR: one finder, no verifier');
  assert.ok(workflowLabels['risk:R1'] && workflowLabels['risk:R2']);
});

test('a green draft is left for ship to mark ready; the CLI never readies it', () => {
  const calls = [];
  const messages = afkMerge(cfg, [pr(20, { isDraft: true, statusCheckRollup: [{ conclusion: 'SUCCESS' }] })], null, args => { calls.push(args); return { status: 0 }; });
  assert.deepEqual([messages, calls], [[], []]);
});

test('a capped draft, whose issues all left lane:afk, is never served; an abandoned draft of a lane:afk issue is', () => {
  const plan = issues => afkPlan(cfg, [], () => [], 'run', { issues: [epic, ...issues], prs: [pr(20, { isDraft: true, labels: [{ name: 'risk:R2' }], ...linked(5) })], merged: [], now });
  assert.deepEqual(plan([story(5, ['lane:owner'], { status: 'In progress' })]).units, []);
  assert.deepEqual(plan([story(5, ['lane:afk'], { status: 'In progress' })]).units.map(unit => unit.pr), [20]);
});

test('a PR merged in the last week without lessons gets one improve unit, after Review and before Todo', () => {
  const merged = [{ number: 30, title: 'Done', mergedAt: '2026-11-05T12:00:00Z' }, { number: 31, title: 'Old', mergedAt: '2026-10-20T12:00:00Z' }, { number: 32, title: 'Learned', mergedAt: '2026-11-05T12:00:00Z' }];
  const threads = number => number === 32 ? [{ id: 1, user: { login: 'builder' }, body: '## Lessons\n\nno lessons' }] : [];
  const plan = afkPlan(cfg, [], threads, 'run', { issues: [epic, story(6)], prs: [pr(20)], merged, now });
  assert.deepEqual(plan.units.map(unit => [unit.column, unit.pr ?? unit.issue]), [['Review', 20], ['Done', 30], ['Todo', 6]]);
  const improve = plan.units[1];
  assert.deepEqual([improve.refine, improve.paths, improve.text], [true, [], 'PR #30 (Done) merged: invoke `ship` on it to check base and record delivery, then `improve` on it alone and comment `## Lessons` on it']);
});

test('an issue whose PR is still a draft stays In progress when its run ends; a ready PR goes to Review', () => {
  assert.deepEqual(afkEndCards(7, [], new Set([7]), false, new Set([7])), [[7, 'PROGRESS']]);
  assert.deepEqual(afkEndCards(7, [], new Set([7]), false, new Set()), [[7, 'REVIEW']]);
});

const verdict = (mode, value, state = 'COMMENTED') => ({ author: { login: 'reviewer' }, state, commit: { oid: 'abc' }, body: `<!-- agent-review sha=abc round=1 mode=${mode} verdict=${value} -->` });
const plain = (prs, issues = [story(5, ['lane:afk'], { status: 'In progress' })]) => afkPlan(cfg, [], () => [], 'run', { issues: [epic, ...issues], prs, merged: [], now }).units;

test('a ready PR whose only verdict at its head is from author mode awaits its team-mode review', () => {
  const units = plain([pr(20, { isDraft: false, ...linked(5), reviews: [verdict('author', 'ready')] })]);
  assert.deepEqual(units.map(unit => [unit.pr, Boolean(unit.review)]), [[20, true]]);
});

test('a green draft with an author verdict=ready at its head gets a ship unit, not a fix', () => {
  const units = plain([pr(20, { isDraft: true, ...linked(5), statusCheckRollup: [{ conclusion: 'SUCCESS' }], reviews: [verdict('author', 'ready')] })]);
  assert.deepEqual(units.map(unit => [unit.pr, unit.paths, unit.text]), [[20, [], 'PR #20 (PR 20) passed author review: invoke `ship` to hand it to team review']]);
});

test('a human change request at an approved head gets a fix unit', () => {
  const human = { author: { login: 'teammate' }, state: 'CHANGES_REQUESTED', commit: { oid: 'abc' }, body: 'Please rename this.' };
  const units = plain([pr(20, { isDraft: false, ...linked(5), reviews: [verdict('team', 'ready', 'APPROVED'), human] })]);
  assert.deepEqual(units.map(unit => [unit.pr, Boolean(unit.review), unit.text]), [[20, false, 'PR #20 (PR 20) needs its review fixed']]);
});
