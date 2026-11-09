import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afkMerge, afkMergedPrs, afkPlan, afkPrRecord } from '../../plugins/common/workflow/scripts/lib/afk-board.mjs';
import { afkEndCards, afkOpenPrIssues } from '../../plugins/common/workflow/scripts/lib/afk-runs.mjs';
import { ensureWorkflowLabels, workflowLabels } from '../../plugins/common/workflow/scripts/lib/core.mjs';

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

test('a draft whose newest author verdict at its head is cap is never served, whatever its issues; another draft is', () => {
  const capVerdict = { author: { login: 'reviewer' }, state: 'COMMENTED', commit: { oid: 'abc' }, body: '<!-- agent-review sha=abc round=3 mode=author verdict=cap -->' };
  const plan = (issues, extra = {}) => afkPlan(cfg, [], () => [], 'run', { issues: [epic, ...issues], prs: [pr(20, { isDraft: true, labels: [{ name: 'risk:R2' }], ...extra })], merged: [], now });
  assert.deepEqual(plan([], { reviews: [capVerdict] }).units, [], 'capped with no linked story');
  assert.deepEqual(plan([story(5, ['lane:afk'], { status: 'In progress' })], { ...linked(5), reviews: [capVerdict] }).units, []);
  assert.deepEqual(plan([story(5, ['lane:afk'], { status: 'In progress' })], { ...linked(5), reviews: [{ ...capVerdict, commit: { oid: 'old' } }] }).units.map(unit => unit.pr), [20], 'a new head after the cap is served');
  assert.deepEqual(plan([story(5, ['lane:owner'], { status: 'In progress' })], { ...linked(5), statusCheckRollup: [{ conclusion: 'FAILURE' }] }).units.map(unit => unit.pr), [20], 'a red, never-capped draft on an owner issue still gets its fix');
});

test('a PR merged in the last week without lessons gets one improve unit, after Review and before Todo', () => {
  const merged = [{ number: 30, title: 'Done', mergedAt: '2026-11-05T12:00:00Z' }, { number: 31, title: 'Old', mergedAt: '2026-10-20T12:00:00Z' }, { number: 32, title: 'Learned', mergedAt: '2026-11-05T12:00:00Z' }];
  const threads = number => number === 32 ? [{ id: 1, user: { login: 'builder' }, body: '## Lessons\n\nno lessons' }] : [];
  const plan = afkPlan(cfg, [], threads, 'run', { issues: [epic, story(6)], prs: [pr(20)], merged: merged.map(item => ({ ...item, files: [{ path: `src/${item.number}.js` }] })), now });
  assert.deepEqual(plan.units.map(unit => [unit.column, unit.pr ?? unit.issue]), [['Review', 20], ['Done', 30], ['Todo', 6]]);
  const improve = plan.units[1];
  assert.deepEqual([improve.pr, improve.paths, improve.text], [30, ['src/30.js'], 'PR #30 (Done) merged: invoke `ship` on it to check base and record delivery, then `improve` on it alone and comment `## Lessons` on it']);
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

test('a draft with an author verdict=ready at its head gets a ship unit, not a fix, while its checks pend', () => {
  const units = plain([pr(20, { isDraft: true, ...linked(5), statusCheckRollup: [{ status: 'IN_PROGRESS' }], reviews: [verdict('author', 'ready')] })]);
  assert.deepEqual(units.map(unit => [unit.pr, unit.paths, unit.text]), [[20, [], 'PR #20 (PR 20) passed author review: invoke `ship` to hand it to team review']]);
});

test('a human change request at an approved head gets a fix unit', () => {
  const human = { author: { login: 'teammate' }, state: 'CHANGES_REQUESTED', commit: { oid: 'abc' }, body: 'Please rename this.' };
  const units = plain([pr(20, { isDraft: false, ...linked(5), reviews: [verdict('team', 'ready', 'APPROVED'), human] })]);
  assert.deepEqual(units.map(unit => [unit.pr, Boolean(unit.review), unit.text]), [[20, false, 'PR #20 (PR 20) needs its review fixed']]);
});

test('a ship unit needs no scope, and a red check or a human change request outranks it', () => {
  const ready = { isDraft: true, ...linked(5), reviews: [verdict('author', 'ready')] };
  assert.deepEqual(plain([pr(20, { ...ready, filesUnread: true })], [story(5, ['lane:afk'], { status: 'In progress', paths: null })]).map(unit => unit.text), ['PR #20 (PR 20) passed author review: invoke `ship` to hand it to team review']);
  assert.match(plain([pr(20, { ...ready, statusCheckRollup: [{ conclusion: 'FAILURE' }] })])[0].text, /has a red check/);
  const human = { author: { login: 'teammate' }, state: 'CHANGES_REQUESTED', commit: { oid: 'abc' }, body: 'No.' };
  assert.match(plain([pr(20, { ...ready, reviews: [...ready.reviews, human] })])[0].text, /needs its review fixed/);
});

test('only a human change request at the head counts, and their later approval clears it', () => {
  const approval = verdict('team', 'ready', 'APPROVED');
  const human = (state, oid = 'abc') => ({ author: { login: 'teammate' }, state, commit: { oid }, body: '' });
  assert.equal(afkPrRecord(pr(20, { reviews: [approval, human('CHANGES_REQUESTED', 'old')] }), cfg).needsWork, false, 'an older head');
  assert.equal(afkPrRecord(pr(20, { reviews: [approval, human('CHANGES_REQUESTED'), human('APPROVED')] }), cfg).needsWork, false, 'approved later');
});

test('a split verdict at the head routes its PR to spec', () => {
  const split = { author: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', commit: { oid: 'abc' }, body: '<!-- agent-review sha=abc round=0 verdict=split -->' };
  assert.match(plain([pr(20, { ...linked(5), reviews: [split] })])[0].text, /was held for its size: invoke `spec` to split its issue/);
});

test('the improve unit skips a merged PR a live run holds, and a spent one is not offered again', () => {
  const merged = [{ number: 30, title: 'Done', mergedAt: '2026-11-05T12:00:00Z', files: [] }];
  const held = number => number === 30 ? [{ id: 1, body: '<!-- afk-issue-hold session=other -->' }] : [];
  assert.deepEqual(afkPlan(cfg, ['other'], held, 'run', { issues: [epic], prs: [], merged, now }).units, []);
  const first = afkPlan(cfg, [], () => [], 'run', { issues: [epic], prs: [], merged, now }).units[0];
  const again = afkPlan(cfg, [], () => [], 'run', { issues: [epic], prs: [], merged, now, spent: { 30: first.state } });
  assert.deepEqual([again.units, again.unchanged], [[], [30]]);
});

test('merged PRs are read by merge date, and an unreadable list offers none', () => {
  const calls = [];
  assert.deepEqual(afkMergedPrs(cfg, now, args => { calls.push(args); return [{ number: 1 }]; }), [{ number: 1 }]);
  assert.ok(calls[0].includes('merged:>=2026-10-30 sort:updated-desc') && calls[0].includes('number,title,mergedAt,files'));
  assert.deepEqual(afkMergedPrs(cfg, now, () => { throw new Error('down'); }), []);
});

test('missing workflow labels are created, existing ones kept', () => {
  const created = [];
  const names = ensureWorkflowLabels('acme/app', () => Object.keys(workflowLabels).filter(name => name !== 'risk:R1').map(name => ({ name })), name => created.push(name));
  assert.deepEqual([names, created], [['risk:R1'], ['risk:R1']]);
});

test('a run end reads which named issues still have a draft PR', () => {
  const { named, drafts } = afkOpenPrIssues([{ issues: [7], isDraft: true }, { issues: [8], isDraft: false }]);
  assert.deepEqual([[...named], [...drafts]], [[7, 8], [7]]);
});

test('ship runs the team-mode review before requesting reviewers and the owner only on verdict=owner or a third failed round', () => {
  const skill = name => readFileSync(new URL(`../../plugins/common/workflow/skills/${name}/SKILL.md`, import.meta.url), 'utf8');
  const ship = skill('ship');
  const review = ship.indexOf('Team review');
  assert.ok(review >= 0 && ship.indexOf('Request reviewers') > review);
  for (const text of [ship, skill('agent-review')]) {
    assert.match(text, /verdict=owner/);
    assert.match(text, /third failed round|round >= 3/);
  }
  assert.match(ship, /gh pr ready <N>`, then drop its CODEOWNERS owner auto-request[^\n]*--remove-reviewer/);
  assert.doesNotMatch(ship, /invites human review/);
  assert.match(skill('vcs'), /team-mode pass/);
});
