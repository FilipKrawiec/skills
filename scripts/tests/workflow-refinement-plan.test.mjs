import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { githubIo, plannerBrief } from '../../plugins/common/workflow/scripts/lib/drive.mjs';

const read = path => readFileSync(new URL(`../../plugins/common/workflow/skills/${path}`, import.meta.url), 'utf8');

test('epic slicing directs the planner to create one final refinement with native blockers and standard criteria', () => {
  const brief = plannerBrief({ issue: { number: 1, title: 'Epic', url: 'url', body: '' }, step: { mode: 'slice' } });
  assert.match(brief, /Invoke the `plan` skill/);
  const plan = read('plan/SKILL.md');
  assert.match(plan, /exactly one final refinement slice/);
  assert.ok(plan.includes('<!-- workflow:epic-refinement -->'));
  assert.match(plan, /native blocked-by links to every other slice/);
  assert.match(plan, /Outcome, Decisions and architecture rules/);
  assert.match(plan, /Nits, aliases, shims and naming clashes/);
  assert.match(plan, /dead files, exports, symbols, fixtures and baseline entries/i);
  assert.match(plan, /no new entries/);
  assert.match(plan, /before and after times per project gate and CI part/);
  assert.match(plan, /missing evidence/);
  assert.match(plan, /implementer brief and review expectations/);
});

test('drive creates a missing refinement with the marker and exactly the criteria the plan skill gives the planner', () => {
  let body = '';
  const gh = args => {
    const query = args.find(arg => arg.startsWith('query=')) || '';
    if (query.includes('createIssue')) { body = args.find(arg => arg.startsWith('body=')).slice(5); return { data: { createIssue: { issue: { number: 2 } } } }; }
    if (query) return { data: { repository: { id: 'R', issue: { id: 'E', milestone: null } } } };
    return { number: 2 };
  };
  githubIo({ repo: 'acme/app' }, gh).createRefinement({ number: 1, title: 'Epic', body: '```scope\n{"paths":["a/"]}\n```' });
  assert.ok(body.startsWith('<!-- workflow:epic-refinement -->'));
  assert.ok(body.includes('```scope\n{"paths":["a/"]}\n```'));
  const created = body.split('\n').filter(line => line.startsWith('- [ ] ')).map(line => line.slice(6));
  const planned = read('plan/SKILL.md').split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2));
  assert.equal(created.length, 3);
  assert.deepEqual(created, planned.filter(line => created.includes(line)));
});
