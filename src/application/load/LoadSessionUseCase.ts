import type { SessionStore } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import { truncateForContext } from '../../domain/session/ContentTruncation.js';
import { resolveMaxLoadChars } from '../../infrastructure/config/Limits.js';
import type { Result } from '../Result.js';
import { err, ok } from '../Result.js';
import type { IndexReconciliationService } from '../IndexReconciliationService.js';

export type LoadSessionInput = {
  readonly scope: Scope;
};

export type LoadSessionOutput = {
  readonly content: string;
  readonly sessionId: string;
  readonly summary: string;
  readonly createdAt: string;
  readonly truncated: boolean;
};

export class LoadSessionUseCase {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly indexReconciliation: IndexReconciliationService,
  ) {}

  async execute(input: LoadSessionInput): Promise<Result<LoadSessionOutput>> {
    await this.indexReconciliation.reconcileIfNeeded();

    var session = await this.sessionStore.findLatest(input.scope);
    if (!session) {
      return err('No session found for current scope');
    }

    var maxLength = resolveMaxLoadChars();
    var truncatedContent = truncateForContext(session.content, maxLength);

    return ok({
      content: truncatedContent.text,
      sessionId: session.id,
      summary: session.summary,
      createdAt: session.createdAt.toISOString(),
      truncated: truncatedContent.truncated,
    });
  }
}
