import type { SessionIndex, SessionStore } from '../domain/ports/SessionStore.js';

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

    await this.rebuildIfSlugsMissing();
  }

  private async rebuildIfSlugsMissing(): Promise<void> {
    var indexed = await this.sessionIndex.search({ status: 'active', allProjects: true });
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
