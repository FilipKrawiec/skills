import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';

const builtIn = new Set(['implementer', 'freshImplementer', 'reviewer', 'planner', 'devops', 'improver']);

// A separate session is advisory work; it cannot take over delivery or review authority.
export function runResponsibility(delivery, name, brief, runner = spawnSync) {
  if (!/^[a-z][a-z0-9-]*$/.test(name) || builtIn.has(name)) throw new Error('Choose a custom responsibility name, not a built-in role');
  if (!brief || typeof brief !== 'string') throw new Error('Provide a brief path');
  if (!delivery || !['codex', 'claude'].includes(delivery.orchestrator)) throw new Error('Configure a supported delivery orchestrator');
  const role = delivery.roles?.[name];
  if (!role || !['codex', 'claude', 'agy'].includes(role.host) || typeof role.model !== 'string' || !role.model.trim()) throw new Error(`Configure delivery.roles.${name} with a supported host and model`);
  if (role.host === 'agy') {
    try { brief = realpathSync(brief); readFileSync(brief); }
    catch (error) { throw new Error(`Cannot read brief: ${error.message}`); }
    if (/[()*?\[\]{}\\!\r\n]/.test(brief)) throw new Error('Unsafe AGY brief path: permission metacharacters are not allowed');
  }
  const executable = delivery.executables?.[role.host] ?? role.host;
  if (typeof executable !== 'string' || !executable.trim()) throw new Error(`Configure delivery.executables.${role.host} as an executable path`);
  const prompt = `Your responsibility: ${name}. Follow your brief at ${brief} and return its hand-back.`;
  const args = role.host === 'codex' ? ['exec', '-m', role.model, prompt]
    : role.host === 'agy' ? ['--settings', JSON.stringify({ permissions: { allow: [`read_file(${brief})`] } }), '--model', role.model, '--print-timeout', '60s', '-p', prompt]
      : ['--print', '--model', role.model, '--permission-mode', 'auto', prompt];
  const result = runner(executable, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${role.host} ${name} failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
  const output = result.stdout || '';
  if (!/^status: (done|blocked|replan)\r?\nnote: \S[^\r\n]*(?:\r?\n)?$/.test(output)) throw new Error(`${role.host} ${name} returned a malformed hand-back; require status and note`);
  return output;
}
