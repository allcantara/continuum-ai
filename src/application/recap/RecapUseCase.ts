import type { GitSyncPort } from '../../domain/ports/GitSyncPort.js';
import type { SessionStore } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import { truncateForContext } from '../../domain/session/ContentTruncation.js';
import { resolveMaxRecapChars } from '../../infrastructure/config/Limits.js';
import type { Result } from '../Result.js';
import { err, ok } from '../Result.js';
import type { IndexReconciliationService } from '../IndexReconciliationService.js';

export type RecapSessionInput = {
  readonly scope: Scope;
  readonly last?: number;
};

export type RecapSessionEntry = {
  readonly sessionId: string;
  readonly summary: string;
  readonly content: string;
  readonly createdAt: string;
  readonly truncated: boolean;
};

export type RecapSessionOutput = {
  readonly sessions: readonly RecapSessionEntry[];
  readonly anyTruncated: boolean;
};

const DEFAULT_RECAP_COUNT = 5;

export class RecapUseCase {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly gitSync: GitSyncPort,
    private readonly indexReconciliation: IndexReconciliationService,
  ) {}

  async execute(input: RecapSessionInput): Promise<Result<RecapSessionOutput>> {
    await this.pullAndReconcileIfSynced();

    var limit = input.last ?? DEFAULT_RECAP_COUNT;
    var sessions = await this.sessionStore.findRecent(input.scope, limit);

    if (sessions.length === 0) {
      return err('No sessions found for current scope');
    }

    var totalBudget = resolveMaxRecapChars();
    var budgetPerSession = Math.max(1, Math.floor(totalBudget / sessions.length));
    var mappedSessions = sessions.map((session) => {
      var truncatedContent = truncateForContext(session.content, budgetPerSession);
      return {
        sessionId: session.id,
        summary: session.summary,
        content: truncatedContent.text,
        createdAt: session.createdAt.toISOString(),
        truncated: truncatedContent.truncated,
      };
    });

    return ok({
      anyTruncated: mappedSessions.some((entry) => entry.truncated),
      sessions: mappedSessions,
    });
  }

  private async pullAndReconcileIfSynced(): Promise<void> {
    var config = await this.gitSync.getConfiguration();
    if (!config.enabled) {
      return;
    }

    var pullResult = await this.gitSync.pull();
    if (pullResult.success) {
      await this.indexReconciliation.reconcileIfNeeded();
    }
  }
}
