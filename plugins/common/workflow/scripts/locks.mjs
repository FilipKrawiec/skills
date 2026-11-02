import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Both lockf (EX_TEMPFAIL) and flock -E report a lock timeout as 75, so it never reads as a command failure.
export const lockTimeoutStatus = 75;
export function runWithLocks(directory, names, command, args, { timeoutSeconds = 300, env = process.env, cwd = process.cwd() } = {}) {
  if (!Array.isArray(names) || names.some(name => !/^[a-z0-9-]+$/.test(name))) throw new Error('Invalid workflow lock name');
  const ordered = [...new Set(names)].sort();
  if (!ordered.length) return spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error(`Workflow advisory locks are unsupported on ${process.platform}`);
  const token = randomUUID();
  mkdirSync(directory, { recursive: true });
  const proofPath = join(directory, `.context-${token}.json`);
  try {
    writeFileSync(proofPath, JSON.stringify({ token, names: ordered }), { flag: 'wx', mode: 0o600 });
    const lockEnv = { ...env, WORKFLOW_LOCK_NAMES: ordered.join(','), WORKFLOW_LOCK_TOKEN: token, WORKFLOW_LOCK_PROOF: proofPath, WORKFLOW_LOCK_OWNER_PID: String(process.pid) };
    let argv = [command, ...args];
    for (const name of ordered.reverse()) {
      const path = join(directory, `${name}.lock`);
      writeFileSync(path, '', { flag: 'a' });
      if (process.platform === 'darwin') argv = ['lockf', '-t', String(timeoutSeconds), path, ...argv];
      else argv = ['flock', '-F', '-E', String(lockTimeoutStatus), '-w', String(timeoutSeconds), path, ...argv];
    }
    const result = spawnSync(argv[0], argv.slice(1), { cwd, env: lockEnv, stdio: 'inherit' });
    if (result.error) throw new Error(`Cannot start workflow lock command: ${result.error.message}`);
    return result;
  } finally { rmSync(proofPath, { force: true }); }
}
