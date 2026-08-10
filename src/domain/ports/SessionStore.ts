import type { Scope } from '../scope/Scope.js';
import type { Session } from '../session/Session.js';
import type { SessionContent } from '../session/SessionContent.js';
import type { SessionId } from '../session/SessionId.js';
import type { SessionSummary } from '../session/SessionSummary.js';

export type SessionStore = {
  save(session: Session): Promise<void>;
  findById(scope: Scope, id: SessionId): Promise<Session | null>;
  findLatest(scope: Scope): Promise<Session | null>;
  findRecent(scope: Scope, limit: number): Promise<readonly Session[]>;
  moveToTrash(scope: Scope, id: SessionId): Promise<void>;
  restoreFromTrash(scope: Scope, id: SessionId): Promise<void>;
  moveScopeToTrash(scope: Scope): Promise<void>;
  listAllSessions(): Promise<readonly Session[]>;
};

export type SessionIndexEntry = {
  readonly id: SessionId;
  readonly scopeHash: string;
  readonly scopeType: 'project' | 'workspace';
  readonly summary: SessionSummary;
  readonly createdAt: Date;
  readonly status: 'active' | 'trashed';
};

export type SessionSearchQuery = {
  readonly query?: string;
  readonly scopeHash?: string;
  readonly status?: 'active' | 'trashed';
  readonly allProjects?: boolean;
};

export type SessionIndex = {
  upsert(entry: SessionIndexEntry, content: SessionContent): Promise<void>;
  search(query: SessionSearchQuery): Promise<readonly SessionIndexEntry[]>;
  updateStatus(id: SessionId, scopeHash: string, status: 'active' | 'trashed'): Promise<void>;
  rebuildFromSessions(sessions: readonly Session[]): Promise<void>;
  isAvailable(): boolean;
};
