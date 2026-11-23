import type { User, UserId, Users } from '../domain/users.ts';

export class MemoryUsers implements Users {
  private readonly rows = new Map<string, User>();

  async find(id: UserId): Promise<User | undefined> {
    return this.rows.get(id);
  }

  async save(user: User): Promise<void> {
    this.rows.set(user.id, user);
  }
}
