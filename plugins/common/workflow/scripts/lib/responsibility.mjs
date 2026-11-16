import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';

const builtIn = new Set(['implementer', 'freshImplementer', 'reviewer', 'planner', 'devops', 'improver']);

// A separate session is advisory work; it cannot take over delivery or review authority.
export function runResponsibility(delivery, name, brief, runner = spawnSync) {
  if (!/^[a-z][a-z0-9-]*$/.test(name) || builtIn.has(name)) throw new Error('Choose a custom responsibility name, not a built-in role');
  if (!brief || typeof brief !== 'string') throw new Error('Provide a brief path');
  if (!delivery || !['codex', 'claude'].includes(delivery.orchestrator)) throw new Error('Configure a supported delivery orchestrator');
  const configured = delivery.roles?.[name];
  const choices = Array.isArray(configured) ? configured : [configured];
  if (!choices.length || choices.some(role => !role || !['codex', 'claude', 'agy'].includes(role.host) || typeof role.model !== 'string' || !role.model.trim())) throw new Error(`Configure delivery.roles.${name} with a supported host and model`);
  for (const [index, role] of choices.entries()) {
    const resume = `Inspect the session and work state before resuming; to choose another candidate, reorder delivery.roles.${name} and rerun responsibility ${name} ${brief}`;
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
    if (result.error?.code === 'ENOENT') {
      console.error(`${role.host} ${role.model} unavailable: executable ${executable} did not start`);
      if (index + 1 < choices.length) continue;
      throw new Error(`All configured candidates unavailable. Install an executable or change delivery.roles.${name}; ${resume}`);
    }
    if (result.error || result.status !== 0) throw new Error(`${role.host} ${name} failed: ${result.error?.message || result.stderr || `exit ${result.status}`}; output: ${result.stdout || '(none)'}; ${resume}`);
    const output = result.stdout || '';
    if (!/^status: (done|blocked|replan)\r?\nnote: \S[^\r\n]*(?:\r?\n)?$/.test(output)) throw new Error(`${role.host} ${name} returned a malformed hand-back; require status and note; output: ${output}; ${resume}`);
    if (choices.length > 1) console.error(`Selected ${role.host} ${role.model}`);
    return output;
  }
}
