import { createUser, email, userId, type Users } from '../domain/users.ts';

export type RegisterUserResult = { type: 'Registered' } | { type: 'AlreadyRegistered' };

export async function registerUser(users: Users, rawId: string, rawEmail: string): Promise<RegisterUserResult> {
  const id = userId(rawId);
  if (await users.find(id)) return { type: 'AlreadyRegistered' };
  await users.save(createUser(id, email(rawEmail)).user);
  return { type: 'Registered' };
}
