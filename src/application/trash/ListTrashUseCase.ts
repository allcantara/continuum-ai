import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { Result } from '../Result.js';
import { ok } from '../Result.js';
import type { IndexReconciliationService } from '../IndexReconciliationService.js';

export type ListTrashEntry = {
  readonly sessionId: string;
  readonly scopeHash: string;
  readonly scopeSlug: string;
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
    private readonly indexReconciliation: IndexReconciliationService,
  ) {}

  async execute(): Promise<Result<ListTrashOutput>> {
    await this.indexReconciliation.reconcileIfNeeded();

    var entries = await this.sessionIndex.search({ status: 'trashed' });

    return ok({
      items: entries.map((entry) => ({
        sessionId: entry.id,
        scopeHash: entry.scopeHash,
        scopeSlug: entry.scopeSlug,
        scopeType: entry.scopeType,
        summary: entry.summary,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  }
}
