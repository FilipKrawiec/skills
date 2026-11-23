import assert from 'node:assert/strict';
import test from 'node:test';
import { INBOX_MARKER, notifyOwner, resolveOwner } from '../../plugins/common/workflow/scripts/lib/inbox.mjs';

function fakeGithub(open = [3, 4]) {
  const g = { comments: {}, inbox: null, pinned: [], writes: 0, open: new Set(open), next: 100 };
  g.api = {
    comments: n => g.comments[n] || [],
    comment: (n, body) => { (g.comments[n] ||= []).push({ body }); },
    isOpen: n => g.open.has(n),
    findInbox: () => g.inbox,
    createInbox: body => { g.inbox = { number: g.next, body }; g.writes++; return g.next; },
    pin: n => g.pinned.push(n),
    updateBody: (n, body) => { g.inbox = { number: n, body }; g.writes++; },
  };
  return g;
}
const step = (n, url) => ({ owner: `#${n} needs a decision`, url });

test('an owner step posts once with an @-mention and a repeat posts nothing', () => {
  const g = fakeGithub();
  notifyOwner(g.api, 'alice', 3, step(3, 'https://x/3'));
  notifyOwner(g.api, 'alice', 3, step(3, 'https://x/3'));
  assert.equal(g.comments[3].length, 1);
  assert.match(g.comments[3][0].body, /@alice .*#3 needs a decision/);
  notifyOwner(g.api, 'alice', 3, step(3, 'https://x/other'));
  assert.equal(g.comments[3].length, 2);
});

test('the inbox is created once, pinned, updated on change and left alone otherwise', () => {
  const g = fakeGithub();
  notifyOwner(g.api, 'alice', 3, step(3, 'https://x/3'));
  assert.deepEqual(g.pinned, [100]);
  assert.ok(g.inbox.body.includes(INBOX_MARKER));
  assert.match(g.inbox.body, /#3 needs a decision https:\/\/x\/3/);
  assert.equal(g.writes, 1);
  notifyOwner(g.api, 'alice', 3, step(3, 'https://x/3'));
  assert.equal(g.writes, 1, 'unchanged set writes nothing');
  notifyOwner(g.api, 'alice', 4, step(4, 'https://x/4'));
  assert.equal(g.writes, 2);
  assert.deepEqual(g.pinned, [100], 'never created or pinned twice');
  assert.match(g.inbox.body, /#3 needs[\s\S]*#4 needs/);
});

test('a resolved step drops off the list', () => {
  const g = fakeGithub();
  notifyOwner(g.api, 'alice', 3, step(3, 'u3'));
  notifyOwner(g.api, 'alice', 4, step(4, 'u4'));
  g.open.delete(3);
  notifyOwner(g.api, 'alice', 4, step(4, 'u4'));
  assert.doesNotMatch(g.inbox.body, /#3 needs/);
  resolveOwner(g.api, 4);
  assert.doesNotMatch(g.inbox.body, /#4 needs/);
  assert.match(g.inbox.body, /Nothing waits/);
  const writes = g.writes;
  resolveOwner(g.api, 4);
  assert.equal(g.writes, writes, 'resolving an absent step writes nothing');
});

test('an entry whose issue can no longer be read (deleted or transferred) is dropped, never stalling the sync', () => {
  const g = fakeGithub();
  notifyOwner(g.api, 'alice', 3, step(3, 'https://x/3'));
  notifyOwner(g.api, 'alice', 4, step(4, 'https://x/4'));
  g.api.isOpen = n => { if (n === 3) throw new Error('Could not resolve to an issue'); return true; };
  notifyOwner(g.api, 'alice', 4, step(4, 'https://x/4b'));
  assert.doesNotMatch(g.inbox.body, /#3 needs a decision/);
  assert.match(g.inbox.body, /#4 needs a decision https:\/\/x\/4b/);
});
