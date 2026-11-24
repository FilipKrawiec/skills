import type { Author, AuthorId, Authors, Submission, Submissions } from '../domain/intake.ts';

export class MemoryAuthors implements Authors {
  private readonly rows: readonly Author[];

  constructor(rows: readonly Author[] = []) {
    this.rows = rows;
  }

  async find(id: AuthorId): Promise<Author | undefined> {
    return this.rows.find(row => row.id === id);
  }
}

export class MemorySubmissions implements Submissions {
  private readonly rows: Submission[] = [];

  async save(submission: Submission): Promise<void> {
    this.rows.push(submission);
  }

  async all(): Promise<readonly Submission[]> {
    return [...this.rows];
  }
}
