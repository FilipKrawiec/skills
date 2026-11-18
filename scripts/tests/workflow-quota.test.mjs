import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gate, isMergeCritical, plan, pollSeconds, quotaStatus, readBudget, sharedRead, writeBudget } from '../../plugins/common/workflow/scripts/lib/quota.mjs';

const HOUR = 3_600_000;
const dir = () => join(mkdtempSync(join(tmpdir(), 'quota-')), 'graphql-budget.json');
const budget = (remaining, now = 0) => ({ remaining, limit: 5000, resetAt: new Date(now + HOUR).toISOString() });

test('plan runs freely above the threshold, backs off proportionally, and stops non-critical calls at the floor', () => {
  const at = remaining => plan(budget(remaining), { now: 0, share: 1 });
  assert.equal(at(4000).sleepMs, 0);
  const light = at(900).sleepMs; const heavy = at(400).sleepMs;
  assert.ok(light > 0 && heavy > light, 'the delay grows as the quota shrinks');
  assert.equal(at(100).exhausted, true);
  assert.equal(plan(budget(100), { now: 0, share: 1, critical: true }).sleepMs, 0, 'a merge-critical call still runs');
  assert.equal(plan(budget(0), { now: HOUR + 1, share: 1 }).sleepMs, 0, 'a passed reset frees the quota');
});

test('merge-critical calls are the merge and its readiness only', () => {
  assert.equal(isMergeCritical(['pr', 'merge', '5']), true);
  assert.equal(isMergeCritical(['api', 'graphql', '-f', 'query=mutation{enablePullRequestAutoMerge(input:{})}']), true);
  assert.equal(isMergeCritical(['pr', 'view', '5']), false);
});

test('an exhausted quota is reported once with its reset time and never retried in a tight loop', () => {
  const file = dir(); const reports = []; let probes = 0;
  writeBudget({ ...budget(10), probedAt: 0 }, file, 'k');
  const options = { file, key: 'k', now: () => 1000, fetchLimit: () => { probes++; return null; }, report: message => reports.push(message), share: 1 };
  assert.throws(() => gate(['pr', 'view', '5'], options), /used up until/);
  assert.throws(() => gate(['pr', 'view', '5'], options), /used up until/);
  assert.equal(reports.length, 1);
  assert.match(reports[0], new RegExp(budget(10).resetAt));
  assert.equal(probes, 0, 'a fresh figure is not re-fetched on every call');
  gate(['pr', 'merge', '5'], options);
});

test('a polling caller sleeps until the reset, in bounded steps, instead of failing', () => {
  const file = dir(); const sleeps = []; let clock = 1000;
  writeBudget({ ...budget(0), probedAt: 0 }, file, 'k');
  gate(['pr', 'view', '5'], { file, key: 'k', share: 1, waitWhenExhausted: true, report: () => {}, now: () => clock, sleep: ms => { sleeps.push(ms); clock += ms; }, fetchLimit: () => (clock > HOUR ? { remaining: 5000, limit: 5000, resetAt: new Date(clock + HOUR).toISOString() } : null) });
  assert.ok(sleeps.length > 10 && sleeps.every(ms => ms <= 60_000), 'one bounded sleep per minute, not a spin');
  assert.ok(clock >= HOUR);
});

test('status reads the shared quota and reset time', () => {
  const file = dir();
  assert.equal(quotaStatus(file, 'k'), null);
  writeBudget(budget(1234), file, 'k');
  assert.deepEqual(quotaStatus(file, 'k', 0), { remaining: 1234, limit: 5000, resetAt: budget(0).resetAt, expired: false });
});

test('waits poll no faster than a minute, jittered, and share one read per PR per interval', () => {
  assert.equal(pollSeconds(1, () => 0), 60);
  assert.ok(pollSeconds(30, () => 1) > 60 && pollSeconds(30, () => 1) <= 72);
  assert.equal(pollSeconds(300, () => 0), 300);
  const file = join(mkdtempSync(join(tmpdir(), 'shared-')), 'graphql-shared.json'); let loads = 0; let clock = 0;
  const read = () => sharedRead('pr:a/b#5', 55_000, () => ++loads, { now: () => clock, file });
  assert.deepEqual([read(), read(), read()], [1, 1, 1]);
  clock = 56_000;
  assert.equal(read(), 2);
});

// Six parallel drives, each polling and working, plus three waits, against one simulated hourly quota.
test('six parallel drives plus waits stay under the configured share of the hourly quota', () => {
  const file = dir(); let clock = 0; const limit = 5000; let spent = 0; const resetAt = new Date(HOUR).toISOString();
  const github = () => ({ remaining: limit - spent, limit, resetAt });
  const options = { file, key: 'k', report: () => {}, now: () => clock, fetchLimit: github, sleep: ms => { clock += ms; } };
  // Each actor makes a call whenever its own clock allows; a throttled call is skipped, as the CLI would error or sleep.
  const actors = [...Array(6)].map(() => ({ every: 90, at: 0, critical: false })).concat([...Array(3)].map(() => ({ every: 60, at: 0, critical: false })));
  // Burst: each drive makes ~700 calls a minute worth of reads (the incident rate), spread over the actors.
  for (let second = 0; second < 3600; second++) {
    clock = second * 1000;
    for (const actor of actors) {
      if (second < actor.at) continue;
      for (let burst = 0; burst < 12; burst++) {
        try { gate(['pr', 'view', '5'], { ...options, sleep: () => {} }); spent++; } catch { actor.at = second + 60; break; }
      }
      actor.at = Math.max(actor.at, second + actor.every / 90);
    }
  }
  assert.ok(spent <= limit * 0.5, `spent ${spent} of ${limit}`);
  assert.ok(spent > limit * 0.4, 'the throttle uses its share rather than stalling early');
  assert.equal(readBudget(file, 'k').limit, limit);
});

test('identical GraphQL reads in one invocation run once; a write clears them', () => {
  const root = mkdtempSync(join(tmpdir(), 'memo-')); const log = join(root, 'calls');
  writeFileSync(join(root, 'gh'), `#!/bin/sh\necho "$@" >> '${log}'\nif [ "$2" = rate_limit ]; then echo '{"remaining":5000,"limit":5000,"reset":${Math.floor(Date.now() / 1000) + 3600}}'; else echo '{}'; fi\n`, { mode: 0o755 });
  const core = new URL('../../plugins/common/workflow/scripts/lib/core.mjs', import.meta.url).href;
  const code = `import { run } from '${core}'; const read = ['api','graphql','-f','query=query{viewer{login}}']; run('gh', read); run('gh', read); run('gh', ['api','graphql','-f','query=mutation{x}']); run('gh', read);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, PATH: `${root}:${process.env.PATH}`, WORKFLOW_QUOTA: '', WORKFLOW_QUOTA_DIR: root } });
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(log, 'utf8').trim().split('\n').filter(line => !line.includes('rate_limit'));
  assert.equal(calls.length, 3, 'two reads around a mutation run twice, the repeated one once');
});

test('a REST write or a non-gh command clears the read memo', () => {
  const root = mkdtempSync(join(tmpdir(), 'memo-')); const log = join(root, 'calls');
  writeFileSync(join(root, 'gh'), `#!/bin/sh\necho "$@" >> '${log}'\nif [ "$2" = rate_limit ]; then echo '{"remaining":5000,"limit":5000,"reset":${Math.floor(Date.now() / 1000) + 3600}}'; else echo '{}'; fi\n`, { mode: 0o755 });
  const core = new URL('../../plugins/common/workflow/scripts/lib/core.mjs', import.meta.url).href;
  const code = `import { run } from '${core}'; const read = ['api','graphql','-f','query=query{viewer{login}}']; run('gh', read); run('gh', ['api','repos/a/b/pulls/5/reviews','--input','-'], { input: '{}' }); run('gh', read); run('true', []); run('gh', read);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, PATH: `${root}:${process.env.PATH}`, WORKFLOW_QUOTA: '', WORKFLOW_QUOTA_DIR: root } });
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(log, 'utf8').trim().split('\n').filter(line => !line.includes('rate_limit'));
  assert.equal(calls.length, 4, 'each read after a REST write or other command reaches gh again');
});

test('a secondary-limit response is parsed for Retry-After or x-ratelimit-reset and falls back to a default delay', async () => {
  const { parseSecondaryLimit } = await import('../../plugins/common/workflow/scripts/lib/quota.mjs');
  assert.equal(parseSecondaryLimit('gh: You have exceeded a secondary rate limit (HTTP 403)\nretry-after: 42', 0).delayMs, 42_000);
  assert.equal(parseSecondaryLimit('HTTP 429: rate limit already exceeded\nx-ratelimit-reset: 90', 30_000).delayMs, 60_000);
  assert.equal(parseSecondaryLimit('HTTP 403: secondary rate limit', 0).delayMs, 60_000);
  assert.equal(parseSecondaryLimit('HTTP 404: Not Found', 0), null);
  assert.equal(parseSecondaryLimit('retry-after: 0\nHTTP 429', 0).delayMs, 1000, 'never a zero delay');
});

test('a secondary limit writes one backoff file every process honours, and retries stop after 3 attempts without a tight loop', async () => {
  const { retrySecondary, readBackoff } = await import('../../plugins/common/workflow/scripts/lib/quota.mjs');
  const file = join(mkdtempSync(join(tmpdir(), 'backoff-')), 'graphql-backoff.json');
  let clock = 0; const sleeps = []; let calls = 0;
  const options = { file, key: 'k', now: () => clock, sleep: ms => { sleeps.push(ms); clock += ms; } };
  const limited = () => { calls++; throw Object.assign(new Error('limited'), { secondaryLimit: { delayMs: 10_000 } }); };
  assert.throws(() => retrySecondary(limited, options), /limited/);
  assert.equal(calls, 4, 'the first try plus 3 retries');
  assert.equal(sleeps.length, 3);
  assert.ok(sleeps.every(ms => ms >= 10_000), 'each retry waits the full delay');
  assert.equal(readBackoff(file, 'k').until, 40_000);
  // Another process starts inside the backoff window: it waits for the shared deadline before its first call.
  clock = 5000; sleeps.length = 0; calls = 0;
  assert.equal(retrySecondary(() => { calls++; return 'ok'; }, options), 'ok');
  assert.deepEqual(sleeps, [35_000]);
  assert.equal(calls, 1);
});

test('a failure that is not a secondary limit is not retried', async () => {
  const { retrySecondary } = await import('../../plugins/common/workflow/scripts/lib/quota.mjs');
  let calls = 0;
  assert.throws(() => retrySecondary(() => { calls++; throw new Error('boom'); }, { file: dir(), key: 'k', now: () => 0, sleep: () => {} }), /boom/);
  assert.equal(calls, 1);
});
