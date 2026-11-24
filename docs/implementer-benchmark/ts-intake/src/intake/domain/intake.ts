export type AuthorId = string & { readonly __brand: 'AuthorId' };
export type Title = string & { readonly __brand: 'Title' };

export function authorId(raw: string): AuthorId {
  if (!raw.trim()) throw new Error('An author id is not empty');
  return raw as AuthorId;
}

export function title(raw: string): Title {
  if (!raw.trim()) throw new Error('A title is not empty');
  return raw as Title;
}

export type Author = { readonly id: AuthorId; readonly standing: 'Trusted' | 'Untrusted' };
export type Submission = { readonly author: AuthorId; readonly title: Title };
export type Admission = { readonly type: 'Admitted' } | { readonly type: 'Refused' };

// The trust gate: only a trusted author's submission is admitted.
export function admit(author: Author): Admission {
  return author.standing === 'Trusted' ? { type: 'Admitted' } : { type: 'Refused' };
}

export interface Authors {
  find(id: AuthorId): Promise<Author | undefined>;
}

export interface Submissions {
  save(submission: Submission): Promise<void>;
  all(): Promise<readonly Submission[]>;
}
