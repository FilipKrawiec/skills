import { reviewAreas } from './vcs.mjs';

// The review packet: the facts drive already knows, in the order a Reviewer reads them. It carries no PR description,
// implementer note or hand-back, so the Reviewer judges the diff against the issue, never against the author's account of it.
export const packetLimits = { fileLines: 200, diffLines: 1500, excerptLines: 40, sites: 8, symbols: 20 };

const truncated = (hidden, what) => `[truncated: ${hidden} more ${what}]`;
const clip = (text, max, what) => {
  const lines = String(text || '').split('\n');
  return lines.length <= max ? lines.join('\n') : `${lines.slice(0, max).join('\n')}\n${truncated(lines.length - max, what)}`;
};
const fence = text => `\`\`\`\n${String(text).replace(/```/g, '`​``')}\n\`\`\``;

// The issue's acceptance criteria verbatim, then its scope packet; the whole body (clipped) when no such section exists.
export function issueCriteria(body = '') {
  const lines = String(body).split('\n');
  const start = lines.findIndex(line => /^#{2,4}\s+acceptance criteria\b/i.test(line));
  let criteria;
  if (start >= 0) {
    const level = /^#+/.exec(lines[start])[0].length;
    let end = lines.length; let inFence = false;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^```/.test(lines[i])) inFence = !inFence;
      if (!inFence && (/^```scope\b/.test(lines[i]) || (/^(#+)\s/.test(lines[i]) && /^#+/.exec(lines[i])[0].length <= level))) { end = i; break; }
    }
    criteria = lines.slice(start, end).join('\n').trimEnd();
  } else criteria = clip(body, 120, 'lines of the issue body');
  const scope = /```scope\b[\s\S]*?```/.exec(body)?.[0] || '(no scope packet)';
  return { criteria, scope };
}
function ciSection(checks, required) {
  if (!checks.length) return 'No checks reported at this head.';
  return checks.map(check => {
    const line = `- ${check.name}${required.includes(check.name) ? ' (required)' : ''}: ${check.state}`;
    return check.excerpt ? `${line}\n${fence(clip(check.excerpt, packetLimits.excerptLines, 'lines of the failing log'))}` : line;
  }).join('\n');
}
function gateSection(gate, head) {
  if (!gate) return 'No project gate result recorded for this worktree.';
  const where = gate.head === head ? 'at this head' : `recorded at ${String(gate.head).slice(0, 7)}, before the commits that reach ${head.slice(0, 7)}`;
  return `${gate.status === 0 || gate.status === 'pass' ? 'pass' : 'fail'} (${where}${gate.at ? `, ${gate.at}` : ''})`;
}
function diffSection(files, diffs, range) {
  const { areas, mechanical } = reviewAreas(files);
  const out = [];
  let budget = packetLimits.diffLines; let omitted = 0;
  for (const area of areas) {
    out.push(`### ${area.area} (+${area.additions} -${area.deletions}, ${area.files.length} ${area.files.length === 1 ? 'file' : 'files'})`);
    for (const path of area.files) {
      const text = diffs[path];
      if (text === undefined || budget <= 0) { omitted += 1; out.push(`#### ${path}\n${truncated(1, `file diff; read it with git diff ${range} -- ${path}`)}`); continue; }
      const shown = clip(text, Math.min(packetLimits.fileLines, budget), `lines of ${path}; read the rest with git diff ${range} -- ${path}`);
      budget -= shown.split('\n').length;
      out.push(`#### ${path}\n${fence(shown)}`);
    }
  }
  if (mechanical.length) out.push(`### Renames (mechanical, no content change)\n${mechanical.map(path => `- ${path}`).join('\n')}`);
  if (!out.length) out.push('No changed files.');
  return out.join('\n\n');
}
function deltaSection(previous, head) {
  if (!previous) return null;
  const files = previous.files || [];
  return `Since your last verdict at ${previous.sha.slice(0, 7)} (now ${head.slice(0, 7)}): ${files.length} changed ${files.length === 1 ? 'file' : 'files'}.\n${files.map(path => `- ${path}`).join('\n') || '- none'}\n\n${fence(clip(previous.diff || '', packetLimits.diffLines, 'lines of the delta'))}`;
}
function threadSection(threads) {
  const open = (threads || []).filter(thread => !thread.isResolved);
  if (!open.length) return 'No open threads.';
  return open.map(thread => `- ${thread.path || '(no file)'}${thread.line ? `:${thread.line}` : ''}${thread.isOutdated ? ' (outdated)' : ''}: ${String(thread.body || '').split('\n')[0].slice(0, 200)}`).join('\n');
}
function siteSection(callSites) {
  if (!callSites?.length) return 'No exported symbol changed, or none found with git grep.';
  return callSites.map(entry => `- \`${entry.symbol}\` (${entry.file}): ${entry.sites.length ? '' : 'no other reference'}${entry.sites.slice(0, packetLimits.sites).map(site => `\n  - ${site}`).join('')}${entry.sites.length > packetLimits.sites ? `\n  - ${truncated(entry.sites.length - packetLimits.sites, 'references')}` : ''}`).join('\n');
}
// raw: { issue:{url,body}, pr:{number,url,head,base}, round, requiredChecks, checks, gate, files, diffs, range, previous, threads, callSites }
export function reviewPacket(raw) {
  const { criteria, scope } = issueCriteria(raw.issue?.body);
  const head = raw.pr.head;
  const parts = [
    `# Review packet: PR #${raw.pr.number} at ${head}, round ${raw.round}`,
    'Facts drive gathered. It leaves out the PR description, implementer notes and hand-back on purpose; check blast radius outside it yourself with `git grep` and Read.',
    `## 1. Issue ${raw.issue?.url || ''}\n\n${criteria}\n\n${scope}`,
    `## 2. CI\n\n${ciSection(raw.checks || [], raw.requiredChecks || [])}`,
    `## 3. Project gate\n\n${gateSection(raw.gate, head)}`,
    `## 4. Diff at head by area\n\n${diffSection(raw.files || [], raw.diffs || {}, raw.range || `${raw.pr.base}...${head}`)}`,
  ];
  const delta = deltaSection(raw.previous, head);
  if (delta) parts.push(`## 5. Delta since the last verdict\n\n${delta}`, `## 6. Open threads\n\n${threadSection(raw.threads)}`);
  parts.push(`## ${delta ? 7 : 5}. Call sites of changed exports\n\n${siteSection(raw.callSites)}`);
  return `${parts.join('\n\n')}\n`;
}
// The exported names a diff adds, for the call-site search.
export function exportedSymbols(diff) {
  const names = new Set();
  for (const line of String(diff).split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const declared = /^\+\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (declared) names.add(declared[1]);
    const listed = /^\+\s*export\s*\{([^}]*)\}/.exec(line);
    if (listed) for (const item of listed[1].split(',')) { const name = item.trim().split(/\s+as\s+/).at(-1); if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name); }
  }
  return [...names].slice(0, packetLimits.symbols);
}
