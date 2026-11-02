import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, json, config, run, fixture, commitFixture, pushRecord, assertNoPush } from './support/workflow-cli-fixture.mjs';

test('AFK commit enforces the issue scope recorded in the hold', t => {
  const f = fixture(t);
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 1082, paths: ['docs/'] }] }));
  f.env.WORKFLOW_RUN_ID = 'afk-test-run';
  f.env.WORKFLOW_ISSUE_NUMBER = '1082';
  f.env.GIT_AUTHOR_NAME = 'Test';
  f.env.GIT_AUTHOR_EMAIL = 'test@example.test';
  f.env.GIT_COMMITTER_NAME = 'Test';
  f.env.GIT_COMMITTER_EMAIL = 'test@example.test';
  mkdirSync(join(f.repo, '.captures-886'));
  writeFileSync(join(f.repo, '.captures-886', 'after.jpeg'), 'capture');
  const denied = f.cliRun('commit', '--message', 'chore: out of scope', '--', '.captures-886/after.jpeg');
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /assigned AFK scope/);
  assert.equal(f.linkedGit('diff', '--cached', '--name-only').stdout.trim(), '');
  delete f.env.WORKFLOW_ISSUE_NUMBER;
  const selfClaim = f.cliRun('commit', '--message', 'chore: out of scope', '--', '.captures-886/after.jpeg');
  assert.notEqual(selfClaim.status, 0);
  assert.match(selfClaim.stderr, /assigned AFK scope/);
  f.env.WORKFLOW_ISSUE_NUMBER = '1082';
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  mkdirSync(join(f.repo, 'docs'));
  writeFileSync(join(f.repo, 'docs', 'report.md'), 'in scope');
  const allowed = f.cliRun('commit', '--message', 'docs: in scope', '--', 'docs/report.md');
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.deepEqual(f.linkedGit('show', '--format=', '--name-only', 'HEAD').stdout.trim().split('\n'), ['docs/report.md']);
  const committed = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 1082, paths: [] }] }));
  writeFileSync(join(f.repo, 'docs', 'read-only.md'), 'must stay uncommitted');
  const readOnly = f.cliRun('commit', '--message', 'docs: violate read-only task', '--', 'docs/read-only.md');
  assert.notEqual(readOnly.status, 0);
  assert.match(readOnly.stderr, /assigned AFK scope/);
  assert.equal(f.linkedGit('rev-parse', 'HEAD').stdout.trim(), committed);
});

test('AFK commit rejects an unauthenticated actor before staging', t => {
  const f = fixture(t);
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 1082, paths: ['docs/'] }] }));
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  f.env.WORKFLOW_RUN_ID = 'afk-test-run';
  f.env.WORKFLOW_ISSUE_NUMBER = '1082';
  f.env.FAKE_ACTOR = 'reviewer';
  mkdirSync(join(f.repo, 'docs'));
  writeFileSync(join(f.repo, 'docs', 'report.md'), 'in scope');
  const before = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  const result = f.cliRun('commit', '--message', 'docs: in scope', '--', 'docs/report.md');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AFK writes require builder/);
  assert.equal(f.linkedGit('rev-parse', 'HEAD').stdout.trim(), before);
  assert.equal(f.linkedGit('diff', '--cached', '--name-only').stdout.trim(), '');
});

test('AFK push rejects staged and committed renames from outside scope', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'outside.txt'), 'outside');
  assert.equal(f.linkedGit('add', 'outside.txt').status, 0);
  commitFixture(f);
  f.env.REMOTE_BASE_SHA = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 1082, paths: ['docs/'] }] }));
  f.env.WORKFLOW_RUN_ID = 'afk-test-run';
  f.env.WORKFLOW_ISSUE_NUMBER = '1082';
  mkdirSync(join(f.repo, 'docs'));
  assert.equal(f.linkedGit('mv', 'outside.txt', 'docs/inside.txt').status, 0);
  const staged = f.cliRun('push');
  assert.notEqual(staged.status, 0);
  assert.match(staged.stderr, /Push paths exceed the assigned AFK scope/);
  assert.equal(f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'move').status, 0);
  const committed = f.cliRun('push');
  assert.notEqual(committed.status, 0);
  assert.match(committed.stderr, /Push paths exceed the assigned AFK scope/);
  assertNoPush(f);
});

test('AFK push scope ignores base commits the branch has not merged', t => {
  const f = fixture(t);
  writeFileSync(join(f.main, 'outside.txt'), 'base moved');
  assert.equal(f.git('add', 'outside.txt').status, 0);
  commitFixture(f, f.main);
  f.env.REMOTE_BASE_SHA = f.git('rev-parse', 'HEAD').stdout.trim();
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 1082, paths: ['docs/'] }] }));
  f.env.WORKFLOW_RUN_ID = 'afk-test-run';
  f.env.WORKFLOW_ISSUE_NUMBER = '1082';
  mkdirSync(join(f.repo, 'docs'));
  writeFileSync(join(f.repo, 'docs', 'report.md'), 'in scope');
  assert.equal(f.linkedGit('add', 'docs/report.md').status, 0);
  assert.equal(f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'docs').status, 0);
  const inScope = f.cliRun('push');
  assert.doesNotMatch(inScope.stderr, /assigned AFK scope/);
  assert.equal(inScope.status, 0, inScope.stderr);
  writeFileSync(join(f.repo, 'own.txt'), 'outside');
  assert.equal(f.linkedGit('add', 'own.txt').status, 0);
  assert.equal(f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'own').status, 0);
  const outOfScope = f.cliRun('push');
  assert.notEqual(outOfScope.status, 0);
  assert.match(outOfScope.stderr, /Push paths exceed the assigned AFK scope/);
});

test('AFK push rejects raw commits outside the issue scope before authenticating', t => {
  const f = fixture(t);
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 1082, paths: ['docs/'] }] }));
  f.env.WORKFLOW_RUN_ID = 'afk-test-run';
  f.env.WORKFLOW_ISSUE_NUMBER = '1082';
  mkdirSync(join(f.repo, '.captures-886'));
  writeFileSync(join(f.repo, '.captures-886', 'after.jpeg'), 'capture');
  assert.equal(run(f.env.REAL_GIT, ['add', '.captures-886/after.jpeg'], { cwd: f.repo }).status, 0);
  assert.equal(run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'chore: bypass cli commit'], { cwd: f.repo }).status, 0);
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Push paths exceed the assigned AFK scope/);
  assertNoPush(f);
});

test('AFK push --to updates the held PR from a differently named branch and refuses other refs', t => {
  const f = fixture(t);
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 259, paths: ['docs/'] }] }));
  f.env.WORKFLOW_RUN_ID = 'afk-test-run';
  f.env.WORKFLOW_ISSUE_NUMBER = '259';
  f.env.OPEN_PRS = JSON.stringify([
    { number: 259, headRefName: 'feature/held', isCrossRepository: false, autoMergeRequest: null, closingIssuesReferences: [] },
    { number: 300, headRefName: 'feature/other', isCrossRepository: false, autoMergeRequest: null, closingIssuesReferences: [{ number: 12 }] },
    { number: 301, headRefName: 'feature/fork', isCrossRepository: true, autoMergeRequest: null, closingIssuesReferences: [{ number: 259 }] },
  ]);
  for (const ref of ['feature/other', 'feature/fork', 'feature/absent', 'main']) {
    const refused = f.cliRun('push', '--to', ref);
    assert.notEqual(refused.status, 0, ref);
    assert.match(refused.stderr, ref === 'main' ? /default branch/ : /not the head of the held PR/);
    assertNoPush(f);
  }
  const head = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  const result = f.cliRun('push', '--to', 'feature/held');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).branch, 'feature/held');
  assert.ok(pushRecord(f).args.includes(`${head}:refs/heads/feature/held`));
});

test('AFK push --to accepts the PR that closes or is part of the held issue', t => {
  const f = fixture(t);
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 261, paths: ['docs/'] }] }));
  f.env.WORKFLOW_RUN_ID = 'afk-test-run';
  const closes = (owner, name) => [{ number: 261, repository: { name, owner: { login: owner } } }];
  f.env.OPEN_PRS = JSON.stringify([
    { number: 262, headRefName: 'fix/held', isCrossRepository: false, autoMergeRequest: null, closingIssuesReferences: closes('Acme', 'App') },
    { number: 263, headRefName: 'fix/elsewhere', isCrossRepository: false, autoMergeRequest: null, closingIssuesReferences: closes('other', 'repo') },
    { number: 264, headRefName: 'fix/slice', isCrossRepository: false, autoMergeRequest: null, closingIssuesReferences: [], body: 'Part of #261' },
    { number: 265, headRefName: 'fix/mention', isCrossRepository: false, autoMergeRequest: null, closingIssuesReferences: [], body: 'See #261 and #2610' },
    { number: 266, headRefName: 'fix/longer', isCrossRepository: false, autoMergeRequest: null, closingIssuesReferences: [], body: 'Part of #2610' },
  ]);
  const elsewhere = f.cliRun('push', '--to', 'fix/elsewhere');
  assert.notEqual(elsewhere.status, 0);
  assert.match(elsewhere.stderr, /not the head of the held PR/);
  assertNoPush(f);
  const mention = f.cliRun('push', '--to', 'fix/mention');
  assert.notEqual(mention.status, 0);
  assertNoPush(f);
  const longer = f.cliRun('push', '--to', 'fix/longer');
  assert.notEqual(longer.status, 0);
  assertNoPush(f);
  const slice = f.cliRun('push', '--to', 'fix/slice');
  assert.equal(slice.status, 0, slice.stderr);
  assert.ok(pushRecord(f).args.some(arg => arg.endsWith(':refs/heads/fix/slice')));
  const result = f.cliRun('push', '--to', 'fix/held');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(pushRecord(f).args.some(arg => arg.endsWith(':refs/heads/fix/held')));
});

test('AFK commit records a base merge that brings in files outside the scope', t => {
  const f = fixture(t);
  const g = (...args) => run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: f.repo });
  mkdirSync(join(f.repo, 'docs'));
  writeFileSync(join(f.repo, 'docs', 'report.md'), 'base'); writeFileSync(join(f.repo, 'outside.txt'), 'base');
  assert.equal(g('add', 'docs/report.md', 'outside.txt').status, 0); assert.equal(g('commit', '-qm', 'base').status, 0);
  assert.equal(g('checkout', '-qb', 'other').status, 0);
  writeFileSync(join(f.repo, 'outside.txt'), 'base change'); writeFileSync(join(f.repo, 'docs', 'report.md'), 'theirs');
  assert.equal(g('commit', '-qam', 'base change').status, 0);
  assert.equal(g('checkout', '-q', 'feature/test').status, 0);
  writeFileSync(join(f.repo, 'docs', 'report.md'), 'ours'); assert.equal(g('commit', '-qam', 'ours').status, 0);
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 1082, paths: ['docs/'] }] }));
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  f.env.WORKFLOW_RUN_ID = 'afk-test-run';
  f.env.WORKFLOW_ISSUE_NUMBER = '1082';
  const before = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  assert.notEqual(g('merge', '--no-ff', '--no-commit', 'other').status, 0);
  writeFileSync(join(f.repo, 'docs', 'report.md'), 'resolved');
  writeFileSync(join(f.repo, 'outside.txt'), 'edited during merge');
  const evil = f.cliRun('commit', '--message', 'chore: merge base', '--', 'docs/report.md', 'outside.txt');
  assert.notEqual(evil.status, 0);
  assert.match(evil.stderr, /assigned AFK scope: outside\.txt differ/);
  assert.equal(f.linkedGit('rev-parse', 'HEAD').stdout.trim(), before);
  assert.equal(g('checkout', 'MERGE_HEAD', '--', 'outside.txt').status, 0);
  const result = f.cliRun('commit', '--message', 'chore: merge base');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.linkedGit('show', '-s', '--format=%P', 'HEAD').stdout.trim().split(' ').length, 2);
  assert.equal(f.linkedGit('show', 'HEAD:outside.txt').stdout, 'base change');
  assert.equal(f.linkedGit('show', 'HEAD:docs/report.md').stdout, 'resolved');
});

test('commit without paths requires a merge in progress', t => {
  const f = fixture(t);
  const result = f.cliRun('commit', '--message', 'chore: nothing');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only while a merge is in progress/);
});

test('AFK commit and push follow a scope packet corrected on the held issue', t => {
  const f = fixture(t);
  f.env.REMOTE_BASE_SHA = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 1082, paths: ['docs/old.md'] }] }));
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  Object.assign(f.env, { WORKFLOW_RUN_ID: 'afk-test-run', WORKFLOW_ISSUE_NUMBER: '1082', GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.test', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.test' });
  mkdirSync(join(f.repo, 'docs'));
  writeFileSync(join(f.repo, 'docs', 'moved.md'), 'moved target');
  f.env.FAKE_ISSUE_BODY = 'Scope\n```scope\n{"paths":["docs/old.md"]}\n```';
  const stale = f.cliRun('commit', '--message', 'docs: moved target', '--', 'docs/moved.md');
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /assigned AFK scope/);
  f.env.FAKE_ISSUE_BODY = 'Scope\n```scope\n{"paths":["docs/moved.md"]}\n```';
  const corrected = f.cliRun('commit', '--message', 'docs: moved target', '--', 'docs/moved.md');
  assert.equal(corrected.status, 0, corrected.stderr);
  assert.deepEqual(f.linkedGit('show', '--format=', '--name-only', 'HEAD').stdout.trim().split('\n'), ['docs/moved.md']);
  const pushed = f.cliRun('push');
  assert.equal(pushed.status, 0, pushed.stderr);
  f.env.FAKE_ISSUE_BODY = 'Scope\n```scope\n{"paths":["docs/old.md"]}\n```';
  const reverted = f.cliRun('push');
  assert.notEqual(reverted.status, 0);
  assert.match(reverted.stderr, /Push paths exceed the assigned AFK scope/);
});

test('AFK merge commit follows a scope packet corrected on the held issue', t => {
  const f = fixture(t);
  const g = (...args) => run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: f.repo });
  mkdirSync(join(f.repo, 'docs'));
  writeFileSync(join(f.repo, 'docs', 'moved.md'), 'base');
  assert.equal(g('add', 'docs/moved.md').status, 0); assert.equal(g('commit', '-qm', 'base').status, 0);
  assert.equal(g('checkout', '-qb', 'other').status, 0);
  writeFileSync(join(f.repo, 'docs', 'moved.md'), 'theirs'); assert.equal(g('commit', '-qam', 'theirs').status, 0);
  assert.equal(g('checkout', '-q', 'feature/test').status, 0);
  writeFileSync(join(f.repo, 'docs', 'moved.md'), 'ours'); assert.equal(g('commit', '-qam', 'ours').status, 0);
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 1082, paths: ['docs/old.md'] }] }));
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  Object.assign(f.env, { WORKFLOW_RUN_ID: 'afk-test-run', WORKFLOW_ISSUE_NUMBER: '1082' });
  const before = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  assert.notEqual(g('merge', '--no-ff', '--no-commit', 'other').status, 0);
  writeFileSync(join(f.repo, 'docs', 'moved.md'), 'resolved');
  f.env.FAKE_ISSUE_BODY = 'Scope\n```scope\n{"paths":["docs/old.md"]}\n```';
  const stale = f.cliRun('commit', '--message', 'chore: merge base', '--', 'docs/moved.md');
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /assigned AFK scope: docs\/moved\.md differ/);
  assert.equal(f.linkedGit('rev-parse', 'HEAD').stdout.trim(), before);
  f.env.FAKE_ISSUE_BODY = 'Scope\n```scope\n{"paths":["docs/moved.md"]}\n```';
  const corrected = f.cliRun('commit', '--message', 'chore: merge base', '--', 'docs/moved.md');
  assert.equal(corrected.status, 0, corrected.stderr);
  assert.equal(f.linkedGit('show', 'HEAD:docs/moved.md').stdout, 'resolved');
});

test('AFK commit and push let a PR scoped by its files follow paths the base renamed', t => {
  const f = fixture(t);
  const g = (...args) => run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: f.repo });
  mkdirSync(join(f.repo, 'tests'));
  writeFileSync(join(f.repo, 'tests', 'old.test.mjs'), 'shared test body\n'.repeat(20));
  writeFileSync(join(f.repo, 'tests', 'kept.test.mjs'), 'kept test body\n'.repeat(20));
  assert.equal(g('add', 'tests').status, 0); assert.equal(g('commit', '-qm', 'base').status, 0);
  assert.equal(g('checkout', '-qb', 'other').status, 0);
  assert.equal(g('mv', 'tests/old.test.mjs', 'tests/new.test.mjs').status, 0); assert.equal(g('commit', '-qm', 'move tests').status, 0);
  assert.equal(g('update-ref', 'refs/remotes/origin/main', 'other').status, 0);
  assert.equal(g('checkout', '-q', 'feature/test').status, 0);
  const head = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 295, pr: 295, head, paths: ['tests/old.test.mjs'] }] }));
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  Object.assign(f.env, { WORKFLOW_RUN_ID: 'afk-test-run', WORKFLOW_ISSUE_NUMBER: '295', FAKE_ISSUE_BODY: 'No packet', REMOTE_BASE_SHA: f.linkedGit('rev-parse', 'other').stdout.trim(), GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.test', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.test' });
  assert.equal(g('merge', '-q', '--no-ff', '-m', 'merge base', 'other').status, 0);
  writeFileSync(join(f.repo, 'tests', 'new.test.mjs'), 'edited after the move\n');
  const moved = f.cliRun('commit', '--message', 'test: edit moved test', '--', 'tests/new.test.mjs');
  assert.equal(moved.status, 0, moved.stderr);
  const pushed = f.cliRun('push');
  assert.equal(pushed.status, 0, pushed.stderr);
  // Only the base's renames widen the scope; unrelated base files and the branch's own renames stay outside.
  writeFileSync(join(f.repo, 'tests', 'kept.test.mjs'), 'edited\n');
  const unrelated = f.cliRun('commit', '--message', 'test: edit unrelated test', '--', 'tests/kept.test.mjs');
  assert.notEqual(unrelated.status, 0);
  assert.match(unrelated.stderr, /assigned AFK scope.*add a `scope` packet listing them to #295/);
  assert.equal(g('checkout', '--', 'tests/kept.test.mjs').status, 0);
  assert.equal(g('mv', 'tests/new.test.mjs', 'tests/elsewhere.test.mjs').status, 0);
  assert.equal(g('commit', '-qm', 'rename on the branch').status, 0);
  const branchRename = f.cliRun('push');
  assert.notEqual(branchRename.status, 0);
  assert.match(branchRename.stderr, /Push paths exceed the assigned AFK scope/);
});

