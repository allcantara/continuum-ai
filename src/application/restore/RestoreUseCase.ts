import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { SessionStore } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import type { SessionId } from '../../domain/session/SessionId.js';
import type { Result } from '../Result.js';
import { err, ok } from '../Result.js';

export type RestoreInput = {
  readonly scope: Scope;
  readonly sessionId?: SessionId;
  readonly restoreProject?: boolean;
};

export type RestoreOutput = {
  readonly message: string;
};

export class RestoreUseCase {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly sessionIndex: SessionIndex,
  ) {}

  async execute(input: RestoreInput): Promise<Result<RestoreOutput>> {
    if (input.restoreProject) {
      var restoredIds: readonly SessionId[];
      try {
        restoredIds = await this.sessionStore.restoreScopeFromTrash(input.scope);
      } catch (error) {
        return err((error as Error).message);
      }

      try {
        for (var sessionId of restoredIds) {
          await this.sessionIndex.updateStatus(sessionId, input.scope.hash, 'active');
        }
      } catch (error) {
        await this.sessionStore.moveScopeToTrash(input.scope);
        throw error;
      }

      return ok({ message: `Restored ${restoredIds.length} session(s) from trash` });
    }

    if (!input.sessionId) {
      return err('Either sessionId or restoreProject must be provided');
    }

    var existing = await this.sessionStore.findById(input.scope, input.sessionId);
    if (!existing) {
      return err(`Session not found in trash: ${input.sessionId}`);
    }

    if (existing.status !== 'trashed') {
      return err(`Session is not in trash: ${input.sessionId}`);
    }

    await this.sessionStore.restoreFromTrash(input.scope, input.sessionId);
    try {
      await this.sessionIndex.updateStatus(input.sessionId, input.scope.hash, 'active');
    } catch (error) {
      await this.sessionStore.moveToTrash(input.scope, input.sessionId);
      throw error;
    }

    return ok({ message: 'Restored successfully' });
  }
}
