import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { Result } from '../Result.js';
import { ok } from '../Result.js';
import type { IndexReconciliationService } from '../IndexReconciliationService.js';

export type ListedIndexEntry = {
  readonly id: string;
  readonly scopeHash: string;
  readonly scopeSlug: string;
  readonly scopeType: 'project' | 'workspace';
  readonly summary: string;
  readonly createdAt: string;
  readonly status: 'active' | 'trashed';
};

export type ListIndexOutput = {
  readonly entries: readonly ListedIndexEntry[];
};

export class ListIndexUseCase {
  constructor(
    private readonly sessionIndex: SessionIndex,
    private readonly indexReconciliation: IndexReconciliationService,
  ) {}

  async execute(): Promise<Result<ListIndexOutput>> {
    await this.indexReconciliation.reconcileIfNeeded();
    var entries = await this.sessionIndex.listAllEntries();
    return ok({
      entries: entries.map((entry) => ({
        id: entry.id,
        scopeHash: entry.scopeHash,
        scopeSlug: entry.scopeSlug,
        scopeType: entry.scopeType,
        summary: entry.summary,
        createdAt: entry.createdAt.toISOString(),
        status: entry.status,
      })),
    });
  }
}
