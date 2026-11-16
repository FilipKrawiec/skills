import { createHash } from 'node:crypto';
import { jsonCommand, run } from './core.mjs';

// Session usage: parsed from a host's machine-readable output, kept as entries in one PR comment, summed by role and model.
// Nothing here may fail a delivery: a parse failure or a missing field reads as "unreported".

export const unreported = 'unreported';
export const usageBaseline = '2026-11-16 dry-run baseline (Opus reviews without a packet): $0.21-0.46 per review';
const usageMarker = /<!-- workflow:usage (\{.*?\}) -->/s;
const maxEntries = 200;
const count = value => (Number.isFinite(value) && value >= 0 ? value : null);
const empty = { input: null, output: null, cacheRead: null, cacheWrite: null, cost: null };

// The host a separate-session command talks to, read from the flags drive put on it.
export function usageHost(command = []) {
  if (command.includes('--output-format') && command[command.indexOf('--output-format') + 1] === 'json') return 'claude';
  if (command[1] === 'exec' && command.includes('--json')) return 'codex';
  return null;
}
export function commandModel(command = []) {
  const at = command.findIndex(arg => arg === '--model' || arg === '-m');
  return at >= 0 && typeof command[at + 1] === 'string' ? command[at + 1] : null;
}
const parseJson = text => { try { return JSON.parse(text); } catch { return undefined; } };
// `claude --print --output-format json` prints one result object (or, in some builds, an array of events ending with it).
function claudeResult(text) {
  const parsed = parseJson(String(text).trim());
  const result = Array.isArray(parsed) ? parsed.filter(event => event?.type === 'result').at(-1) : parsed;
  return result && typeof result === 'object' && ('result' in result || 'usage' in result) ? result : null;
}
// `codex exec --json` prints one event per line: the answer is the last agent message, usage is summed over turns.
function codexEvents(text) {
  return String(text).split('\n').map(line => parseJson(line.trim())).filter(event => event && typeof event === 'object');
}
// Returns { input, output, cacheRead, cacheWrite, cost } with null for what the host did not report; null when nothing parsed.
export function parseUsage(host, text) {
  try {
    if (host === 'claude') {
      const result = claudeResult(text);
      const usage = result?.usage;
      if (!usage) return null;
      return { input: count(usage.input_tokens), output: count(usage.output_tokens), cacheRead: count(usage.cache_read_input_tokens), cacheWrite: count(usage.cache_creation_input_tokens), cost: count(result.total_cost_usd) };
    }
    if (host === 'codex') {
      const turns = codexEvents(text).filter(event => event.type === 'turn.completed' && event.usage);
      if (!turns.length) return null;
      const sum = key => (turns.some(turn => count(turn.usage[key]) !== null) ? turns.reduce((total, turn) => total + (count(turn.usage[key]) || 0), 0) : null);
      return { input: sum('input_tokens'), output: sum('output_tokens'), cacheRead: sum('cached_input_tokens'), cacheWrite: null, cost: null };
    }
  } catch { /* unreported */ }
  return null;
}
// What the session printed before drive asked for machine-readable output; raw text when it cannot be parsed.
export function visibleResult(host, text) {
  try {
    if (host === 'claude') { const result = claudeResult(text); if (typeof result?.result === 'string') return result.result; }
    if (host === 'codex') { const message = codexEvents(text).filter(event => event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string').at(-1); if (message) return message.item.text; }
  } catch { /* print the raw text */ }
  return String(text);
}
// A subagent hand-back may carry `usage: in=1200 out=300 cache=5000 cache_write=40 cost=0.12 model=sonnet host=claude`.
export function parseUsageLine(line) {
  if (typeof line !== 'string' || !line.trim()) return null;
  const fields = Object.fromEntries([...line.matchAll(/(\w+)=(\S+)/g)].map(match => [match[1].toLowerCase(), match[2]]));
  const number = key => (/^\d+(\.\d+)?$/.test(fields[key] || '') ? Number(fields[key]) : null);
  const usage = { input: number('in'), output: number('out'), cacheRead: number('cache'), cacheWrite: number('cache_write'), cost: number('cost') };
  return { usage: Object.values(usage).some(value => value !== null) ? usage : null, model: fields.model || null, host: fields.host || null };
}
export function usageEntry({ role, host, model, usage, key }) {
  const entry = { role: String(role), host: host || unreported, model: model || unreported, ...(usage || empty) };
  entry.key = key || createHash('sha1').update(JSON.stringify([entry, Date.now(), Math.random()])).digest('hex').slice(0, 12);
  return entry;
}
const reported = entry => ['input', 'output', 'cacheRead', 'cacheWrite', 'cost'].some(field => entry[field] !== null && entry[field] !== undefined);
// Totals by role, model and host; a row whose sessions reported nothing stays "unreported" rather than zero.
export function usageTotals(entries = []) {
  const rows = new Map();
  for (const entry of entries) {
    const id = [entry.role, entry.model, entry.host].join('\0');
    const row = rows.get(id) || { role: entry.role, model: entry.model, host: entry.host, sessions: 0, reported: 0, input: null, output: null, cacheRead: null, cacheWrite: null, cost: null };
    row.sessions += 1;
    if (reported(entry)) row.reported += 1;
    for (const field of ['input', 'output', 'cacheRead', 'cacheWrite', 'cost']) if (count(entry[field]) !== null) row[field] = (row[field] || 0) + entry[field];
    rows.set(id, row);
  }
  return [...rows.values()].sort((a, b) => a.role.localeCompare(b.role) || a.model.localeCompare(b.model));
}
// The shape `status` prints: the table rows, with "unreported" where a host gave no data.
export function usageSummary(entries = []) {
  if (!entries.length) return unreported;
  return usageTotals(entries).map(row => Object.fromEntries(Object.entries(row).map(([field, value]) => [field, value === null ? unreported : value])));
}
const cell = (value, cost) => (value === null ? unreported : cost ? `$${value.toFixed(2)}` : String(value));
export function usageComment(entries) {
  const kept = entries.slice(-maxEntries);
  const rows = usageTotals(kept).map(row => `| ${row.role} | ${row.model} | ${row.host} | ${row.sessions} | ${cell(row.input)} | ${cell(row.output)} | ${cell(row.cacheRead)} | ${cell(row.cost, true)} |`);
  return `<!-- workflow:usage ${JSON.stringify({ entries: kept }).replace(/-->/g, '--\\u003e')} -->
**Workflow usage**

| Role | Model | Host | Sessions | Input | Output | Cache read | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

Baseline: ${usageBaseline}.
`;
}
export function parseUsageComment(body) {
  const match = usageMarker.exec(body || '');
  const parsed = match ? parseJson(match[1]) : undefined;
  return Array.isArray(parsed?.entries) ? parsed.entries.filter(entry => entry && typeof entry.role === 'string') : null;
}
// The newest usage comment `author` wrote; `author` is drive's identity, so a stranger's marker is never counted.
export function findUsageComment(comments = [], author) {
  for (const comment of [...comments].reverse()) {
    const login = (comment.user?.login ?? comment.author?.login)?.toLowerCase();
    if (author && login !== author.toLowerCase()) continue;
    const entries = parseUsageComment(comment.body);
    if (entries) return { id: comment.id, entries };
  }
  return null;
}
// Adds one entry to the PR's usage comment, creating it on the first session. Never throws: usage must not block a step.
export function recordUsage({ repo, pr, author, entry }, { gh = args => jsonCommand('gh', args), write = args => run('gh', args) } = {}) {
  try {
    const comments = gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${pr}/comments?per_page=100`]).flat();
    const found = findUsageComment(comments, author);
    const entries = found?.entries || [];
    if (entry.key && entries.some(existing => existing.key === entry.key)) return true;
    const body = usageComment([...entries, entry]);
    if (found) write(['api', '--method', 'PATCH', `repos/${repo}/issues/comments/${found.id}`, '-f', `body=${body}`]);
    else write(['api', '--method', 'POST', `repos/${repo}/issues/${pr}/comments`, '-f', `body=${body}`]);
    return true;
  } catch (error) {
    console.error(`workflow: usage not recorded for #${pr} (${String(error.message).replace(/\s+/g, ' ').slice(0, 120)})`);
    return false;
  }
}
