import type { SessionIndex, SessionIndexEntry } from '../../domain/ports/SessionStore.js';
import type { Result } from '../Result.js';
import { ok } from '../Result.js';
import type { IndexReconciliationService } from '../IndexReconciliationService.js';

export type ListedScope = {
  readonly hash: string;
  readonly slug: string;
  readonly type: 'project' | 'workspace';
  readonly sessionCount: number;
};

export type ListScopesOutput = {
  readonly projects: readonly ListedScope[];
};

export class ListScopesUseCase {
  constructor(
    private readonly sessionIndex: SessionIndex,
    private readonly indexReconciliation: IndexReconciliationService,
  ) {}

  async execute(): Promise<Result<ListScopesOutput>> {
    await this.indexReconciliation.reconcileIfNeeded();
    var entries = await this.sessionIndex.search({ status: 'active' });
    var projects = groupActiveScopes(entries);
    return ok({ projects });
  }
}

function groupActiveScopes(entries: readonly SessionIndexEntry[]): ListedScope[] {
  var grouped = new Map<string, { slug: string; type: 'project' | 'workspace'; sessionCount: number }>();

  for (var entry of entries) {
    var existing = grouped.get(entry.scopeHash);
    if (existing) {
      grouped.set(entry.scopeHash, {
        slug: existing.slug || entry.scopeSlug,
        type: existing.type,
        sessionCount: existing.sessionCount + 1,
      });
      continue;
    }
    grouped.set(entry.scopeHash, {
      slug: entry.scopeSlug,
      type: entry.scopeType,
      sessionCount: 1,
    });
  }

  return [...grouped.entries()]
    .map(([hash, item]) => ({
      hash,
      slug: item.slug,
      type: item.type,
      sessionCount: item.sessionCount,
    }))
    .sort((left, right) => {
      var slugCompare = left.slug.localeCompare(right.slug);
      return slugCompare !== 0 ? slugCompare : left.hash.localeCompare(right.hash);
    });
}
