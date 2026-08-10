import type { GitSyncPort } from '../../domain/ports/GitSyncPort.js';
import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { SessionStore } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import type { SessionId } from '../../domain/session/SessionId.js';
import type { Result } from '../Result.js';
import { err, ok } from '../Result.js';

export type RestoreInput = {
  readonly scope: Scope;
  readonly sessionId: SessionId;
};

export type RestoreOutput = {
  readonly message: string;
  readonly syncWarning?: string;
};

export class RestoreUseCase {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly sessionIndex: SessionIndex,
    private readonly gitSync: GitSyncPort,
  ) {}

  async execute(input: RestoreInput): Promise<Result<RestoreOutput>> {
    var existing = await this.sessionStore.findById(input.scope, input.sessionId);
    if (!existing) {
      return err(`Session not found in trash: ${input.sessionId}`);
    }

    if (existing.status !== 'trashed') {
      return err(`Session is not in trash: ${input.sessionId}`);
    }

    await this.sessionStore.restoreFromTrash(input.scope, input.sessionId);
    await this.sessionIndex.updateStatus(input.sessionId, input.scope.hash, 'active');

    var syncWarning: string | undefined;
    var config = await this.gitSync.getConfiguration();
    if (config.enabled) {
      var syncResult = await this.gitSync.commitAndPush('continuum: restore');
      if (!syncResult.success) {
        syncWarning = syncResult.message;
      }
    }

    var output: RestoreOutput = { message: 'Restored successfully' };
    if (syncWarning !== undefined) {
      output = { ...output, syncWarning };
    }
    return ok(output);
  }
}
