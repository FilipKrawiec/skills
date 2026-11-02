#!/usr/bin/env node
// PreToolUse guard: in a repository with .agents/config.json, commits and pushes go through the workflow CLI,
// which authors as the implementer and checks scope; plain git would act as the host's Git user.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GLOBAL_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']);

export function blockedGitSubcommand(command) {
  for (const segment of String(command).split(/&&|\|\||[;|\n&()]/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
    if (['env', 'command', 'exec', 'sudo'].includes(words[i])) i++;
    while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
    if (!/(^|\/)git$/.test(words[i] || '')) continue;
    i++;
    while (i < words.length && words[i].startsWith('-')) i += GLOBAL_OPTIONS_WITH_VALUE.has(words[i]) ? 2 : 1;
    if (['commit', 'push'].includes(words[i])) return words[i];
    // A merge may stop before committing; the CLI's commit then records it as the implementer.
    if (words[i] === 'merge' && !words.slice(i + 1).some(word => ['--no-commit', '--abort', '--quit'].includes(word))) return 'merge';
  }
  return null;
}

function governed(cwd) {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  return top.status === 0 && existsSync(join(top.stdout.trim(), '.agents', 'config.json'));
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
  const subcommand = blockedGitSubcommand(input?.tool_input?.command || '');
  if (!subcommand || !governed(input?.cwd || process.cwd())) process.exit(0);
  const cli = join(dirname(fileURLToPath(import.meta.url)), 'workflow.mjs');
  const commit = `node ${cli} commit --message "<conventional message>" -- <paths>`;
  const usage = { commit, push: `node ${cli} push`, merge: `git merge --no-commit <base>, resolve any conflicts, then ${commit}` }[subcommand];
  process.stderr.write(`Plain git ${subcommand} is blocked here: it would act as this host's Git user. Use the vcs skill: ${usage}\n`);
  process.exit(2);
}
