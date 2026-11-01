import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseYaml } from './yaml-lite.mjs';

function frontmatter(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return {};
  const end = lines.indexOf('---', 1);
  if (end < 0) return {};
  try { return parseYaml(lines.slice(1, end).join('\n')); }
  catch { return {}; }
}
function findAgents(start) {
  let current = resolve(start);
  while (true) {
    const candidate = resolve(current, 'AGENTS.md');
    if (existsSync(candidate)) {
      try { const config = frontmatter(candidate); if (Object.keys(config).length) return { root: current, config }; } catch {}
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Could not find valid AGENTS.md with frontmatter in hierarchy');
}
function detectTool(root, config) {
  const tools = config.build_tools && typeof config.build_tools === 'object' ? config.build_tools : {};
  let fallback;
  for (const [name, settings] of Object.entries(tools)) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) continue;
    if (!settings.build_script) { fallback ||= [name, settings]; continue; }
    const path = resolve(root, settings.build_script);
    if (!existsSync(path)) continue;
    if (settings.contains) {
      try { if (!readFileSync(path, 'utf8').includes(settings.contains)) continue; } catch { continue; }
    }
    return [name, settings];
  }
  return fallback || ['default', {}];
}
function pythonRepr(value) {
  if (Array.isArray(value)) return `[${value.map(pythonRepr).join(', ')}]`;
  if (typeof value === 'string') return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  if (value && typeof value === 'object') return `{${Object.entries(value).map(([key, item]) => `${pythonRepr(key)}: ${pythonRepr(item)}`).join(', ')}}`;
  return String(value);
}
function run(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
}

export function projectVerify(args = []) {
  let root = process.cwd(), strict = false, task;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--root') { if (!args[index + 1]) throw new Error('--root requires a directory'); root = args[++index]; }
    else if (args[index] === '--strict-git') strict = true;
    else if (!task) task = args[index];
    else throw new Error('Usage: workflow project [--root DIR] [--strict-git] [TASK]');
  }
  task ||= 'verify';
  const found = findAgents(root);
  const [tool, settings] = detectTool(found.root, found.config);
  if (task === 'status') {
    const active = found.config.active_skills || [];
    const tasks = settings.lifecycle_tasks && typeof settings.lifecycle_tasks === 'object' ? Object.keys(settings.lifecycle_tasks) : [];
    console.log(`Project Root: ${found.root}`);
    console.log(`Active Skills: ${pythonRepr(active)}`);
    console.log(`Detected Tool: '${tool}' (via build_script: '${settings.build_script || 'N/A'}')`);
    console.log(`Available Tasks: ${pythonRepr(tasks)}`);
    return 0;
  }
  const tasks = settings.lifecycle_tasks && typeof settings.lifecycle_tasks === 'object' ? settings.lifecycle_tasks : {};
  const command = tasks[task];
  if (typeof command !== 'string' || !command.trim()) throw new Error(`Task '${task}' not found or empty for tool '${tool}'. Available: ${Object.keys(tasks).join(', ')}`);
  console.log(`=== Executing [${tool}] task '${task}' -> '${command}' ===`);
  const executed = run(command, [], { cwd: found.root, shell: true, stdio: 'inherit' });
  if (executed.status !== 0) throw new Error(`Task '${task}' failed with exit code ${executed.status}`);
  if (task === 'verify') {
    const gitStatus = run('git', ['-C', found.root, 'status', '--porcelain'], { encoding: 'utf8' });
    if (gitStatus.status === 0 && gitStatus.stdout.trim()) {
      if (strict || process.env.CI === 'true' || process.env.STRICT_GIT === '1') throw new Error('Git worktree has uncommitted changes (strict git hygiene enforced)');
      console.error('WARNING: Git worktree has uncommitted changes');
    }
  }
  console.log(`PASS: Task '${task}' completed successfully.`);
  return 0;
}
