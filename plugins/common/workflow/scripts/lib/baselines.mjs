// Gate baselines: tracked files named `*baseline*` whose entries carry the issue that removes them as a `#N` tag
// (for example `foo.bar  # #1290`). A gate rejects an entry whose issue is closed, so closing an issue that entries
// still name breaks every PR; drive retags them to one open follow-up before the PR that closes the issue merges.
export const BASELINE_MARKER = parent => `<!-- workflow:baseline-follow-up ${parent ?? 'none'} -->`;
const maxBytes = 1_000_000;
export const isBaselinePath = path => /baseline/i.test(path.split('/').pop()) && !/\.(md|mjs|js|ts|json|png|jpe?g|gif|zip)$/i.test(path);
const tag = n => new RegExp(`(?<![\\w#])#${n}(?!\\d)`, 'g');
// The files (path and text) with at least one entry tagged with issue `n`.
export function baselineRefs(files, n) {
  return files.filter(file => file.text.length <= maxBytes && tag(n).test(file.text));
}
// The same text with every `#from` tag now `#to`; other lines stay byte for byte.
export const retagBaseline = (text, from, to) => text.replace(tag(from), `#${to}`);
// The one open follow-up for the work that removes the entries: an open issue under the same epic (or standalone) carrying
// the parent's marker is reused, else one is created under that epic. `ops`: openIssues(), create(parent, title, body) -> number.
export function baselineFollowUp(ops, issue, parent, refs) {
  const marker = BASELINE_MARKER(parent);
  const existing = ops.openIssues().filter(open => (open.body || '').includes(marker) && open.number !== issue.number).sort((a, b) => a.number - b.number)[0];
  if (existing) return existing.number;
  const paths = refs.map(file => `\`${file.path}\``).join(', ');
  const body = `${marker}\n\n## Outcome\nRemove the gate baseline entries in ${paths} that #${issue.number} left behind, and retag any it cannot remove.\n\n### Acceptance criteria\n- [ ] No entry in ${paths} is tagged #${issue.number} or this issue; each is fixed and deleted.\n\nDrive filed this on closing #${issue.number}: a baseline entry naming a closed issue fails the gate on every PR.\n`;
  return ops.create(parent, `chore(baseline): remove the gate baseline entries left by #${issue.number}`, body);
}
