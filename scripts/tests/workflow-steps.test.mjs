import test from 'node:test';
import assert from 'node:assert/strict';
import { requireTestStep } from '../../plugins/common/workflow/scripts/workflow.mjs';

test('AFK requires a non-empty configured Test command', () => {
  for (const steps of [{}, { test: null }, { test: [] }]) {
    assert.throws(() => requireTestStep(steps), /steps\.test as a non-empty argv array/);
  }
  assert.deepEqual(requireTestStep({ test: ['just', 'verify'] }), ['just', 'verify']);
});
