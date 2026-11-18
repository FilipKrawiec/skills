import { createHash } from 'node:crypto';

export const INBOX_MARKER = '<!-- workflow:owner-inbox -->';
export const INBOX_TITLE = 'Owner inbox';
const STEP_MARKER = /<!-- workflow:owner-step [0-9a-f]+ -->/;
const ITEM = /^- <!-- workflow:inbox (\d+) -->(.*)$/;

const stepText = step => `${step.owner}${step.url ? ` ${step.url}` : ''}`;
export const stepMarker = step => `<!-- workflow:owner-step ${createHash('sha1').update(stepText(step)).digest('hex').slice(0, 12)} -->`;

export function stepComment(owner, n, step) {
  return `${stepMarker(step)}\n@${owner} **Owner step (drive):** ${step.owner}${step.url ? `\n\n${step.url}` : ''}\n\nDecision: act on the link above, then \`drive ${n}\` continues. Every open owner step is listed on the "${INBOX_TITLE}" issue.`;
}

export function parseInbox(body) {
  const items = new Map();
  for (const line of String(body || '').split('\n')) {
    const m = ITEM.exec(line);
    if (m) items.set(Number(m[1]), m[2].trim());
  }
  return items;
}

export function renderInbox(items) {
  const lines = [...items].sort((a, b) => a[0] - b[0]).map(([n, text]) => `- <!-- workflow:inbox ${n} --> ${text}`);
  return `${INBOX_MARKER}\nEvery open owner step in this repository, kept up to date by \`drive\`. A resolved step drops off on the next update.\n\n${lines.length ? lines.join('\n') : '_Nothing waits on the owner._'}\n`;
}

// api: { comments(n), comment(n, body), isOpen(n), findInbox() -> {number, body}|null, createInbox(body) -> number, pin(number), updateBody(number, body) }
// Posts the step once on its issue or PR, then lists it on the inbox; a repeated identical step changes nothing.
export function notifyOwner(api, owner, n, step) {
  const marker = stepMarker(step);
  const last = api.comments(n).filter(c => STEP_MARKER.test(c.body || '')).at(-1);
  if (!last?.body?.includes(marker)) api.comment(n, stepComment(owner, n, step));
  syncInbox(api, items => { items.set(n, `${step.owner}${step.url ? ` ${step.url}` : ''}`.replace(/\s+/g, ' ')); });
}

// Applies `change` to the listed steps, drops resolved (closed) targets, and writes the body only when it differs.
export function syncInbox(api, change, { create = true } = {}) {
  const inbox = api.findInbox();
  const items = parseInbox(inbox?.body);
  change(items);
  for (const n of [...items.keys()]) if (!api.isOpen(n)) items.delete(n);
  const body = renderInbox(items);
  if (!inbox) {
    if (!create || !items.size) return;
    const number = api.createInbox(body);
    api.pin(number);
    return;
  }
  if (inbox.body !== body) api.updateBody(inbox.number, body);
}

// Called when drive returns anything but an owner step for `n`: the step is resolved, so it leaves the list.
export function resolveOwner(api, n) {
  const inbox = api.findInbox();
  if (!inbox || !parseInbox(inbox.body).has(n)) return;
  syncInbox(api, items => items.delete(n), { create: false });
}
