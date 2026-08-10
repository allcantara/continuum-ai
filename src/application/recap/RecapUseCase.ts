import type { GitSyncPort } from '../../domain/ports/GitSyncPort.js';
import type { SessionStore } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import type { Result } from '../Result.js';
import { err, ok } from '../Result.js';

export type RecapSessionInput = {
  readonly scope: Scope;
  readonly last?: number;
};

export type RecapSessionEntry = {
  readonly sessionId: string;
  readonly summary: string;
  readonly content: string;
  readonly createdAt: string;
};

export type RecapSessionOutput = {
  readonly sessions: readonly RecapSessionEntry[];
};

const DEFAULT_RECAP_COUNT = 5;

export class RecapUseCase {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly gitSync: GitSyncPort,
  ) {}

  async execute(input: RecapSessionInput): Promise<Result<RecapSessionOutput>> {
    var config = await this.gitSync.getConfiguration();
    if (config.enabled) {
      await this.gitSync.pull();
    }

    var limit = input.last ?? DEFAULT_RECAP_COUNT;
    var sessions = await this.sessionStore.findRecent(input.scope, limit);

    if (sessions.length === 0) {
      return err('No sessions found for current scope');
    }

    return ok({
      sessions: sessions.map((session) => ({
        sessionId: session.id,
        summary: session.summary,
        content: session.content,
        createdAt: session.createdAt.toISOString(),
      })),
    });
  }
}
