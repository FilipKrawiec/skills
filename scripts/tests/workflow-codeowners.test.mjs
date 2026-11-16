import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerPaths } from '../../plugins/common/workflow/scripts/lib/codeowners.mjs';

const rules = ['# comment', '* @reviewer', '/.github/workflows/ @owner', 'docs/**/*.md @owner @reviewer', '*.lock @owner', '/scripts/tests/decisions.test.mjs @owner', '/vendor/ ', ''].join('\n');

test('the last matching CODEOWNERS pattern owns a path; only paths the Reviewer does not own are returned', () => {
  const paths = ['src/a.js', '.github/workflows/ci.yml', '.github/workflows/deep/x.yml', 'docs/a/b.md', 'pkg/yarn.lock', 'scripts/tests/decisions.test.mjs', 'scripts/tests/other.test.mjs', 'vendor/x.js', 'sub/.github/workflows/y.yml'];
  assert.deepEqual(ownerPaths(rules, paths, 'Reviewer'), ['.github/workflows/ci.yml', '.github/workflows/deep/x.yml', 'pkg/yarn.lock', 'scripts/tests/decisions.test.mjs']);
  assert.deepEqual(ownerPaths(rules, paths, 'owner').includes('src/a.js'), true, 'by the configured Reviewer, not by a fixed name');
  assert.deepEqual(ownerPaths('', paths, 'reviewer'), []);
});
