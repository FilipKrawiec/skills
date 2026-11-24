import test from 'node:test';
import assert from 'node:assert/strict';
import { admit, authorId, title } from '../src/intake/domain/intake.ts';

test('a trusted author is admitted', () => {
  assert.deepEqual(admit({ id: authorId('a1'), standing: 'Trusted' }), { type: 'Admitted' });
});

test('ids and titles are not empty', () => {
  assert.throws(() => authorId(' '));
  assert.throws(() => title(''));
});
