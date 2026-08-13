import type { SessionStore } from '../../domain/ports/SessionStore.js';
import type { SessionId } from '../../domain/session/SessionId.js';
import type { Result } from '../Result.js';
import { err, ok } from '../Result.js';
import type { ResolveScopeFromHashUseCase } from '../scope/ResolveScopeFromHashUseCase.js';

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
    private readonly resolveScopeFromHash: ResolveScopeFromHashUseCase,
  ) {}

  async execute(input: GetSessionInput): Promise<Result<GetSessionOutput>> {
    var scope = await this.resolveScopeFromHash.execute(input.scopeHash);
    if (!scope) {
      return err(`Project not found: ${input.scopeHash}`, 'not_found');
    }

    var session = await this.sessionStore.findById(scope, input.sessionId);
    if (!session) {
      return err(`Session not found: ${input.sessionId}`, 'not_found');
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
