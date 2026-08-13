import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { SessionStore } from '../../domain/ports/SessionStore.js';
import type { SessionId } from '../../domain/session/SessionId.js';
import type { Result } from '../Result.js';
import { err, ok } from '../Result.js';
import type { IndexReconciliationService } from '../IndexReconciliationService.js';
import { resolveScopeFromHash } from '../scope/resolveScopeFromHash.js';

export type GetSessionInput = {
  readonly scopeHash: string;
  readonly sessionId: SessionId;
};

export type GetSessionOutput = {
  readonly sessionId: string;
  readonly scopeHash: string;
  readonly scopeSlug: string;
  readonly scopeType: 'project' | 'workspace';
  readonly summary: string;
  readonly content: string;
  readonly createdAt: string;
  readonly status: 'active' | 'trashed';
};

export class GetSessionUseCase {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly sessionIndex: SessionIndex,
    private readonly indexReconciliation: IndexReconciliationService,
  ) {}

  async execute(input: GetSessionInput): Promise<Result<GetSessionOutput>> {
    await this.indexReconciliation.reconcileIfNeeded();

    var scope = await resolveScopeFromHash(this.sessionIndex, input.scopeHash);
    if (!scope) {
      return err(`Project not found: ${input.scopeHash}`);
    }

    var session = await this.sessionStore.findById(scope, input.sessionId);
    if (!session) {
      return err(`Session not found: ${input.sessionId}`);
    }

    return ok({
      sessionId: session.id,
      scopeHash: session.scope.hash,
      scopeSlug: session.scope.slug,
      scopeType: session.scope.type,
      summary: session.summary,
      content: session.content,
      createdAt: session.createdAt.toISOString(),
      status: session.status,
    });
  }
}
