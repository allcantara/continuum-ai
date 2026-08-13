import type { Scope } from '../scope/Scope.js';
import type { Session } from '../session/Session.js';
import type { SessionContent } from '../session/SessionContent.js';
import type { SessionId } from '../session/SessionId.js';
import type { SessionSummary } from '../session/SessionSummary.js';

export type SessionStore = {
  save(session: Session): Promise<void>;
  /**
   * Picks a free session id for `timestamp` within `scope` and persists the session built
   * from it, as a single atomic operation. Needed because "find a free id" and "write it"
   * are two separate steps — without both happening under one lock, concurrent saves in the
   * same scope (e.g. a CLI save racing an MCP save, or parallel MCP tool calls) could pick
   * the same id and overwrite each other's session file.
   */
  saveWithUniqueTimestamp(
    scope: Scope,
    timestamp: string,
    build: (id: SessionId) => Session,
  ): Promise<Session>;
  findById(scope: Scope, id: SessionId): Promise<Session | null>;
  findLatest(scope: Scope): Promise<Session | null>;
  findRecent(scope: Scope, limit: number): Promise<readonly Session[]>;
  moveToTrash(scope: Scope, id: SessionId): Promise<void>;
  restoreFromTrash(scope: Scope, id: SessionId): Promise<void>;
  moveScopeToTrash(scope: Scope): Promise<void>;
  restoreScopeFromTrash(scope: Scope): Promise<readonly SessionId[]>;
  listAllSessions(): Promise<readonly Session[]>;
  countAllSessions(): Promise<number>;
};

export type SessionIndexEntry = {
  readonly id: SessionId;
  readonly scopeHash: string;
  readonly scopeSlug: string;
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
  listAllEntries(): Promise<readonly SessionIndexEntry[]>;
  updateStatus(id: SessionId, scopeHash: string, status: 'active' | 'trashed'): Promise<void>;
  rebuildFromSessions(sessions: readonly Session[]): Promise<void>;
  count(): Promise<number>;
  isAvailable(): boolean;
};
