#!/usr/bin/env node
import { accessSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';

const hook = process.env.WORKFLOW_PRE_PUSH_HOOK;
try { accessSync(hook, constants.X_OK); } catch { process.exit(0); }
const env = { ...process.env };
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']) delete env[key];
for (const key of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM']) {
  const saved = env[`WORKFLOW_HOOK_${key}`];
  if (saved === undefined) delete env[key]; else env[key] = saved;
  delete env[`WORKFLOW_HOOK_${key}`];
}
delete env.WORKFLOW_PRE_PUSH_HOOK;
delete env.WORKFLOW_PUSH_WORKTREE;
const result = spawnSync(hook, process.argv.slice(2), { cwd: process.env.WORKFLOW_PUSH_WORKTREE, env, stdio: 'inherit' });
process.exit(result.status ?? 1);
