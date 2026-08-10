import type { GitSyncPort } from '../../domain/ports/GitSyncPort.js';
import type { SessionStore } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import type { Result } from '../Result.js';
import { err, ok } from '../Result.js';

export type LoadSessionInput = {
  readonly scope: Scope;
};

export type LoadSessionOutput = {
  readonly content: string;
  readonly sessionId: string;
  readonly summary: string;
  readonly createdAt: string;
};

export class LoadSessionUseCase {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly gitSync: GitSyncPort,
  ) {}

  async execute(input: LoadSessionInput): Promise<Result<LoadSessionOutput>> {
    await this.pullIfSynced();

    var session = await this.sessionStore.findLatest(input.scope);
    if (!session) {
      return err('No session found for current scope');
    }

    return ok({
      content: session.content,
      sessionId: session.id,
      summary: session.summary,
      createdAt: session.createdAt.toISOString(),
    });
  }

  private async pullIfSynced(): Promise<void> {
    var config = await this.gitSync.getConfiguration();
    if (config.enabled) {
      await this.gitSync.pull();
    }
  }
}
