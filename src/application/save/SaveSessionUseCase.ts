import type { GitSyncPort } from '../../domain/ports/GitSyncPort.js';
import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { SessionStore } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import { createSession } from '../../domain/session/Session.js';
import { sessionContentFrom } from '../../domain/session/SessionContent.js';
import { formatSessionTimestamp } from '../../domain/session/SessionId.js';
import {
  extractSummaryFromContent,
  sessionSummaryFrom,
} from '../../domain/session/SessionSummary.js';
import { containsLikelySecret, SECRET_SAVE_WARNING } from '../../domain/session/SecretScanner.js';
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
  readonly securityWarning?: string;
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

    var session = await this.sessionStore.saveWithUniqueTimestamp(input.scope, timestamp, (id) =>
      createSession({ id, scope: input.scope, content, summary, createdAt: now }),
    );

    await this.sessionIndex.upsert(
      {
        id: session.id,
        scopeHash: input.scope.hash,
        scopeSlug: input.scope.slug,
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
      var syncResult = await this.gitSync.commitAndPush(`continuum: save session ${session.id}`);
      if (!syncResult.success) {
        syncWarning = syncResult.message;
      }
    }

    var output: SaveSessionOutput = { sessionId: session.id };
    if (syncWarning !== undefined) {
      output = { ...output, syncWarning };
    }
    if (containsLikelySecret(input.content)) {
      output = { ...output, securityWarning: SECRET_SAVE_WARNING };
    }
    return ok(output);
  }
}
