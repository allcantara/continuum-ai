import type { Session } from '../domain/session/Session.js';
import type { SessionIndex, SessionIndexEntry, SessionStore } from '../domain/ports/SessionStore.js';

export class IndexReconciliationService {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly sessionIndex: SessionIndex,
  ) {}

  async reconcileIfNeeded(): Promise<void> {
    var fileCount = await this.sessionStore.countAllSessions();
    var indexCount = await this.sessionIndex.count();
    if (fileCount !== indexCount) {
      await this.rebuild();
      return;
    }

    if (!(await this.isIdentityInSync())) {
      await this.rebuild();
      return;
    }

    await this.rebuildIfSlugsMissing();
  }

  private async isIdentityInSync(): Promise<boolean> {
    var sessions = await this.sessionStore.listAllSessions();
    var entries = await this.sessionIndex.listAllEntries();

    if (sessions.length !== entries.length) {
      return false;
    }

    var diskIdentities = new Set(sessions.map(sessionIdentity));
    for (var entry of entries) {
      if (!diskIdentities.has(entryIdentity(entry))) {
        return false;
      }
    }

    return true;
  }

  private async rebuildIfSlugsMissing(): Promise<void> {
    var indexed = await this.sessionIndex.listAllEntries();
    if (indexed.length === 0 || indexed.every((entry) => entry.scopeSlug)) {
      return;
    }

    var sessions = await this.sessionStore.listAllSessions();
    if (!sessions.some((session) => session.scope.slug)) {
      return;
    }

    await this.sessionIndex.rebuildFromSessions(sessions);
  }

  private async rebuild(): Promise<void> {
    var sessions = await this.sessionStore.listAllSessions();
    await this.sessionIndex.rebuildFromSessions(sessions);
  }
}

function sessionIdentity(session: Session): string {
  return `${session.scope.hash}:${session.id}:${session.status}`;
}

function entryIdentity(entry: SessionIndexEntry): string {
  return `${entry.scopeHash}:${entry.id}:${entry.status}`;
}
