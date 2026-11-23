export type UserId = string & { readonly __brand: 'UserId' };
export type Email = string & { readonly __brand: 'Email' };

export function userId(raw: string): UserId {
  if (!raw.trim()) throw new Error('A user id is not empty');
  return raw as UserId;
}

export function email(raw: string): Email {
  if (!/^[^@\s]+@[^@\s]+$/.test(raw)) throw new Error('Not an email address');
  return raw.toLowerCase() as Email;
}

export type User = { readonly id: UserId; readonly email: Email };
export type UserRegistered = { readonly type: 'UserRegistered'; readonly id: UserId };

export function createUser(id: UserId, address: Email): { user: User; event: UserRegistered } {
  return { user: { id, email: address }, event: { type: 'UserRegistered', id } };
}

export interface Users {
  find(id: UserId): Promise<User | undefined>;
  save(user: User): Promise<void>;
}
