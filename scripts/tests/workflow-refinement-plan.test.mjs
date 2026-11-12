import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plannerBrief } from '../../plugins/common/workflow/scripts/lib/drive.mjs';

const read = path => readFileSync(new URL(`../../plugins/common/workflow/skills/${path}`, import.meta.url), 'utf8');

test('epic slicing directs the planner to create one final refinement with native blockers and standard criteria', () => {
  const brief = plannerBrief({ issue: { number: 1, title: 'Epic', url: 'url', body: '' }, step: { mode: 'slice' } });
  assert.match(brief, /Invoke the `plan` skill/);
  const plan = read('plan/SKILL.md');
  assert.match(plan, /exactly one final refinement slice/);
  assert.match(plan, /native blocked-by links to every other slice/);
  assert.match(plan, /Outcome, Decisions and architecture rules/);
  assert.match(plan, /Nits, aliases, shims and naming clashes/);
  assert.match(plan, /dead files, exports, symbols, fixtures and baseline entries/i);
  assert.match(plan, /no new entries/);
  assert.match(plan, /before and after times per project gate and CI part/);
  assert.match(plan, /missing evidence/);
  assert.match(plan, /implementer brief and review expectations/);
});
