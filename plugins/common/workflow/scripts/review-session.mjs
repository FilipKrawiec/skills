#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { config, jsonCommand } from './lib/core.mjs';
import { acquireReviewRef, createReviewClaim, localClaimIsDead, releaseSessionClaim, sessionClaim, withReviewTransport } from './lib/review-ref.mjs';

const [, , pr, head, ...command] = process.argv;
if (!/^[1-9]\d*$/.test(pr || '') || !/^[0-9a-f]{40,64}$/i.test(head || '') || !command.length) throw new Error('Invalid reviewer session');
const { root, lanes } = config();
const nonce = randomUUID();
mkdirSync(join(root, '.wf'), { recursive: true });
const path = join(root, '.wf', `review-session-${nonce}.json`);
const child = spawn(command[0], command.slice(1), { cwd: root, stdio: 'inherit', detached: true, env: { ...process.env, WORKFLOW_REVIEW_NONCE: nonce } });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
let oid; let acquired = false;
try {
  if (!child.pid) throw new Error('Reviewer did not start');
  const identity = { nonce, pid: child.pid, host: randomUUID(), startedAt: Date.now() };
  const machine = hostname();
  oid = createReviewClaim(root, head, identity);
  writeFileSync(path, JSON.stringify({ ...identity, machine, head, oid, pr, acquired: false }));
  const acquire = () => withReviewTransport(root, lanes.repo, lanes.reviewer, (directory, remote, env) => acquireReviewRef(directory, remote, pr, oid, env));
  let recovered = false;
  if (!acquire()) {
    const prior = sessionClaim(root, lanes.repo, lanes.reviewer, pr);
    if (!prior || !localClaimIsDead(prior, prior.claim?.head) || !releaseSessionClaim(root, lanes.repo, lanes.reviewer, pr, prior.oid) || !acquire()) throw new Error('Reviewer claim is held or unavailable');
    recovered = true;
  }
  acquired = true;
  const current = jsonCommand('gh', ['pr', 'view', pr, '--repo', `github.com/${lanes.repo}`, '--json', 'headRefOid,labels'], { cwd: root });
  if (current.headRefOid !== head || (!recovered && (current.labels || []).some(label => label.name === 'state:reviewing'))) throw new Error('Reviewer head changed or an existing claim is unverified');
  writeFileSync(path, JSON.stringify({ ...identity, machine, head, oid, pr, acquired: true, recovered }));
} catch (error) {
  if (acquired) { try { releaseSessionClaim(root, lanes.repo, lanes.reviewer, pr, oid); } catch { /* retain an unverifiable claim */ } }
  child.kill(); console.error(error.message); process.exitCode = 1;
}
child.on('exit', (code, signal) => { if (!process.exitCode) process.exitCode = code ?? (signal ? 1 : 0); });
