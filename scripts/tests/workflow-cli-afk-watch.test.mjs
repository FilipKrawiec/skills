import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { cli, configPath, json, config, run, fixture, commitFixture } from './support/workflow-cli-fixture.mjs';

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

