import type { GitSyncPort } from '../../domain/ports/GitSyncPort.js';
import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { Result } from '../Result.js';
import { ok } from '../Result.js';

export type ListTrashEntry = {
  readonly sessionId: string;
  readonly scopeHash: string;
  readonly scopeType: 'project' | 'workspace';
  readonly summary: string;
  readonly createdAt: string;
};

export type ListTrashOutput = {
  readonly items: readonly ListTrashEntry[];
};

export class ListTrashUseCase {
  constructor(
    private readonly sessionIndex: SessionIndex,
    private readonly gitSync: GitSyncPort,
  ) {}

  async execute(): Promise<Result<ListTrashOutput>> {
    var config = await this.gitSync.getConfiguration();
    if (config.enabled) {
      await this.gitSync.pull();
    }

    var entries = await this.sessionIndex.search({ status: 'trashed' });

    return ok({
      items: entries.map((entry) => ({
        sessionId: entry.id,
        scopeHash: entry.scopeHash,
        scopeType: entry.scopeType,
        summary: entry.summary,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  }
}
