import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { runWithLocks } from '../../plugins/common/workflow/scripts/locks.mjs';

const locksModule = pathToFileURL(new URL('../../plugins/common/workflow/scripts/locks.mjs', import.meta.url).pathname).href;
function launch(directory, target) {
  const script = `import {runWithLocks} from ${JSON.stringify(locksModule)}; const r=runWithLocks(${JSON.stringify(directory)}, ['serial'], process.execPath, ['-e', ${JSON.stringify(target)}]); process.exitCode=r.status ?? 1;`;
  return spawn(process.execPath, ['--input-type=module', '-e', script], { detached: true, stdio: ['ignore', 'pipe', 'inherit'] });
}
function waitFor(output, target) {
  return new Promise((resolve, reject) => {
    let value = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${target}; got ${value}`)), 5000);
    output.on('data', chunk => {
      value += chunk.toString();
      if (value.includes(target)) { clearTimeout(timer); resolve(value); }
    });
  });
}
function capture(output, events) {
  output.on('data', chunk => events.push(...chunk.toString().trim().split('\n').filter(Boolean)));
}

test('advisory locks serialize concurrent commands', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-locks-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = launch(directory, `console.log('first-start'); setTimeout(()=>console.log('first-end'),250)`);
  const events = [];
  capture(first.stdout, events);
  const firstOutput = waitFor(first.stdout, 'first-start');
  await firstOutput;
  const second = launch(directory, `console.log('second-start'); console.log('second-end')`);
  capture(second.stdout, events);
  const secondOutput = waitFor(second.stdout, 'second-start');
  const [firstDone, secondDone] = await Promise.all([
    new Promise(resolve => first.on('close', resolve)),
    new Promise(resolve => second.on('close', resolve)),
    secondOutput,
  ]).then(values => values.slice(0, 2));
  assert.equal(firstDone, 0);
  assert.equal(secondDone, 0);
  assert.ok(events.indexOf('first-end') < events.indexOf('second-start'), events.join(', '));
});

test('OS releases a workflow lock when its command group is killed', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-locks-kill-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const holder = launch(directory, `console.log('holding'); setInterval(()=>{},1000)`);
  await waitFor(holder.stdout, 'holding');
  process.kill(-holder.pid, 'SIGKILL');
  await new Promise(resolve => holder.on('close', resolve));
  const recovered = runWithLocks(directory, ['serial'], process.execPath, ['-e', "console.log('recovered')"], { timeoutSeconds: 5, stdio: 'inherit' });
  assert.equal(recovered.status, 0);
});

test('a lock timeout exits 75 so callers can tell it from a command failure', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-locks-timeout-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const holder = launch(directory, `console.log('holding'); setInterval(()=>{},1000)`);
  t.after(() => { try { process.kill(-holder.pid, 'SIGKILL'); } catch {} });
  await waitFor(holder.stdout, 'holding');
  const timedOut = runWithLocks(directory, ['serial'], process.execPath, ['-e', 'process.exit(0)'], { timeoutSeconds: 0 });
  assert.equal(timedOut.status, 75);
  const failed = runWithLocks(join(directory, 'other'), ['serial'], process.execPath, ['-e', 'process.exit(1)'], { timeoutSeconds: 0 });
  assert.equal(failed.status, 1);
});
