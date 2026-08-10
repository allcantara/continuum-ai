import type { GitSyncPort } from '../../domain/ports/GitSyncPort.js';
import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import type { Result } from '../Result.js';
import { ok } from '../Result.js';

export type ListSessionsInput = {
  readonly scope?: Scope;
  readonly query?: string;
  readonly allProjects?: boolean;
};

export type ListSessionEntry = {
  readonly sessionId: string;
  readonly scopeHash: string;
  readonly scopeType: 'project' | 'workspace';
  readonly summary: string;
  readonly createdAt: string;
};

export type ListSessionsOutput = {
  readonly sessions: readonly ListSessionEntry[];
};

export class ListSessionsUseCase {
  constructor(
    private readonly sessionIndex: SessionIndex,
    private readonly gitSync: GitSyncPort,
  ) {}

  async execute(input: ListSessionsInput): Promise<Result<ListSessionsOutput>> {
    var config = await this.gitSync.getConfiguration();
    if (config.enabled) {
      await this.gitSync.pull();
    }

    var searchQuery: {
      query?: string;
      scopeHash?: string;
      status: 'active';
      allProjects?: boolean;
    } = { status: 'active' };

    if (input.query !== undefined) {
      searchQuery.query = input.query;
    }
    if (!input.allProjects && input.scope !== undefined) {
      searchQuery.scopeHash = input.scope.hash;
    }
    if (input.allProjects) {
      searchQuery.allProjects = true;
    }

    var entries = await this.sessionIndex.search(searchQuery);

    return ok({
      sessions: entries.map((entry) => ({
        sessionId: entry.id,
        scopeHash: entry.scopeHash,
        scopeType: entry.scopeType,
        summary: entry.summary,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  }
}
