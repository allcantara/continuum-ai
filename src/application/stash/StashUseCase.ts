import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { SessionStore } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import type { SessionId } from '../../domain/session/SessionId.js';
import type { Result } from '../Result.js';
import { err, ok } from '../Result.js';

export type StashInput = {
  readonly scope: Scope;
  readonly sessionId?: SessionId;
  readonly stashProject?: boolean;
};

export type StashOutput = {
  readonly message: string;
};

export class StashUseCase {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly sessionIndex: SessionIndex,
  ) {}

  async execute(input: StashInput): Promise<Result<StashOutput>> {
    if (input.stashProject) {
      var indexedSessions = await this.sessionIndex.search({
        scopeHash: input.scope.hash,
        status: 'active',
      });
      await this.sessionStore.moveScopeToTrash(input.scope);
      try {
        for (var entry of indexedSessions) {
          await this.sessionIndex.updateStatus(entry.id, input.scope.hash, 'trashed');
        }
      } catch (error) {
        await this.compensateScopeStash(input.scope, indexedSessions);
        throw error;
      }
    } else if (input.sessionId) {
      var existing = await this.sessionStore.findById(input.scope, input.sessionId);
      if (!existing) {
        return err(`Session not found: ${input.sessionId}`);
      }
      await this.sessionStore.moveToTrash(input.scope, input.sessionId);
      try {
        await this.sessionIndex.updateStatus(input.sessionId, input.scope.hash, 'trashed');
      } catch (error) {
        await this.sessionStore.restoreFromTrash(input.scope, input.sessionId);
        throw error;
      }
    } else {
      return err('Either sessionId or stashProject must be provided');
    }

    return ok({ message: 'Moved to trash successfully' });
  }

  private async compensateScopeStash(
    scope: Scope,
    indexedSessions: readonly { readonly id: SessionId }[],
  ): Promise<void> {
    try {
      var restoredIds = await this.sessionStore.restoreScopeFromTrash(scope);
      for (var sessionId of restoredIds) {
        await this.sessionIndex.updateStatus(sessionId, scope.hash, 'active');
      }
    } catch {
      for (var entry of indexedSessions) {
        await this.sessionIndex.updateStatus(entry.id, scope.hash, 'active');
      }
    }
  }
}
