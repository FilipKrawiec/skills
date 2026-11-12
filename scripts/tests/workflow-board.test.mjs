import test from 'node:test';
import assert from 'node:assert/strict';
import { linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  boardStatus,
  pathsFromIssueBody,
  pathsWithinScope,
  prLinkedIssues,
  prRecord,
  reviewerApproved,
} from '../../plugins/common/workflow/scripts/lib/board.mjs';
import {
  assertDistinctPushRoles,
  discoveredProject,
  githubPushRemoteMatches,
  githubRepoFromRemote,
  githubScopeFailure,
  missingProjectScope,
  readThroughLocalCache,
  workflowLabels,
  workflowMetadataCachePath,
} from '../../plugins/common/workflow/scripts/lib/core.mjs';
import {
  hasLockfAncestor,
  needsAbsoluteInvocation,
} from '../../plugins/common/workflow/scripts/workflow.mjs';
import {
  assertIssueVisibility,
  issueTargetRepo,
  oldestExactTitle,
  scopeOverlaps,
  validateIssueCommentBody,
  workspaceFilePath,
} from '../../plugins/common/workflow/scripts/lib/issues.mjs';

const cfg = { repo: 'acme/app', reviewer: 'reviewer', owner: 'owner' };

test('a scope covers a path equal to or under one of its entries', () => {
  assert.equal(pathsWithinScope(['docs/a.md'], ['docs/']), true);
  assert.equal(pathsWithinScope(['.captures-886/a.jpeg'], ['docs/']), false);
  assert.equal(pathsWithinScope(['docs/read-only.md'], []), false);
  assert.equal(pathsWithinScope([], []), true);
  assert.equal(pathsWithinScope([], null), true);
  assert.equal(pathsWithinScope(['src/app.dart'], null), true);
});

test('a scope packet or an explicit no-repository-change constraint gives the issue\'s paths', () => {
  assert.deepEqual(pathsFromIssueBody('Make no repository changes, commits, PRs, deployments.'), []);
  assert.deepEqual(pathsFromIssueBody('```scope\n{"paths":["docs/"]}\n```'), ['docs/']);
  assert.equal(pathsFromIssueBody('no valid packet'), null);
});

test('workflow label catalog is centralized in the CLI', () => {
  assert.deepEqual(Object.keys(workflowLabels), [
    'lane:owner', 'state:started', 'state:reviewing',
    'review:owner', 'risk:R0', 'risk:R1', 'risk:R2', 'nits:swept', 'type:epic', 'type:story', 'type:bug', 'type:chore', 'type:task',
  ]);
});

test('repository and base metadata come from the Git remote and origin HEAD', () => {
  assert.equal(githubRepoFromRemote('https://github.com/acme/stage.git'), 'acme/stage');
  assert.equal(githubRepoFromRemote('git@github.com:acme/stage.git'), 'acme/stage');
  assert.throws(() => githubRepoFromRemote('https://example.com/acme/stage.git'), /GitHub/);
});

test('GitHub metadata cache is shared by a caller-supplied common git directory', t => {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-cache-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = workflowMetadataCachePath(directory);
  let calls = 0;
  const loader = () => { calls++; return { project: { number: 5, owner: 'acme-projects' }, defaultBranch: 479 }; };
  const options = { expectedFields: ['project', 'defaultBranch'] };
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', loader, { ...options, now: 1_000 }), { project: { number: 5, owner: 'acme-projects' }, defaultBranch: 479 });
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', loader, { ...options, now: 2_000 }), { project: { number: 5, owner: 'acme-projects' }, defaultBranch: 479 });
  assert.equal(calls, 1);
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', loader, { ...options, now: 2_000, refresh: true }), { project: { number: 5, owner: 'acme-projects' }, defaultBranch: 479 });
  assert.equal(calls, 2);
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', () => ({ defaultBranch: 480 }), { ...options, now: 3_000, refresh: true }), { project: { number: 5, owner: 'acme-projects' }, defaultBranch: 480 });
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', () => ({ defaultBranch: 481 }), { ...options, now: 100_000, ttlMs: 10 }), { defaultBranch: 481 });
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', () => ({ project: null }), { ...options, now: 100_001, ttlMs: 10 }), { project: null, defaultBranch: 481 });
  assert.deepEqual(readThroughLocalCache(path, 'acme/stage', () => ({ defaultBranch: 482 }), { ...options, now: 200_000, ttlMs: 10 }), { defaultBranch: 482 });
});

test('board discovery tells no board, one board and tied boards apart', () => {
  assert.equal(discoveredProject([]), false);
  assert.deepEqual(discoveredProject([{ number: 5, title: 'Pro', owner: 'acme', count: 3 }, { number: 6, title: 'Old', count: 1 }]), { number: 5, title: 'Pro', owner: 'acme' });
  assert.deepEqual(discoveredProject([{ number: 5, title: 'Pro', count: 2 }, { number: 6, title: 'Old', count: 2 }, { number: 7, title: 'X', count: 1 }]), { ambiguous: [5, 6] });
});

test('silent board status callers return false quietly for every unusable board state', t => {
  const logged = [];
  t.mock.method(console, 'log', (...args) => logged.push(args));
  t.mock.method(console, 'error', (...args) => logged.push(args));
  for (const project of [false, { ambiguous: [5, 6] }, null, undefined]) {
    assert.equal(boardStatus({ repo: 'acme/app', project }, 4, 'TODO', true), false);
    assert.equal(boardStatus({ repo: 'acme/app', project }, 4, 'NOPE', true), false);
  }
  assert.deepEqual(logged, []);
});

test('macOS inherited-lock check survives truncated lockf command paths', () => {
  assert.equal(hasLockfAncestor(['lockf -t 300 /Users/filip/Developer/github.com/FilipKrawiec/stagely-pro/.git/workflow-locks/issue-create.lock /opt/homebrew/bin/node']), true);
  assert.equal(hasLockfAncestor(['/bin/bash -lc node workflow.mjs issue create']), false);
});

test('a PR links an issue only by a closing reference in its repository or a Part of line', () => {
  const closes = (number, owner = 'acme') => ({ number, repository: { name: 'app', owner: { login: owner } } });
  const pr = (body, refs = []) => ({ number: 7, title: 'Fix', body, closingIssuesReferences: refs, headRefOid: 'head', labels: [], statusCheckRollup: [], reviews: [] });
  assert.deepEqual(prRecord(pr('Refs #8\nSee #9, and part of #10'), cfg).issues, [], 'a mention links nothing');
  assert.deepEqual(prRecord(pr('Closes #8', [closes(8), closes(11, 'other')]), cfg).issues, [8], 'only a closing link in this repository counts');
  assert.deepEqual(prLinkedIssues(pr('Summary\n  Part of #12\nPart of #13.'), 'Acme/App'), [12, 13]);
  assert.deepEqual(prLinkedIssues(pr('Stacked on #5.\n\nCloses #6'), 'acme/app'), [6], 'a stacked PR has no closing link, yet its body closes its issue');
});

test('a Reviewer approval applies only to the exact head and verdict', () => {
  const pr = { number: 7, title: 'Update', body: 'Issue #8', headRefOid: 'head', labels: [], statusCheckRollup: [], reviews: [
    { author: { login: 'reviewer' }, state: 'APPROVED', commit: { oid: 'old' }, body: '<!-- agent-review sha=old verdict=ready -->' },
  ] };
  const record = prRecord(pr, cfg);
  assert.equal(record.approved, false);
  assert.equal(record.awaitingReview, true);
});

test('a Reviewer thread reply after an approval keeps the approval, a change request does not', () => {
  const approval = { author: { login: 'reviewer' }, state: 'APPROVED', commit: { oid: 'head' }, body: '<!-- agent-review sha=head verdict=ready -->' };
  const reply = { author: { login: 'reviewer' }, state: 'COMMENTED', commit: { oid: 'head' }, body: '' };
  const fixes = { author: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', commit: { oid: 'head' }, body: '<!-- agent-review sha=head verdict=fixes -->' };
  const pr = reviews => ({ number: 7, title: 'Update', body: 'Issue #8', headRefOid: 'head', labels: [], statusCheckRollup: [], reviews });
  assert.equal(reviewerApproved(pr([approval, reply]), cfg), true);
  assert.equal(reviewerApproved(pr([approval, { ...reply, body: 'Fixed as agent-review asked.' }]), cfg), true);
  assert.equal(prRecord(pr([approval, reply]), cfg).approved, true);
  assert.equal(reviewerApproved(pr([approval, fixes]), cfg), false);
  assert.equal(reviewerApproved(pr([approval, { ...fixes, body: '' }]), cfg), false);
  assert.equal(prRecord(pr([approval, reply, fixes]), cfg).approved, false);
});

test('push roles require owner, implementer and reviewer to be distinct', () => {
  assert.doesNotThrow(() => assertDistinctPushRoles({ owner: 'owner', implementer: 'builder', reviewer: 'reviewer' }));
  assert.throws(() => assertDistinctPushRoles({ owner: 'reviewer', implementer: 'builder', reviewer: 'Reviewer' }), /distinct/);
});

test('GitHub scope failures are reported without exposing API diagnostics', () => {
  const error = "gh: Your token has not been granted the required scopes to execute this query. The 'id' field requires one of the following scopes: ['read:project'], but your token has only been granted the: ['gist', 'read:org', 'repo', 'workflow']. Authorization: secret";
  assert.equal(githubScopeFailure(error), 'GitHub token is missing required scope(s): read:project; current token has: gist, read:org, repo, workflow.');
  const writeError = "gh: The 'updateProjectV2ItemFieldValue' field requires one of the following scopes: ['project'], but your token has only been granted the: ['read:project', 'repo']. Authorization: secret";
  assert.equal(githubScopeFailure(writeError), 'GitHub token is missing required scope(s): project; current token has: read:project, repo.');
  assert.equal(githubScopeFailure('error: your authentication token is missing required scopes [read:project]'), 'GitHub token is missing required scope(s): read:project.');
  assert.equal(githubScopeFailure('gh: API rate limit exceeded'), null);
  assert.equal(missingProjectScope(new Error(githubScopeFailure(error))), true);
  assert.equal(missingProjectScope(new Error(githubScopeFailure(writeError))), true);
  assert.equal(missingProjectScope(new Error('GitHub token is missing required scope(s): repo; current token has: gist.')), false);
});

test('issue comment bodies are bounded, non-empty text', () => {
  assert.equal(validateIssueCommentBody('Final report'), 'Final report');
  assert.throws(() => validateIssueCommentBody(' \n '), /1–60000 characters/);
  assert.throws(() => validateIssueCommentBody('x'.repeat(60_001)), /1–60000 characters/);
});

test('issue comment body files stay inside the worktree, including canonical symlink targets', t => {
  const root = mkdtempSync(join(tmpdir(), 'workflow-comment-root-'));
  const outside = mkdtempSync(join(tmpdir(), 'workflow-comment-outside-'));
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
  const insideFile = join(root, 'comment.md');
  const outsideFile = join(outside, 'secret.txt');
  writeFileSync(insideFile, 'Public report');
  writeFileSync(outsideFile, 'private secret');
  mkdirSync(join(root, 'folder'));
  symlinkSync(outsideFile, join(root, 'escape.md'));
  linkSync(outsideFile, join(root, 'hardlink.md'));
  assert.equal(workspaceFilePath(root, insideFile), realpathSync(insideFile));
  assert.throws(() => workspaceFilePath(root, outsideFile), /inside the current worktree/);
  assert.throws(() => workspaceFilePath(root, join(root, 'escape.md')), /inside the current worktree/);
  assert.throws(() => workspaceFilePath(root, join(root, 'hardlink.md')), /multiple hard links/);
  assert.throws(() => workspaceFilePath(root, join(root, 'folder')), /regular file/);
});

test('push accepts HTTPS or SSH GitHub remotes', () => {
  assert.equal(githubPushRemoteMatches('https://github.com/Acme/App.git', 'acme/app'), true);
  assert.equal(githubPushRemoteMatches('git@github.com:acme/app.git', 'acme/app'), true);
  assert.equal(githubPushRemoteMatches('git@github.com:acme/other.git', 'acme/app'), false);
  assert.equal(githubPushRemoteMatches('https://example.com/acme/app.git', 'acme/app'), false);
});

test('a relative CLI invocation re-executes by absolute path so lock owners match', () => {
  assert.equal(needsAbsoluteInvocation('plugins/common/workflow/scripts/workflow.mjs', '/r/plugins/common/workflow/scripts/workflow.mjs'), true);
  assert.equal(needsAbsoluteInvocation('/r/plugins/common/workflow/scripts/workflow.mjs', '/r/plugins/common/workflow/scripts/workflow.mjs'), false);
});

test('issue writes reach only the configured repository or the workflow tooling repository', () => {
  const cfg = { repo: 'acme/app', toolingRepository: 'https://github.com/acme/skills.git' };
  assert.equal(issueTargetRepo(cfg, undefined), 'acme/app');
  assert.equal(issueTargetRepo(cfg, 'acme/app'), 'acme/app');
  assert.equal(issueTargetRepo(cfg, 'acme/skills'), 'acme/skills');
  assert.throws(() => issueTargetRepo(cfg, 'other/repo'), /only acme\/app or the workflow tooling repository acme\/skills/);
});

test('scope overlaps match equal paths and directories, skipping issues without a packet', () => {
  const packet = paths => `\u0060\u0060\u0060scope\n${JSON.stringify({ paths })}\n\u0060\u0060\u0060`;
  const issues = [
    { number: 1, title: 'same file', body: packet(['plugins/a/workflow.mjs']) },
    { number: 2, title: 'parent dir', body: packet(['scripts/tests/']) },
    { number: 3, title: 'no packet', body: 'Edits scripts/tests/x.mjs' },
    { number: 4, title: 'sibling', body: packet(['scripts/testsuite.mjs', 'docs']) },
  ];
  assert.deepEqual(scopeOverlaps(issues, ['plugins/a/workflow.mjs', 'scripts/tests/x.test.mjs', 'docs/a.md']).map(issue => issue.number), [1, 2, 4]);
  assert.deepEqual(scopeOverlaps(issues, ['plugins/a/']).map(issue => issue.number), [1]);
  assert.deepEqual(scopeOverlaps(issues, ['scripts/']).map(issue => issue.number), [2, 4]);
  assert.deepEqual(scopeOverlaps(issues, null), []);
});

test('a unique issue title resolves to the oldest open exact match', () => {
  const issues = [{ number: 9, title: 'Owner improvements' }, { number: 4, title: 'Owner improvements' }, { number: 2, title: 'Owner improvements (old)' }];
  assert.equal(oldestExactTitle(issues, 'Owner improvements'), 4);
  assert.equal(oldestExactTitle(issues, 'Missing'), null);
});

test('issue writes never carry private repository evidence into a public one', () => {
  assert.throws(() => assertIssueVisibility({ name: 'acme/app', private: true }, { name: 'acme/skills', private: false }), /acme\/skills is public and acme\/app is private; file in acme\/app/);
  assert.doesNotThrow(() => assertIssueVisibility({ name: 'acme/app', private: false }, { name: 'acme/skills', private: false }));
  assert.doesNotThrow(() => assertIssueVisibility({ name: 'acme/app', private: true }, { name: 'acme/skills', private: true }));
});
