import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync, rmSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeownersRolesFrom } from '../../plugins/common/workflow/scripts/workflow.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const cli = join(root, 'plugins/common/workflow/scripts/workflow.mjs');
const configPath = '.agents/config.json';
const json = value => JSON.stringify(value);
const config = values => ({
  version: 1,
  identities: Object.fromEntries(['implementer', 'reviewer'].filter(key => values[key] !== undefined).map(key => [key, values[key]])),
});

test('CODEOWNERS roles reject an organization slug when several path owners exist', () => {
  assert.throws(() => codeownersRolesFrom('* @reviewer\n/*.rules @alice\n/*.json @bob\n', 'acme/app'), /identify one Owner account/);
  assert.deepEqual(codeownersRolesFrom('* @reviewer\n/*.rules @alice\n', 'acme/app'), { owner: 'alice', defaultReviewer: 'reviewer' });
  assert.throws(() => codeownersRolesFrom('* @reviewer\n', 'acme/app'), /identify one Owner account/);
  assert.throws(() => codeownersRolesFrom('* @reviewer @other\n/*.rules @alice\n', 'acme/app'), /exactly one user/);
});

const fakeGh = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const out = value => process.stdout.write(JSON.stringify(value) + '\\n');
if (args[0] === 'auth' && args[1] === 'token') {
  if (process.env.FAIL_GH_NETWORK) { process.stderr.write('error connecting to github.com SECRET_TOKEN'); process.exit(1); }
  if (process.env.GH_TOKEN || process.env.GH_HOST) process.exit(1);
  if (process.env.AUTH_USERS_FILE) fs.appendFileSync(process.env.AUTH_USERS_FILE, (args.includes('--user') ? args[args.indexOf('--user') + 1] : 'ACTIVE') + '\\n');
  process.stdout.write('SECRET_TOKEN\\n');
} else if (args[0] === 'api' && args[1] === 'graphql') {
  if (args.some(arg => arg.includes('ref(qualifiedName:'))) {
    if (process.env.GH_TOKEN !== 'SECRET_TOKEN') process.exit(1);
    if (process.env.HOOK_TO_REPLACE) fs.writeFileSync(process.env.HOOK_TO_REPLACE, '#!/bin/sh\\nprintf replaced > "$HOOK_RECORD"\\n');
    const oid = process.env.REMOTE_BRANCH_SHA;
    out(process.env.BRANCH_QUERY_ERROR ? { errors: [{ message: 'missing access' }], data: { repository: { ref: null } } } : { data: { repository: { ref: oid ? { target: { oid } } : null } } });
  } else out({ data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [{ isResolved: false, isOutdated: false }] } } } } });
} else if (args[0] === 'api') {
  if (process.env.GH_TOKEN !== 'SECRET_TOKEN') process.exit(1);
  if (args.includes('user') && process.env.RACE_URL_TARGET) require('node:child_process').spawnSync(process.env.REAL_GIT, ['config', 'url.' + process.env.RACE_URL_TARGET + '.insteadOf', process.env.TEST_NATIVE_REMOTE], { cwd: process.cwd() });
  if (args.some(arg => arg.includes('collaborators/') && arg.includes('/permission'))) out({ role_name: 'admin' });
  else if (args.includes('repos/acme/app')) out({ default_branch: 'main', owner: { type: process.env.FAKE_OWNER_KIND || 'Organization', login: 'acme' } });
  else if (args.includes('repos/acme/app/branches/main')) out({ commit: { sha: process.env.REMOTE_BASE_SHA } });
  else if (args.some(arg => arg.startsWith('repos/acme/app/issues/') && /^\\d+$/.test(arg.split('/').at(-1))) && args.includes('state=open')) { fs.writeFileSync(process.env.ISSUE_STATE_RECORD, JSON.stringify(args)); out({ state: 'open' }); }
  else {
    const actor = process.env.FAKE_ACTOR || 'builder';
    process.stdout.write(args.includes('--jq') ? actor + '\\n' : JSON.stringify({ login: actor, id: 4242 }) + '\\n');
  }
} else if (args[0] === 'pr' && args[1] === 'view') {
  out({ url: 'https://github.com/acme/app/pull/1', baseRefOid: process.env.BASE_SHA, headRefOid: process.env.HEAD_SHA, files: [], reviews: [], reviewDecision: 'REVIEW_REQUIRED', statusCheckRollup: [] });
} else if (args[0] === 'pr' && args[1] === 'list') out(process.env.AUTO_MERGE ? [{ number: 4, autoMergeRequest: { enabledAt: 'now' } }] : JSON.parse(process.env.OPEN_PRS || '[]').filter(pr => pr.headRefName === args[args.indexOf('--head') + 1]));
else if (args[0] === 'issue' && args[1] === 'view') out({ url: 'https://github.com/acme/app/issues/1', body: 'Acceptance', comments: [{ url: 'https://example.test/1', body: 'Decision: reuse prior policy' }] });
else process.exit(1);
`;

const fakeGit = `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const real = process.env.REAL_GIT;
if (args[0] === 'fetch') process.exit(0);
if (args.includes('commit') && process.env.TEST_CONCURRENT_STAGE) spawnSync(real, ['add', 'unrelated.txt'], { stdio: 'inherit' });
if (!args.includes('push')) {
  const result = spawnSync(real, args, { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
if (process.env.TEST_PUSH_FAILURE) { process.stderr.write(process.env.FAKE_PUSH_STDERR || 'SECRET_TOKEN'); process.exit(1); }
if (process.env.TEST_NATIVE_REMOTE || process.env.TEST_PUSH_URL) {
  const replacement = process.env.TEST_NATIVE_REMOTE || process.env.TEST_PUSH_URL;
  const result = spawnSync(real, args.map(arg => arg.startsWith('https://github.com/') ? replacement : arg), { encoding: 'utf8' });
  fs.writeFileSync(process.env.PUSH_RECORD, JSON.stringify({ git_status: result.status }));
  process.stderr.write(result.stderr || '');
  process.exit(result.status ?? 1);
}
const credential = spawnSync(real, ['-c', 'credential.helper=', 'credential', 'fill'], { input: 'protocol=https\\nhost=github.com\\n\\n', encoding: 'utf8' });
const secret = credential.stdout.split('\\n').find(line => line.startsWith('password='))?.slice('password='.length);
fs.writeFileSync(process.env.PUSH_RECORD, JSON.stringify({ args, secret, environment_has_token: Object.hasOwn(process.env, 'WORKFLOW_PUSH_TOKEN') }));
process.stdout.write('remote says SECRET_TOKEN\\n');
`;

function run(program, args, options = {}) {
  return spawnSync(program, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...options });
}
function runCliAsync(f, ...args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: f.repo, env: f.env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let stdout = ''; let stderr = ''; let timedOut = false;
    child.stdout.setEncoding('utf8').on('data', value => { stdout += value; });
    child.stderr.setEncoding('utf8').on('data', value => { stderr += value; });
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }, 15000);
    child.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr, timedOut }); });
  });
}
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, 'bin'); mkdirSync(bin);
  const home = join(directory, 'home');
  mkdirSync(join(home, '.config', 'gh-agents'), { recursive: true });
  writeFileSync(join(home, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: {} }));
  const main = join(directory, 'repo'); mkdirSync(join(main, '.agents'), { recursive: true }); mkdirSync(join(main, '.github'), { recursive: true });
  const linked = join(directory, 'linked');
  const realGit = run('which', ['git']).stdout.trim();
  const initialConfig = config({ repo: 'acme/app', implementer: 'builder', reviewer: 'reviewer', owner: 'owner' });
  writeFileSync(join(main, configPath), json(initialConfig));
  writeFileSync(join(main, '.github', 'CODEOWNERS'), '* @reviewer\n/*.rules @owner\n');
  const git = (...args) => run(realGit, args, { cwd: main });
  assert.equal(run(realGit, ['init', '-q', '-b', 'main', main]).status, 0);
  assert.equal(git('remote', 'add', 'origin', 'https://github.com/acme/app.git').status, 0);
  assert.equal(git('add', configPath, '.github/CODEOWNERS').status, 0);
  assert.equal(git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'initial').status, 0);
  assert.equal(git('update-ref', 'refs/remotes/origin/main', 'HEAD').status, 0);
  assert.equal(git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main').status, 0);
  assert.equal(git('worktree', 'add', '-q', '-b', 'feature/test', linked, 'HEAD').status, 0);
  const writeFake = (name, content) => { const path = join(bin, name); writeFileSync(path, content); chmodSync(path, 0o755); };
  writeFake('gh', fakeGh); writeFake('git', fakeGit);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    HOME: home,
    REAL_GIT: realGit,
    PUSH_RECORD: join(directory, 'push.json'),
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  delete env.WORKFLOW_RUN_ID; delete env.WORKFLOW_ISSUE_NUMBER;
  env.REMOTE_BASE_SHA = git('rev-parse', 'HEAD').stdout.trim();
  const cliRun = (...args) => run(process.execPath, [cli, ...args], { cwd: linked, env });
  const linkedGit = (...args) => run(realGit, args, { cwd: linked });
  return { root: directory, main, repo: linked, env, git, linkedGit, cliRun };
}
function commitFixture(f, repo = f.repo) {
  assert.equal(run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'fixture'], { cwd: repo }).status, 0);
  assert.equal(run(f.env.REAL_GIT, ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: repo }).status, 0);
}
function changeConfig(f, values, target = f.repo) {
  writeFileSync(join(target, configPath), json(config(values)));
  assert.equal(run(f.env.REAL_GIT, ['add', configPath], { cwd: target }).status, 0);
  commitFixture(f, target);
}
function pushRecord(f) { return JSON.parse(readFileSync(f.env.PUSH_RECORD, 'utf8')); }
function nativeRemote(f) {
  const remote = join(f.root, 'remote.git');
  assert.equal(run(f.env.REAL_GIT, ['init', '--bare', '-q', remote]).status, 0);
  f.env.TEST_NATIVE_REMOTE = remote;
  return remote;
}
function hookPath(f) {
  const result = run(f.env.REAL_GIT, ['rev-parse', '--git-path', 'hooks/pre-push'], { cwd: f.repo });
  return result.stdout.trim().startsWith('/') ? result.stdout.trim() : join(f.repo, result.stdout.trim());
}
function assertNoPush(f) { assert.equal(existsSync(f.env.PUSH_RECORD), false); }

test('push ignores repository URL rewrites added after validation', t => {
  const f = fixture(t);
  const good = nativeRemote(f);
  const evil = join(f.root, 'other.git');
  assert.equal(run(f.env.REAL_GIT, ['init', '--bare', '-q', evil]).status, 0);
  f.env.RACE_URL_TARGET = evil;
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(run(f.env.REAL_GIT, ['--git-dir', good, 'rev-parse', '--verify', 'refs/heads/feature/test']).status, 0);
  assert.notEqual(run(f.env.REAL_GIT, ['--git-dir', evil, 'rev-parse', '--verify', 'refs/heads/feature/test']).status, 0);
});

test('push reads workflow config from the base branch', t => {
  const f = fixture(t);
  const value = { ...config({ repo: 'acme/app', implementer: 'builder', reviewer: 'reviewer', owner: 'owner' }), afk: { maxRuns: 2 } };
  writeFileSync(join(f.repo, configPath), json(value));
  assert.equal(run(f.env.REAL_GIT, ['add', configPath], { cwd: f.repo }).status, 0);
  commitFixture(f);
  f.env.REMOTE_BASE_SHA = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr);
});

test('commit and push refuse the main checkout', t => {
  const f = fixture(t);
  writeFileSync(join(f.main, 'assigned.txt'), 'assigned');
  for (const args of [['commit', '--message', 'fix: guard checkout', '--', 'assigned.txt'], ['push']]) {
    const result = run(process.execPath, [cli, ...args], { cwd: f.main, env: f.env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /linked worktree/);
  }
  assertNoPush(f);
});

test('commit includes only assigned paths', t => {
  const f = fixture(t);
  run(f.env.REAL_GIT, ['config', 'user.name', 'Test'], { cwd: f.repo });
  run(f.env.REAL_GIT, ['config', 'user.email', 'test@example.test'], { cwd: f.repo });
  writeFileSync(join(f.repo, 'assigned.txt'), 'assigned');
  writeFileSync(join(f.repo, 'unrelated.txt'), 'unrelated');
  const result = f.cliRun('commit', '--message', 'fix: protect actor', '--', 'assigned.txt');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.linkedGit('show', '--format=', '--name-only', 'HEAD').stdout.trim().split('\\n'), ['assigned.txt']);
  assert.equal(existsSync(join(f.repo, 'unrelated.txt')), true);
  assert.equal(f.linkedGit('show', '-s', '--format=%an <%ae>|%cn <%ce>', 'HEAD').stdout.trim(), 'builder <4242+builder@users.noreply.github.com>|builder <4242+builder@users.noreply.github.com>');
  assert.equal(JSON.parse(result.stdout).result, 'committed');
});

test('push reports GitHub network failure without exposing diagnostics', t => {
  const f = fixture(t);
  f.env.FAIL_GH_NETWORK = '1';
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Cannot reach GitHub; check network or sandbox access and retry/);
  assert.doesNotMatch(result.stderr, /SECRET_TOKEN/);
  assertNoPush(f);
});

test('AFK watcher binds its held issue to the launched agent', t => {
  if (spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { stdio: 'ignore' }).status !== 0) { t.skip('watcher lock ownership requires process inspection'); return; }
  const f = fixture(t);
  const child = join(f.root, 'agent.mjs');
  writeFileSync(child, `import { spawnSync } from 'node:child_process';\nimport { writeFileSync } from 'node:fs';\nwriteFileSync('outside.txt', 'outside');\nconst r = spawnSync(process.execPath, [process.env.TEST_CLI, 'commit', '--message', 'fix: outside', '--', 'outside.txt'], { encoding: 'utf8' });\nwriteFileSync(process.env.TEST_RESULT, JSON.stringify({status:r.status, stderr:r.stderr, run:process.env.WORKFLOW_RUN_ID, issue:process.env.WORKFLOW_ISSUE_NUMBER}));\n`);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node\nconst a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));\nif(a[0]==='auth') { console.log('SECRET_TOKEN'); process.exit(0); }\nif(a[0]==='pr' || a[0]==='issue') { out([]); process.exit(0); }\nif(a.includes('rate_limit')) { console.log('5000 2000000000'); process.exit(0); }\nif(a.includes('graphql')) { const row=(number,labels,parent,body='')=>({number,title:'item',body,lastEditedAt:'2020-01-01T00:00:00Z',labels:{nodes:labels.map(name=>({name}))},blockedBy:{nodes:[]},milestone:null,parent,projectItems:{nodes:[]}}); out({data:{repository:{issues:{pageInfo:{hasNextPage:false},nodes:[row(1,['type:epic'],null),row(1082,['lane:afk'],{number:1,parent:null},'\\u0060\\u0060\\u0060scope\\n{\\"paths\\":[\\"docs/\\"]}\\n\\u0060\\u0060\\u0060')]}}}}); process.exit(0); }\nif(a.some(x=>x.includes('/comments')) && a.includes('--slurp')) { out([[]]); process.exit(0); }\nif(a.some(x=>x.includes('/comments'))) { out({id:12}); process.exit(0); }\nif(a.includes('user')) { out({login:'builder'}); process.exit(0); }\nif(a.includes('repos/acme/app')) { out({permissions:{}}); process.exit(0); }\nconsole.log('event');\n`);
  chmodSync(gh, 0o755);
  const cfg = { ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] }, afk: { startCommand: [process.execPath, child, '{runId}', '{prompt}'] } };
  writeFileSync(join(f.repo, configPath), json(cfg));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  f.env.TEST_CLI = cli;
  f.env.TEST_RESULT = join(f.root, 'agent-result.json');
  const watch = f.cliRun('afk', 'watch', '--issue', '1082');
  assert.equal(watch.status, 0, `${watch.stdout}\n${watch.stderr}`);
  const result = JSON.parse(readFileSync(f.env.TEST_RESULT, 'utf8'));
  assert.match(result.run, /^afk-/);
  assert.equal(result.issue, '1082');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /assigned AFK scope/);
});

test('AFK watcher records the run usage on the released hold', t => {
  if (spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { stdio: 'ignore' }).status !== 0) { t.skip('watcher lock ownership requires process inspection'); return; }
  const f = fixture(t);
  const child = join(f.root, 'agent.mjs');
  writeFileSync(child, `console.log(JSON.stringify({type:'result',result:'Summary: done',total_cost_usd:0.5,num_turns:7,duration_ms:120000,usage:{input_tokens:10,output_tokens:20,cache_read_input_tokens:30,cache_creation_input_tokens:40}}));\n`);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node\nconst a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));\nif(a.includes('PATCH')) require('fs').appendFileSync(process.env.TEST_PATCHES, a.join(' ')+'\\n');\nif(a[0]==='auth') { console.log('SECRET_TOKEN'); process.exit(0); }\nif(a[0]==='pr' || a[0]==='issue') { out([]); process.exit(0); }\nif(a.includes('rate_limit')) { console.log('5000 2000000000'); process.exit(0); }\nif(a.includes('graphql')) { const row=(number,labels,parent,body='')=>({number,title:'item',body,lastEditedAt:'2020-01-01T00:00:00Z',labels:{nodes:labels.map(name=>({name}))},blockedBy:{nodes:[]},milestone:null,parent,projectItems:{nodes:[]}}); out({data:{repository:{issues:{pageInfo:{hasNextPage:false},nodes:[row(1,['type:epic'],null),row(1082,['lane:afk'],{number:1,parent:null},'\\u0060\\u0060\\u0060scope\\n{\\"paths\\":[\\"docs/\\"]}\\n\\u0060\\u0060\\u0060')]}}}}); process.exit(0); }\nif(a.some(x=>x.includes('/comments')) && a.includes('--slurp')) { out([[]]); process.exit(0); }\nif(a.some(x=>x.includes('/comments'))) { out({id:12}); process.exit(0); }\nif(a.includes('user')) { out({login:'builder'}); process.exit(0); }\nif(a.includes('repos/acme/app')) { out({permissions:{}}); process.exit(0); }\nconsole.log('event');\n`);
  chmodSync(gh, 0o755);
  const cfg = { ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] }, afk: { startCommand: [process.execPath, child, '{runId}', '{prompt}'] } };
  writeFileSync(join(f.repo, configPath), json(cfg));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  f.env.TEST_PATCHES = join(f.root, 'patches.log');
  const watch = f.cliRun('afk', 'watch', '--issue', '1082');
  assert.equal(watch.status, 0, `${watch.stdout}\n${watch.stderr}`);
  assert.match(watch.stdout, /Summary: done\nUsage: \$0\.50, 7 turns, 2 min/);
  assert.match(readFileSync(f.env.TEST_PATCHES, 'utf8'), /issues\/comments\/12 -f body=<!-- afk-issue-released session=afk-\S+ -->\nUsage: \$0\.50, 7 turns, 2 min, tokens in 10, out 20, cache read 30, cache write 40/);
});

async function supervisedRun(t, state, lane, selectLane = 'lane:afk') {
  if (spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { stdio: 'ignore' }).status !== 0) { t.skip('watcher lock ownership requires process inspection'); return; }
  const f = fixture(t);
  const child = join(f.root, 'agent.mjs');
  writeFileSync(child, `import { spawnSync } from 'node:child_process';\nimport { existsSync, writeFileSync } from 'node:fs';\nconst begun = Date.now(), wait = () => existsSync(process.env.TEST_GO) || Date.now() - begun > 30000 ? finish() : setTimeout(wait, 50);\nconst finish = () => { const r = spawnSync(process.execPath, [process.env.TEST_CLI, 'afk', 'end', '--me', process.env.WORKFLOW_RUN_ID], { encoding: 'utf8' }); writeFileSync(process.env.TEST_RESULT, r.stdout + r.stderr); console.log(JSON.stringify({type:'result',result:'Summary: done',num_turns:3})); };\nwait();\n`);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node\nconst a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));\nif(a.includes('PATCH') || a.some(x=>x.startsWith('body=<!-- afk-issue-blocked'))) require('fs').appendFileSync(process.env.TEST_PATCHES, a.join(' ')+'\\n');\nif(a[0]==='auth') { console.log('SECRET_TOKEN'); process.exit(0); }\nif(a[0]==='pr' || a[0]==='issue') { out([]); process.exit(0); }\nif(a.includes('rate_limit')) { console.log('5000 2000000000'); process.exit(0); }\nif(a.includes('graphql')) { const row=(number,labels,parent,body='')=>({number,title:'item',body,lastEditedAt:'2020-01-01T00:00:00Z',labels:{nodes:labels.map(name=>({name}))},blockedBy:{nodes:[]},milestone:null,parent,projectItems:{nodes:[]}}); out({data:{repository:{issues:{pageInfo:{hasNextPage:false},nodes:[row(1,['type:epic'],null),row(1082,[process.env.TEST_SELECT_LANE||'lane:afk'],{number:1,parent:null},'\\u0060\\u0060\\u0060scope\\n{\\"paths\\":[\\"docs/\\"]}\\n\\u0060\\u0060\\u0060')]}}}}); process.exit(0); }\nif(a.some(x=>x.includes('/comments')) && a.includes('--slurp')) { out([[]]); process.exit(0); }\nif(a.some(x=>x.includes('/comments'))) { out({id:12}); process.exit(0); }\nif(a.includes('user')) { out({login:'builder'}); process.exit(0); }\nif(a.includes('repos/acme/app/issues/1082')) { out({state:process.env.TEST_STATE||'open',labels:[{name:process.env.TEST_LANE||'lane:afk'}]}); process.exit(0); }\nif(a.includes('repos/acme/app')) { out({permissions:{}}); process.exit(0); }\nconsole.log('event');\n`);
  chmodSync(gh, 0o755);
  const cfg = { ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] }, afk: { startCommand: [process.execPath, child, '{runId}', '{prompt}'] } };
  writeFileSync(join(f.repo, configPath), json(cfg));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  Object.assign(f.env, { TEST_STATE: state, TEST_LANE: lane, TEST_SELECT_LANE: selectLane, TEST_CLI: cli, TEST_GO: join(f.root, 'go'), TEST_RESULT: join(f.root, 'end.txt'), TEST_PATCHES: join(f.root, 'patches.log') });
  const log = join(f.root, 'watch.log');
  const output = openSync(log, 'w');
  const watch = spawnSync(process.execPath, [cli, 'afk', 'watch', '--issue', '1082'], { cwd: f.repo, env: f.env, stdio: ['ignore', output, output] });
  closeSync(output);
  assert.equal(watch.status, 0, readFileSync(log, 'utf8'));
  assert.match(readFileSync(log, 'utf8'), /Launched: afk-/);
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  const [[runId, [hold]]] = Object.entries(JSON.parse(readFileSync(join(common, 'afk-holds.json'), 'utf8')));
  assert.equal(hold.check, selectLane === 'lane:proposed' ? true : undefined);
  assert.notEqual(hold.watcherPid, watch.pid);
  assert.match(spawnSync('ps', ['-p', String(hold.watcherPid), '-o', 'command='], { encoding: 'utf8' }).stdout, / afk supervise --me /);
  assert.equal(JSON.parse(readFileSync(join(common, 'afk-runs', `${runId}.json`), 'utf8')).pid, hold.watcherPid);
  const lock = join(common, 'workflow-locks', 'afk-start.lock');
  const probe = process.platform === 'darwin' ? spawnSync('lockf', ['-t', '0', lock, 'true']) : spawnSync('flock', ['-n', lock, 'true']);
  assert.equal(probe.status, 0, 'the start lock is free while the run works');
  writeFileSync(f.env.TEST_GO, '');
  for (let i = 0; i < 200 && !/Completed:/.test(readFileSync(log, 'utf8')); i++) await new Promise(done => setTimeout(done, 100));
  assert.match(readFileSync(log, 'utf8'), new RegExp(`Completed: ${runId}\\nSummary: done\\nUsage: 3 turns`));
  assert.match(readFileSync(f.env.TEST_RESULT, 'utf8'), /One-shot watcher will release run/);
  assert.deepEqual(JSON.parse(readFileSync(join(common, 'afk-holds.json'), 'utf8')), {});
  assert.match(readFileSync(f.env.TEST_PATCHES, 'utf8'), /afk-issue-released session=afk-\S+ -->\nUsage: 3 turns/);
  const blocked = /body=<!-- afk-issue-blocked session=afk-\S+ -->\n\*\*Blocked:\*\* run afk-\S+ ended without a PR\.\n\nSummary: done/;
  if (state === 'open' && lane === 'lane:afk' && selectLane === 'lane:afk') assert.match(readFileSync(f.env.TEST_PATCHES, 'utf8'), blocked);
  else assert.doesNotMatch(readFileSync(f.env.TEST_PATCHES, 'utf8'), /afk-issue-blocked/);
  assert.equal(existsSync(join(common, 'afk-runs', `${runId}.json`)), false);
}

test('AFK watcher returns while its run works, and the run supervisor releases the hold', t => supervisedRun(t, 'open', 'lane:afk'));

test('a run on an issue no longer lane:afk when it ends does not block it', t => supervisedRun(t, 'open', 'lane:proposed'));

test('an eligibility check that approves its issue into lane:afk does not block it', t => supervisedRun(t, 'open', 'lane:afk', 'lane:proposed'));

test('a run whose issue closed does not block it', t => supervisedRun(t, 'closed', 'lane:afk'));

test('issue create reuses an open exact-title issue with --unique and creates otherwise', t => {
  const f = fixture(t);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node\nconst a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));\nrequire('fs').appendFileSync(process.env.TEST_CALLS, a.join(' ')+'\\n');\nif(a[0]==='auth') { console.log('SECRET_TOKEN'); process.exit(0); }\nif(a[0]==='issue' && a[1]==='list') { if(a.includes('--search')) process.exit(9); const fs=require('fs'), n=Number(fs.existsSync(process.env.TEST_LISTS)?fs.readFileSync(process.env.TEST_LISTS,'utf8'):0)+1; fs.writeFileSync(process.env.TEST_LISTS,String(n)); out(process.env.TEST_EXISTING ? [{number:7,title:'Owner improvements'}] : process.env.TEST_RACE && n>1 ? [{number:5,title:'Owner improvements'},{number:31,title:'Owner improvements'}] : []); process.exit(0); }\nif(a.includes('repos/acme/app') && process.env.TEST_PRIVATE) { out({private:true}); process.exit(0); }\nif(a.includes('repos/acme/skills/issues')) { out({number:31}); process.exit(0); }\nif(a.includes('user')) { out({login:'builder'}); process.exit(0); }\nif(a.includes('repos/acme/app')) { out({permissions:{}}); process.exit(0); }\nconsole.log('{}');\n`);
  chmodSync(gh, 0o755);
  const cfg = { ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] }, afk: { toolingRepository: 'https://github.com/acme/skills.git' } };
  writeFileSync(join(f.repo, configPath), json(cfg));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  writeFileSync(join(f.repo, 'body.md'), 'Run evidence');
  f.env.TEST_CALLS = join(f.root, 'calls.log');
  f.env.TEST_LISTS = join(f.root, 'lists.count');
  f.env.TEST_EXISTING = '1';
  const reused = f.cliRun('issue', 'create', '--title', 'Owner improvements', '--body-file', 'body.md', '--labels', 'lane:owner', '--repo', 'acme/skills', '--unique');
  assert.equal(reused.status, 0, reused.stderr);
  assert.match(reused.stdout, /Exists: #7/);
  assert.doesNotMatch(readFileSync(f.env.TEST_CALLS, 'utf8'), /repos\/acme\/skills\/issues /);
  delete f.env.TEST_EXISTING;
  const created = f.cliRun('issue', 'create', '--title', 'chore(afk): cut rereads', '--body-file', 'body.md', '--labels', 'type:chore,lane:afk', '--repo', 'acme/skills');
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /Created: #31/);
  assert.match(readFileSync(f.env.TEST_CALLS, 'utf8'), /repos\/acme\/skills\/issues -f title=chore\(afk\): cut rereads -f body=Run evidence -f labels\[\]=type:chore -f labels\[\]=lane:afk/);
  const denied = f.cliRun('issue', 'create', '--title', 'x', '--body-file', 'body.md', '--repo', 'other/repo');
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /workflow tooling repository/);
  rmSync(f.env.TEST_LISTS, { force: true });
  f.env.TEST_RACE = '1';
  const raced = f.cliRun('issue', 'create', '--title', 'Owner improvements', '--body-file', 'body.md', '--repo', 'acme/skills', '--unique');
  assert.equal(raced.status, 0, raced.stderr);
  assert.match(raced.stdout, /Exists: #5/);
  assert.match(readFileSync(f.env.TEST_CALLS, 'utf8'), /-X PATCH repos\/acme\/skills\/issues\/31 -f state=closed/);
  delete f.env.TEST_RACE;
  writeFileSync(f.env.TEST_CALLS, '');
  f.env.TEST_PRIVATE = '1';
  const leaked = f.cliRun('issue', 'create', '--title', 'y', '--body-file', 'body.md', '--repo', 'acme/skills');
  assert.notEqual(leaked.status, 0);
  assert.match(leaked.stderr, /acme\/skills is public and acme\/app is private/);
  assert.doesNotMatch(readFileSync(f.env.TEST_CALLS, 'utf8'), /repos\/acme\/skills\/issues /);
});

test('AFK watcher hands an explore pass to the agent without a second afk start', t => {
  const f = fixture(t);
  const child = join(f.root, 'agent.mjs');
  writeFileSync(child, `import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.TEST_RESULT, process.argv[3]);\n`);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node\nconst a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));\nif(a[0]==='auth') { console.log('SECRET_TOKEN'); process.exit(0); }\nif(a[0]==='pr' || a[0]==='issue') { out([]); process.exit(0); }\nif(a.includes('rate_limit')) { console.log('5000 2000000000'); process.exit(0); }\nif(a.includes('graphql')) { out({data:{repository:{issues:{pageInfo:{hasNextPage:false},nodes:[]}}}}); process.exit(0); }\nif(a.some(x=>x.includes('/comments'))) { out([[]]); process.exit(0); }\nif(a.includes('user')) { out({login:'builder'}); process.exit(0); }\nif(a.includes('repos/acme/app')) { out({permissions:{}}); process.exit(0); }\nconsole.log('event');\n`);
  chmodSync(gh, 0o755);
  const cfg = { ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] }, afk: { startCommand: [process.execPath, child, '{runId}', '{prompt}'] } };
  writeFileSync(join(f.repo, configPath), json(cfg));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  f.env.TEST_RESULT = join(f.root, 'agent-prompt.txt');
  const watch = f.cliRun('afk', 'watch');
  assert.equal(watch.status, 0, `${watch.stdout}\n${watch.stderr}`);
  const prompt = readFileSync(f.env.TEST_RESULT, 'utf8');
  assert.match(prompt, /explore/);
  assert.doesNotMatch(prompt, /afk start --me/);
});

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

test('AFK push --to accepts the PR that closes the held issue', t => {
  const f = fixture(t);
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  writeFileSync(join(common, 'afk-holds.json'), JSON.stringify({ 'afk-test-run': [{ number: 261, paths: ['docs/'] }] }));
  f.env.WORKFLOW_RUN_ID = 'afk-test-run';
  const closes = (owner, name) => [{ number: 261, repository: { name, owner: { login: owner } } }];
  f.env.OPEN_PRS = JSON.stringify([
    { number: 262, headRefName: 'fix/held', isCrossRepository: false, autoMergeRequest: null, closingIssuesReferences: closes('Acme', 'App') },
    { number: 263, headRefName: 'fix/elsewhere', isCrossRepository: false, autoMergeRequest: null, closingIssuesReferences: closes('other', 'repo') },
  ]);
  const elsewhere = f.cliRun('push', '--to', 'fix/elsewhere');
  assert.notEqual(elsewhere.status, 0);
  assert.match(elsewhere.stderr, /not the head of the held PR/);
  assertNoPush(f);
  const result = f.cliRun('push', '--to', 'fix/held');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(pushRecord(f).args.some(arg => arg.endsWith(':refs/heads/fix/held')));
});

test('push --to outside an AFK run is refused', t => {
  const f = fixture(t);
  f.env.OPEN_PRS = JSON.stringify([{ number: 259, headRefName: 'feature/held', isCrossRepository: false, autoMergeRequest: null, closingIssuesReferences: [] }]);
  const result = f.cliRun('push', '--to', 'feature/held');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires an AFK run/);
  assertNoPush(f);
});

test('commit excludes a path staged concurrently', t => {
  const f = fixture(t);
  run(f.env.REAL_GIT, ['config', 'user.name', 'Test'], { cwd: f.repo });
  run(f.env.REAL_GIT, ['config', 'user.email', 'test@example.test'], { cwd: f.repo });
  writeFileSync(join(f.repo, 'assigned.txt'), 'assigned'); writeFileSync(join(f.repo, 'unrelated.txt'), 'unrelated');
  f.env.TEST_CONCURRENT_STAGE = '1';
  const result = f.cliRun('commit', '--message', 'fix: protect actor', '--', 'assigned.txt');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.linkedGit('show', '--format=', '--name-only', 'HEAD').stdout.trim().split('\\n'), ['assigned.txt']);
  assert.deepEqual(f.linkedGit('diff', '--cached', '--name-only').stdout.trim().split('\\n'), ['unrelated.txt']);
});

test('commit records a stopped merge as the implementer', t => {
  const f = fixture(t);
  const g = (...args) => run(f.env.REAL_GIT, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], { cwd: f.repo });
  writeFileSync(join(f.repo, 'song.txt'), 'base');
  assert.equal(g('add', 'song.txt').status, 0); assert.equal(g('commit', '-qm', 'base').status, 0);
  assert.equal(g('checkout', '-qb', 'other').status, 0);
  writeFileSync(join(f.repo, 'song.txt'), 'theirs'); assert.equal(g('commit', '-qam', 'theirs').status, 0);
  assert.equal(g('checkout', '-q', 'feature/test').status, 0);
  writeFileSync(join(f.repo, 'song.txt'), 'ours'); assert.equal(g('commit', '-qam', 'ours').status, 0);
  assert.notEqual(g('merge', '--no-commit', 'other').status, 0);
  writeFileSync(join(f.repo, 'song.txt'), 'resolved');
  const result = f.cliRun('commit', '--message', 'chore: merge other', '--', 'song.txt');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.linkedGit('show', '-s', '--format=%p|%an', 'HEAD').stdout.trim().split('|').map((v, i) => i ? v : v.split(' ').length).join('|'), '2|builder');
});

test('commit refuses existing staged changes', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, 'previous.txt'), 'preserve'); writeFileSync(join(f.repo, 'assigned.txt'), 'assigned');
  run(f.env.REAL_GIT, ['add', 'previous.txt'], { cwd: f.repo });
  const result = f.cliRun('commit', '--message', 'fix: protect actor', '--', 'assigned.txt');
  assert.notEqual(result.status, 0);
  assert.deepEqual(f.linkedGit('diff', '--cached', '--name-only').stdout.trim().split('\\n'), ['previous.txt']);
});

test('commit rejects invalid messages and parent paths', t => {
  const f = fixture(t); writeFileSync(join(f.repo, 'assigned.txt'), 'assigned');
  for (const [message, path] of [['bad message', 'assigned.txt'], ['fix: test', '../outside']]) assert.notEqual(f.cliRun('commit', '--message', message, '--', path).status, 0);
  assert.equal(f.linkedGit('diff', '--cached', '--name-only').stdout.trim(), '');
});

test('push binds the verified credential and redacts output', t => {
  const f = fixture(t); const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr);
  const record = pushRecord(f);
  assert.equal(record.secret, 'SECRET_TOKEN'); assert.equal(record.environment_has_token, false);
  assert.ok(record.args.some(arg => arg.endsWith(':refs/heads/feature/test')));
  assert.ok(record.args.includes('--no-follow-tags')); assert.ok(record.args.includes('--recurse-submodules=no'));
  assert.ok(!`${result.stdout}${result.stderr}`.includes('SECRET_TOKEN'));
});

test('wrong actor never pushes', t => {
  const f = fixture(t); f.env.FAKE_ACTOR = 'reviewer';
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0); assertNoPush(f); assert.ok(!`${result.stdout}${result.stderr}`.includes('SECRET_TOKEN'));
});

test('owner bootstrap uses configured Reviewer while Owner comes from branch CODEOWNERS', t => {
  const f = fixture(t);
  assert.equal(run(f.env.REAL_GIT, ['rm', '-q', configPath], { cwd: f.main }).status, 0);
  writeFileSync(join(f.main, '.github', 'CODEOWNERS'), '* @reviewer\n');
  commitFixture(f, f.main);
  f.env.REMOTE_BASE_SHA = run(f.env.REAL_GIT, ['rev-parse', 'HEAD'], { cwd: f.main }).stdout.trim();
  writeFileSync(join(f.repo, '.github', 'CODEOWNERS'), '* @owner\n/*.rules @owner\n');
  assert.equal(f.linkedGit('add', '.github/CODEOWNERS').status, 0);
  assert.equal(f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'branch owner rules').status, 0);
  f.env.FAKE_ACTOR = 'owner'; f.env.AUTH_USERS_FILE = join(f.root, 'auth-users.txt');
  const result = f.cliRun('push', '--owner-bootstrap');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(new Set(readFileSync(f.env.AUTH_USERS_FILE, 'utf8').trim().split(/\r?\n/)), new Set(['owner']));
  assert.equal(existsSync(f.env.PUSH_RECORD), true);
});

test('failed Git push never reports success or exposes its token', t => {
  const f = fixture(t); f.env.TEST_PUSH_FAILURE = '1';
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0); assert.ok(!result.stdout.includes('"result":"pushed"')); assert.ok(!`${result.stdout}${result.stderr}`.includes('SECRET_TOKEN'));
});

test('unrelated URL rewrites do not block push', t => {
  const f = fixture(t); f.linkedGit('config', 'url.https://example.invalid/.insteadOf', 'example:');
  assert.equal(f.cliRun('push').status, 0);
});

test('target URL rewrite cannot redirect the checked credential', t => {
  const f = fixture(t);
  f.linkedGit('remote', 'set-url', 'origin', 'git@github.com:acme/app.git');
  f.linkedGit('config', 'url.https://attacker.invalid/.insteadOf', 'https://github.com/');
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0); assert.match(result.stderr, /URL rewrite/); assertNoPush(f);
});

test('reviewer as implementer is rejected before credentials', t => {
  const f = fixture(t); changeConfig(f, { repo: 'acme/app', implementer: 'reviewer', reviewer: 'reviewer', owner: 'owner' });
  assert.notEqual(f.cliRun('push').status, 0); assertNoPush(f);
});

test('push ignores uncommitted identity configuration', t => {
  const f = fixture(t);
  writeFileSync(join(f.repo, configPath), json(config({ repo: 'acme/app', implementer: 'reviewer', reviewer: 'builder', owner: 'owner' })));
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).actor, 'builder');
});

test('push ignores replacement refs for base roles', t => {
  const f = fixture(t); const original = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(f.repo, configPath), json(config({ repo: 'acme/app', implementer: 'reviewer', reviewer: 'builder', owner: 'owner' })));
  f.linkedGit('add', configPath); f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'replacement');
  const replacement = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  f.linkedGit('reset', '--hard', '-q', original); f.linkedGit('replace', original, replacement);
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).actor, 'builder');
});

test('push refuses owner as implementer', t => {
  const f = fixture(t); changeConfig(f, { repo: 'acme/app', implementer: 'owner', reviewer: 'reviewer', owner: 'owner' });
  assert.notEqual(f.cliRun('push').status, 0); assertNoPush(f);
});

test('repo, base, owner and reviewer are derived from origin and CODEOWNERS', t => {
  const f = fixture(t);
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).repository, 'acme/app');
});

test('push refuses when auto-merge is enabled', t => {
  const f = fixture(t); f.env.AUTO_MERGE = '1';
  assert.notEqual(f.cliRun('push').status, 0); assertNoPush(f);
});

test('stale base configuration is rejected', t => {
  const f = fixture(t); f.env.REMOTE_BASE_SHA = 'f'.repeat(40);
  assert.notEqual(f.cliRun('push').status, 0); assertNoPush(f);
});

test('push ignores inherited GitHub actor and host', t => {
  const f = fixture(t); f.env.GH_TOKEN = 'WRONG_REVIEWER_TOKEN'; f.env.GH_HOST = 'invalid.example';
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(pushRecord(f).secret, 'SECRET_TOKEN');
  assert.ok(!`${result.stdout}${result.stderr}`.includes('WRONG_REVIEWER_TOKEN'));
});

test('push isolates URL-scoped credential helpers', t => {
  const f = fixture(t); const marker = join(f.root, 'helper-ran');
  f.linkedGit('config', 'credential.https://github.com.helper', `!touch ${marker}`);
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(existsSync(marker), false); assert.equal(pushRecord(f).secret, 'SECRET_TOKEN');
});

test('push refuses sending token to a non-GitHub host', async t => {
  const f = fixture(t); const received = [];
  const server = createServer((request, response) => {
    received.push(request.headers.authorization || null);
    response.statusCode = received.at(-1) ? 403 : 401;
    response.setHeader('Connection', 'close');
    if (!received.at(-1)) response.setHeader('WWW-Authenticate', 'Basic realm="fixture"');
    response.end();
  });
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); }
  catch (error) { if (error.code === 'EPERM') { t.skip('sandbox denies localhost sockets; hosted CI runs this credential-boundary fixture'); return; } throw error; }
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const marker = join(f.root, 'unsafe-helper'); const helper = `!touch ${marker}; echo username=reviewer; echo password=WRONG`;
  f.linkedGit('config', 'credential.https://github.com.helper', helper);
  f.linkedGit('config', 'credential.https://github.com/acme/app.git.helper', helper);
  f.env.TEST_PUSH_URL = `http://127.0.0.1:${server.address().port}/acme/app.git`;
  const result = await runCliAsync(f, 'push');
  assert.notEqual(result.status, 0); assert.equal(result.timedOut, false); assert.equal(existsSync(marker), false);
  const leaked = `Basic ${Buffer.from('x-access-token:SECRET_TOKEN').toString('base64')}`;
  assert.ok(!received.includes(leaked)); assert.ok(!`${result.stdout}${result.stderr}`.includes('SECRET_TOKEN'));
});

test('push refuses scoped authorization headers', t => {
  const f = fixture(t); f.linkedGit('config', 'http.https://github.com/.extraheader', 'Authorization: secret');
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0); assertNoPush(f); assert.ok(!result.stderr.includes('Authorization: secret'));
});

test('installed hooks run normally without receiving credential environment', t => {
  const f = fixture(t); const remote = nativeRemote(f); const hook = hookPath(f);
  f.env.HOOK_RECORD = join(f.root, 'hook.json');
  writeFileSync(hook, `#!/bin/sh
case "$GH_TOKEN$GITHUB_TOKEN$WORKFLOW_CREDENTIAL_SOCKET" in "") token=false;; *) token=true;; esac
printf '{"token":%s}\\n' "$token" > "$HOOK_RECORD"
`); chmodSync(hook, 0o755);
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(readFileSync(f.env.HOOK_RECORD, 'utf8')).token, false);
  assert.equal(run(f.env.REAL_GIT, ['--git-dir', remote, 'rev-parse', 'refs/heads/feature/test']).stdout.trim(), f.env.REMOTE_BASE_SHA);
});

test('installed hook failure stops push', t => {
  const f = fixture(t); const remote = nativeRemote(f); const hook = hookPath(f);
  writeFileSync(hook, `#!/bin/sh
exit 13
`); chmodSync(hook, 0o755);
  assert.notEqual(f.cliRun('push').status, 0);
  assert.notEqual(run(f.env.REAL_GIT, ['--git-dir', remote, 'rev-parse', '--verify', 'refs/heads/feature/test']).status, 0);
});

test('installed hooks run with SSH origin', t => {
  const f = fixture(t); const remote = nativeRemote(f); const hook = hookPath(f);
  f.linkedGit('remote', 'set-url', 'origin', 'git@github.com:acme/app.git');
  f.env.HOOK_RECORD = join(f.root, 'hook.txt'); writeFileSync(hook, `#!/bin/sh
printf ran > "$HOOK_RECORD"
`); chmodSync(hook, 0o755);
  const result = f.cliRun('push');
  assert.equal(result.status, 0, result.stderr); assert.equal(readFileSync(f.env.HOOK_RECORD, 'utf8'), 'ran');
  assert.equal(run(f.env.REAL_GIT, ['--git-dir', remote, 'rev-parse', 'refs/heads/feature/test']).stdout.trim(), f.env.REMOTE_BASE_SHA);
});

test('push failure reports safe classification without diagnostics', t => {
  const f = fixture(t); f.env.TEST_PUSH_FAILURE = '1'; f.env.FAKE_PUSH_STDERR = 'rejected non-fast-forward SECRET_TOKEN private-detail';
  const result = f.cliRun('push');
  assert.match(result.stderr, /remote branch changed or is ahead/); assert.ok(!result.stderr.includes('SECRET_TOKEN')); assert.ok(!result.stderr.includes('private-detail'));
});

test('review context reports identical tree and unresolved threads', t => {
  const f = fixture(t); const base = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '-qm', 'same tree');
  const head = f.linkedGit('rev-parse', 'HEAD').stdout.trim(); f.env.BASE_SHA = base; f.env.HEAD_SHA = head;
  const result = f.cliRun('review-context', '--pr', '1', '--previous', base, '--previous-base', base, '--issue', '1');
  assert.equal(result.status, 0, result.stderr); const data = JSON.parse(result.stdout);
  assert.equal(data.comparison.identicalTree, true); assert.equal(data.comparison.identicalBaseTree, true); assert.equal(data.comparison.treesUnchanged, true);
  assert.equal(data.reviewThreads[0].isResolved, false); assert.match(data.issue.decisions[0].body, /Decision:/); assert.equal(data.issue.decisionsMayBeIncomplete, true);
});

test('identical head without prior base is not carryable evidence', t => {
  const f = fixture(t); const head = f.linkedGit('rev-parse', 'HEAD').stdout.trim(); f.env.BASE_SHA = head; f.env.HEAD_SHA = head;
  const result = f.cliRun('review-context', '--pr', '1', '--previous', head);
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).comparison.treesUnchanged, false);
});

test('changed base tree is not carryable evidence', t => {
  const f = fixture(t); const previous = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(f.repo, 'new-file'), 'change'); f.linkedGit('add', 'new-file');
  f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'change');
  const base = f.linkedGit('rev-parse', 'HEAD').stdout.trim(); f.env.BASE_SHA = base; f.env.HEAD_SHA = previous;
  const result = f.cliRun('review-context', '--pr', '1', '--previous', previous, '--previous-base', previous);
  assert.equal(result.status, 0, result.stderr); const data = JSON.parse(result.stdout).comparison;
  assert.equal(data.identicalTree, true); assert.equal(data.identicalBaseTree, false); assert.equal(data.treesUnchanged, false);
});

test('review context works without workflow config', t => {
  const f = fixture(t); f.linkedGit('rm', '-q', configPath);
  f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'no config');
  f.linkedGit('update-ref', 'refs/remotes/origin/main', 'HEAD'); const head = f.linkedGit('rev-parse', 'HEAD').stdout.trim();
  f.env.BASE_SHA = head; f.env.HEAD_SHA = head;
  const result = f.cliRun('review-context', '--pr', '1');
  assert.equal(result.status, 0, result.stderr); const data = JSON.parse(result.stdout);
  assert.equal(data.headRefOid, head); assert.equal(data.baseConfigurationAvailable, false);
});

test('push without base roles fails closed', t => {
  const f = fixture(t); f.linkedGit('rm', '-q', configPath);
  f.linkedGit('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'no config');
  f.linkedGit('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0); assert.match(result.stderr, /identities\.implementer/); assertNoPush(f);
});

test('push requires configured Reviewer even when CODEOWNERS names one', t => {
  const f = fixture(t);
  writeFileSync(join(f.main, configPath), json({ version: 1, identities: { implementer: 'builder' } }));
  assert.equal(f.git('add', configPath).status, 0);
  commitFixture(f, f.main);
  f.env.REMOTE_BASE_SHA = f.git('rev-parse', 'HEAD').stdout.trim();
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /identities\.implementer and identities\.reviewer/);
  assertNoPush(f);
});

test('push rejects a malformed configured Reviewer clearly', t => {
  const f = fixture(t);
  writeFileSync(join(f.main, configPath), json({ version: 1, identities: { implementer: 'builder', reviewer: 42 } }));
  assert.equal(f.git('add', configPath).status, 0);
  commitFixture(f, f.main);
  f.env.REMOTE_BASE_SHA = f.git('rev-parse', 'HEAD').stdout.trim();
  const result = f.cliRun('push');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /identities\.reviewer must be a GitHub login/);
  assertNoPush(f);
});

test('push failure reports a safe class and exit', t => {
  const f = fixture(t); f.env.TEST_PUSH_FAILURE = '1';
  const result = f.cliRun('push');
  assert.match(result.stderr, /exit 1/); assert.match(result.stderr, /unclassified Git failure/); assert.ok(!result.stderr.includes('SECRET_TOKEN'));
});

test('remote destination mismatch is rejected', t => {
  const f = fixture(t); f.linkedGit('remote', 'set-url', 'origin', 'https://github.com/other/project.git');
  assert.notEqual(f.cliRun('push').status, 0); assertNoPush(f);
});
