import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectRunnerSession, collectSession, githubApi, locateTranscript, parseSessionLogs, redact, sessionLogEntries, survivingSecret } from '../../plugins/common/workflow/scripts/lib/session-log.mjs';
import { statusCommand } from '../../plugins/common/workflow/scripts/lib/state.mjs';

const ghToken = `ghp_${'a1B2c3D4e5F6g7H8i9J0'}`;
const line = (text, timestamp) => JSON.stringify({ timestamp, message: { id: `m${timestamp}`, model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 1 }, content: text } });
const transcript = text => [line(text, '2026-11-19T10:00:00.000Z'), line('done', '2026-11-19T10:12:03.000Z')].join('\n');
const store = files => ({ files: () => Object.keys(files), read: path => files[path] });

// A fake GitHub: PR comments and gists held in memory.
function fakeGithub(initial = []) {
  const state = { comments: [...initial], gists: {}, calls: [] };
  return {
    state,
    comments: () => state.comments,
    postComment: body => { state.calls.push('comment'); state.comments.push({ id: state.comments.length + 1, user: { login: 'bot' }, body }); },
    patchComment: (id, body) => { state.calls.push('patch'); state.comments.find(c => c.id === id).body = body; },
    createGist: (name, content) => { state.calls.push('gist'); state.gists.g1 = { [name]: content }; return { id: 'g1', html_url: 'https://gist.github.com/bot/g1' }; },
    addGistFile: (id, name, content) => { state.calls.push('gist-file'); state.gists[id][name] = content; return { id, html_url: 'https://gist.github.com/bot/g1' }; },
    gistFiles: id => Object.keys(state.gists[id] || {}),
  };
}
const logs = () => mkdtempSync(join(tmpdir(), 'session-log-'));
const session = { id: 'sess-1', role: 'implementer', status: 'done', usage: 'in=1 out=2 model=sonnet effort=medium' };
const collect = (github, files, extra = {}) => collectSession({ repo: 'o/r', pr: 7, author: 'bot', session, github, store: store(files), logDirectory: logs(), env: {}, ...extra });

test('the transcript is found by the session id in its file name, else by the id inside it', () => {
  assert.equal(locateTranscript('abc', store({ '/p/other.jsonl': 'x', '/p/abc.jsonl': 'y' })), '/p/abc.jsonl');
  assert.equal(locateTranscript('abc', store({ '/p/a.jsonl': 'Session: abc', '/p/b.jsonl': 'nothing' })), '/p/a.jsonl');
  assert.equal(locateTranscript('abc', store({ '/p/b.jsonl': 'nothing' })), null);
  assert.equal(locateTranscript('', store({ '/p/b.jsonl': 'nothing' })), null);
});

test('redaction replaces tokens, keys, Authorization values, private keys and secret environment values', () => {
  const env = { MY_API_TOKEN: 'supersecretvalue1', HOME: '/home/x', SHORT_KEY: 'abc' };
  const input = [
    `token ${ghToken} and github_pat_${'x'.repeat(30)}`, `key sk-ant-api03-${'k'.repeat(20)} and AKIA${'A'.repeat(16)}`,
    '{"cmd":"curl -H \\"Authorization: Bearer abcdef123456\\" https://x"}', 'Authorization: token zzz999yyy', 'Bearer abcdefgh12345678',
    '-----BEGIN RSA PRIVATE KEY-----\\nMIIB\\n-----END RSA PRIVATE KEY-----', 'value supersecretvalue1 here', 'export DB_PASSWORD=hunter2hunter2', 'path /home/x',
  ].join('\n');
  const out = redact(input, env);
  for (const secret of [ghToken, 'github_pat_xxx', 'sk-ant-api03', 'AKIAAAAA', 'abcdef123456', 'zzz999yyy', 'MIIB', 'supersecretvalue1', 'hunter2hunter2']) assert.ok(!out.includes(secret), secret);
  assert.match(out, /Authorization: token \[REDACTED\]/);
  assert.match(out, /DB_PASSWORD=\[REDACTED\]/);
  assert.ok(out.includes('/home/x'));
  assert.equal(survivingSecret(out, env), null);
});

test('a token right after an escaped newline, tab or unicode escape in a JSONL line is redacted', () => {
  const lines = [
    JSON.stringify({ c: `user: bot\n${ghToken}` }), JSON.stringify({ c: `key\tsk-ant-api03-${'k'.repeat(20)}` }),
    JSON.stringify({ c: `pat\r\ngithub_pat_${'x'.repeat(30)}` }), JSON.stringify({ c: `"Bearer\nabcdefgh12345678` }), `{"c":"\\u0027${ghToken}"}`,
  ];
  for (const raw of lines) {
    assert.ok(survivingSecret(raw, {}), `detected in ${raw}`);
    const out = redact(raw, {});
    assert.equal(survivingSecret(out, {}), null, out);
    for (const secret of [ghToken, 'sk-ant-api03', 'github_pat_xxx', 'abcdefgh12345678']) assert.ok(!out.includes(secret), out);
  }
  // A word that merely contains a token prefix is left alone.
  assert.equal(redact(`task-${'a'.repeat(24)}`, {}), `task-${'a'.repeat(24)}`);
});

test('a runner-started orchestrator is collected from the transcript named by its session id', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const github = fakeGithub();
  const result = collectRunnerSession({ repo: 'o/r', number: 5, findPr: n => ({ number: n + 4 }), author: 'bot', outcome: 'done', github, store: store({ [`/p/${id}.jsonl`]: transcript('ok'), '/p/other.jsonl': 'x' }), logDirectory: logs(), env: { WORKFLOW_DRIVE_SESSION: id } });
  assert.deepEqual(result, { collected: `orchestrator-1-${id}.jsonl` });
  assert.match(github.state.comments[0].body, /\| orchestrator \| claude-sonnet-5-5 \|.*\| done \|/);
  assert.equal(collectRunnerSession({ repo: 'o/r', number: 5, findPr: () => null, github, store: store({}), env: {} }), null);
});

test('a surviving secret refuses the upload, logs it, and comments the session as missing once', () => {
  const github = fakeGithub();
  const directory = logs();
  const files = { '/p/sess-1.jsonl': transcript(`leak ${ghToken}`) };
  const result = collect(github, files, { redactor: text => text, logDirectory: directory });
  assert.match(result.failed, /upload refused/);
  assert.deepEqual(github.state.calls, ['comment']);
  assert.equal(Object.keys(github.state.gists).length, 0);
  assert.match(readFileSync(join(directory, 'session-log.log'), 'utf8'), /#7 implementer sess-1: upload refused/);
  // A rerun that fails again does not comment twice.
  collectSession({ repo: 'o/r', pr: 7, author: 'bot', session, github, store: store(files), logDirectory: directory, env: {}, redactor: text => text });
  assert.deepEqual(github.state.calls, ['comment']);
});

test('one gist per PR and one comment per session, linking the file with role, model, duration, usage and outcome', () => {
  const github = fakeGithub();
  const files = { '/p/sess-1.jsonl': transcript(`secret ${ghToken}`), '/p/sess-2.jsonl': transcript('ok') };
  assert.deepEqual(collect(github, files), { collected: 'implementer-1-sess-1.jsonl' });
  assert.deepEqual(collectSession({ repo: 'o/r', pr: 7, author: 'bot', session: { id: 'sess-2', role: 'reviewer', outcome: 'verdict: approve' }, github, store: store(files), logDirectory: logs(), env: {} }), { collected: 'reviewer-2-sess-2.jsonl' });
  assert.deepEqual(Object.keys(github.state.gists.g1), ['implementer-1-sess-1.jsonl', 'reviewer-2-sess-2.jsonl']);
  assert.ok(!github.state.gists.g1['implementer-1-sess-1.jsonl'].includes(ghToken));
  assert.equal(github.state.comments.length, 2);
  const [first] = github.state.comments;
  assert.match(first.body, /\| implementer \| sonnet \| medium \| 12m 03s \| 1 in \/ 2 out/);
  assert.match(first.body, /\| done \|/);
  assert.match(first.body, /https:\/\/gist\.github\.com\/bot\/g1#file-implementer-1-sess-1-jsonl/);
  assert.deepEqual(github.state.calls, ['gist', 'comment', 'gist-file', 'comment']);
});

test('a rerun of drive never uploads or posts the same session twice', () => {
  const github = fakeGithub();
  const files = { '/p/sess-1.jsonl': transcript('ok') };
  collect(github, files);
  assert.deepEqual(collect(github, files), { skipped: 'collected' });
  assert.deepEqual(github.state.calls, ['gist', 'comment']);
});

test('a session first reported missing is completed in place when its transcript appears later', () => {
  const github = fakeGithub();
  assert.match(collect(github, {}).failed, /no transcript/);
  assert.deepEqual(collect(github, { '/p/sess-1.jsonl': transcript('ok') }), { collected: 'implementer-1-sess-1.jsonl' });
  assert.deepEqual(github.state.calls, ['comment', 'gist', 'patch']);
  assert.equal(github.state.comments.length, 1);
  assert.match(github.state.comments[0].body, /Redacted transcript/);
});

test('a GitHub or store failure never throws: it is logged and the delivery goes on', () => {
  const directory = logs();
  const broken = { ...fakeGithub(), comments: () => { throw new Error('GitHub command failed'); } };
  assert.deepEqual(collect(broken, {}, { logDirectory: directory }), { failed: 'GitHub command failed' });
  assert.match(readFileSync(join(directory, 'session-log.log'), 'utf8'), /GitHub command failed/);
  const upload = { ...fakeGithub(), createGist: () => { throw new Error('gist refused'); } };
  assert.match(collect(upload, { '/p/sess-1.jsonl': transcript('ok') }, { logDirectory: directory }).failed, /gist refused/);
  assert.ok(existsSync(join(directory, 'session-log.log')));
});

test('status totals usage by role and model from the per-session records', () => {
  const github = fakeGithub();
  collect(github, { '/p/sess-1.jsonl': transcript('ok') });
  const comments = github.state.comments.map(comment => ({ ...comment, user: { login: 'bot' } }));
  assert.equal(parseSessionLogs(comments, 'bot').length, 1);
  assert.equal(parseSessionLogs(comments, 'someone-else').length, 0);
  assert.equal(sessionLogEntries(comments, 'bot')[0].key, 'session-sess-1');
  const read = args => {
    const path = args.at(-1);
    if (path.endsWith('/issues/7')) return { pull_request: {}, number: 7 };
    if (path.includes('/issues/7/comments')) return [comments];
    return [];
  };
  const lines = [];
  const log = console.log; console.log = text => lines.push(text);
  try { statusCommand(['7'], { repo: 'o/r', implementer: 'bot', reviewer: 'rev' }, read, () => ({ number: 7, state: 'OPEN', isDraft: true, labels: [], headRefOid: 'a'.repeat(40), reviews: [], statusCheckRollup: [], commits: [], closingIssuesReferences: [] })); } catch { /* the PR facts are faked thinly */ } finally { console.log = log; }
  const usage = lines.length ? JSON.parse(lines[0]).usage : null;
  assert.ok(Array.isArray(usage), 'status prints usage rows');
  assert.equal(usage[0].role, 'implementer');
  assert.equal(usage[0].input, 1);
});

test('the gh adapter reads comments and writes a secret gist through the bot, never public', () => {
  const calls = [];
  const api = (args, input) => { calls.push({ args, input }); return args.includes('--slurp') ? [[{ id: 1 }]] : { id: 'g' }; };
  const github = githubApi('o/r', 7, api);
  assert.deepEqual(github.comments(), [{ id: 1 }]);
  github.createGist('f.jsonl', 'content');
  const body = JSON.parse(calls.at(-1).input);
  assert.equal(body.public, false);
  assert.deepEqual(calls.at(-1).args.slice(0, 4), ['api', '--method', 'POST', 'gists']);
});
