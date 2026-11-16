#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const [executable, role, model, brief] = process.argv.slice(2);
function invoke(args) {
  const result = spawnSync(executable, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`AGY ${args[0]} failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
  if (!result.stdout.trim() && /permission.*(?:denied|cannot prompt)|(?:denied|cannot prompt).*permission/i.test(result.stderr)) throw new Error('AGY headless tool permission was denied; configure the required read permissions in AGY settings and retry');
  return result.stdout;
}
try {
  if (!executable || !['devops', 'reviewer'].includes(role) || !model || !brief) throw new Error('AGY supports only the verified devops risk and reviewer sessions; configure an installed role and model');
  if (!invoke(['agents']).split(/\r?\n/).some(line => line.trim() === role)) throw new Error(`AGY role ${role} unavailable; install the workflow plugin and inspect agy agents`);
  if (!invoke(['models']).split(/\r?\n/).some(line => line.split(/\s+/)[0] === model)) throw new Error(`AGY model ${model} unavailable; inspect agy models`);
  const handBack = invoke(['--agent', role, '--model', model, '-p', role === 'reviewer' ? `Follow your brief at ${brief}. Return at most 5 lines.` : `Follow your brief at ${brief} and return its hand-back.`]);
  if (role === 'reviewer' ? !handBack.trim() : !/^risk: R[012]\r?\nreason: [^\r\n]+\r?\n?$/.test(handBack)) throw new Error('AGY returned a malformed risk hand-back; inspect the session and retry');
  process.stdout.write(handBack);
} catch (error) {
  console.error(`drive: ${error.message}`);
  process.exitCode = 1;
}
