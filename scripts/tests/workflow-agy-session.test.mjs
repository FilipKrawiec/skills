import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deliveryAssignment } from '../../plugins/common/workflow/scripts/lib/drive.mjs';

const adapter = new URL('../../plugins/common/workflow/scripts/agy-session.mjs', import.meta.url).pathname;
test('AGY risk assignment is native and other delivery responsibilities stop', () => {
  const delivery = { orchestrator: 'codex', roles: { devops: { host: 'agy', model: 'model' }, planner: { host: 'agy', model: 'model' } } };
  assert.deepEqual(deliveryAssignment(delivery, { agent: 'devops' }, 'R1'), { host: 'agy', model: 'model', effort: 'medium', session: 'native' });
  assert.throws(() => deliveryAssignment(delivery, { agent: 'planner' }, 'R1'), /unverified/);
});
test('the native devops session refuses the reviewer role: AGY is advisory only', () => {
  const result = spawnSync(process.execPath, [adapter, 'agy', 'reviewer', 'model', '/tmp/brief'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /advisory only.*only the verified devops/);
});
test('native session checks role and model, passes arguments and preserves the hand-back', t => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-test-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fake = join(dir, 'agy');
  writeFileSync(fake, '#!/bin/sh\ncase "$1" in agents) echo devops;; models) printf "model\\tModel\\n";; --agent) [ "$2" = devops ] && [ "$3" = --model ] && [ "$4" = model ] && [ "$5" = -p ] && [ "$6" = "Follow your brief at /tmp/brief and return its hand-back." ] || exit 4; printf "risk: R1\\nreason: evidence\\n";; *) exit 5;; esac\n', { mode: 0o755 });
  const run = (role, model) => spawnSync(process.execPath, [adapter, fake, role, model, '/tmp/brief'], { encoding: 'utf8' });
  const good = run('devops', 'model'); assert.equal(good.status, 0); assert.equal(good.stdout, 'risk: R1\nreason: evidence\n');
  const missing = run('devops', 'missing'); assert.equal(missing.status, 1); assert.match(missing.stderr, /model missing unavailable/);
  const unsupported = run('planner', 'model'); assert.equal(unsupported.status, 1); assert.match(unsupported.stderr, /only the verified devops/);
  writeFileSync(fake, '#!/bin/sh\ncase "$1" in agents) echo devops;; models) echo model;; *) echo invalid;; esac\n', { mode: 0o755 });
  writeFileSync(fake, '#!/bin/sh\ncase "$1" in agents) echo devops;; models) echo model;; *) echo "a tool required the read_file permission that headless mode cannot prompt for, so it was auto-denied" >&2;; esac\n', { mode: 0o755 });
  const denied = run('devops', 'model'); assert.equal(denied.status, 1); assert.match(denied.stderr, /headless tool permission was denied/);
  writeFileSync(fake, '#!/bin/sh\ncase "$1" in agents) echo devops;; models) echo model;; *) echo invalid;; esac\n', { mode: 0o755 });
  const malformed = run('devops', 'model'); assert.equal(malformed.status, 1); assert.match(malformed.stderr, /malformed/);
});
