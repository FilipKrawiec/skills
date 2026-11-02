import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, chmodSync, existsSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { cli, configPath, json, config, run, fixture, commitFixture } from './support/workflow-cli-fixture.mjs';

async function supervisedRun(t, state, lane, selectLane = 'lane:afk', pr = false) {
  if (spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { stdio: 'ignore' }).status !== 0) { t.skip('watcher lock ownership requires process inspection'); return; }
  const f = fixture(t);
  const child = join(f.root, 'agent.mjs');
  writeFileSync(child, `import { spawnSync } from 'node:child_process';\nimport { existsSync, writeFileSync } from 'node:fs';\nconst begun = Date.now(), wait = () => existsSync(process.env.TEST_GO) || Date.now() - begun > 30000 ? finish() : setTimeout(wait, 50);\nconst finish = () => { const r = spawnSync(process.execPath, [process.env.TEST_CLI, 'afk', 'end', '--me', process.env.WORKFLOW_RUN_ID], { encoding: 'utf8' }); writeFileSync(process.env.TEST_RESULT, r.stdout + r.stderr); console.log(JSON.stringify({type:'result',result:'Summary: done',num_turns:3})); };\nwait();\n`);
  const gh = join(f.root, 'bin', 'gh');
  writeFileSync(gh, `#!/usr/bin/env node\nconst a=process.argv.slice(2), out=x=>console.log(JSON.stringify(x));\nif(a.includes('PATCH') || a.some(x=>x.startsWith('body=<!-- afk-issue-blocked'))) require('fs').appendFileSync(process.env.TEST_PATCHES, a.join(' ')+'\\n');\nif(a[0]==='auth') { console.log('SECRET_TOKEN'); process.exit(0); }\nif(a[0]==='pr' || a[0]==='issue') { out(a[0]==='pr' && process.env.TEST_PR ? [{number:2000,title:'pr',body:'Closes #1082',headRefOid:'abc',labels:[],reviews:[],isDraft:false,statusCheckRollup:[],mergeable:'MERGEABLE'}] : []); process.exit(0); }\nif(a.some(x=>x.includes('pullRequests(states'))) { out({data:{repository:{pullRequests:{nodes:[]}}}}); process.exit(0); }\nif(a[0]==='project') { out({id:'P1',title:'Board'}); process.exit(0); }\nif(a.includes('number=2000')) { console.error('Could not resolve to an Issue with the number of 2000.'); process.exit(1); }\nif(a.includes('rate_limit')) { console.log('5000 2000000000'); process.exit(0); }\nif(a.includes('graphql')) { const row=(number,labels,parent,body='')=>({number,title:'item',body,lastEditedAt:'2020-01-01T00:00:00Z',labels:{nodes:labels.map(name=>({name}))},blockedBy:{nodes:[]},milestone:null,parent,projectItems:{nodes:[{project:{number:5,title:'Board',owner:{login:'acme'}}}]}}); out({data:{repository:{issues:{pageInfo:{hasNextPage:false},nodes:[row(1,['type:epic'],null),row(1082,[process.env.TEST_SELECT_LANE||'lane:afk'],{number:1,parent:null},'\\u0060\\u0060\\u0060scope\\n{\\"paths\\":[\\"docs/\\"]}\\n\\u0060\\u0060\\u0060')]}}}}); process.exit(0); }\nif(a.some(x=>x.includes('/comments')) && a.includes('--slurp')) { out([[]]); process.exit(0); }\nif(a.some(x=>x.includes('/comments'))) { out({id:12}); process.exit(0); }\nif(a.includes('user')) { out({login:'builder'}); process.exit(0); }\nif(a.includes('repos/acme/app/issues/1082')) { out({state:process.env.TEST_STATE||'open',labels:[{name:process.env.TEST_LANE||'lane:afk'}]}); process.exit(0); }\nif(a.includes('repos/acme/app')) { out({permissions:{}}); process.exit(0); }\nconsole.log('event');\n`);
  chmodSync(gh, 0o755);
  const cfg = { ...config({ implementer: 'builder', reviewer: 'reviewer' }), steps: { process: null, assemble: null, test: ['true'] }, afk: { startCommand: [process.execPath, child, '{runId}', '{prompt}'] } };
  writeFileSync(join(f.repo, configPath), json(cfg));
  assert.equal(f.linkedGit('add', configPath).status, 0);
  commitFixture(f);
  writeFileSync(join(f.env.HOME, '.config', 'gh-agents', 'workflow-env.json'), JSON.stringify({ env: { GH_TOKEN: 'SECRET_TOKEN' } }));
  Object.assign(f.env, { TEST_STATE: state, TEST_LANE: lane, TEST_SELECT_LANE: selectLane, TEST_PR: pr ? '1' : '', TEST_CLI: cli, TEST_GO: join(f.root, 'go'), TEST_RESULT: join(f.root, 'end.txt'), TEST_PATCHES: join(f.root, 'patches.log') });
  const log = join(f.root, 'watch.log');
  const output = openSync(log, 'w');
  const watch = spawnSync(process.execPath, [cli, 'afk', 'watch', '--issue', pr ? '2000' : '1082'], { cwd: f.repo, env: f.env, stdio: ['ignore', output, output] });
  closeSync(output);
  assert.equal(watch.status, 0, readFileSync(log, 'utf8'));
  assert.match(readFileSync(log, 'utf8'), /Launched: afk-/);
  const common = f.linkedGit('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.trim();
  const [[runId, [hold]]] = Object.entries(JSON.parse(readFileSync(join(common, 'afk-holds.json'), 'utf8')));
  assert.equal(hold.check, selectLane === 'lane:proposed' ? true : undefined);
  assert.equal(hold.review, pr ? true : undefined);
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
  if (state === 'open' && lane === 'lane:afk' && selectLane === 'lane:afk' && !pr) assert.match(readFileSync(f.env.TEST_PATCHES, 'utf8'), blocked);
  else assert.doesNotMatch(readFileSync(f.env.TEST_PATCHES, 'utf8'), /afk-issue-blocked/);
  assert.equal(existsSync(join(common, 'afk-runs', `${runId}.json`)), false);
}

test('AFK watcher returns while its run works, and the run supervisor releases the hold', t => supervisedRun(t, 'open', 'lane:afk'));

test('a run on an issue no longer lane:afk when it ends does not block it', t => supervisedRun(t, 'open', 'lane:proposed'));

test('an eligibility check that approves its issue into lane:afk does not block it', t => supervisedRun(t, 'open', 'lane:afk', 'lane:proposed'));

test('a run whose issue closed does not block it', t => supervisedRun(t, 'closed', 'lane:afk'));

test('a run that reviews a PR starts without a card for the PR and never blocks it', t => supervisedRun(t, 'open', 'lane:afk', 'lane:afk', true));
