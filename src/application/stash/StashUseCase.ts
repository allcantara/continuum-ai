import type { GitSyncPort } from '../../domain/ports/GitSyncPort.js';
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
  readonly syncWarning?: string;
};

export class StashUseCase {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly sessionIndex: SessionIndex,
    private readonly gitSync: GitSyncPort,
  ) {}

  async execute(input: StashInput): Promise<Result<StashOutput>> {
    if (input.stashProject) {
      var indexedSessions = await this.sessionIndex.search({
        scopeHash: input.scope.hash,
        status: 'active',
      });
      await this.sessionStore.moveScopeToTrash(input.scope);
      for (var entry of indexedSessions) {
        await this.sessionIndex.updateStatus(entry.id, input.scope.hash, 'trashed');
      }
    } else if (input.sessionId) {
      var existing = await this.sessionStore.findById(input.scope, input.sessionId);
      if (!existing) {
        return err(`Session not found: ${input.sessionId}`);
      }
      await this.sessionStore.moveToTrash(input.scope, input.sessionId);
      await this.sessionIndex.updateStatus(input.sessionId, input.scope.hash, 'trashed');
    } else {
      return err('Either sessionId or stashProject must be provided');
    }

    var syncWarning: string | undefined;
    var config = await this.gitSync.getConfiguration();
    if (config.enabled) {
      var syncResult = await this.gitSync.commitAndPush('continuum: stash');
      if (!syncResult.success) {
        syncWarning = syncResult.message;
      }
    }

    var output: StashOutput = { message: 'Moved to trash successfully' };
    if (syncWarning !== undefined) {
      output = { ...output, syncWarning };
    }
    return ok(output);
  }
}
