import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deliveryAssignment } from '../../plugins/common/workflow/scripts/lib/drive.mjs';

const adapter = new URL('../../plugins/common/workflow/scripts/agy-session.mjs', import.meta.url).pathname;
test('AGY risk assignment is native, the reviewer is separate and other responsibilities stop', () => {
  const delivery = { orchestrator: 'codex', roles: { devops: { host: 'agy', model: 'model' }, reviewer: { host: 'agy', model: 'model' }, planner: { host: 'agy', model: 'model' } } };
  assert.deepEqual(deliveryAssignment(delivery, { agent: 'devops' }, 'R1'), { host: 'agy', model: 'model', session: 'native' });
  assert.deepEqual(deliveryAssignment(delivery, { agent: 'reviewer' }, 'R1'), { host: 'agy', model: 'model', session: 'separate' });
  assert.throws(() => deliveryAssignment(delivery, { agent: 'planner' }, 'R1'), /unverified/);
});
test('AGY reviewer session verifies role and model, sends the brief and fails clearly', t => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-review-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fake = join(dir, 'agy');
  const script = agents => `#!/bin/sh\ncase "$1" in agents) echo ${agents};; models) echo model;; --agent) [ "$2" = reviewer ] && [ "$3" = --model ] && [ "$4" = model ] && [ "$5" = -p ] && [ "$6" = "Follow your brief at /tmp/brief. Return at most 5 lines." ] || exit 4; echo "approved at abc";; *) exit 5;; esac\n`;
  const run = (role = 'reviewer', model = 'model') => spawnSync(process.execPath, [adapter, fake, role, model, '/tmp/brief'], { encoding: 'utf8' });
  writeFileSync(fake, script('reviewer'), { mode: 0o755 });
  const good = run(); assert.equal(good.status, 0); assert.equal(good.stdout, 'approved at abc\n');
  const model = run('reviewer', 'missing'); assert.equal(model.status, 1); assert.match(model.stderr, /model missing unavailable/);
  writeFileSync(fake, script('devops'), { mode: 0o755 });
  const role = run(); assert.equal(role.status, 1); assert.match(role.stderr, /role reviewer unavailable/);
  writeFileSync(fake, '#!/bin/sh\ncase "$1" in agents) echo reviewer;; models) echo model;; *) echo "a tool required the run_command permission that headless mode cannot prompt for, so it was auto-denied" >&2;; esac\n', { mode: 0o755 });
  const denied = run(); assert.equal(denied.status, 1); assert.match(denied.stderr, /permission was denied/);
  writeFileSync(fake, '#!/bin/sh\ncase "$1" in agents) echo reviewer;; models) echo model;; esac\n', { mode: 0o755 });
  const empty = run(); assert.equal(empty.status, 1); assert.match(empty.stderr, /malformed|empty/);
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
