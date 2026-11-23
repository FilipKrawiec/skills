import test from 'node:test';
import assert from 'node:assert/strict';
import { createUser, email, userId } from '../src/users/domain/users.ts';
import { registerUser } from '../src/users/app/register-user.ts';
import { MemoryUsers } from '../src/users/infra/memory-users.ts';

test('creating a user records its registration', () => {
  const { user, event } = createUser(userId('u1'), email('Ada@Example.com'));
  assert.equal(user.email, 'ada@example.com');
  assert.deepEqual(event, { type: 'UserRegistered', id: 'u1' });
});

test('registering twice reports the existing user', async () => {
  const users = new MemoryUsers();
  assert.deepEqual(await registerUser(users, 'u1', 'ada@example.com'), { type: 'Registered' });
  assert.deepEqual(await registerUser(users, 'u1', 'ada@example.com'), { type: 'AlreadyRegistered' });
});
