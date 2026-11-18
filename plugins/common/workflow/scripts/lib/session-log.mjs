import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { run } from './core.mjs';
import { parseUsageLine, transcriptUsage } from './usage.mjs';

// Every session drive starts for a PR leaves one PR comment (role, model, effort, duration, usage, outcome) linking its redacted
// transcript, a file in one secret gist per PR owned by the implementer bot. Nothing here may block a delivery: a failure is logged
// to the runner log directory and the session is commented as missing once. Gists and comments are never deleted.

export const redacted = '[REDACTED]';
const marker = /<!-- workflow:session-log (\{.*?\}) -->/s;
const maxBytes = 4 * 1024 * 1024;

// Token shapes that are secrets wherever they appear.
const tokenPatterns = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bsk-ant-[A-Za-z0-9_-]{10,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bBearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]{8,}/gi,
];
const privateKeyBlock = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const privateKeyHeader = /-----BEGIN [A-Z ]*PRIVATE KEY-----[^"]*/g;
const authorization = /(authorization["'\\]*\s*[:=]\s*["'\\]*)(?:(bearer|basic|token)\s+)?(?!\[REDACTED\])[^\s"'\\,]+/gi;
const secretAssignment = /\b([A-Za-z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD)[A-Za-z0-9_]*)=(?!\[REDACTED\])[^\s"'\\]+/gi;
const secretName = /TOKEN|SECRET|KEY|PASSWORD/i;
const secretValues = env => Object.entries(env).filter(([name, value]) => secretName.test(name) && typeof value === 'string' && value.length >= 8).map(([, value]) => value);

export function redact(text, env = process.env) {
  let out = String(text);
  for (const value of secretValues(env)) out = out.split(value).join(redacted);
  out = out.replace(privateKeyBlock, redacted).replace(privateKeyHeader, redacted);
  out = out.replace(authorization, (_, head, scheme) => `${head}${scheme ? `${scheme} ` : ''}${redacted}`);
  for (const pattern of tokenPatterns) out = out.replace(pattern, redacted);
  return out.replace(secretAssignment, (_, name) => `${name}=${redacted}`);
}
// The first known secret shape still in `text`, as a label; null when none. Checked after redaction, before anything is uploaded.
export function survivingSecret(text, env = process.env) {
  const body = String(text);
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(body)) return 'private key';
  const token = tokenPatterns.find(pattern => new RegExp(pattern.source, pattern.flags.replace('g', '')).test(body));
  if (token) return 'token';
  if (new RegExp(authorization.source, 'i').test(body.replace(/authorization["'\\]*\s*[:=]\s*["'\\]*(?:(?:bearer|basic|token)\s+)?\[REDACTED\]/gi, ''))) return 'authorization value';
  return secretValues(env).some(value => body.includes(value)) ? 'environment secret' : null;
}

// ---- the transcript store: Claude Code's JSONL files under ~/.claude/projects

export const transcriptRoot = () => join(homedir(), '.claude', 'projects');
export const fsStore = (root = transcriptRoot()) => ({
  files() {
    const found = [];
    const walk = directory => {
      let entries = [];
      try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.jsonl')) { try { found.push({ path, mtime: statSync(path).mtimeMs }); } catch { /* vanished */ } }
      }
    };
    walk(root);
    return found.sort((a, b) => b.mtime - a.mtime).map(file => file.path);
  },
  read: path => readFileSync(path, 'utf8'),
});
// The transcript of the session drive issued `id` to: a file named for the id, else the newest file that carries it (the brief
// the agent read, or the environment of a runner-started session). Null when none is found.
export function locateTranscript(id, store = fsStore()) {
  if (!id) return null;
  const files = store.files();
  const named = files.find(path => path.split('/').pop().includes(id));
  if (named) return named;
  return files.find(path => { try { return store.read(path).includes(id); } catch { return false; } }) || null;
}
function timeSpan(text) {
  const times = String(text).split('\n').map(line => { try { return Date.parse(JSON.parse(line).timestamp); } catch { return NaN; } }).filter(Number.isFinite);
  return times.length > 1 ? Math.max(...times) - Math.min(...times) : null;
}
const clip = text => {
  if (Buffer.byteLength(text) <= maxBytes) return text;
  const lines = text.split('\n');
  while (Buffer.byteLength(lines.join('\n')) > maxBytes && lines.length > 1) lines.shift();
  return `${JSON.stringify({ truncated: 'earlier lines dropped to fit the gist' })}\n${lines.join('\n')}`;
};

// ---- the per-session records kept in the PR's comments

export function parseSessionLogs(comments = [], author) {
  const records = [];
  for (const comment of comments) {
    const login = (comment.user?.login ?? comment.author?.login)?.toLowerCase();
    if (author && login !== author.toLowerCase()) continue;
    let record;
    try { record = JSON.parse(marker.exec(comment.body || '')?.[1]); } catch { record = null; }
    if (record && typeof record.id === 'string') records.push({ ...record, commentId: comment.id });
  }
  return records;
}
// The usage rows these records carry, keyed `session-<id>`: `status` totals them by role and model beside the usage comment's.
export function sessionLogEntries(comments, author) {
  return parseSessionLogs(comments, author).filter(record => !record.missing).map(record => ({
    role: record.role, host: record.host || 'unreported', model: record.model || 'unreported', effort: record.effort || 'unreported',
    input: record.input ?? null, output: record.output ?? null, cacheRead: record.cacheRead ?? null, cacheWrite: record.cacheWrite ?? null, cost: record.cost ?? null, key: `session-${record.id}`,
  }));
}
const duration = ms => {
  if (!Number.isFinite(ms)) return 'unreported';
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
};
const tokens = record => (['input', 'output', 'cacheRead'].some(field => record[field] != null) ? `${record.input ?? '?'} in / ${record.output ?? '?'} out / ${record.cacheRead ?? '?'} cache${record.cost != null ? ` / $${Number(record.cost).toFixed(2)}` : ''}` : 'unreported');
const anchor = name => `file-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
export function sessionComment(record) {
  const json = JSON.stringify(record).replace(/-->/g, '--\\u003e');
  if (record.missing) return `<!-- workflow:session-log ${json} -->\n**Session log: ${record.role}** was not collected (${record.reason}). Outcome: ${record.outcome || 'unreported'}.\n`;
  return `<!-- workflow:session-log ${json} -->
**Session log: ${record.role}**

| Role | Model | Effort | Duration | Usage | Outcome |
| --- | --- | --- | --- | --- | --- |
| ${record.role} | ${record.model} | ${record.effort} | ${duration(record.durationMs)} | ${tokens(record)} | ${record.outcome || 'unreported'} |

Redacted transcript: [${record.file}](${record.gistUrl}#${anchor(record.file)})
`;
}

// ---- GitHub through `gh` (injected as `api(args, input)` so tests run with a fake)

export function githubApi(repo, pr, api = (args, input) => JSON.parse(run('gh', args, input === undefined ? {} : { input }) || 'null')) {
  const json = (method, path, body) => api(['api', '--method', method, path, '--input', '-'], JSON.stringify(body));
  return {
    comments: () => api(['api', '--paginate', '--slurp', `repos/${repo}/issues/${pr}/comments?per_page=100`]).flat(),
    postComment: body => json('POST', `repos/${repo}/issues/${pr}/comments`, { body }),
    patchComment: (id, body) => json('PATCH', `repos/${repo}/issues/comments/${id}`, { body }),
    createGist: (name, content) => json('POST', 'gists', { description: `Workflow session logs for ${repo}#${pr}`, public: false, files: { [name]: { content } } }),
    addGistFile: (id, name, content) => json('PATCH', `gists/${id}`, { files: { [name]: { content } } }),
    gistFiles: id => Object.keys(api(['api', `gists/${id}`]).files || {}),
  };
}
export const sessionLogDirectory = repo => join(homedir(), 'Library', 'Logs', 'workflow-runner', repo.replace(/[^A-Za-z0-9._-]+/g, '-'));
const noteFailure = (directory, line) => { try { mkdirSync(directory, { recursive: true }); appendFileSync(join(directory, 'session-log.log'), `${new Date().toISOString()} ${line}\n`); } catch { /* the log is best effort */ } };

// Collects one session: locate, redact, refuse on a surviving secret, upload, comment once. Returns what happened; never throws.
// `session` is { id, role, status|outcome, usage (a hand-back `usage:` line), model, effort }.
export function collectSession({ repo, pr, author, session, github = githubApi(repo, pr), store = fsStore(), logDirectory = sessionLogDirectory(repo), env = process.env, redactor = redact }) {
  const { id, role } = session;
  const base = { id, role, outcome: session.outcome || session.status || null };
  try {
    const records = parseSessionLogs(github.comments(), author);
    const existing = records.find(record => record.id === id);
    if (existing && !existing.missing) return { skipped: 'collected' };
    try {
      const path = locateTranscript(id, store);
      if (!path) throw new Error('no transcript found for the session id');
      const raw = store.read(path);
      const text = clip(redactor(raw, env));
      const leak = survivingSecret(text, env);
      if (leak) throw new Error(`upload refused: a ${leak} survived redaction`);
      const stated = parseUsageLine(session.usage);
      const found = transcriptUsage(raw);
      const usage = stated?.usage || found?.usage || {};
      const owned = records.filter(record => record.gist && !record.missing);
      const gist = owned[0]?.gist;
      const prior = gist ? github.gistFiles(gist) : [];
      const file = prior.find(name => name.includes(`-${id}.`)) || `${role}-${prior.length + 1}-${id}.jsonl`;
      let created;
      if (gist) created = { id: gist, html_url: owned[0].gistUrl, ...github.addGistFile(gist, file, text) };
      else created = github.createGist(file, text);
      const record = { ...base, host: stated?.host || 'claude', model: stated?.model || session.model || found?.model || 'unreported', effort: stated?.effort || session.effort || 'unreported',
        durationMs: timeSpan(raw), input: usage.input ?? null, output: usage.output ?? null, cacheRead: usage.cacheRead ?? null, cacheWrite: usage.cacheWrite ?? null, cost: usage.cost ?? null,
        gist: created.id || gist, gistUrl: created.html_url || owned[0]?.gistUrl, file };
      const body = sessionComment(record);
      if (existing) github.patchComment(existing.commentId, body); else github.postComment(body);
      return { collected: file };
    } catch (error) {
      const reason = String(error.message).replace(/\s+/g, ' ').slice(0, 160);
      noteFailure(logDirectory, `#${pr} ${role} ${id}: ${reason}`);
      if (!existing) github.postComment(sessionComment({ ...base, missing: true, reason }));
      return { failed: reason };
    }
  } catch (error) {
    noteFailure(logDirectory, `#${pr} ${role} ${id}: ${String(error.message).replace(/\s+/g, ' ').slice(0, 160)}`);
    return { failed: String(error.message) };
  }
}
