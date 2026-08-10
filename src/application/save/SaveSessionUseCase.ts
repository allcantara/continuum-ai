import type { GitSyncPort } from '../../domain/ports/GitSyncPort.js';
import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { SessionStore } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import { createSession } from '../../domain/session/Session.js';
import { sessionContentFrom } from '../../domain/session/SessionContent.js';
import {
  formatSessionTimestamp,
  sessionIdFrom,
} from '../../domain/session/SessionId.js';
import {
  extractSummaryFromContent,
  sessionSummaryFrom,
} from '../../domain/session/SessionSummary.js';
import type { Result } from '../Result.js';
import { ok } from '../Result.js';

export type SaveSessionInput = {
  readonly scope: Scope;
  readonly content: string;
  readonly summary?: string;
};

export type SaveSessionOutput = {
  readonly sessionId: string;
  readonly syncWarning?: string;
};

export class SaveSessionUseCase {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly sessionIndex: SessionIndex,
    private readonly gitSync: GitSyncPort,
  ) {}

  async execute(input: SaveSessionInput): Promise<Result<SaveSessionOutput>> {
    var content = sessionContentFrom(input.content);
    var summary = input.summary
      ? sessionSummaryFrom(input.summary)
      : extractSummaryFromContent(content);

    var now = new Date();
    var timestamp = formatSessionTimestamp(now);
    var sessionId = await this.resolveUniqueId(input.scope, timestamp);

    var session = createSession({
      id: sessionId,
      scope: input.scope,
      content,
      summary,
      createdAt: now,
    });

    await this.sessionStore.save(session);
    await this.sessionIndex.upsert(
      {
        id: session.id,
        scopeHash: input.scope.hash,
        scopeType: input.scope.type,
        summary: session.summary,
        createdAt: session.createdAt,
        status: 'active',
      },
      content,
    );

    var syncConfig = await this.gitSync.getConfiguration();
    var syncWarning: string | undefined;

    if (syncConfig.enabled) {
      var syncResult = await this.gitSync.commitAndPush(`continuum: save session ${sessionId}`);
      if (!syncResult.success) {
        syncWarning = syncResult.message;
      }
    }

    var output: SaveSessionOutput = { sessionId };
    if (syncWarning !== undefined) {
      output = { ...output, syncWarning };
    }
    return ok(output);
  }

  private async resolveUniqueId(scope: Scope, timestamp: string): Promise<ReturnType<typeof sessionIdFrom>> {
    var baseId = sessionIdFrom(timestamp);
    var existing = await this.sessionStore.findById(scope, baseId);
    if (!existing) {
      return baseId;
    }

    for (var suffix = 1; suffix < 100; suffix++) {
      var candidate = sessionIdFrom(timestamp, suffix);
      var collision = await this.sessionStore.findById(scope, candidate);
      if (!collision) {
        return candidate;
      }
    }

    throw new Error('Unable to generate unique session id');
  }
}
